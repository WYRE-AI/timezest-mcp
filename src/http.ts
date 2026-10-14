/**
 * HTTP streaming transport for Node.js (per-request pattern).
 *
 * HTTP refuses to start unless CONDUIT_S2S_SECRET is a real secret.
 * MCP_ALLOW_INSECURE_DEV=1 is a local-only escape hatch: it logs a warning,
 * does not enforce X-Gateway-S2S, and forces the listener onto 127.0.0.1.
 * Known placeholder secrets are rejected even with that flag. A configured
 * secret honors MCP_HTTP_HOST (default 127.0.0.1 when unset).
 * Gateway mode requires X-Timezest-Api-Token and never falls back to
 * TIMEZEST_API_TOKEN. /health stays unauthenticated and does not read
 * credentials. stdio does not use S2S auth.
 */
import http from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { runWithCredentials } from './utils/client.js';
import { logger } from './utils/logger.js';
import { verifyS2sHeader, S2S_HEADER } from './s2s-verify.js';

/**
 * Public example values. A copied placeholder must not verify as a real
 * secret. Matched case-insensitively after trim. Never log the value.
 */
export const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'replace-with-a-real-secret',
  'your-s2s-secret',
  'your-secret',
  'changeme',
  'change-me',
  'placeholder',
  'secret',
  'example',
  'replace-me',
  's2s-secret',
]);

const LOOPBACK_HOST = '127.0.0.1';

const MISSING_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET is empty. ' +
  'Set CONDUIT_S2S_SECRET to the gateway-provisioned secret (openssl rand -hex 32), ' +
  'or set MCP_ALLOW_INSECURE_DEV=1 for local development only.';

const PLACEHOLDER_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET is a known placeholder. ' +
  'Generate a secret with openssl rand -hex 32 and set CONDUIT_S2S_SECRET to that value.';

const INSECURE_DEV_WARNING =
  'SECURITY WARNING: CONDUIT_S2S_SECRET is empty and MCP_ALLOW_INSECURE_DEV=1. ' +
  'HTTP /mcp is not enforcing X-Gateway-S2S and is bound to 127.0.0.1 only. ' +
  'Do not use this outside local development.';

const GATEWAY_CREDENTIALS_UNAUTHORIZED = {
  error: 'Missing credentials',
  message:
    'Gateway mode requires the X-Timezest-Api-Token header. This server does not fall back to TIMEZEST_API_TOKEN.',
  required: ['X-Timezest-Api-Token'],
};

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[(.+)\]$/, '$1');
  if (normalized === 'localhost' || normalized === '::1') return true;
  const bare = normalized.startsWith('::ffff:')
    ? normalized.slice('::ffff:'.length)
    : normalized;
  const parts = bare.split('.');
  if (parts.length !== 4) return false;
  if (parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
    return false;
  }
  return parts[0] === '127';
}

/**
 * Secret for X-Gateway-S2S on /mcp. Read at HTTP startup, not module load.
 * Empty is fail-closed unless MCP_ALLOW_INSECURE_DEV=1. A known placeholder
 * always refuses to start. The secret value is never written to logs.
 */
function resolveHttpS2sSecret(): { secret: string; insecureDev: boolean } {
  const raw = (process.env.CONDUIT_S2S_SECRET ?? '').trim();
  if (KNOWN_PLACEHOLDER_SECRETS.has(raw.toLowerCase())) {
    logger.error(PLACEHOLDER_S2S_SECRET_ERROR);
    process.exit(1);
  }
  if (raw) return { secret: raw, insecureDev: false };
  if (process.env.MCP_ALLOW_INSECURE_DEV === '1') {
    logger.error(INSECURE_DEV_WARNING);
    return { secret: '', insecureDev: true };
  }
  logger.error(MISSING_S2S_SECRET_ERROR);
  process.exit(1);
}

/**
 * With a real secret, honor MCP_HTTP_HOST (default 127.0.0.1 when unset).
 * Without a secret the insecure-dev bypass forces 127.0.0.1, including when
 * MCP_HTTP_HOST is a wider address such as 0.0.0.0.
 */
function resolveBindHost(hasRealSecret: boolean): string {
  const configured = (process.env.MCP_HTTP_HOST ?? '').trim();
  if (hasRealSecret) return configured || LOOPBACK_HOST;
  if (configured && !isLoopbackHost(configured)) {
    logger.error(
      `WARNING: MCP_HTTP_HOST=${configured} is not a loopback address. ` +
        'MCP_ALLOW_INSECURE_DEV=1 without CONDUIT_S2S_SECRET forces the listener to 127.0.0.1 only.',
    );
  }
  return LOOPBACK_HOST;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function startHttpServer(port: number): http.Server {
  const { secret: s2sSecret, insecureDev } = resolveHttpS2sSecret();
  const host = resolveBindHost(!insecureDev);
  const isGatewayMode = process.env.AUTH_MODE === 'gateway';

  const server = http.createServer(async (req, res) => {
    // Liveness probe: respond 200 to GET /health before the catch-all 404
    // so Azure Container Apps does not recycle the container. Must NOT
    // read credentials — in gateway mode they only arrive per-request
    // via headers, so a credential check here would always fail the probe.
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        authMode: isGatewayMode ? 'gateway' : 'env',
      }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Empty s2sSecret is only reachable when MCP_ALLOW_INSECURE_DEV=1.
    // A configured secret is always enforced, before credential extraction.
    const s2sHeader = headerValue(req.headers[S2S_HEADER]);
    if (s2sSecret && !verifyS2sHeader(s2sHeader, s2sSecret)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Missing or invalid X-Gateway-S2S header: this endpoint only accepts requests signed by the gateway.',
        })
      );
      return;
    }

    // Gateway mode: per-request credentials from the X-Timezest-Api-Token
    // header, threaded through an AsyncLocalStorage-scoped context (see
    // utils/client.ts). Falling through when the header is missing would
    // resolve TIMEZEST_API_TOKEN from the process environment, which is not
    // request-scoped.
    const handle = async () => {
      // CRITICAL: Create fresh server and transport per request for gateway mode
      const mcpServer = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
      });

      // Clean up when request ends
      res.on('close', () => {
        transport.close();
        mcpServer.close();
      });

      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        logger.error('MCP transport error', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error' },
            id: null,
          }));
        }
      }
    };

    if (isGatewayMode) {
      const apiToken = headerValue(req.headers['x-timezest-api-token']);
      if (!apiToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(GATEWAY_CREDENTIALS_UNAUTHORIZED));
        return;
      }
      await runWithCredentials({ apiToken }, handle);
      return;
    }

    await handle();
  });

  server.listen(port, host, () => {
    logger.info(`TimeZest MCP server listening on http://${host}:${port}/mcp`);
    logger.info(`Authentication mode: ${isGatewayMode ? 'gateway (X-Timezest-Api-Token header)' : 'env (TIMEZEST_API_TOKEN environment variable)'}`);
  });

  return server;
}

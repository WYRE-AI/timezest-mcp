/**
 * HTTP streaming transport for Node.js (per-request pattern)
 */
import http from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { getCredentials, runWithCredentials } from './utils/client.js';
import { logger } from './utils/logger.js';
import { verifyS2sHeader, S2S_HEADER } from './s2s-verify.js';

const S2S_SECRET = process.env.CONDUIT_S2S_SECRET || '';

export function startHttpServer(port: number): http.Server {
  const isGatewayMode = process.env.AUTH_MODE === 'gateway';

  const server = http.createServer(async (req, res) => {
    // Liveness probe: respond 200 to GET /health before the catch-all 404
    // so Azure Container Apps does not recycle the container. Must NOT
    // gate on credentials — in gateway mode they only arrive per-request
    // via headers, so a credential check here would always fail the probe.
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', credentials: { configured: !!getCredentials() } }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (S2S_SECRET && !verifyS2sHeader(req.headers[S2S_HEADER] as string | undefined, S2S_SECRET)) {
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
    // utils/client.ts). Previously this container never read any header at
    // all here — gateway mode was a no-op that fell through to whatever
    // TIMEZEST_API_TOKEN happened to be set in the container's environment.
    const apiToken = isGatewayMode
      ? (req.headers['x-timezest-api-token'] as string | undefined)
      : undefined;

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
        transport.handleRequest(req, res);
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

    if (apiToken) {
      await runWithCredentials({ apiToken }, handle);
    } else {
      await handle();
    }
  });

  server.listen(port, () => {
    logger.info(`TimeZest MCP server listening on port ${port}`);
    logger.info(`Authentication mode: ${isGatewayMode ? 'gateway (X-Timezest-Api-Token header)' : 'env (TIMEZEST_API_TOKEN environment variable)'}`);
  });

  return server;
}
/**
 * Gateway-mode header wiring for the HTTP transport.
 *
 * Before this fix, startHttpServer never read any request header at all —
 * AUTH_MODE=gateway was checked only deep inside createMcpServer(), which
 * re-read process.env.TIMEZEST_API_TOKEN (never set per request). This pins
 * that the X-Timezest-Api-Token header is actually extracted and threaded
 * into the request-scoped credential store that utils/client.ts reads from.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

const runWithCredentialsSpy = vi.fn((creds: unknown, fn: () => unknown) => fn());

vi.mock('../server.js', () => ({
  createMcpServer: () => ({
    connect: vi.fn(async () => {}),
    close: vi.fn(),
  }),
}));

vi.mock('../utils/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/client.js')>();
  return { ...actual, runWithCredentials: runWithCredentialsSpy };
});

// StreamableHTTPServerTransport.handleRequest needs a real request/response
// pair; stub it to a no-op so this test stays scoped to header extraction,
// not full MCP protocol framing.
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    close = vi.fn();
    handleRequest = vi.fn((_req: unknown, res: http.ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  },
}));

const ENV_TOKEN = 'env-token-must-not-be-used';

function postToMcp(
  port: number,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/mcp', method: 'POST', headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end('{}');
  });
}

describe('startHttpServer — gateway mode credential wiring', () => {
  let server: http.Server;
  let port: number;
  const originalEnv = {
    AUTH_MODE: process.env.AUTH_MODE,
    CONDUIT_S2S_SECRET: process.env.CONDUIT_S2S_SECRET,
    MCP_ALLOW_INSECURE_DEV: process.env.MCP_ALLOW_INSECURE_DEV,
    MCP_HTTP_HOST: process.env.MCP_HTTP_HOST,
    TIMEZEST_API_TOKEN: process.env.TIMEZEST_API_TOKEN,
  };

  beforeEach(async () => {
    runWithCredentialsSpy.mockClear();
    // S2S enforcement is covered in http-s2s-auth.test.ts. This file stays
    // on credential wiring, so the dev bypass starts HTTP without a secret
    // and binds 127.0.0.1.
    delete process.env.CONDUIT_S2S_SECRET;
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = '127.0.0.1';
    process.env.AUTH_MODE = 'gateway';
    process.env.TIMEZEST_API_TOKEN = ENV_TOKEN;
    vi.resetModules();
    const { startHttpServer } = await import('../http.js');
    server = startHttpServer(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('threads X-Timezest-Api-Token into runWithCredentials', async () => {
    const response = await postToMcp(port, { 'x-timezest-api-token': 'gw-token-123' });
    expect(response.status).toBe(200);
    expect(response.body).not.toContain(ENV_TOKEN);
    expect(runWithCredentialsSpy).toHaveBeenCalledWith({ apiToken: 'gw-token-123' }, expect.any(Function));
  });

  it('returns 401 and does not call runWithCredentials when the header is absent', async () => {
    const response = await postToMcp(port, {});
    expect(response.status).toBe(401);
    expect(response.body).toContain('Missing credentials');
    expect(response.body).toContain('X-Timezest-Api-Token');
    expect(response.body).not.toContain(ENV_TOKEN);
    expect(runWithCredentialsSpy).not.toHaveBeenCalled();
  });
});

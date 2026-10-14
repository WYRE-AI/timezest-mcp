/**
 * HTTP transport fail-closed auth.
 *
 * Startup requires a real CONDUIT_S2S_SECRET. Empty and known placeholders
 * refuse to start. MCP_ALLOW_INSECURE_DEV=1 (empty secret only) logs a
 * warning and forces the listener onto 127.0.0.1. A configured secret still
 * honors MCP_HTTP_HOST.
 * /mcp rejects a missing or invalid X-Gateway-S2S header.
 * AUTH_MODE=gateway rejects requests that omit X-Timezest-Api-Token and
 * must not fall back to TIMEZEST_API_TOKEN.
 */

import { createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getCredentialsMock = vi.hoisted(() => vi.fn());
const runWithCredentialsMock = vi.hoisted(() =>
  vi.fn((creds: unknown, fn: () => unknown) => fn()),
);

vi.mock('../utils/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/client.js')>();
  return {
    ...actual,
    getCredentials: getCredentialsMock,
    runWithCredentials: runWithCredentialsMock,
  };
});

import { KNOWN_PLACEHOLDER_SECRETS, startHttpServer } from '../http.js';

const S2S_SECRET = 's2s-do-not-log-7f3a';
const ENV_TOKEN = 'env-token-must-not-be-used';
const HEADER_TOKEN = 'header-token-do-not-log';

const ENV_KEYS = [
  'CONDUIT_S2S_SECRET',
  'MCP_ALLOW_INSECURE_DEV',
  'MCP_HTTP_PORT',
  'MCP_HTTP_HOST',
  'AUTH_MODE',
  'TIMEZEST_API_TOKEN',
  'LOG_LEVEL',
  'MCP_TRANSPORT',
] as const;

const savedEnv = new Map<string, string | undefined>();

function mintS2sHeader(secret: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

function captureStderr(): { text: () => string; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  });
  return {
    text: () => lines.join('\n'),
    restore: () => spy.mockRestore(),
  };
}

function assertSecretNotLogged(logged: string, extra: string[] = []): void {
  const scrubbed = logged
    .replaceAll('CONDUIT_S2S_SECRET', '')
    .replaceAll('known placeholder', '')
    .replaceAll('Generate a secret with openssl rand -hex 32', '');
  expect(scrubbed).not.toContain(S2S_SECRET);
  expect(scrubbed).not.toContain(ENV_TOKEN);
  expect(scrubbed).not.toContain(HEADER_TOKEN);
  for (const value of extra) {
    const needle = value.trim();
    if (!needle) continue;
    expect(scrubbed.toLowerCase()).not.toContain(needle.toLowerCase());
  }
}

function refuseExit(): { restore: () => void } {
  const spy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${String(code)}`);
  }) as typeof process.exit);
  return { restore: () => spy.mockRestore() };
}

interface HttpResult {
  status: number;
  body: string;
}

function sendHttp(options: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.setTimeout(5000, () => {
      req.destroy(new Error(`timeout ${options.method} ${options.path}`));
    });
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

async function listen(): Promise<{ port: number; address: string; close: () => Promise<void> }> {
  const server = startHttpServer(0);
  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });
  }
  const bound = server.address() as AddressInfo | null;
  if (!bound || typeof bound === 'string') {
    throw new Error('HTTP server did not bind a TCP port');
  }
  return {
    port: bound.port,
    address: bound.address,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

function mcpHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...extra,
  };
}

const statusCall = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'timezest_status', arguments: {} },
});

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  process.env.LOG_LEVEL = 'info';
  delete process.env.CONDUIT_S2S_SECRET;
  delete process.env.MCP_ALLOW_INSECURE_DEV;
  delete process.env.MCP_HTTP_HOST;
  delete process.env.AUTH_MODE;
  delete process.env.TIMEZEST_API_TOKEN;
  getCredentialsMock.mockReset();
  getCredentialsMock.mockImplementation(() => {
    throw new Error('getCredentials must not be used for HTTP auth tests');
  });
  runWithCredentialsMock.mockClear();
});

describe('HTTP startup', () => {
  it('refuses to start when CONDUIT_S2S_SECRET is empty', () => {
    const logs = captureStderr();
    const exit = refuseExit();

    try {
      expect(() => startHttpServer(0)).toThrow('process.exit:1');
      const text = logs.text();
      expect(text).toContain('Refusing to start HTTP transport');
      expect(text).toContain('CONDUIT_S2S_SECRET is empty');
      assertSecretNotLogged(text);
    } finally {
      exit.restore();
      logs.restore();
    }
  });

  it('still refuses when MCP_ALLOW_INSECURE_DEV is not exactly 1', () => {
    process.env.MCP_ALLOW_INSECURE_DEV = 'true';
    const logs = captureStderr();
    const exit = refuseExit();

    try {
      expect(() => startHttpServer(0)).toThrow('process.exit:1');
      expect(logs.text()).toContain('Refusing to start HTTP transport');
      assertSecretNotLogged(logs.text());
    } finally {
      exit.restore();
      logs.restore();
    }
  });

  it.each([...KNOWN_PLACEHOLDER_SECRETS])(
    'refuses known placeholder %s even when MCP_ALLOW_INSECURE_DEV=1',
    (placeholder) => {
      process.env.CONDUIT_S2S_SECRET = placeholder;
      process.env.MCP_ALLOW_INSECURE_DEV = '1';
      process.env.MCP_HTTP_HOST = '0.0.0.0';
      const logs = captureStderr();
      const exit = refuseExit();

      try {
        expect(() => startHttpServer(0)).toThrow('process.exit:1');
        const text = logs.text();
        expect(text).toContain('Refusing to start HTTP transport');
        expect(text).toContain('known placeholder');
        expect(text).not.toContain('SECURITY WARNING');
        assertSecretNotLogged(text, [placeholder]);
      } finally {
        exit.restore();
        logs.restore();
      }
    },
  );

  it.each(['ChangeMe', '  Your-S2S-Secret  ', '  SECRET  '])(
    'refuses placeholder variant %j and does not log it',
    (placeholder) => {
      process.env.CONDUIT_S2S_SECRET = placeholder;
      const logs = captureStderr();
      const exit = refuseExit();

      try {
        expect(() => startHttpServer(0)).toThrow('process.exit:1');
        const text = logs.text();
        expect(text).toContain('known placeholder');
        assertSecretNotLogged(text, [placeholder]);
      } finally {
        exit.restore();
        logs.restore();
      }
    },
  );

  it('allows startup with a warning when MCP_ALLOW_INSECURE_DEV=1 and binds 127.0.0.1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    const logs = captureStderr();
    const exit = refuseExit();
    let close: (() => Promise<void>) | undefined;
    try {
      const server = await listen();
      close = server.close;
      expect(server.address).toBe('127.0.0.1');
      const text = logs.text();
      expect(text).toContain('SECURITY WARNING');
      expect(text).toContain('CONDUIT_S2S_SECRET');
      expect(text).toContain('MCP_ALLOW_INSECURE_DEV=1');
      expect(text).toContain('127.0.0.1');
      expect(text).not.toContain('not a loopback address');
      assertSecretNotLogged(text);
    } finally {
      exit.restore();
      logs.restore();
      await close?.();
    }
  });

  it.each(['0.0.0.0', '10.1.2.3'])(
    'forces 127.0.0.1 when the dev bypass is set and MCP_HTTP_HOST is %s',
    async (host) => {
      process.env.MCP_ALLOW_INSECURE_DEV = '1';
      process.env.MCP_HTTP_HOST = host;
      const logs = captureStderr();
      const exit = refuseExit();
      let close: (() => Promise<void>) | undefined;

      try {
        const server = await listen();
        close = server.close;
        expect(server.address).toBe('127.0.0.1');
        const text = logs.text();
        expect(text).toContain(`MCP_HTTP_HOST=${host} is not a loopback address`);
        expect(text).toContain('forces the listener to 127.0.0.1 only');
        assertSecretNotLogged(text);
      } finally {
        exit.restore();
        logs.restore();
        await close?.();
      }
    },
  );

  it('forces 127.0.0.1 for the dev bypass even when MCP_HTTP_HOST is localhost', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = 'localhost';
    const logs = captureStderr();
    const exit = refuseExit();
    let close: (() => Promise<void>) | undefined;
    try {
      const server = await listen();
      close = server.close;
      expect(server.address).toBe('127.0.0.1');
      expect(logs.text()).toContain('SECURITY WARNING');
      expect(logs.text()).not.toContain('not a loopback address');
    } finally {
      exit.restore();
      logs.restore();
      await close?.();
    }
  });

  it('honors a non-loopback MCP_HTTP_HOST when CONDUIT_S2S_SECRET is set', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const logs = captureStderr();
    const server = await listen();
    try {
      expect(server.address).toBe('0.0.0.0');
      expect(logs.text()).not.toContain('not a loopback address');
      assertSecretNotLogged(logs.text());
    } finally {
      logs.restore();
      await server.close();
    }
  });

  it('binds 127.0.0.1 when MCP_HTTP_HOST is unset and a secret is configured', async () => {
    delete process.env.MCP_HTTP_HOST;
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    const server = await listen();
    try {
      expect(server.address).toBe('127.0.0.1');
    } finally {
      await server.close();
    }
  });
});

describe('HTTP /mcp authentication', () => {
  beforeEach(() => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.AUTH_MODE = 'gateway';
    process.env.MCP_HTTP_HOST = '127.0.0.1';
    process.env.TIMEZEST_API_TOKEN = ENV_TOKEN;
  });

  it('returns 401 when the S2S header is missing or invalid and does not log the secret', async () => {
    const logs = captureStderr();
    const server = await listen();
    try {
      const missing = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({ 'x-timezest-api-token': HEADER_TOKEN }),
        body: statusCall,
      });
      const invalid = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader('wrong-secret'),
          'x-timezest-api-token': HEADER_TOKEN,
        }),
        body: statusCall,
      });

      expect(missing.status).toBe(401);
      expect(invalid.status).toBe(401);
      expect(missing.body).toContain('X-Gateway-S2S');
      expect(invalid.body).toContain('X-Gateway-S2S');
      expect(missing.body).not.toContain(S2S_SECRET);
      expect(invalid.body).not.toContain(S2S_SECRET);
      expect(missing.body).not.toContain(ENV_TOKEN);
      expect(invalid.body).not.toContain(HEADER_TOKEN);
      assertSecretNotLogged(logs.text());
      expect(getCredentialsMock).not.toHaveBeenCalled();
      expect(runWithCredentialsMock).not.toHaveBeenCalled();
    } finally {
      logs.restore();
      await server.close();
    }
  });

  it('returns 401 in gateway mode without credential headers and does not use env credentials', async () => {
    const server = await listen();
    try {
      const response = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
        body: statusCall,
      });
      const whitespace = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
          'x-timezest-api-token': '   ',
        }),
        body: statusCall,
      });

      expect(response.status).toBe(401);
      expect(whitespace.status).toBe(401);
      expect(response.body).toContain('Missing credentials');
      expect(response.body).toContain('X-Timezest-Api-Token');
      expect(response.body).not.toContain(ENV_TOKEN);
      expect(response.body).not.toContain(S2S_SECRET);
      expect(whitespace.body).not.toContain(ENV_TOKEN);
      expect(getCredentialsMock).not.toHaveBeenCalled();
      expect(runWithCredentialsMock).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('accepts a valid S2S header plus the credential header and uses that credential', async () => {
    const logs = captureStderr();
    const server = await listen();
    try {
      const response = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
          'x-timezest-api-token': HEADER_TOKEN,
        }),
        body: statusCall,
      });

      expect(response.status).toBe(200);
      expect(response.body).not.toContain(S2S_SECRET);
      expect(response.body).not.toContain(ENV_TOKEN);
      expect(response.body).not.toContain(HEADER_TOKEN);
      const payload = JSON.parse(response.body) as {
        result?: { content?: Array<{ text?: string }> };
      };
      const text = payload.result?.content?.[0]?.text ?? '';
      expect(text).toContain('TimeZest MCP Server');
      expect(runWithCredentialsMock).toHaveBeenCalledWith(
        { apiToken: HEADER_TOKEN },
        expect.any(Function),
      );
      expect(getCredentialsMock).not.toHaveBeenCalled();
      assertSecretNotLogged(logs.text());
    } finally {
      logs.restore();
      await server.close();
    }
  });

  it('serves /health without authentication and without reading credentials', async () => {
    const server = await listen();
    try {
      const response = await sendHttp({
        port: server.port,
        method: 'GET',
        path: '/health',
      });
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body) as { status?: string; authMode?: string };
      expect(body.status).toBe('ok');
      expect(body.authMode).toBe('gateway');
      expect(response.body).not.toContain(S2S_SECRET);
      expect(response.body).not.toContain(ENV_TOKEN);
      expect(getCredentialsMock).not.toHaveBeenCalled();
      expect(runWithCredentialsMock).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});

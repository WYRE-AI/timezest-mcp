#!/usr/bin/env node

/**
 * TimeZest MCP Server Entry Point
 * Supports both stdio and HTTP transports
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { startHttpServer } from './http.js';
import { logger } from './utils/logger.js';

async function main() {
  const transport = process.env.MCP_TRANSPORT || 'stdio';
  const httpPort = parseInt(process.env.MCP_HTTP_PORT || '8080', 10);

  logger.info('Starting TimeZest MCP server', { transport, httpPort });

  if (transport === 'http') {
    // Fail-closed S2S startup, loopback dev bypass, and gateway credential
    // rejection live in startHttpServer. stdio does not use S2S auth.
    startHttpServer(httpPort);
  } else {
    // Stdio transport for direct connections
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('TimeZest MCP server running on stdio');
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });
}
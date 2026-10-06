import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createLakePassMcpServer } from './server';

export const mcpRouter = Router();
mcpRouter.use((req, res, next) => {
  const expected = process.env.MCP_API_KEY;
  if (!expected || expected.length < 32) {
    res.status(503).json({ error: 'MCP is not configured.' });
    return;
  }
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!match || !timingSafeEqual(digest(match[1]), digest(expected))) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="lake-pass-mcp"');
    res.status(401).json({ error: 'Invalid or missing MCP bearer token.' });
    return;
  }
  next();
});
mcpRouter.post('/', async (req, res) => {
  const server = createLakePassMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { void server.close().catch(() => {}); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal MCP server error.' } });
  }
});
// Stateless: no persistent SSE stream or sessions to delete.
mcpRouter.all('/', (_req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed.' } });
});

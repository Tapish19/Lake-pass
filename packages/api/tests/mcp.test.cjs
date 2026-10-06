const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const dbPath = require.resolve('../dist/api/src/lib/prisma.js');
const calls = [];
let conflict = null, blockout = null, status = 'available', fail = false;
const prisma = {
  marina: { findMany: async q => { calls.push(q); if (fail) throw Error('secret password'); return [{ id: 'm1' }]; } },
  boat: { findMany: async q => { calls.push(q); return [{ id: 'b1' }]; }, findFirst: async q => { calls.push(q); return { id: 'b1', status, turnaroundBuffer: 30 }; } },
  reservation: { findFirst: async q => { calls.push(q); return conflict; } },
  blockout: { findFirst: async q => { calls.push(q); return blockout; } },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma } };
const { mcpRouter } = require('../dist/api/src/mcp/router.js');
const token = 'test-only-key-012345678901234567890123456789';
let httpServer, url, client;
before(async () => {
  process.env.MCP_API_KEY = token;
  const app = express();
  app.use(express.json()); app.use('/mcp', mcpRouter);
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise(resolve => httpServer.once('listening', resolve));
  url = new URL(`http://127.0.0.1:${httpServer.address().port}/mcp`);
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
});
after(async () => { await client?.close(); await new Promise(resolve => httpServer.close(resolve)); delete process.env.MCP_API_KEY; });
const data = r => JSON.parse(r.content[0].text);
test('authentication, disabled endpoint, and key rotation', async () => {
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  process.env.MCP_API_KEY = 'rotated-token-012345678901234567890123456789';
  assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  delete process.env.MCP_API_KEY;
  assert.equal((await fetch(url)).status, 503);
  process.env.MCP_API_KEY = token;
  assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status, 405);
});
test('HTTP MCP initialization and tool discovery', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), ['check_availability', 'list_boats', 'list_marinas']);
  assert.ok(tools.every(t => t.annotations.readOnlyHint));
});
test('bounded catalog queries select public fields', async () => {
  calls.length = 0;
  assert.equal(data(await client.callTool({ name: 'list_marinas', arguments: {} }))[0].id, 'm1');
  assert.equal(calls[0].take, 25); assert.equal(calls[0].where.isActive, true);
  assert.equal(calls[0].select.stripeAccountId, undefined);
  assert.equal((await client.callTool({ name: 'list_boats', arguments: { limit: 101 } })).isError, true);
  await client.callTool({ name: 'list_boats', arguments: { guests: 4 } });
  assert.equal(calls.at(-1).where.capacity.gte, 4);
  assert.equal(calls.at(-1).where.marina.isActive, true);
});
test('availability respects buffers, blockouts, maintenance, and input validation', async () => {
  const args = { boatId: 'b1', startDate: '2026-10-10T10:00:00Z', endDate: '2026-10-10T12:00:00Z' };
  const check = extra => client.callTool({ name: 'check_availability', arguments: { ...args, ...extra } });
  calls.length = 0;
  assert.equal(data(await check()).available, true);
  assert.equal(calls[1].where.startDate.lt.toISOString(), '2026-10-10T12:30:00.000Z');
  assert.equal(calls[1].where.endDate.gt.toISOString(), '2026-10-10T09:30:00.000Z');
  assert.equal(calls[2].where.startDate.lt.toISOString(), '2026-10-10T12:00:00.000Z');
  conflict = { id: 'private-reservation' };
  const r = await check(); assert.equal(data(r).available, false);
  assert.ok(!JSON.stringify(r).includes('private-reservation'));
  conflict = null; blockout = { id: 'private-blockout' };
  assert.equal(data(await check()).available, false);
  blockout = null; status = 'maintenance';
  assert.equal(data(await check()).available, false); status = 'available';
  assert.equal((await check({ endDate: args.startDate })).isError, true);
  assert.equal((await check({ startDate: 'invalid' })).isError, true);
});
test('database errors do not leak connection secrets', async () => {
  fail = true;
  const r = await client.callTool({ name: 'list_marinas', arguments: {} });
  assert.equal(r.isError, true); assert.ok(!JSON.stringify(r).includes('password')); fail = false;
});

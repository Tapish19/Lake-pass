import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { prisma } from '../lib/prisma';

const id = z.string().min(1).max(128);
const pagination = {
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).max(10000).default(0),
};
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const boatFields = {
  id: true, marinaId: true, name: true, type: true, capacity: true,
  dailyRate: true, hourlyRate: true, description: true, amenities: true,
  photoUrls: true, status: true,
} as const;
function result(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}
async function safely(action: () => Promise<unknown>) {
  try { return result(await action()); }
  catch {
    // Database errors can contain credentials; never return them to clients.
    return { ...result({ error: 'Unable to query Lake Pass. Please try again later.' }), isError: true };
  }
}

/** One server per request keeps the endpoint stateless across replicas. */
export function createLakePassMcpServer() {
  const server = new McpServer({ name: 'lake-pass', version: '1.0.0' });
  server.registerTool('list_marinas', {
    description: 'List active Lake Pass marinas. Results are paginated.',
    inputSchema: { lake: z.string().min(1).max(200).optional(), ...pagination }, annotations,
  }, ({ lake, limit, offset }) => safely(() => prisma.marina.findMany({
    where: { isActive: true, ...(lake ? { lake: { contains: lake, mode: 'insensitive' as const } } : {}) },
    select: { id: true, name: true, lake: true, city: true, state: true, latitude: true, longitude: true, logoUrl: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }], take: limit, skip: offset,
  })));
  server.registerTool('list_boats', {
    description: 'List active boats at active marinas with rental rates. Use check_availability before planning a booking.',
    inputSchema: { marinaId: id.optional(), type: z.string().min(1).max(100).optional(), guests: z.number().int().min(1).max(1000).optional(), ...pagination }, annotations,
  }, ({ marinaId, type, guests, limit, offset }) => safely(() => prisma.boat.findMany({
    where: { isActive: true, marina: { isActive: true }, marinaId, type, ...(guests ? { capacity: { gte: guests } } : {}) },
    select: boatFields, orderBy: [{ dailyRate: 'asc' }, { id: 'asc' }], take: limit, skip: offset,
  })));
  server.registerTool('check_availability', {
    description: 'Check one boat for an exact time range including reservations, turnaround buffer, and maintenance blockouts. This snapshot does not hold or book the boat. Supply ISO 8601 timestamps with timezone offsets.',
    inputSchema: { boatId: id, startDate: z.string().datetime({ offset: true }), endDate: z.string().datetime({ offset: true }) }, annotations,
  }, async ({ boatId, startDate, endDate }) => {
    const start = new Date(startDate), end = new Date(endDate);
    if (end <= start) return { ...result({ error: 'endDate must be after startDate.' }), isError: true };
    return safely(async () => {
      const boat = await prisma.boat.findFirst({
        where: { id: boatId, isActive: true, marina: { isActive: true } },
        select: { id: true, status: true, turnaroundBuffer: true },
      });
      if (!boat) return { boatId, available: false, reason: 'Boat not found in the active catalog.' };
      if (boat.status === 'maintenance') return { boatId, available: false, reason: 'Boat is under maintenance.' };
      const buffer = boat.turnaroundBuffer * 60_000;
      const [reservation, blockout] = await Promise.all([
        prisma.reservation.findFirst({
          where: { boatId, status: { in: ['pending', 'confirmed', 'checked_in'] }, startDate: { lt: new Date(end.getTime() + buffer) }, endDate: { gt: new Date(start.getTime() - buffer) } },
          select: { id: true },
        }),
        prisma.blockout.findFirst({ where: { boatId, startDate: { lt: end }, endDate: { gt: start } }, select: { id: true } }),
      ]);
      return { boatId, startDate, endDate, available: !reservation && !blockout, reason: reservation ? 'Reservation or turnaround conflict.' : blockout ? 'Boat is blocked for this period.' : null, checkedAt: new Date().toISOString() };
    });
  });
  return server;
}

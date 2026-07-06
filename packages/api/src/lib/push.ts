/**
 * Server-side push notifications via the Expo Push API.
 * Works for any client (consumer mobile app today; a future staff mobile
 * app tomorrow) that registers an Expo push token.
 *
 * No extra package needed — Expo's push endpoint is a plain HTTPS JSON API.
 */
import { prisma } from './prisma';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

async function sendExpoPush(messages: PushMessage[]) {
  if (!messages.length) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body:    JSON.stringify(messages.map(m => ({ ...m, sound: 'default' }))),
    });
    if (!res.ok) {
      console.error('[push] Expo push API responded', res.status, await res.text().catch(() => ''));
    }
  } catch (err: any) {
    console.error('[push] failed to send', err?.message);
  }
}

/** Push a single consumer their push token (if any) */
export async function sendConsumerPush(userId: string, title: string, body: string, data?: Record<string, any>) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } });
  if (!user?.pushToken) return;
  await sendExpoPush([{ to: user.pushToken, title, body, data }]);
}

/**
 * Alert all staff (owner/manager/staff) at a marina who have registered a
 * push token. Used for: new bookings, low-fuel / maintenance flags, walk-ins.
 */
export async function sendStaffPush(marinaId: string, title: string, body: string, data?: Record<string, any>) {
  const staff = await prisma.staffMember.findMany({
    where:  { marinaId, pushToken: { not: null } },
    select: { pushToken: true },
  });
  const messages = staff
    .filter(s => !!s.pushToken)
    .map(s => ({ to: s.pushToken as string, title, body, data }));
  await sendExpoPush(messages);
}

export async function notifyStaffNewBooking(marinaId: string, boatName: string, customerName: string, startDate: Date) {
  await sendStaffPush(
    marinaId,
    '🚤 New booking',
    `${customerName} booked ${boatName} for ${startDate.toLocaleDateString()}`,
    { type: 'new_booking' },
  );
}

export async function notifyStaffMaintenance(marinaId: string, boatName: string, type: string, notes?: string | null) {
  const isLowFuel = type === 'fuel' && /low/i.test(notes ?? '');
  await sendStaffPush(
    marinaId,
    isLowFuel ? '⛽ Low fuel alert' : `🔧 Maintenance logged — ${boatName}`,
    isLowFuel ? `${boatName} was flagged low on fuel.` : (notes || `New ${type} entry for ${boatName}`),
    { type: isLowFuel ? 'low_fuel' : 'maintenance' },
  );
}

export async function notifyStaffWalkIn(marinaId: string, boatName: string, walkInName: string) {
  await sendStaffPush(marinaId, '🧑‍✈️ Walk-in booked', `${walkInName} — ${boatName}`, { type: 'walk_in' });
}

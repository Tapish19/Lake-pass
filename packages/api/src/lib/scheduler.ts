/**
 * scheduler.ts
 *
 * Lightweight in-process cron scheduler using setInterval.
 * Runs two jobs:
 *   1. Reminder job  — fires every hour, sends 24h-before reminders
 *   2. Cleanup job   — fires daily, marks no-shows for missed check-ins
 *
 * For production at scale, replace setInterval with a proper job queue
 * (BullMQ, pg-boss, etc.) or a cloud scheduler (AWS EventBridge, Render Cron).
 * The sendReminder() function is idempotent — NotificationLog deduplication
 * prevents double-sends if the process restarts.
 */
import { prisma } from './prisma';
import { sendReminder } from './notifications';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;

async function runReminderJob() {
  const now       = new Date();
  const in24h     = new Date(now.getTime() + DAY_MS);
  const in25h     = new Date(now.getTime() + DAY_MS + HOUR_MS);

  // Find confirmed reservations starting in the next 24-25h window
  // that have NOT already had a reminder sent (no matching NotificationLog row)
  const upcoming = await prisma.reservation.findMany({
    where: {
      status:    'confirmed',
      startDate: { gte: in24h, lt: in25h },
      notifications: {
        none: { type: 'reminder' },
      },
    },
    include: {
      boat: { include: { marina: true } },
      user: true,
    },
  });

  for (const r of upcoming) {
    try {
      await sendReminder(r);
      console.log(`[scheduler] reminder sent for reservation ${r.id}`);
    } catch (err) {
      console.error(`[scheduler] reminder failed for reservation ${r.id}:`, err);
    }
  }
}

async function runNoShowJob() {
  const cutoff = new Date(Date.now() - 4 * HOUR_MS); // 4 hours past start time

  // Auto-mark confirmed reservations as no_show if start date passed 4h ago
  const result = await prisma.reservation.updateMany({
    where: {
      status:    'confirmed',
      startDate: { lt: cutoff },
    },
    data: { status: 'no_show' },
  });

  if (result.count > 0) {
    console.log(`[scheduler] marked ${result.count} reservation(s) as no_show`);
  }
}

export function startReminderScheduler() {
  console.log('[scheduler] starting reminder and no-show scheduler');

  // Run immediately on startup, then every hour
  runReminderJob().catch(err => console.error('[scheduler] initial reminder run failed:', err));
  setInterval(() => {
    runReminderJob().catch(err => console.error('[scheduler] reminder job error:', err));
  }, HOUR_MS);

  // No-show check every 2 hours
  setInterval(() => {
    runNoShowJob().catch(err => console.error('[scheduler] no-show job error:', err));
  }, 2 * HOUR_MS);
}

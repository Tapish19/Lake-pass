/**
 * Thin wrapper around SendGrid (email) and Twilio (SMS).
 * Both are optional — if env vars are missing, notifications are logged
 * to console only (useful for local dev without real credentials).
 *
 * Install:  pnpm add @sendgrid/mail twilio  (in packages/api)
 */
import { prisma } from './prisma';

// ── lazy-import so the API boots without the packages if omitted ──────────────
async function getSendGrid() {
  try {
    const sg = await import('@sendgrid/mail');
    sg.default.setApiKey(process.env.SENDGRID_API_KEY!);
    return sg.default;
  } catch {
    return null;
  }
}

async function getTwilio() {
  try {
    const twilio = await import('twilio');
    return twilio.default(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  } catch {
    return null;
  }
}

// ── email ─────────────────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string, reservationId: string, type: string) {
  const sg = await getSendGrid();
  try {
    if (sg && process.env.SENDGRID_FROM_EMAIL) {
      await sg.send({ to, from: process.env.SENDGRID_FROM_EMAIL, subject, html });
    } else {
      console.log(`[EMAIL – ${type}] to=${to} subject="${subject}"`);
    }
    await prisma.notificationLog.create({
      data: { reservationId, type, channel: 'email', recipient: to },
    });
  } catch (err: any) {
    console.error(`[EMAIL ERROR – ${type}]`, err?.message);
    await prisma.notificationLog.create({
      data: { reservationId, type, channel: 'email', recipient: to, error: String(err?.message) },
    });
  }
}

// ── SMS ───────────────────────────────────────────────────────────────────────
async function sendSms(to: string, body: string, reservationId: string, type: string) {
  const client = await getTwilio();
  try {
    if (client && process.env.TWILIO_FROM_NUMBER) {
      await client.messages.create({ to, from: process.env.TWILIO_FROM_NUMBER, body });
    } else {
      console.log(`[SMS – ${type}] to=${to} body="${body}"`);
    }
    await prisma.notificationLog.create({
      data: { reservationId, type, channel: 'sms', recipient: to },
    });
  } catch (err: any) {
    console.error(`[SMS ERROR – ${type}]`, err?.message);
    await prisma.notificationLog.create({
      data: { reservationId, type, channel: 'sms', recipient: to, error: String(err?.message) },
    });
  }
}

// ── public helpers ─────────────────────────────────────────────────────────────

interface ReservationInfo {
  id: string;
  startDate: Date;
  endDate: Date;
  totalAmount?: number | null;
  boat: { name: string; marina: { name: string; phone?: string | null } };
  user: { name: string; email: string; phone?: string | null };
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export async function sendConfirmation(r: ReservationInfo) {
  const subject = `Your Lake Pass booking is confirmed — ${r.boat.name}`;
  const html = `
    <h2>Booking Confirmed! 🚤</h2>
    <p>Hi ${r.user.name}, your reservation for <strong>${r.boat.name}</strong> at <strong>${r.boat.marina.name}</strong> is confirmed.</p>
    <ul>
      <li><strong>Start:</strong> ${formatDate(r.startDate)}</li>
      <li><strong>End:</strong> ${formatDate(r.endDate)}</li>
      ${r.totalAmount != null ? `<li><strong>Total:</strong> $${r.totalAmount.toFixed(2)}</li>` : ''}
    </ul>
    <p>Marina contact: ${r.boat.marina.phone ?? 'see your itinerary in the app'}</p>
    <p>See you on the water!</p>
  `;
  await sendEmail(r.user.email, subject, html, r.id, 'confirmation');
  if (r.user.phone) {
    await sendSms(
      r.user.phone,
      `Lake Pass ✓ ${r.boat.name} at ${r.boat.marina.name} confirmed for ${formatDate(r.startDate)}. Booking ID: ${r.id}`,
      r.id, 'confirmation',
    );
  }
}

export async function sendReminder(r: ReservationInfo) {
  const subject = `Reminder: your boat rental is tomorrow — ${r.boat.name}`;
  const html = `
    <h2>Heads up — your rental is tomorrow! 🌊</h2>
    <p>Hi ${r.user.name}, this is a reminder that your <strong>${r.boat.name}</strong> rental at <strong>${r.boat.marina.name}</strong> starts tomorrow (${formatDate(r.startDate)}).</p>
    <p>Marina phone: ${r.boat.marina.phone ?? 'check the app'}</p>
  `;
  await sendEmail(r.user.email, subject, html, r.id, 'reminder');
  if (r.user.phone) {
    await sendSms(
      r.user.phone,
      `Lake Pass reminder: ${r.boat.name} rental at ${r.boat.marina.name} is tomorrow. Questions? ${r.boat.marina.phone ?? 'see the app'}.`,
      r.id, 'reminder',
    );
  }
}

export async function sendNoShowNotice(r: ReservationInfo) {
  const subject = `Your Lake Pass booking has been marked no-show`;
  const html = `
    <p>Hi ${r.user.name}, your reservation for <strong>${r.boat.name}</strong> on ${formatDate(r.startDate)} was marked as a no-show by the marina.</p>
    <p>If you believe this is an error, please contact ${r.boat.marina.name} directly${r.boat.marina.phone ? ` at ${r.boat.marina.phone}` : ''}.</p>
  `;
  await sendEmail(r.user.email, subject, html, r.id, 'no_show');
}

export async function sendCancellationNotice(r: ReservationInfo) {
  const subject = `Your Lake Pass booking has been cancelled`;
  const html = `
    <p>Hi ${r.user.name}, your reservation for <strong>${r.boat.name}</strong> on ${formatDate(r.startDate)} has been cancelled.</p>
    <p>If you paid a deposit or full amount, your refund will appear within 5–10 business days.</p>
  `;
  await sendEmail(r.user.email, subject, html, r.id, 'cancellation');
  if (r.user.phone) {
    await sendSms(
      r.user.phone,
      `Lake Pass: Your ${r.boat.name} booking on ${formatDate(r.startDate)} was cancelled. Refunds within 5–10 biz days.`,
      r.id, 'cancellation',
    );
  }
}

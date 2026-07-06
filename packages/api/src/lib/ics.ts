/**
 * Minimal iCalendar (.ics) parser + generator.
 *
 * We intentionally avoid pulling in a heavy third-party ICS library —
 * marina calendar exports (Google Calendar, Outlook, Airbnb, a simple
 * spreadsheet-to-ics tool) are simple VEVENT blocks, and that's all we
 * need to support for calendar import/export.
 */

export interface ParsedEvent {
  uid?: string;
  summary?: string;
  start: Date;
  end: Date;
}

function unfoldLines(text: string): string[] {
  // RFC 5545: lines starting with a space/tab are continuations of the
  // previous line and should be joined.
  const raw = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsDate(value: string): Date {
  // Forms we handle: 20260615T140000Z | 20260615T140000 | 20260615
  const v = value.trim();
  if (/^\d{8}$/.test(v)) {
    const y = +v.slice(0, 4), m = +v.slice(4, 6), d = +v.slice(6, 8);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (m) {
    const [, y, mo, d, h, mi, s, z] = m;
    return z
      ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
      : new Date(+y, +mo - 1, +d, +h, +mi, +s);
  }
  // Fall back to native parsing (handles e.g. with TZID, best-effort)
  const fallback = new Date(v);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

/** Parses raw .ics text into a flat list of VEVENT start/end ranges. */
export function parseIcs(text: string): ParsedEvent[] {
  const lines  = unfoldLines(text);
  const events: ParsedEvent[] = [];
  let current: Partial<ParsedEvent> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current?.start && current?.end) events.push(current as ParsedEvent);
      current = null;
      continue;
    }
    if (!current) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const keyPart = line.slice(0, idx); // may include ;params, e.g. DTSTART;VALUE=DATE
    const value   = line.slice(idx + 1);
    const key     = keyPart.split(';')[0].toUpperCase();

    if (key === 'DTSTART') current.start = parseIcsDate(value);
    else if (key === 'DTEND') current.end = parseIcsDate(value);
    else if (key === 'SUMMARY') current.summary = value;
    else if (key === 'UID') current.uid = value;
  }

  return events.filter(e => e.end.getTime() > e.start.getTime());
}

function formatIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

interface ExportableEvent {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  description?: string;
}

/** Generates a basic .ics feed — used to let marinas export bookings into Google Calendar via "subscribe by URL". */
export function generateIcs(calendarName: string, events: ExportableEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lake Pass//Boat Reservations//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${calendarName}`,
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(e.start)}`,
      `DTEND:${formatIcsDate(e.end)}`,
      `SUMMARY:${(e.summary || '').replace(/[\r\n]+/g, ' ')}`,
      ...(e.description ? [`DESCRIPTION:${e.description.replace(/[\r\n]+/g, ' ')}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

#!/usr/bin/env node
// Standalone round-trip test for the timezone math used in src/utils/datetime.ts.
// Mirrors localInputToIsoInTz / isoToLocalInputInTz exactly so reviewers can verify
// the algorithm without a JS test runner. Run with: node scripts/test-datetime.cjs

function localInputToIsoInTz(localValue, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localValue);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6] || 0);
  const candidateUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = dtf.formatToParts(new Date(candidateUtc));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const tzY = get('year');
  const tzMo = get('month');
  const tzD = get('day');
  let tzH = get('hour');
  const tzMi = get('minute');
  const tzS = get('second');
  if (tzH === 24) tzH = 0;
  const tzWallAsUtc = Date.UTC(tzY, tzMo - 1, tzD, tzH, tzMi, tzS);
  const offsetMs = tzWallAsUtc - candidateUtc;
  return new Date(candidateUtc - offsetMs).toISOString();
}

function isoToLocalInputInTz(iso, tz) {
  const date = new Date(iso);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  let h = get('hour');
  if (h === '24') h = '00';
  return `${get('year')}-${get('month')}-${get('day')}T${h}:${get('minute')}`;
}

let pass = 0, fail = 0;

function assertEq(actual, expected, label) {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}\n      expected: ${expected}\n      actual:   ${actual}`);
  }
}

function roundTrip(localValue, tz) {
  const iso = localInputToIsoInTz(localValue, tz);
  const back = isoToLocalInputInTz(iso, tz);
  return { iso, back };
}

console.log('Asia/Taipei (no DST, fixed +08:00)');
{
  const { iso, back } = roundTrip('2026-05-30T20:00', 'Asia/Taipei');
  assertEq(iso, '2026-05-30T12:00:00.000Z', 'iso matches +08:00 offset');
  assertEq(back, '2026-05-30T20:00', 'wall-clock round-trips');
}

console.log('America/Los_Angeles (PDT, summer)');
{
  const { iso, back } = roundTrip('2026-06-15T18:00', 'America/Los_Angeles');
  assertEq(iso, '2026-06-16T01:00:00.000Z', 'iso matches -07:00 PDT offset');
  assertEq(back, '2026-06-15T18:00', 'wall-clock round-trips');
}

console.log('America/Los_Angeles (PST, winter)');
{
  const { iso, back } = roundTrip('2026-01-15T18:00', 'America/Los_Angeles');
  assertEq(iso, '2026-01-16T02:00:00.000Z', 'iso matches -08:00 PST offset');
  assertEq(back, '2026-01-15T18:00', 'wall-clock round-trips');
}

console.log('Europe/London (BST, summer)');
{
  const { iso, back } = roundTrip('2026-06-15T12:00', 'Europe/London');
  assertEq(iso, '2026-06-15T11:00:00.000Z', 'iso matches +01:00 BST offset');
  assertEq(back, '2026-06-15T12:00', 'wall-clock round-trips');
}

console.log('Europe/London (GMT, winter)');
{
  const { iso, back } = roundTrip('2026-01-15T12:00', 'Europe/London');
  assertEq(iso, '2026-01-15T12:00:00.000Z', 'iso matches +00:00 GMT offset');
  assertEq(back, '2026-01-15T12:00', 'wall-clock round-trips');
}

console.log('Cross-timezone scenario: Taipei sender, LA viewer');
{
  // Sender in Taipei picks "2026-05-30 20:00" (Taipei wall-clock)
  const iso = localInputToIsoInTz('2026-05-30T20:00', 'Asia/Taipei');
  // Viewer in LA prefilling: same ISO → LA wall-clock should be 5:00 AM same day (PDT)
  const laWallClock = isoToLocalInputInTz(iso, 'America/Los_Angeles');
  assertEq(laWallClock, '2026-05-30T05:00', 'LA viewer sees 5:00 AM same day');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

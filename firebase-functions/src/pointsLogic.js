const LOOKUP_PHONE_PATTERN = /^\d{9,10}$/;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function bangkokDateParts(date) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    ms: date.getUTCMilliseconds(),
  };
}

function lastDayOfMonth(year, month1to12) {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

export function parseInstant(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'object') {
    if (typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000 + (Number(value.nanoseconds) || 0) / 1e6);
    }
    if (typeof value._seconds === 'number') {
      return new Date(value._seconds * 1000 + (Number(value._nanoseconds) || 0) / 1e6);
    }
  }
  return null;
}

/** บวกเดือนตามปฏิทินกรุงเทพฯ · 31 ม.ค. + 1 เดือน = วันสุดท้ายของ ก.พ. ไม่ล้นไปมี.ค. */
export function addCalendarMonths(date, months) {
  const parts = bangkokDateParts(date);
  const monthIndex = (parts.month - 1) + Number(months);
  let year = parts.year + Math.floor(monthIndex / 12);
  let month0 = monthIndex % 12;
  if (month0 < 0) {
    month0 += 12;
    year -= 1;
  }
  const month = month0 + 1;
  const day = Math.min(parts.day, lastDayOfMonth(year, month));
  return new Date(`${year}-${pad2(month)}-${pad2(day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}.${String(parts.ms).padStart(3, '0')}+07:00`);
}

export function computePointsExpireAt(lastOrderAt, months) {
  const n = Number(months);
  if (!Number.isFinite(n) || n <= 0) return null;
  const last = parseInstant(lastOrderAt);
  if (!last) return null;
  return addCalendarMonths(last, n);
}

export function shouldExpirePoints(lastOrderAt, months, now = new Date()) {
  const expireAt = computePointsExpireAt(lastOrderAt, months);
  if (!expireAt) return false;
  return expireAt.getTime() <= now.getTime();
}

export function buildExpireHistoryEntry(points, months, at) {
  return {
    delta: -points,
    reason: 'expire',
    by: 'system:expire',
    at,
    note: `แต้มหมดอายุ ไม่ได้มาซื้อ ${months} เดือน`,
  };
}

export function resolvePointsEarned(order) {
  if (order?.pointsEarned != null && Number.isFinite(Number(order.pointsEarned))) {
    return Math.max(0, Math.floor(Number(order.pointsEarned)));
  }
  return Math.max(0, Math.floor(Number(order?.total || 0) / 10));
}

export function computeAutoApproveTake(earn, pendingPoints) {
  const earned = Math.max(0, Number(earn) || 0);
  const pending = Math.max(0, Number(pendingPoints) || 0);
  return Math.min(earned, pending);
}

export function isQrOrder(order) {
  return order?.source === 'qr' || !!order?.checkoutRequestId;
}

export function shouldAutoApproveQrPoints(before, after) {
  if (!after) return false;
  if (after.isPaid !== true) return false;
  if (before && before.isPaid === true) return false;
  if (after.pointsAutoApproved) return false;
  if (!isQrOrder(after)) return false;
  if (!after.memberPhone) return false;
  return true;
}

export function isLookupPhone(phone) {
  return LOOKUP_PHONE_PATTERN.test(String(phone || ''));
}

export function publicMemberLookup(member) {
  if (!member) return { exists: false };
  return {
    exists: true,
    name: String(member.name || ''),
    points: Number(member.points) || 0,
    pendingPoints: Number(member.pendingPoints) || 0,
    pointsExpireAt: member.pointsExpireAt ?? null,
  };
}

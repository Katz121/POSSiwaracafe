const EARN_REASONS = new Set(['order', 'review', 'recalc']);
const MANUAL_REASONS = new Set(['manual', 'bill-edit']);
const WINDOW_MS = 24 * 60 * 60 * 1000;
const DUP_WINDOW_MS = 60_000;
const CLUSTER_MS = 10 * 60 * 1000;
const HIGH_EARN = 100;
const POS_SPIKE_MULT = 3;

function asMs(now) {
  if (now instanceof Date) return now.getTime();
  const n = Number(now);
  return Number.isFinite(n) ? n : Date.now();
}

function parseAt(at) {
  if (at == null) return NaN;
  if (typeof at === 'number') return Number.isFinite(at) ? at : NaN;
  if (typeof at === 'object' && at.seconds != null) return Number(at.seconds) * 1000;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : NaN;
}

export function orderTimeMs(order) {
  const fromCreated = parseAt(order?.createdAt);
  if (Number.isFinite(fromCreated)) return fromCreated;
  const date = String(order?.date || '');
  const time = String(order?.time || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{1,2}:\d{2}/.test(time)) {
    const ms = Date.parse(`${date}T${time.length === 5 ? time : time.slice(0, 5)}:00+07:00`);
    if (Number.isFinite(ms)) return ms;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const ms = Date.parse(`${date}T00:00:00+07:00`);
    if (Number.isFinite(ms)) return ms;
  }
  return NaN;
}

function bangkokISODate(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function thaiDateLabel(now) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(now);
}

function isSystemBy(by) {
  return String(by || '').startsWith('system:');
}

function inWindow(ms, start, end) {
  return Number.isFinite(ms) && ms >= start && ms <= end;
}

export function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 6) return d || '';
  return `${d.slice(0, 3)}xxxx${d.slice(-3)}`;
}

function memberLabel(member) {
  const name = String(member?.name || '').trim() || 'ไม่ระบุชื่อ';
  const phone = maskPhone(member?.phone || member?.id);
  return phone ? `${name} ${phone}` : name;
}

function who(by) {
  const s = String(by || '').trim();
  return s || 'ไม่ระบุ';
}

function fmt(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

function historyOf(member) {
  return Array.isArray(member?.pointsHistory) ? member.pointsHistory : [];
}

function windowEntries(member, start, end) {
  return historyOf(member).filter((e) => {
    const at = parseAt(e?.at);
    if (!Number.isFinite(at)) return false;
    return inWindow(at, start, end);
  });
}

function isPosOrder(order) {
  return order?.source !== 'qr';
}

function isActiveOrder(order) {
  return order?.status !== 'cancelled';
}

function memberPhoneOf(order) {
  return String(order?.memberPhone || '').replace(/\D/g, '');
}

function matchesMember(order, member) {
  const phone = memberPhoneOf(order);
  if (!phone) return false;
  const ids = [member?.phone, member?.id].map((v) => String(v || '').replace(/\D/g, '')).filter(Boolean);
  return ids.includes(phone);
}

function secondsLabel(spanMs) {
  const sec = Math.max(1, Math.ceil(spanMs / 1000));
  return `ภายใน ${fmt(sec)} วินาที`;
}

function maxCluster(times, windowMs) {
  const sorted = times.filter(Number.isFinite).sort((a, b) => a - b);
  let best = 0;
  let bestSpan = 0;
  let left = 0;
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > windowMs) left += 1;
    const count = right - left + 1;
    if (count > best) {
      best = count;
      bestSpan = sorted[right] - sorted[left];
    }
  }
  return { count: best, spanMs: bestSpan };
}

function duplicateFlags(member, entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = `${Number(e.delta)}|${e.reason || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const flags = [];
  for (const [, list] of groups) {
    const times = list.map((e) => parseAt(e.at));
    const { count, spanMs } = maxCluster(times, DUP_WINDOW_MS);
    if (count < 2) continue;
    const sample = list[0];
    flags.push(
      `อนุมัติซ้ำ ${memberLabel(member)} · ${fmt(count)} ครั้ง (${Number(sample.delta) > 0 ? '+' : ''}${fmt(sample.delta)} ${sample.reason || '-'}) ${secondsLabel(spanMs)}`
    );
  }
  return flags;
}

/**
 * สรุปแต้มสมาชิกช่วง 24 ชม. ล่าสุดตามเวลาไทย
 * @param {object[]} members
 * @param {object[]} orders
 * @param {number|Date} now
 */
export function buildPointsSummary(members = [], orders = [], now = Date.now()) {
  const nowMs = asMs(now);
  const start = nowMs - WINDOW_MS;
  const today = bangkokISODate(new Date(nowMs));
  const list = Array.isArray(members) ? members : [];
  const bills = Array.isArray(orders) ? orders.filter(isActiveOrder) : [];

  let manualPoints = 0;
  let autoQrPoints = 0;
  let redeemCount = 0;
  let redeemPoints = 0;
  let expirePoints = 0;
  const earnByMember = [];
  const flags = [];

  let pendingPeople = 0;
  let pendingSum = 0;

  for (const member of list) {
    const pending = Number(member?.pendingPoints) || 0;
    if (pending > 0) {
      pendingPeople += 1;
      pendingSum += pending;
    }

    const entries = windowEntries(member, start, nowMs);
    let earned = 0;

    for (const e of entries) {
      const delta = Number(e?.delta) || 0;
      const reason = e?.reason;
      const by = e?.by;

      if (EARN_REASONS.has(reason)) {
        if (by === 'system:auto-qr') autoQrPoints += delta;
        else if (!isSystemBy(by)) manualPoints += delta;
        if (delta > 0) earned += delta;
      }
      if (reason === 'redeem') {
        redeemCount += 1;
        redeemPoints += Math.abs(delta);
      }
      if (reason === 'expire') expirePoints += Math.abs(delta);
    }

    earnByMember.push({ member, earned });
    flags.push(...duplicateFlags(member, entries));

    for (const e of entries) {
      if (!MANUAL_REASONS.has(e?.reason)) continue;
      const delta = Number(e?.delta) || 0;
      flags.push(
        `แก้มือ ${who(e.by)} → ${memberLabel(member)} · ${delta > 0 ? '+' : ''}${fmt(delta)} แต้ม`
      );
    }

    for (const e of entries) {
      const delta = Number(e?.delta) || 0;
      const orderId = e?.orderId;
      if (!orderId || e?.reason !== 'manual' || !(delta < 0)) continue;
      flags.push(`ลบบิล ${memberLabel(member)} · ${fmt(delta)} แต้ม · บิล ${orderId}`);
    }

    if (earned > HIGH_EARN) {
      flags.push(`ได้แต้มเกิน 100 ${memberLabel(member)} · ${fmt(earned)} แต้ม`);
    }
  }

  const ordersById = new Map(bills.map((o) => [String(o.id || ''), o]));
  for (const member of list) {
    const ids = Array.isArray(member?.pendingOrderIds) ? member.pendingOrderIds : [];
    for (const oid of ids) {
      const order = ordersById.get(String(oid));
      if (!order) continue;
      const phone = memberPhoneOf(order);
      if (!phone) {
        flags.push(`ถอดสมาชิกจากบิล ${memberLabel(member)} · บิล ${oid}`);
        continue;
      }
      if (!matchesMember(order, member)) {
        flags.push(`ถอดสมาชิกจากบิล ${memberLabel(member)} · บิล ${oid}`);
      }
    }

    for (const e of windowEntries(member, start, nowMs)) {
      const orderId = e?.orderId;
      if (!orderId || e?.reason !== 'bill-edit') continue;
      const order = ordersById.get(String(orderId));
      if (!order) continue;
      if (!memberPhoneOf(order) || !matchesMember(order, member)) {
        flags.push(`ถอดสมาชิกจากบิล ${memberLabel(member)} · บิล ${orderId}`);
      }
    }
  }

  for (const member of list) {
    const times = bills
      .filter((o) => matchesMember(o, member))
      .map(orderTimeMs)
      .filter((ms) => inWindow(ms, start, nowMs));
    const { count, spanMs } = maxCluster(times, CLUSTER_MS);
    if (count >= 3) {
      flags.push(`บิลถี่ ${memberLabel(member)} · ${fmt(count)} บิลใน 10 นาที (${secondsLabel(spanMs)})`);
    }
  }

  const uniqueToday = [];
  const seen = new Set();
  for (const o of bills) {
    const ms = orderTimeMs(o);
    const isToday = String(o.date || '') === today
      || (!o.date && Number.isFinite(ms) && bangkokISODate(new Date(ms)) === today);
    if (!isToday) continue;
    const key = String(o.id || `${o.date}-${o.time}-${o.total}`);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueToday.push(o);
  }
  const totals = uniqueToday.map((o) => Number(o.total) || 0);
  const avg = totals.length ? totals.reduce((s, n) => s + n, 0) / totals.length : 0;
  if (avg > 0) {
    for (const o of uniqueToday) {
      if (!isPosOrder(o) || !memberPhoneOf(o)) continue;
      const total = Number(o.total) || 0;
      if (total > avg * POS_SPIKE_MULT) {
        const q = o.queueNumber != null ? `#${o.queueNumber}` : (o.id ? `บิล ${o.id}` : 'บิล');
        flags.push(`บิล POS สูงผิดปกติ ${q} ฿${fmt(total)} (เฉลี่ยวันนี้ ฿${fmt(avg)})`);
      }
    }
  }

  earnByMember.sort((a, b) => b.earned - a.earned || memberLabel(a.member).localeCompare(memberLabel(b.member), 'th'));
  const top = earnByMember.filter((x) => x.earned > 0).slice(0, 3);

  const uniqueFlags = [...new Set(flags)];

  const lines = [
    `สรุปแต้มสมาชิก · ${thaiDateLabel(new Date(nowMs))}`,
    'ช่วง 24 ชม. ล่าสุด (เวลาไทย)',
    '',
    'แต้มออกวันนี้',
    `· อนุมัติมือ ${fmt(manualPoints)} แต้ม`,
    `· อัตโนมัติ QR ${fmt(autoQrPoints)} แต้ม`,
    `· แลก ${fmt(redeemCount)} ครั้ง / ${fmt(redeemPoints)} แต้ม`,
    `· หมดอายุ ${fmt(expirePoints)} แต้ม`,
    '',
    'รออนุมัติตอนนี้',
    `· ${fmt(pendingPeople)} คน · ${fmt(pendingSum)} แต้ม`,
    '',
    'ได้แต้มมากสุด',
  ];
  if (top.length) {
    top.forEach((row, i) => lines.push(`${i + 1}. ${memberLabel(row.member)} · ${fmt(row.earned)} แต้ม`));
  } else {
    lines.push('ไม่มี');
  }
  lines.push('', 'ควรเช็ค');
  if (uniqueFlags.length) uniqueFlags.forEach((f) => lines.push(`· ${f}`));
  else lines.push('ไม่พบสิ่งผิดปกติ');

  return {
    text: lines.join('\n'),
    manualPoints,
    autoQrPoints,
    redeemCount,
    redeemPoints,
    expirePoints,
    pendingPeople,
    pendingPoints: pendingSum,
    topEarners: top,
    flags: uniqueFlags,
  };
}

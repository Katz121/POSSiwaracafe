import { it, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import worker from '../worker.js';
import { cakeOrderKey, sanitizeCakeOrder, resetCakeOrderHits } from '../src/cakeOrder.js';
import { memoryKV } from './helpers.js';

// ลูกค้าส่งรหัสออเดอร์เข้าแชท → บอทต้องตอบรูปลายที่เลือก + สรุป โดยใช้ reply (ฟรี)
// เทสนี้เดินทั้งเส้น: ลายเซ็น LINE → webhook → เรียก /message/reply จริง (ดัก fetch ไว้)

const SECRET = 'line-secret';
const ENV_BASE = {
  LINE_CHANNEL_SECRET: SECRET,
  LINE_CHANNEL_TOKEN: 'test-token',   // ข้ามการออก token
};

async function sign(body) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

function textEvent(text, userId = 'U0000000000000000000000000000001') {
  return {
    events: [{
      type: 'message', replyToken: 'reply-token-1',
      source: { type: 'user', userId },
      message: { type: 'text', text },
    }],
  };
}

describe('webhook ตอบรหัสออเดอร์เค้ก', () => {
  let env; let replies; let realFetch;

  beforeEach(() => {
    resetCakeOrderHits();
    replies = [];
    realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/message/reply')) {
        replies.push(JSON.parse(options.body));
        return new Response('{}', { status: 200 });
      }
      if (String(url).includes('/v2/bot/profile/')) {
        return Response.json({ displayName: 'ลูกค้า' });
      }
      throw new Error(`Unmocked: ${url}`);
    });
    env = { ...ENV_BASE, FOLLOWERS: memoryKV() };
  });

  afterEach(() => { globalThis.fetch = realFetch; });

  const post = async (payload) => {
    const body = JSON.stringify(payload);
    return worker.fetch(
      new Request('https://worker.test/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-line-signature': await sign(body) },
        body,
      }),
      env,
      { waitUntil() {} },
    );
  };

  const seed = async (code, extra = {}) => {
    const order = sanitizeCakeOrder({
      design: 'C03', designName: 'ช็อกโกแลตเรดบีนเค้ก', img: 'cakes/v2/c03.jpg',
      size: '1 ปอนด์ ประมาณ 8 คน', flavor: 'ช็อกโกแลต', date: 'เสาร์ 27 ก.ย.', time: '14:00',
      fulfill: 'รับที่ร้าน', total: 390, name: 'ฟ้า', tel: '0891234567',
    });
    await env.FOLLOWERS.put(cakeOrderKey(code), JSON.stringify({ order, createdAt: '2026-09-20T00:00:00Z', ...extra }));
  };

  it('ส่งรหัสที่มีอยู่ → ได้รูปลายที่เลือกกับสรุปออเดอร์', async () => {
    await seed('SW-7K2Q');
    const res = await post(textEvent('สั่งเค้ก (จากเว็บ) ... รหัส SW-7K2Q'));
    expect(res.status).toBe(200);
    expect(replies).toHaveLength(1);
    const msgs = replies[0].messages;
    expect(msgs[0].type).toBe('image');
    expect(msgs[0].originalContentUrl).toBe('https://siwaracafe.com/cakes/v2/c03.jpg');
    expect(msgs[1].text).toContain('SW-7K2Q');
    expect(msgs[1].text).toContain('0891234567');
  });

  it('ส่งรหัสซ้ำ → ไม่ส่งรูปซ้ำ และบอกว่าถึงร้านแล้ว', async () => {
    await seed('SW-7K2Q');
    await post(textEvent('SW-7K2Q'));
    replies.length = 0;
    await post(textEvent('SW-7K2Q'));
    const msgs = replies[0].messages;
    expect(msgs.some((m) => m.type === 'image')).toBe(false);
    expect(msgs.at(-1).text).toContain('ส่งถึงร้านแล้ว');
  });

  it('รหัสไม่มีในระบบ → บอกว่าไม่พบ ไม่ใบ้ข้อมูลออเดอร์อื่น', async () => {
    await post(textEvent('SW-ZZZZ'));
    const text = replies[0].messages[0].text;
    expect(text).toContain('ไม่พบรหัส');
    expect(text).not.toContain('ฟ้า');
  });

  // ข้อความออเดอร์มีคำว่า "เค้ก" อยู่ด้วยเสมอ ถ้ากฎคีย์เวิร์ดชิงตอบก่อน ลูกค้าจะไม่ได้รูป
  it('ข้อความที่มีรหัสต้องไม่ตกไปที่กฎคีย์เวิร์ดเค้ก', async () => {
    await seed('SW-7K2Q');
    await post(textEvent('สั่งเค้กวันเกิด รหัส SW-7K2Q'));
    expect(replies[0].messages[0].type).toBe('image');
  });

  it('ลายเซ็นผิด = ไม่ตอบอะไรเลย', async () => {
    const body = JSON.stringify(textEvent('SW-7K2Q'));
    const res = await worker.fetch(
      new Request('https://worker.test/webhook', {
        // ลายเซ็นมั่ว (HTTP header ใส่ภาษาไทยไม่ได้ เลยใช้ base64 ที่ไม่ตรง)
        method: 'POST', headers: { 'x-line-signature': 'bm90LWEtcmVhbC1zaWduYXR1cmU=' }, body,
      }),
      env,
      { waitUntil() {} },
    );
    expect(res.status).toBe(403);
    expect(replies).toHaveLength(0);
  });

  it('ข้อความปกติยังได้ auto-reply เหมือนเดิม', async () => {
    await post(textEvent('ร้านเปิดกี่โมง'));
    expect(replies[0].messages[0].text).toContain('เปิดอังคาร');
  });
});

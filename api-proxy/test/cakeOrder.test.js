import { it, expect, describe, beforeEach } from 'vitest';
import worker from '../worker.js';
import {
  sanitizeCakeOrder,
  extractCakeCode,
  makeCakeCode,
  cakeOrderKey,
  cakeImageUrl,
  cakeOrderSummary,
  buildCakeReplyMessages,
  resetCakeOrderHits,
  CAKE_ORDER_RATE_LIMIT,
} from '../src/cakeOrder.js';
import { memoryKV } from './helpers.js';

const ORDER_BODY = {
  design: 'C01',
  designName: 'เค้กเขียนชื่อ แต่งดอกไม้สด',
  img: 'cakes/v2/c01.jpg',
  size: '1 ปอนด์ ประมาณ 8 คน',
  flavor: 'วานิลลา',
  msg: 'Happy Birthday แม่',
  date: 'อาทิตย์ 28 ก.ย.',
  time: '15:00',
  fulfill: 'รับที่ร้าน',
  total: 390,
  name: 'ฟ้า',
  tel: '0891234567',
};

describe('sanitizeCakeOrder', () => {
  it('เก็บเฉพาะฟิลด์ที่ใช้ตอบกลับ และตัดความยาว', () => {
    const o = sanitizeCakeOrder({ ...ORDER_BODY, msg: 'ก'.repeat(500), secret: 'ห้ามหลุด' });
    expect(o.design).toBe('C01');
    expect(o.msg.length).toBe(80);
    expect(o.secret).toBeUndefined();
    expect(o.total).toBe(390);
  });

  // รูปต้องเป็นไฟล์ของเว็บร้านเท่านั้น · ไม่งั้นบอทจะโพสต์รูปจากที่ไหนก็ได้ให้ลูกค้าดู
  it('ทิ้งรูปที่ไม่ใช่ไฟล์ของเว็บร้าน', () => {
    for (const bad of ['https://evil.example/x.jpg', '../../etc/passwd', 'cakes/v2/c01.jpg?x=1', 'cakes/v2/c1.jpg']) {
      expect(sanitizeCakeOrder({ ...ORDER_BODY, img: bad }).img).toBe('');
    }
    expect(sanitizeCakeOrder(ORDER_BODY).img).toBe('cakes/v2/c01.jpg');
  });

  it('ปฏิเสธ body ที่ไม่ใช่ออเดอร์', () => {
    expect(sanitizeCakeOrder(null)).toBeNull();
    expect(sanitizeCakeOrder([])).toBeNull();
    expect(sanitizeCakeOrder({ name: 'ฟ้า' })).toBeNull();
  });
});

describe('รหัสออเดอร์', () => {
  it('สร้างรหัสรูปแบบ SW-XXXX จากตัวอักษรที่อ่านไม่สับสน', () => {
    for (let i = 0; i < 50; i++) {
      expect(makeCakeCode()).toMatch(/^SW-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
    }
  });

  it('อ่านรหัสจากข้อความลูกค้าได้ทั้งตัวเล็กตัวใหญ่และไม่มีขีด', () => {
    expect(extractCakeCode('สั่งเค้ก (จากเว็บ) ... รหัส SW-7K2Q')).toBe('SW-7K2Q');
    expect(extractCakeCode('sw7k2q')).toBe('SW-7K2Q');
    expect(extractCakeCode('ไม่มีรหัสในนี้')).toBeNull();
  });

  it('คีย์ใน KV ขึ้นต้นด้วย order: เพื่อไม่ปนกับผู้ติดตาม', () => {
    expect(cakeOrderKey('SW-7K2Q')).toBe('order:SW7K2Q');
  });
});

describe('ข้อความตอบกลับ', () => {
  it('รูปมาก่อนสรุป และสรุปมีของที่ร้านต้องใช้ครบ', () => {
    const o = sanitizeCakeOrder(ORDER_BODY);
    const msgs = buildCakeReplyMessages(o, 'SW-7K2Q');
    expect(msgs[0].type).toBe('image');
    expect(msgs[0].originalContentUrl).toBe('https://siwaracafe.com/cakes/v2/c01.jpg');
    const summary = msgs[1].text;
    expect(summary).toContain('SW-7K2Q');
    expect(summary).toContain('1 ปอนด์');
    expect(summary).toContain('0891234567');
    expect(summary).toContain('390');
  });

  // ห้ามยืนยันคิวหรือราคาแทนเจ้าของ · ลูกค้าจะเข้าใจผิดว่าร้านรับงานแล้ว
  it('ไม่พูดแทนร้านว่ารับออเดอร์แล้ว', () => {
    const o = sanitizeCakeOrder(ORDER_BODY);
    const text = buildCakeReplyMessages(o, 'SW-7K2Q').at(-1).text;
    expect(text).toContain('รอทางร้าน');
    expect(text).not.toContain('รับออเดอร์เรียบร้อย');
  });

  it('ลายที่ลูกค้าส่งรูปเอง ไม่แนบรูปลายอื่นให้', () => {
    const o = sanitizeCakeOrder({ ...ORDER_BODY, design: 'own', img: '', designName: 'ส่งรูปของฉัน' });
    const msgs = buildCakeReplyMessages(o, 'SW-ABCD');
    expect(msgs.some((m) => m.type === 'image')).toBe(false);
    expect(msgs.at(-1).text).toContain('ส่งรูปแบบที่อยากได้');
  });

  it('ส่งรหัสซ้ำไม่ส่งรูปซ้ำ และบอกว่าถึงร้านแล้ว', () => {
    const o = sanitizeCakeOrder(ORDER_BODY);
    const msgs = buildCakeReplyMessages(o, 'SW-7K2Q', { repeat: true });
    expect(msgs.some((m) => m.type === 'image')).toBe(false);
    expect(msgs.at(-1).text).toContain('ส่งถึงร้านแล้ว');
  });

  it('cakeImageUrl คืนค่าว่างเมื่อไม่มีรูป', () => {
    expect(cakeImageUrl({ img: '' })).toBe('');
    expect(cakeOrderSummary({ design: 'C02', size: '2 ปอนด์' }, 'SW-1111')).toContain('SW-1111');
  });
});

describe('POST /cake-order', () => {
  let env;
  beforeEach(() => {
    resetCakeOrderHits();
    env = { FOLLOWERS: memoryKV() };
  });

  const post = (body, headers = {}) => worker.fetch(
    new Request('https://worker.test/cake-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    { waitUntil() {} },
  );

  it('เก็บออเดอร์แล้วคืนรหัส', async () => {
    const res = await post(ORDER_BODY);
    expect(res.status).toBe(200);
    const { code } = await res.json();
    expect(code).toMatch(/^SW-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
    const saved = await env.FOLLOWERS.get(cakeOrderKey(code), 'json');
    expect(saved.order.design).toBe('C01');
    expect(saved.createdAt).toBeTruthy();
  });

  it('ปฏิเสธ body ที่ไม่ใช่ออเดอร์หรือ JSON เสีย', async () => {
    expect((await post({ hello: 'world' })).status).toBe(400);
    expect((await post('{ not json')).status).toBe(400);
  });

  it('จำกัดจำนวนครั้งต่อ IP', async () => {
    for (let i = 0; i < CAKE_ORDER_RATE_LIMIT; i++) {
      expect((await post(ORDER_BODY)).status).toBe(200);
    }
    expect((await post(ORDER_BODY)).status).toBe(429);
  });

  it('ไม่มี KV = ตอบ 503 ไม่พังทั้ง worker', async () => {
    env = {};
    expect((await post(ORDER_BODY)).status).toBe(503);
  });
});

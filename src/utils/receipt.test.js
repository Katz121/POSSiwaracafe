import { describe, expect, it } from 'vitest';
import { buildReceiptModel } from './receipt';

const bill = {
  id: 'bill-abcdefgh', date: '2026-09-10', time: '09:30', queueNumber: 12, isPaid: true,
  items: [{ name: 'ลาเต้ #คั่วเข้ม', note: 'หวานน้อย', price: 65, quantity: 2 }, { name: 'เค้ก', price: 90, quantity: 1 }],
  subtotal: 220, discount: 10, vat: 0, total: 210,
};

describe('buildReceiptModel', () => {
  it('รักษาลำดับรายการและยอดที่บันทึกไว้', () => {
    const model = buildReceiptModel(bill);
    expect(model.lines).toEqual([
      { name: 'ลาเต้ #คั่วเข้ม', note: 'หวานน้อย', unitPrice: 65, quantity: 2, lineTotal: 130 },
      { name: 'เค้ก', note: '', unitPrice: 90, quantity: 1, lineTotal: 90 },
    ]);
    expect(model.totals).toMatchObject({ subtotal: 220, discount: 10, total: 210, itemCount: 3 });
    expect(model.meta).toMatchObject({ billNo: 'ABCDEFGH', timeText: '09:30', paidLabel: 'ชำระแล้ว' });
  });
  it('อ่านโปรโมชันจากบิลเดิม', () => {
    expect(buildReceiptModel({ ...bill, promotionTitle: 'ลดพิเศษ', promotionDiscountPercent: '15' }).totals)
      .toMatchObject({ promotionTitle: 'ลดพิเศษ', promotionPercent: 15 });
  });
  it('ไม่คำนวณ VAT และยอดชำระแทนบิล', () => {
    expect(buildReceiptModel({ ...bill, vatIncluded: true, vat: '123.45', subtotal: '999', total: '456' }).totals)
      .toMatchObject({ vatIncluded: true, vat: 123.45, subtotal: 999, total: 456, vatPercentage: 7 });
  });
  it('ระบุช่องทาง QR', () => {
    expect(buildReceiptModel({ ...bill, source: 'qr' }).meta.sourceLabel).toBe('สั่งผ่าน QR');
  });
  it('รองรับรายการที่ไม่มีและตัวเลขแบบข้อความ', () => {
    expect(buildReceiptModel({ total: '65', items: undefined }).totals).toMatchObject({ total: 65, itemCount: 0, subtotal: 0 });
    expect(buildReceiptModel({ items: [{ price: '65', quantity: '2' }, { price: 'oops' }] }).lines)
      .toMatchObject([{ unitPrice: 65, quantity: 2, lineTotal: 130 }, { unitPrice: 0, quantity: 0, lineTotal: 0 }]);
  });
  it('ไม่มีข้อมูลลูกค้าให้คืน null', () => {
    expect(buildReceiptModel(bill).customer).toBeNull();
  });
  it('ใช้ค่าร้านเริ่มต้นเมื่อ settings ว่าง', () => {
    expect(buildReceiptModel(bill, { settings: {} }).shop).toEqual({ name: 'ศิวรา คาเฟ่', address: '', phone: '', taxId: '', paperWidth: 80 });
  });
  it('รักษาวันที่บนบิลโดยไม่อิง createdAt', () => {
    const { dateText } = buildReceiptModel({ ...bill, createdAt: new Date('2026-09-09T16:00:00Z') }).meta;
    expect(dateText).toContain('10');
    expect(dateText).toContain('กันยายน');
    expect(dateText).toContain('2569');
  });
  it('ใช้วันที่และเวลาประเทศไทยจาก Firestore เมื่อไม่มี date', () => {
    const { meta } = buildReceiptModel({ createdAt: { seconds: Date.parse('2026-09-09T18:30:00Z') / 1000 } });
    expect(meta.dateText).toContain('10 กันยายน 2569');
    expect(meta.timeText).toBe('01:30');
  });
  it('อ่านค่าร้าน สมาชิก และกระดาษ 58mm', () => {
    const model = buildReceiptModel({ ...bill, memberPhone: '0812345678', memberNickname: 'เอ', bringOwnGlass: true }, {
      settings: { shopName: 'ร้านทดสอบ', shopAddress: 'กรุงเทพ', shopPhone: '021234567', taxId: '123', receiptPaperWidth: '58', receiptFooter: 'แล้วพบกัน', reviewUrl: 'https://example.com' },
    });
    expect(model.shop).toEqual({ name: 'ร้านทดสอบ', address: 'กรุงเทพ', phone: '021234567', taxId: '123', paperWidth: 58 });
    expect(model.customer).toEqual({ name: 'เอ', phone: 'xxx-xxx-5678' });
    expect(model.footer).toEqual({ message: 'แล้วพบกัน', reviewUrl: 'https://example.com' });
    expect(model.totals.bringOwnGlass).toBe(true);
  });
  it.each([
    ['0812345678', 'xxx-xxx-5678'],
    ['5678', 'xxx-xxx-5678'],
    ['123', '123'],
    ['', ''],
  ])('ปิดเบอร์ลูกค้า %s บนใบเสร็จเป็น %s', (phone, expected) => {
    expect(buildReceiptModel({ ...bill, memberNickname: 'เอ', memberPhone: phone }).customer.phone).toBe(expected);
  });
  it('เก็บชื่อลูกค้า QR แม้ไม่มีข้อมูลสมาชิก', () => {
    expect(buildReceiptModel({ ...bill, source: 'qr', memberNickname: 'ลูกค้า QR' }).customer)
      .toEqual({ name: 'ลูกค้า QR', phone: '' });
  });
});

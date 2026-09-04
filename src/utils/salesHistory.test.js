import { describe, it, expect } from 'vitest';
import { validDate, startOf, shift, buildSalesHistory, countUnits, isPieceCategory } from './salesHistory';

const order = (date, total) => ({ status: 'completed', date, total, items: [] });
const expense = (date, amount, title = 'ค่าไฟรายวัน', category = 'ค่าไฟ') =>
  ({ date, amount, title, category });

describe('validDate', () => {
  // บั๊กที่เคยเกิด: เดิมใช้ toISOString() เทียบ ซึ่งแปลงเป็น UTC
  // ไทยอยู่ UTC+7 เที่ยงคืนท้องถิ่นจึงกลายเป็นวันก่อนหน้าใน UTC
  // ผลคือทุกวันถูกตัดทิ้ง ทั้งหน้าตกลงถัง "ไม่ระบุวันที่"
  it('รับวันที่ปกติได้ ไม่ว่าเครื่องอยู่ timezone ไหน', () => {
    expect(validDate('2026-01-03')).toBe(true);
    expect(validDate('2026-08-31')).toBe(true);
    expect(validDate('2026-12-31')).toBe(true);
  });

  it('ปฏิเสธรูปแบบที่ไม่ใช่ YYYY-MM-DD', () => {
    expect(validDate('3/1/256')).toBe(false);
    expect(validDate('')).toBe(false);
    expect(validDate(null)).toBe(false);
    expect(validDate('2026-1-3')).toBe(false);
  });

  it('ปฏิเสธวันที่ไม่มีอยู่จริง', () => {
    expect(validDate('2026-02-31')).toBe(false);
    expect(validDate('2026-13-01')).toBe(false);
  });
});

describe('startOf / shift', () => {
  const now = new Date(2026, 8, 4); // 4 ก.ย. 2026

  it('คำนวณเดือนเริ่มต้นของแต่ละช่วง', () => {
    expect(startOf('all', now)).toBeNull();
    expect(startOf('month', now)).toBe('2026-09');
    expect(startOf('three', now)).toBe('2026-07');
    expect(startOf('six', now)).toBe('2026-04');
    expect(startOf('year', now)).toBe('2025-10');
  });

  it('เลื่อนเดือนข้ามปีได้', () => {
    expect(shift('2026-01', -1)).toBe('2025-12');
    expect(shift('2026-12', 1)).toBe('2027-01');
  });
});

describe('buildSalesHistory', () => {
  const orders = [
    order('2026-08-01', 100),
    order('2026-08-01', 50),
    order('2026-08-02', 200),
    order('2026-07-15', 300),
    order('3/1/256', 89), // วันที่เพี้ยนที่มีอยู่จริงในข้อมูลร้าน
  ];
  const expenses = [
    expense('2026-08-01', 40),
    expense('2026-08-02', 500),
    expense('2026-07-15', 60),
  ];

  it('แยกบิลเข้าเดือนและวันได้ถูกต้อง', () => {
    const data = buildSalesHistory(orders, expenses, 'all');
    const aug = data.ordered.find(month => month.key === '2026-08');

    expect(aug.bills).toHaveLength(3);
    expect(aug.revenue).toBe(350);
    expect(aug.expense).toBe(540);
    expect(aug.days.get('2026-08-01').revenue).toBe(150);
  });

  it('รวมยอดทั้งหมดถูก และไม่ทิ้งบิลที่วันที่เพี้ยน', () => {
    const data = buildSalesHistory(orders, expenses, 'all');

    expect(data.totals.bills).toBe(5);
    expect(data.totals.revenue).toBe(739);
    expect(data.totals.expense).toBe(600);
    expect(data.months.some(month => month.key === 'unknown')).toBe(true);
  });

  it('หาวันที่ขาดทุนได้', () => {
    const data = buildSalesHistory(orders, expenses, 'all');

    expect(data.losses).toHaveLength(1);
    expect(data.losses[0].key).toBe('2026-08-02');
  });

  it('รวมหัวข้อรายจ่ายที่ต่างกันแค่ช่องว่างเป็นรายการเดียว', () => {
    const data = buildSalesHistory([], [
      expense('2026-08-01', 10, 'ส้ม'),
      expense('2026-08-02', 20, 'ส้ม '),
      expense('2026-08-03', 30, ' ส้ม'),
    ], 'all');

    expect(data.titleRows).toHaveLength(1);
    expect(data.titleRows[0].count).toBe(3);
    expect(data.titleRows[0].amount).toBe(60);
  });

  it('ค่าเฉลี่ยรายวันในสัปดาห์ไม่นับวันปิดร้านที่ขายไม่ได้', () => {
    // 2026-08-03 คือวันจันทร์ · อีกวันจันทร์หนึ่งปิดร้านแต่มีรายจ่าย
    const data = buildSalesHistory(
      [order('2026-08-03', 900)],
      [expense('2026-08-10', 500)],
      'all',
    );
    const monday = data.weekdays.find(weekday => weekday.name === 'จันทร์');

    expect(monday.days).toBe(1);
    expect(monday.average).toBe(900);
  });

  it('ไม่มีข้อมูลในช่วง แล้วต้องไม่นับทุกหัวข้อเป็นต้นทุนคงที่', () => {
    const data = buildSalesHistory([], [], 'all');

    expect(data.fixedTitles).toHaveLength(0);
    expect(data.fixed).toBe(0);
  });

  it('จับหัวข้อที่จ่ายอย่างน้อยครึ่งหนึ่งของวันเป็นต้นทุนคงที่', () => {
    const data = buildSalesHistory(
      [order('2026-08-01', 10), order('2026-08-02', 10), order('2026-08-03', 10), order('2026-08-04', 10)],
      [
        expense('2026-08-01', 100),
        expense('2026-08-02', 100),
        expense('2026-08-03', 100),
        expense('2026-08-04', 250, 'ซื้อเมล็ดกาแฟ', 'วัตถุดิบ'),
      ],
      'all',
    );

    expect(data.fixedTitles.map(title => title.name)).toEqual(['ค่าไฟรายวัน']);
    expect(data.fixed).toBe(300);
  });
});

describe('countUnits / isPieceCategory', () => {
  it('แยกแก้ว (เครื่องดื่ม) กับชิ้น (ขนม) ได้', () => {
    const units = countUnits({
      items: [
        { category: 'Coffee', quantity: 2 },
        { category: 'Tea & Cocoa', quantity: 1 },
        { category: 'Cake', quantity: 3 },
      ],
    });

    expect(units).toEqual({ cups: 3, pieces: 3 });
  });

  it('หมวดเครื่องดื่มใหม่ที่ยังไม่รู้จัก ถูกนับเป็นแก้ว', () => {
    expect(countUnits({ items: [{ category: 'Smoothie', quantity: 4 }] }))
      .toEqual({ cups: 4, pieces: 0 });
  });

  it('รู้จักหมวดขนมทั้งไทยและอังกฤษ', () => {
    expect(isPieceCategory('Cake')).toBe(true);
    expect(isPieceCategory('เค้ก')).toBe(true);
    expect(isPieceCategory('เบเกอรี่')).toBe(true);
    expect(isPieceCategory('Coffee')).toBe(false);
    expect(isPieceCategory(undefined)).toBe(false);
  });

  it('บิลไม่มีรายการ ต้องได้ศูนย์ ไม่ใช่พัง', () => {
    expect(countUnits({})).toEqual({ cups: 0, pieces: 0 });
  });
});

describe('buildSalesHistory · นับแก้ว', () => {
  it('สะสมแก้วและชิ้นเข้าเดือน วัน และยอดรวม', () => {
    const data = buildSalesHistory([
      { status: 'completed', date: '2026-08-01', total: 100,
        items: [{ category: 'Coffee', quantity: 2 }, { category: 'Cake', quantity: 1 }] },
      { status: 'completed', date: '2026-08-01', total: 60,
        items: [{ category: 'มัทฉะ', quantity: 1 }] },
    ], [], 'all');

    expect(data.totals.cups).toBe(3);
    expect(data.totals.pieces).toBe(1);
    expect(data.ordered[0].cups).toBe(3);
    expect(data.ordered[0].days.get('2026-08-01').cups).toBe(3);
    expect(data.ordered[0].days.get('2026-08-01').pieces).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { parseManualExpenses, parseManualExpense, inferExpenseCategory, parseEdit, parseCallback, expenseDate } from '../src/telegram/parse.js';
import { NOW } from './helpers.js';
describe('manual parsing', () => {
  it.each(['นม 2000 กรัม 530', 'นม 2000 กรัม 530 บาท', 'นม | 2000 | กรัม | 530', 'นม 2,000 กรัม 530'])('parses %s', line => expect(parseManualExpenses(`รายจ่าย ${line}`)[0]).toMatchObject({ title: 'นม', quantity: 2000, unit: 'กรัม', amount: 530 }));
  it.each(['ค่าไฟ 1,530', 'ค่าไฟ 1,530 บาท'])('short %s', line => expect(parseManualExpense(line)).toEqual({ title: 'ค่าไฟ', quantity: 1, unit: 'ครั้ง', amount: 1530, category: 'ค่าไฟ' }));
  it('multiline and edit formats', () => {
    expect(parseManualExpenses('รายจ่าย\nนม 2 kg 530\nค่าไฟ 400')).toHaveLength(2);
    expect(parseEdit('แก้ไข 2 ค่าแรง 500 บาท', 2)).toMatchObject({ lineIdx: 1, line: { amount: 500 } });
    expect(parseEdit('แก้ไข 1 นม | 1 | kg | 50', 2).line.unit).toBe('กิโลกรัม');
    expect(parseEdit('แก้ไข 3 นม 50', 2)).toBeNull();
  });
  it.each(['', 'นม 0 กรัม 10', 'นม -2 กรัม 20', 'นม | 1 | กรัม | 1,2', 'นม 1 กรัม 0', 'นม 1 กรัม 30 บา'])('rejects %s', line => expect(parseManualExpense(line)).toBeNull());
  it.each([['ค่าไฟ', 'ค่าไฟ'], ['ไฟ', 'ค่าไฟ'], ['น้ำแข็ง', 'ค่าน้ำแข็ง'], ['เงินเดือน', 'ค่าแรง'], ['ค่าจ้าง', 'ค่าแรง'], ['ค่าเช่า', 'ค่าเช่า'], ['ads', 'การตลาด'], ['โฆษณา', 'การตลาด'], ['บูสต์', 'การตลาด'], ['อุปกรณ์', 'อุปกรณ์'], ['นม', 'นมและผลิตภัณฑ์นม'], ['เมล็ดกาแฟ', 'เมล็ดกาแฟ'], ['ไม่รู้จัก', null]])('category %s', (title, cat) => expect(inferExpenseCategory(title)).toBe(cat));
});
describe('callbacks and dates', () => {
  it.each(['c:abc12345', 'x:abc12345', 'e:abc12345', 'r:abc12345', 's:abc12345:0:new', 's:abc12345:0:skip', 's:abc12345:0:2', 'k:abc12345:1:4'])('accepts %s', value => expect(parseCallback(value)?.batchId).toBe('abc12345'));
  it.each(['expense_confirm', 'c:short', 'k:abc12345:0:new', 's:abc12345:-1:0', 's:abc12345:0:bad'])('rejects %s', value => expect(parseCallback(value)).toBeNull());
  it.each([['2026-09-10', '2026-09-10'], ['2026-08-27', '2026-08-27'], ['2026-08-26', '2026-09-10'], ['2026-09-11', '2026-09-10'], ['2026-02-30', '2026-09-10'], [null, '2026-09-10']])('date %s', (value, expected) => expect(expenseDate(value, NOW)).toBe(expected));
  it('uses Bangkok midnight', () => expect(expenseDate(null, Date.parse('2026-09-09T17:01:00Z'))).toBe('2026-09-10'));
});

import { describe, it, expect } from 'vitest';
import {
  extractJson, isRunnerFresh, redactPII, hasNestedArray, wrapPromptForMuse, effortForJobType, toMillis,
} from './museJobs';

describe('extractJson', () => {
  it('parses clean JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('[1,2]')).toEqual([1, 2]);
  });

  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"links":[]}\n```')).toEqual({ links: [] });
  });

  it('finds the object after a preamble and ignores trailing prose', () => {
    const text = 'นี่คือคำตอบครับ:\n{"links":[{"stockId":"x","usage":2}],"notes":"ใช้ {ประมาณ} นี้"}\nหวังว่าจะช่วยได้';
    expect(extractJson(text)).toEqual({ links: [{ stockId: 'x', usage: 2 }], notes: 'ใช้ {ประมาณ} นี้' });
  });

  it('respects braces inside strings and escaped quotes', () => {
    expect(extractJson('ok {"t":"a \\"}\\" b","n":[1]} end')).toEqual({ t: 'a "}" b', n: [1] });
  });

  it('skips a broken candidate and takes the next valid one', () => {
    expect(extractJson('ดู {ตัวอย่าง} แล้ว ["ชาไทย","โกโก้"]')).toEqual(['ชาไทย', 'โกโก้']);
  });

  it('throws when there is no JSON', () => {
    expect(() => extractJson('ขออภัย ตอบไม่ได้')).toThrow();
    expect(() => extractJson('')).toThrow();
  });
});

describe('isRunnerFresh', () => {
  const now = Date.parse('2026-09-24T10:00:00Z');
  it('is fresh within 90 seconds', () => {
    expect(isRunnerFresh({ lastSeen: '2026-09-24T09:59:00Z' }, now)).toBe(true);
    expect(isRunnerFresh({ lastSeen: '2026-09-24T09:58:31Z' }, now)).toBe(true);
  });
  it('is stale after 90 seconds', () => {
    expect(isRunnerFresh({ lastSeen: '2026-09-24T09:58:29Z' }, now)).toBe(false);
  });
  it('treats missing / unparsable / stopped runners as offline', () => {
    expect(isRunnerFresh(null, now)).toBe(false);
    expect(isRunnerFresh({}, now)).toBe(false);
    expect(isRunnerFresh({ lastSeen: 'nope' }, now)).toBe(false);
    expect(isRunnerFresh({ lastSeen: '2026-09-24T09:59:50Z', online: false }, now)).toBe(false);
  });
  it('tolerates small clock skew but not a far-future timestamp', () => {
    expect(isRunnerFresh({ lastSeen: '2026-09-24T10:00:30Z' }, now)).toBe(true);
    expect(isRunnerFresh({ lastSeen: '2026-09-24T10:05:00Z' }, now)).toBe(false);
  });
  it('accepts Firestore-like timestamps', () => {
    expect(toMillis({ toMillis: () => 5 })).toBe(5);
    expect(toMillis({ seconds: 2 })).toBe(2000);
  });
});

describe('redactPII', () => {
  it('masks Thai phone numbers in any common format', () => {
    const out = redactPII('โทร 0812345678 หรือ 081-234-5678 หรือ 02 123 4567 หรือ +66812345678');
    expect(out).not.toMatch(/\d{3}[- ]?\d{4}/);
    expect(out.match(/\[เบอร์โทร\]/g)).toHaveLength(4);
  });
  it('leaves money, quantities and ids alone', () => {
    const text = 'รายได้ 125,000 บาท ใช้ 0.015 กิโลกรัม id 07BtaY6rOmF7qr8q1lsX ปี 2026-09-24';
    expect(redactPII(text)).toBe(text);
  });
});

describe('job helpers', () => {
  it('detects nested arrays Firestore cannot store', () => {
    expect(hasNestedArray({ a: [1, 2] })).toBe(false);
    expect(hasNestedArray({ a: [{ b: [1] }] })).toBe(false);
    expect(hasNestedArray([[1], [2]])).toBe(true);
    expect(hasNestedArray({ a: [[1]] })).toBe(true);
  });
  it('wraps prompts with a JSON-only instruction for json jobs', () => {
    expect(wrapPromptForMuse({ type: 'json', prompt: 'P' })).toMatch(/JSON ล้วน/);
    expect(wrapPromptForMuse({ type: 'text', prompt: 'P' })).not.toMatch(/JSON ล้วน/);
    expect(wrapPromptForMuse({ type: 'text', prompt: 'P' })).toMatch(/ห้ามเดา/);
  });
  it('gives stock suggestions more thinking effort', () => {
    expect(effortForJobType('stockSuggest')).toBe('medium');
    expect(effortForJobType('text')).toBe('low');
    expect(effortForJobType('json')).toBe('low');
  });
});

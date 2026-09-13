import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'CustomerOrderApp.jsx'), 'utf8');

describe('CustomerOrderApp autofill wiring', () => {
  it('uses owner-approved marker copy and the warm lookup strings', () => {
    expect(src).toContain('สมาชิกกรอกแค่เบอร์ได้เลยค่ะ เดี๋ยวชื่อขึ้นให้เอง');
    expect(src).toContain("Members: just enter your phone — we'll fill in your name");
    expect(src).toContain('กำลังดูให้นะคะ');
    expect(src).toContain('ใส่ชื่อให้แล้วค่ะ แก้ได้ถ้าไม่ใช่ชื่อที่ต้องการ');
    expect(src).toContain('เบอร์นี้ยังไม่เป็นสมาชิก จะเริ่มสะสมแต้มจากบิลนี้ค่ะ');
    expect(src).toContain('เช็คเบอร์ไม่ได้นะคะ แต่สั่งได้ตามปกติค่ะ');
    expect(src).toContain("notMe: 'ไม่ใช่ฉัน'");
    expect(src).toContain("notMe: 'Not me'");
    expect(src).not.toMatch(/newPhoneHint: '[^']*ระบบ/);
    expect(src).not.toMatch(/memberPhoneShortcut: '[^']*ระบบ/);
  });

  it('keeps name before phone with autoFocus on the name field', () => {
    const nameBlock = src.indexOf('label={t(\'yourName\')}');
    const autoFocusAt = src.indexOf('autoFocus', nameBlock);
    const phoneBlock = src.indexOf('label={t(\'phoneLabel\')}');
    const markerAt = src.indexOf("t('memberPhoneShortcut')");
    expect(nameBlock).toBeGreaterThan(0);
    expect(autoFocusAt).toBeGreaterThan(nameBlock);
    expect(autoFocusAt).toBeLessThan(phoneBlock);
    expect(markerAt).toBeGreaterThan(nameBlock);
    expect(markerAt).toBeLessThan(phoneBlock);
    expect(src).not.toMatch(/nameInputRef\.current\.focus/);
    expect(src).not.toMatch(/querySelector\(['"]input['"]\)\.focus/);
  });

  it('gates usePoints on the current member phone and remembers siwara_member_phone', () => {
    expect(src).toContain('canRedeemOnSubmit');
    expect(src).toContain('lookupMemberByPhone');
    expect(src).toContain('decideNameAutofill');
    expect(src).toContain('writeRememberedPhone');
    expect(src).toContain('readRememberedPhone');
    expect(src).toContain('clearRememberedPhone');
    expect(src).toContain('shouldApplyLookupResult');
    expect(src).toContain("t('notMe')");
  });
});

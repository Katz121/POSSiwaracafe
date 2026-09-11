import { describe, expect, it } from 'vitest';
import { normalizeThaiPhoneInput } from './constants';

describe('normalizeThaiPhoneInput', () => {
  it('keeps 10 digits from spaced or dashed input', () => {
    expect(normalizeThaiPhoneInput('081 234 5678')).toBe('0812345678');
    expect(normalizeThaiPhoneInput('081-234-5678')).toBe('0812345678');
  });
  it('turns +66 autofill into a local number', () => {
    expect(normalizeThaiPhoneInput('+66 81 234 5678')).toBe('0812345678');
    expect(normalizeThaiPhoneInput('66812345678')).toBe('0812345678');
  });
  it('leaves partial typing alone and caps at 10 digits', () => {
    expect(normalizeThaiPhoneInput('66')).toBe('66');
    expect(normalizeThaiPhoneInput('08123456789')).toBe('0812345678');
    expect(normalizeThaiPhoneInput('')).toBe('');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_MIN_PHONE_LENGTH } from '../config/constants';
import {
  NAME_MAX_LENGTH,
  MEMBER_PHONE_STORAGE_KEY,
  LOOKUP_DEBOUNCE_MS,
  clampMemberName,
  canRedeemOnSubmit,
  canSubmitOrder,
  clearRememberedPhone,
  decideNameAutofill,
  decideReorderIdentity,
  initialNameAutofillState,
  isRememberablePhone,
  phoneToPrefillOnCheckout,
  readRememberedPhone,
  shouldApplyLookupResult,
  writeRememberedPhone,
} from './memberAutofill';

const PHONE_A = '0812345678';
const PHONE_B = '0891112222';
const empty = initialNameAutofillState();

const apply = (events, init = empty) =>
  events.reduce((state, event) => decideNameAutofill(state, event), init);

const memoryStorage = (seed = {}) => {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
    data,
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('clampMemberName', () => {
  it('case 18: trims, collapses spaces, and cuts at 60 without filtering charset', () => {
    expect(clampMemberName('  พี่  ขวัญ  ')).toBe('พี่ ขวัญ');
    expect(clampMemberName('วัดหัวพาน★')).toBe('วัดหัวพาน★');
    const long = `${'ก'.repeat(80)} ชื่อเล่น`;
    expect(clampMemberName(long)).toHaveLength(NAME_MAX_LENGTH);
    expect(clampMemberName(null)).toBe('');
    expect(clampMemberName('   ')).toBe('');
  });
});

describe('decideNameAutofill', () => {
  it('case 1: empty name + lookup hit fills and marks autofill', () => {
    const next = apply([{ type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' }]);
    expect(next).toEqual({
      customerName: 'พี่ขวัญ',
      nameSource: 'autofill',
      autofillName: 'พี่ขวัญ',
      autofillFromPhone: PHONE_A,
    });
  });

  it('case 2: user-typed name is never overwritten on lookup hit', () => {
    const next = apply([
      { type: 'name-input', nextName: 'เพื่อน' },
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
    ]);
    expect(next.customerName).toBe('เพื่อน');
    expect(next.nameSource).toBe('user');
  });

  it('case 3: editing an autofilled name becomes user and is not overwritten', () => {
    const next = apply([
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
      { type: 'name-input', nextName: 'ขวัญ' },
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
    ]);
    expect(next.customerName).toBe('ขวัญ');
    expect(next.nameSource).toBe('user');
  });

  it('case 4: deleting an autofilled name does not refill the same phone', () => {
    const afterDelete = apply([
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
      { type: 'name-input', nextName: '' },
    ]);
    expect(afterDelete).toMatchObject({ customerName: '', nameSource: 'user', autofillFromPhone: PHONE_A });
    const samePhone = decideNameAutofill(afterDelete, { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' });
    expect(samePhone.customerName).toBe('');
    expect(samePhone.nameSource).toBe('user');
  });

  it('case 5: deleting the phone clears an untouched autofill name', () => {
    const next = apply([
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
      { type: 'phone-below-min', phone: '08123456' },
    ]);
    expect(next).toEqual(empty);
  });

  it('case 6: switching to another member replaces an untouched autofill name', () => {
    const next = apply([
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
      { type: 'lookup-hit', phone: PHONE_B, memberName: 'วัดหัวพาน' },
    ]);
    expect(next).toEqual({
      customerName: 'วัดหัวพาน',
      nameSource: 'autofill',
      autofillName: 'วัดหัวพาน',
      autofillFromPhone: PHONE_B,
    });
  });

  it('case 7: switching to a non-member clears an untouched autofill name', () => {
    const next = apply([
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
      { type: 'lookup-miss', phone: PHONE_B },
    ]);
    expect(next).toEqual(empty);
  });

  it('case 8: phones shorter than min do not fill; 9+ digits can', () => {
    expect(MEMBER_MIN_PHONE_LENGTH).toBe(9);
    expect(LOOKUP_DEBOUNCE_MS).toBe(500);
    const short = apply([{ type: 'phone-below-min', phone: '08123456' }]);
    expect(short).toEqual(empty);
    const filled = decideNameAutofill(short, { type: 'lookup-hit', phone: '081234567', memberName: 'เอ' });
    expect(filled.customerName).toBe('เอ');
    expect(filled.nameSource).toBe('autofill');
  });

  it('case 9: stale lookup results are dropped before they can change name', () => {
    expect(shouldApplyLookupResult({
      cancelled: false,
      seq: 1,
      currentSeq: 2,
      resultPhone: PHONE_A,
      currentPhone: PHONE_B,
    })).toBe(false);
    expect(shouldApplyLookupResult({
      cancelled: true,
      seq: 2,
      currentSeq: 2,
      resultPhone: PHONE_B,
      currentPhone: PHONE_B,
    })).toBe(false);
    expect(shouldApplyLookupResult({
      cancelled: false,
      seq: 2,
      currentSeq: 2,
      resultPhone: PHONE_B,
      currentPhone: PHONE_B,
    })).toBe(true);
    const current = apply([{ type: 'lookup-hit', phone: PHONE_B, memberName: 'วัดหัวพาน' }]);
    expect(current.customerName).toBe('วัดหัวพาน');
  });

  it('case 10: restored drafts start with an empty name; phone prefill is separate', () => {
    expect(initialNameAutofillState()).toEqual(empty);
    expect(phoneToPrefillOnCheckout('', '')).toBe('');
    expect(phoneToPrefillOnCheckout('', PHONE_A)).toBe(PHONE_A);
    expect(phoneToPrefillOnCheckout('0890000000', PHONE_A)).toBe('0890000000');
  });

  it('case 11: reorder within the keep window treats an existing name as user', () => {
    const autofilled = apply([{ type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' }]);
    const kept = decideReorderIdentity(autofilled, { keepIdentity: true });
    expect(kept.customerName).toBe('พี่ขวัญ');
    expect(kept.nameSource).toBe('user');
    const lookupAgain = decideNameAutofill(kept, { type: 'lookup-hit', phone: PHONE_A, memberName: 'ชื่อในร้าน' });
    expect(lookupAgain.customerName).toBe('พี่ขวัญ');
  });

  it('case 12: lookup error clears untouched autofill but keeps a typed name', () => {
    const cleared = apply([
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
      { type: 'lookup-error', phone: PHONE_A },
    ]);
    expect(cleared).toEqual(empty);
    const typed = apply([
      { type: 'name-input', nextName: 'อร' },
      { type: 'lookup-error', phone: PHONE_A },
    ]);
    expect(typed).toMatchObject({ customerName: 'อร', nameSource: 'user' });
  });

  it('case 13: exists with empty/null member name does not fill', () => {
    expect(apply([{ type: 'lookup-hit', phone: PHONE_A, memberName: '' }])).toEqual(empty);
    expect(apply([{ type: 'lookup-hit', phone: PHONE_A, memberName: null }])).toEqual(empty);
    const typed = apply([
      { type: 'name-input', nextName: 'ลูกค้า' },
      { type: 'lookup-hit', phone: PHONE_A, memberName: '   ' },
    ]);
    expect(typed.customerName).toBe('ลูกค้า');
  });

  it('case 14: exists false does not fill', () => {
    expect(apply([{ type: 'lookup-miss', phone: PHONE_A }])).toEqual(empty);
  });

  it('case 15: overlapping lookups apply only the latest matching seq', () => {
    expect(shouldApplyLookupResult({
      cancelled: false,
      seq: 3,
      currentSeq: 3,
      resultPhone: '081 234 5678',
      currentPhone: PHONE_A,
    })).toBe(true);
    expect(shouldApplyLookupResult({
      cancelled: false,
      seq: 2,
      currentSeq: 3,
      resultPhone: PHONE_A,
      currentPhone: PHONE_A,
    })).toBe(false);
  });

  it('case 16: filling never returns a focus instruction', () => {
    const next = apply([{ type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' }]);
    expect(Object.keys(next).sort()).toEqual([
      'autofillFromPhone',
      'autofillName',
      'customerName',
      'nameSource',
    ]);
    expect(next).not.toHaveProperty('focus');
    const typedThenLookup = apply([
      { type: 'name-input', nextName: 'ก' },
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
    ]);
    expect(typedThenLookup.customerName).toBe('ก');
  });

  it('case 17: spaced / +66 phones normalize before they are stored as autofill source', () => {
    const next = apply([{ type: 'lookup-hit', phone: '+66 81 234 5678', memberName: 'เอ' }]);
    expect(next.autofillFromPhone).toBe(PHONE_A);
    expect(isRememberablePhone('08123456')).toBe(false);
    expect(isRememberablePhone('081234567')).toBe(true);
  });

  it('case 19: remembered phone shares the member-card key and Not me clears it', () => {
    const store = memoryStorage();
    writeRememberedPhone(PHONE_A, store);
    expect(store.getItem(MEMBER_PHONE_STORAGE_KEY)).toBe(PHONE_A);
    expect(readRememberedPhone(store)).toBe(PHONE_A);
    const filled = apply([{ type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' }]);
    const afterNotMe = decideNameAutofill(filled, { type: 'not-me' });
    expect(afterNotMe).toEqual(empty);
    clearRememberedPhone(store);
    expect(readRememberedPhone(store)).toBe('');
  });

  it('case 19b: Not me keeps a name the customer typed', () => {
    const next = apply([
      { type: 'name-input', nextName: 'เพื่อน' },
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
      { type: 'not-me' },
    ]);
    expect(next.customerName).toBe('เพื่อน');
    expect(next.nameSource).toBe('user');
  });

  it('case 20: browser autofill of the name field is treated as user input', () => {
    const next = apply([
      { type: 'name-input', nextName: 'Chrome Autofill' },
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
    ]);
    expect(next.customerName).toBe('Chrome Autofill');
    expect(next.nameSource).toBe('user');
  });

  it('case 21: there is no off-flag — lookup-hit is always allowed to fill an empty name', () => {
    const next = decideNameAutofill(empty, { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' });
    expect(next.nameSource).toBe('autofill');
    expect(next.customerName).toBe('พี่ขวัญ');
  });

  it('refills an empty user name after switching to a different member phone', () => {
    const next = apply([
      { type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' },
      { type: 'name-input', nextName: '' },
      { type: 'lookup-hit', phone: PHONE_B, memberName: 'วัดหัวพาน' },
    ]);
    expect(next).toMatchObject({
      customerName: 'วัดหัวพาน',
      nameSource: 'autofill',
      autofillFromPhone: PHONE_B,
    });
  });
});

describe('submit invariants', () => {
  it('case 22: submit does not wait on lookup; redeem only when member matches current phone', () => {
    expect(canSubmitOrder({ customerName: 'อร', cartLength: 1, submitting: false })).toBe(true);
    expect(canRedeemOnSubmit({
      usePoints: true,
      member: { phone: PHONE_A },
      phone: PHONE_B,
      pointsEligible: true,
    })).toBe(false);
    expect(canRedeemOnSubmit({
      usePoints: true,
      member: { phone: PHONE_A },
      phone: PHONE_A,
      pointsEligible: true,
    })).toBe(true);
  });

  it('case 23: empty name cannot submit even if lookup is about to return', () => {
    expect(canSubmitOrder({ customerName: '  ', cartLength: 2, submitting: false })).toBe(false);
    expect(canSubmitOrder({ customerName: 'อร', cartLength: 0, submitting: false })).toBe(false);
    expect(canSubmitOrder({ customerName: 'อร', cartLength: 1, submitting: true })).toBe(false);
  });

  it('case 24: a late 429 for the previous phone is ignored', () => {
    expect(shouldApplyLookupResult({
      cancelled: false,
      seq: 1,
      currentSeq: 2,
      resultPhone: '0812345670',
      currentPhone: PHONE_A,
    })).toBe(false);
    const typed = apply([{ type: 'name-input', nextName: 'อร' }]);
    const afterError = decideNameAutofill(typed, { type: 'lookup-error', phone: PHONE_A });
    expect(afterError.customerName).toBe('อร');
  });

  it('does not redeem when the toggle is on but points are short or member is missing', () => {
    expect(canRedeemOnSubmit({
      usePoints: true,
      member: { phone: PHONE_A },
      phone: PHONE_A,
      pointsEligible: false,
    })).toBe(false);
    expect(canRedeemOnSubmit({
      usePoints: true,
      member: null,
      phone: PHONE_A,
      pointsEligible: true,
    })).toBe(false);
    expect(canRedeemOnSubmit({
      usePoints: false,
      member: { phone: PHONE_A },
      phone: PHONE_A,
      pointsEligible: true,
    })).toBe(false);
  });
});

describe('remembered phone storage', () => {
  it('writes only valid phones and ignores private-mode failures', () => {
    const store = memoryStorage();
    writeRememberedPhone('123', store);
    expect(readRememberedPhone(store)).toBe('');
    writeRememberedPhone('+66 81 234 5678', store);
    expect(readRememberedPhone(store)).toBe(PHONE_A);
    const fail = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(readRememberedPhone(fail)).toBe('');
    expect(() => writeRememberedPhone(PHONE_A, fail)).not.toThrow();
    expect(() => clearRememberedPhone(fail)).not.toThrow();
  });

  it('case 11b: reorder after the keep window clears name state', () => {
    const filled = apply([{ type: 'lookup-hit', phone: PHONE_A, memberName: 'พี่ขวัญ' }]);
    expect(decideReorderIdentity(filled, { keepIdentity: false })).toEqual(empty);
  });
});

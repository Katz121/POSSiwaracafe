import { MEMBER_MIN_PHONE_LENGTH, normalizeThaiPhoneInput } from '../config/constants';

export const NAME_MAX_LENGTH = 60;
export const MEMBER_PHONE_STORAGE_KEY = 'siwara_member_phone';
export const LOOKUP_DEBOUNCE_MS = 500;

export function initialNameAutofillState() {
  return {
    customerName: '',
    nameSource: 'empty',
    autofillName: '',
    autofillFromPhone: '',
  };
}

export function clampMemberName(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
}

export function isRememberablePhone(phone) {
  return normalizeThaiPhoneInput(phone).length >= MEMBER_MIN_PHONE_LENGTH;
}

function storageOf(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readRememberedPhone(storage) {
  try {
    const store = storageOf(storage);
    if (!store) return '';
    const phone = normalizeThaiPhoneInput(store.getItem(MEMBER_PHONE_STORAGE_KEY));
    return isRememberablePhone(phone) ? phone : '';
  } catch {
    return '';
  }
}

export function writeRememberedPhone(phone, storage) {
  try {
    const store = storageOf(storage);
    if (!store) return;
    const normalized = normalizeThaiPhoneInput(phone);
    if (!isRememberablePhone(normalized)) return;
    store.setItem(MEMBER_PHONE_STORAGE_KEY, normalized);
  } catch {
    /* private mode */
  }
}

export function clearRememberedPhone(storage) {
  try {
    storageOf(storage)?.removeItem(MEMBER_PHONE_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

export function phoneToPrefillOnCheckout(currentPhone, rememberedPhone) {
  if (String(currentPhone || '').trim()) return currentPhone;
  const remembered = normalizeThaiPhoneInput(rememberedPhone);
  return isRememberablePhone(remembered) ? remembered : String(currentPhone || '');
}

export function canSubmitOrder({ customerName, cartLength, submitting }) {
  return String(customerName || '').trim().length > 0 && Number(cartLength) > 0 && !submitting;
}

export function canRedeemOnSubmit({ usePoints, member, phone, pointsEligible }) {
  const normalized = normalizeThaiPhoneInput(phone);
  return !!(usePoints && member && member.phone === normalized && pointsEligible);
}

export function shouldApplyLookupResult({ cancelled, seq, currentSeq, resultPhone, currentPhone }) {
  if (cancelled) return false;
  if (seq !== currentSeq) return false;
  const result = normalizeThaiPhoneInput(resultPhone);
  const current = normalizeThaiPhoneInput(currentPhone);
  return result.length >= MEMBER_MIN_PHONE_LENGTH && result === current;
}

function keepState(state) {
  return {
    customerName: state.customerName,
    nameSource: state.nameSource,
    autofillName: state.autofillName,
    autofillFromPhone: state.autofillFromPhone,
  };
}

function clearUntouchedAutofill(state) {
  if (state.nameSource === 'autofill' && state.customerName === state.autofillName) {
    return {
      customerName: '',
      nameSource: 'empty',
      autofillName: '',
      autofillFromPhone: '',
    };
  }
  if (state.nameSource === 'autofill') {
    return {
      ...keepState(state),
      nameSource: 'user',
    };
  }
  return keepState(state);
}

function fillFromMember(phone, memberName) {
  return {
    customerName: memberName,
    nameSource: 'autofill',
    autofillName: memberName,
    autofillFromPhone: phone,
  };
}

/**
 * Pure name-autofill state machine.
 * event.type: name-input | lookup-hit | lookup-miss | lookup-error | phone-below-min | not-me
 */
export function decideNameAutofill(state, event) {
  const current = keepState(state || initialNameAutofillState());
  const type = event?.type;

  if (type === 'name-input') {
    const nextName = String(event.nextName ?? '');
    if (nextName === current.customerName) return current;
    if (nextName.trim() === '' && current.nameSource === 'autofill' && current.customerName === current.autofillName) {
      return {
        customerName: '',
        nameSource: 'user',
        autofillName: current.autofillName,
        autofillFromPhone: current.autofillFromPhone,
      };
    }
    if (nextName.trim() === '' && current.nameSource === 'empty') {
      return { ...current, customerName: '' };
    }
    return {
      ...current,
      customerName: nextName,
      nameSource: 'user',
    };
  }

  if (type === 'lookup-hit') {
    const phone = normalizeThaiPhoneInput(event.phone);
    const memberName = clampMemberName(event.memberName);
    if (!memberName) return current;

    if (current.nameSource === 'user' && current.customerName.trim()) return current;
    if (current.nameSource === 'user' && !current.customerName.trim() && phone === current.autofillFromPhone) {
      return current;
    }
    if (current.nameSource === 'autofill' && current.customerName !== current.autofillName) {
      return { ...current, nameSource: 'user' };
    }
    if (current.nameSource === 'autofill' && current.customerName === current.autofillName) {
      return fillFromMember(phone, memberName);
    }
    if (current.nameSource === 'empty' || !current.customerName.trim()) {
      return fillFromMember(phone, memberName);
    }
    return current;
  }

  if (type === 'lookup-miss' || type === 'lookup-error' || type === 'phone-below-min') {
    return clearUntouchedAutofill(current);
  }

  if (type === 'not-me') {
    return clearUntouchedAutofill(current);
  }

  return current;
}

export function decideReorderIdentity(state, { keepIdentity } = {}) {
  const current = keepState(state || initialNameAutofillState());
  if (!keepIdentity) return initialNameAutofillState();
  if (current.customerName.trim()) {
    return { ...current, nameSource: 'user' };
  }
  return current;
}

// Display-only helpers shared by the customer QR page components.
import { MILK_OPTIONS, roundUpTo5 } from '../config/constants';

// Menu/category/bean names come from Firestore (the shop's own data). When the
// customer switches to English we show the `<field>En` value if the owner has
// filled it in, otherwise we fall back to the original Thai. `field` defaults to
// 'name' → 'nameEn'; pass 'description' for 'descriptionEn'.
export const dispField = (obj, lang, field = 'name') => {
  if (!obj) return '';
  const en = obj[`${field}En`];
  return lang === 'en' && en ? en : (obj[field] || '');
};

// Modifier-group headings are a small fixed set (not their own Firestore docs),
// so they are translated with a static map rather than a `nameEn` field.
const GROUP_EN = {
  'เมล็ดกาแฟ': 'Coffee Beans',
  'ผงมัทฉะ': 'Matcha Powder',
  'ส้ม': 'Orange',
};
export const dispGroup = (name, lang) => (lang === 'en' && GROUP_EN[name]) ? GROUP_EN[name] : (name || '');

export const milkLabelForLanguage = (milkType, lang) => {
  const option = MILK_OPTIONS.find((candidate) => candidate.value === milkType);
  return lang === 'en' ? option?.labelEn : option?.label;
};

// Coffee menus display prices rounded up to the nearest 5 baht (same rule the
// cart line applies when it charges).
export const displayPrice = (item, price) => (item?.allowBeanModifier ? roundUpTo5(price) : price);

// One-line summary of a cart line's options: "#Ethiopia · นมโอ๊ต · หวาน 50%".
export const lineOptionSummary = (line, t, lang) => [
  line.beanModifier ? line.beanModifier.replace(/#/g, '').trim() : '',
  line.milkLabel ? (milkLabelForLanguage(line.milkType, lang) || line.milkLabel) : '',
  line.sweetness != null ? `${t('sweetness')} ${line.sweetness}%` : '',
].filter(Boolean).join(' · ');

// The note a line gets automatically from its options (see buildCartLine). A
// note equal to this is not something the customer typed, so it is not shown.
export const defaultOptionNote = (line) => {
  const sweetnessNote = line.sweetness == null ? '' : `หวาน ${line.sweetness}%`;
  return [line.beanModifier, line.milkLabel, sweetnessNote].filter(Boolean).join(' ');
};

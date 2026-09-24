// OptionSheet · bean/blend, sweetness and milk picker for one menu item.
// Replaces the old centred BeanModifierModal. Same rules as the POS option
// sheet: the base option (no surcharge) of each group, sweetness (last choice
// or 100%) and cow's milk are preselected, so the common drink is one tap on
// "add". The server re-validates everything (checkoutLogic.js); this only
// decides what is sent: onSelect(item, modifiers[], sweetness, milkType).
import { useState } from 'react';
import { Check } from 'lucide-react';
import Sheet from '../components/ui/Sheet';
import Button from '../components/ui/Button';
import SegmentedControl from '../components/ui/SegmentedControl';
import { formatCurrency, getModifierGroups, isBaseModifier, supportsMilkChoice, MILK_OPTIONS } from '../config/constants';
import { supportsSweetnessChoice } from '../utils/promotions';
import { buildCartLine } from '../utils/customerCart';
import { readLastSweetness } from '../utils/cartDraft';
import { dispField, dispGroup } from './display';

const SWEETNESS_LEVELS = [0, 25, 50, 75, 100];

function buildGroups(item, modifiers) {
  if (!item) return [];
  const itemBase = Number(item.price) || 0;
  const extra = Number(item.beanExtra) || 0;
  // Only groups that really have an option on sale (modifiers arrive pre-filtered to available ones).
  return getModifierGroups(item)
    .map((g) => ({
      name: g,
      mods: modifiers
        .filter((m) => (m.group || 'เมล็ดกาแฟ') === g)
        .map((mod) => ({
          mod,
          surcharge: isBaseModifier(item, mod) ? 0 : Math.max(0, (Number(mod.price) || 0) + extra - itemBase),
        }))
        .sort((a, b) => a.surcharge - b.surcharge),
    }))
    .filter((g) => g.mods.length > 0);
}

export default function OptionSheet({ isOpen, item, modifiers, settingsData, preset, editing = false, onSelect, onClose, t, lang = 'th' }) {
  const groups = buildGroups(item, modifiers);
  const multi = groups.length > 1;
  const showSweetness = Boolean(item && supportsSweetnessChoice(item, settingsData));
  const showMilkChoice = supportsMilkChoice(item);
  // Single group and nothing else to choose: tapping an option adds at once.
  const needsConfirmButton = showSweetness || showMilkChoice || multi || !!preset;

  const [selections, setSelections] = useState({});
  const [sweetness, setSweetness] = useState(100);
  const [milkType, setMilkType] = useState('cow');
  const [lastSweetness, setLastSweetness] = useState(null);
  // Reset every time a (new) menu opens · adjusting state during render per React docs.
  const [lastItemId, setLastItemId] = useState(item?.id);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const itemChanged = item?.id !== lastItemId;
  const justOpened = isOpen && !wasOpen;
  if (itemChanged || isOpen !== wasOpen) {
    if (itemChanged) setLastItemId(item?.id);
    if (isOpen !== wasOpen) setWasOpen(isOpen);
    if (itemChanged || justOpened) {
      const remembered = readLastSweetness();
      setLastSweetness(remembered);
      const fromPreset = Object.fromEntries(modifiers.filter((m) => preset?.modifierIds?.includes(m.id)).map((m) => [m.group || 'เมล็ดกาแฟ', m]));
      // Default = the cheapest (base) option of every group the preset did not set.
      const defaults = needsConfirmButton
        ? Object.fromEntries(groups.filter((g) => !fromPreset[g.name]).map((g) => [g.name, g.mods[0].mod]))
        : {};
      setSelections({ ...defaults, ...fromPreset });
      setSweetness(preset?.sweetness ?? (showSweetness ? remembered : null) ?? 100);
      setMilkType(preset?.milkType || 'cow');
    }
  }

  const allChosen = groups.every((g) => selections[g.name]);
  const chosenMods = groups.map((g) => selections[g.name]).filter(Boolean);
  const previewPrice = item ? buildCartLine(item, chosenMods, sweetness, milkType, settingsData).price : 0;

  const confirm = () => onSelect(item, chosenMods, preset && !showSweetness ? preset.sweetness ?? null : sweetness, showMilkChoice ? milkType : null);

  const footer = needsConfirmButton ? (
    <Button variant="primary" size="xl" fullWidth disabled={!allChosen} onClick={confirm}>
      {allChosen
        ? <span className="flex w-full items-center justify-between gap-3"><span>{t(editing ? 'saveOptions' : 'addToCart')}</span><span className="num">{formatCurrency(previewPrice)}</span></span>
        : t('chooseAllGroups')}
    </Button>
  ) : null;

  return (
    <Sheet
      open={isOpen && Boolean(item)}
      onClose={onClose}
      title={item ? dispField(item, lang) : t('chooseOption')}
      description={needsConfirmButton ? t('chooseOptionHint') : t('chooseOptionTapHint')}
      width={440}
      footer={footer}
    >
      {item && (
        <div className="space-y-5 pb-1">
          {groups.map((group) => (
            <fieldset key={group.name} className="space-y-2">
              <legend className="text-sm font-semibold text-[var(--text-secondary)] mb-2">{dispGroup(group.name, lang) || t('chooseOption')}</legend>
              <div className="grid gap-2">
                {group.mods.map(({ mod }) => {
                  const selected = selections[group.name]?.id === mod.id;
                  const onClick = needsConfirmButton
                    ? () => setSelections((prev) => ({ ...prev, [group.name]: mod }))
                    : () => onSelect(item, mod);
                  // The price shown is what the customer pays if they pick this
                  // one, together with what is already chosen in other groups.
                  const withThis = groups
                    .map((g) => (g.name === group.name ? mod : selections[g.name]))
                    .filter(Boolean);
                  const priceIfChosen = buildCartLine(item, withThis, sweetness, milkType, settingsData).price;
                  const delta = needsConfirmButton ? priceIfChosen - previewPrice : 0;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      role={needsConfirmButton ? 'radio' : undefined}
                      aria-checked={needsConfirmButton ? selected : undefined}
                      onClick={onClick}
                      className={`w-full min-h-14 flex items-center gap-3 px-4 py-3 rounded-[var(--radius)] border-2 text-left transition-colors ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {needsConfirmButton && (
                        <span className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--text-on-accent)]' : 'border-[var(--border-strong)]'}`} aria-hidden="true">
                          {selected && <Check size={12} strokeWidth={3} />}
                        </span>
                      )}
                      <span className="flex-1 min-w-0 font-semibold text-[var(--text-primary)] leading-snug">{dispField(mod, lang)}</span>
                      <span className="shrink-0 flex flex-col items-end leading-snug">
                        <span className="font-bold text-[var(--text-primary)] num">{formatCurrency(priceIfChosen)}</span>
                        {!selected && delta !== 0 && (
                          <span className={`text-xs font-semibold num ${delta > 0 ? 'text-[var(--state-warn)]' : 'text-[var(--accent)]'}`}>
                            {delta > 0 ? `+${formatCurrency(delta)}` : t('cheaperBy', formatCurrency(-delta))}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {showSweetness && (
            <div className="space-y-2">
              <p id="opt-sweetness" className="text-sm font-semibold text-[var(--text-secondary)]">{t('sweetness')}</p>
              <SegmentedControl
                size="lg"
                fullWidth
                ariaLabel={t('sweetness')}
                value={sweetness}
                onChange={setSweetness}
                options={SWEETNESS_LEVELS.map((level) => ({ value: level, label: `${level}%` }))}
              />
              {lastSweetness != null && <p className="text-xs text-[var(--text-muted)]">{t('lastSweetness', lastSweetness)}</p>}
            </div>
          )}

          {showMilkChoice && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[var(--text-secondary)]">{t('milkType')}</p>
              <SegmentedControl
                size="lg"
                fullWidth
                ariaLabel={t('milkType')}
                value={milkType}
                onChange={setMilkType}
                options={MILK_OPTIONS.map((option) => ({ value: option.value, label: lang === 'en' ? option.labelEn : option.label }))}
              />
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

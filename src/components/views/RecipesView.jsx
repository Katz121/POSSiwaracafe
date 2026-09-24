import { useMemo, useState } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { BookOpen, Lock, Pencil, ChevronRight, Coffee } from 'lucide-react';
import { db, appId } from '../../services/firebase';
import { useDataContext, useConfigContext, useUIContext } from '../../context/AppContext';
import { Badge, Button, Input, Textarea, Modal, EmptyState, FilterChips, PageHeader, Sheet, Toolbar, useToast } from '../ui';
import RecipeSheet from '../RecipeSheet';

const ALL = 'ทั้งหมด';
const hasRecipe = (recipes, id) => Boolean(String(recipes[id]?.text || '').trim());

/**
 * สูตรเมนู — every staff member can read; editing asks for the admin PIN each
 * time (when PIN security is on). Recipes live in recipes/{menuId}, separate
 * from menu docs because menu is published to the customer QR page.
 * UX v2 (WP5): PageHeader + Toolbar, "ยังไม่มีสูตร" chip, dense list, editor in a Sheet.
 */
export default function RecipesView() {
  const { menu, recipes = {}, dynamicCategories } = useDataContext();
  const { pinEnabled, adminPin } = useConfigContext();
  const { runDbAction } = useUIContext();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const [recipeFilter, setRecipeFilter] = useState('all'); // all | missing | done
  const [viewing, setViewing] = useState(null); // menu item
  const [pinFor, setPinFor] = useState(null); // menu item waiting for PIN
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [editing, setEditing] = useState(null); // { item, text }
  const [saving, setSaving] = useState(false);

  const needsPin = Boolean(pinEnabled && adminPin);

  const categories = useMemo(() => {
    const order = (dynamicCategories || []).map((c) => c.name);
    const used = [...new Set((menu || []).map((m) => m.category).filter(Boolean))];
    return [ALL, ...order.filter((c) => used.includes(c)), ...used.filter((c) => !order.includes(c))];
  }, [menu, dynamicCategories]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (menu || [])
      .filter((m) => (category === ALL || m.category === category))
      .filter((m) => !q || String(m.name || '').toLowerCase().includes(q) || String(recipes[m.id]?.text || '').toLowerCase().includes(q));
  }, [menu, recipes, category, query]);

  const items = useMemo(() => searched
    .filter((m) => recipeFilter === 'all' || (recipeFilter === 'missing' ? !hasRecipe(recipes, m.id) : hasRecipe(recipes, m.id)))
    .sort((a, b) => String(a.category || '').localeCompare(String(b.category || ''), 'th') || String(a.name || '').localeCompare(String(b.name || ''), 'th')),
  [searched, recipes, recipeFilter]);

  const withRecipe = (menu || []).filter((m) => hasRecipe(recipes, m.id)).length;
  const missingInView = searched.filter((m) => !hasRecipe(recipes, m.id)).length;

  const startEdit = (item) => {
    setViewing(null);
    if (needsPin) { setPin(''); setPinError(''); setPinFor(item); return; }
    setEditing({ item, text: recipes[item.id]?.text || '' });
  };

  const confirmPin = () => {
    if (pin === String(adminPin)) {
      const item = pinFor;
      setPinFor(null); setPin('');
      setEditing({ item, text: recipes[item.id]?.text || '' });
    } else {
      setPinError('รหัส PIN ไม่ถูกต้อง'); setPin('');
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await runDbAction(async () => {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'recipes', editing.item.id);
        const text = editing.text.trim();
        if (text) await setDoc(ref, { text, menuName: editing.item.name || '', updatedAt: serverTimestamp() }, { merge: true });
        else await deleteDoc(ref);
        toast.success(text ? 'บันทึกสูตรแล้ว' : 'ลบสูตรแล้ว');
        setEditing(null);
      }, 'บันทึกสูตรไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-full bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <PageHeader
        title="สูตรเมนู"
        icon={BookOpen}
        subtitle={`มีสูตรแล้ว ${withRecipe} จาก ${(menu || []).length} เมนู · แตะเมนูเพื่อดู${needsPin ? ' · แก้ไขต้องใส่ PIN' : ''}`}
      />

      <Toolbar
        search={{ value: query, onChange: setQuery, placeholder: 'ค้นหาเมนูหรือคำในสูตร' }}
        filters={(
          <div className="flex flex-col gap-2">
            <FilterChips
              ariaLabel="กรองตามสูตร"
              value={recipeFilter}
              onChange={setRecipeFilter}
              chips={[
                { value: 'all', label: 'ทั้งหมด', count: searched.length },
                { value: 'missing', label: 'ยังไม่มีสูตร', count: missingInView, tone: missingInView ? 'warn' : undefined },
                { value: 'done', label: 'มีสูตรแล้ว', count: searched.length - missingInView, tone: 'ok' },
              ]}
            />
            <FilterChips
              ariaLabel="กรองตามหมวด"
              value={category}
              onChange={setCategory}
              chips={categories.map((c) => ({ value: c, label: c }))}
            />
          </div>
        )}
      />

      <div className="px-[var(--page-pad)] pb-24 md:pb-10 pt-1">
        {items.length === 0 ? (
          <EmptyState icon="search" title="ไม่พบเมนู" description="ลองเปลี่ยนหมวด ตัวกรอง หรือคำค้น" />
        ) : (
          <ul className="grid grid-cols-1 xl:grid-cols-2 gap-px rounded-[var(--radius)] overflow-hidden bg-[var(--border-light)] shadow-[var(--elev-1)]">
            {items.map((m) => {
              const text = String(recipes[m.id]?.text || '').trim();
              return (
                <li key={m.id} className="bg-[var(--bg-surface)]">
                  <button
                    type="button"
                    onClick={() => setViewing(m)}
                    className="w-full text-left flex items-center gap-3 min-h-16 px-4 py-2.5 hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[inset_0_0_0_3px_var(--accent)]"
                  >
                    <span className="w-12 h-12 shrink-0 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-sunken)] flex items-center justify-center">
                      {m.image
                        ? <img src={m.image} alt="" width={48} height={48} loading="lazy" decoding="async" className="w-12 h-12 object-cover" />
                        : <Coffee size={18} className="text-[var(--text-muted)]" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold leading-snug text-[var(--text-primary)] break-words">{m.name}</span>
                        <span className="text-sm text-[var(--text-muted)]">{m.category || 'ไม่มีหมวด'}</span>
                      </span>
                      {text
                        ? <span className="block text-sm leading-[var(--lh-sm)] text-[var(--text-secondary)] truncate">{text.split('\n').filter(Boolean).join(' · ')}</span>
                        : <Badge tone="warn" className="mt-1">ยังไม่มีสูตร</Badge>}
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <RecipeSheet
        isOpen={!!viewing}
        onClose={() => setViewing(null)}
        menuName={viewing?.name}
        recipe={viewing ? recipes[viewing.id] : null}
        actions={viewing && (
          <Button leftIcon={needsPin ? <Lock size={16} /> : <Pencil size={16} />} onClick={() => startEdit(viewing)}>
            {recipes[viewing.id]?.text ? 'แก้ไขสูตร' : 'เพิ่มสูตร'}
          </Button>
        )}
      />

      <Modal isOpen={!!pinFor} onClose={() => setPinFor(null)} title="ใส่ PIN เพื่อแก้ไขสูตร" size="sm">
        <div className="space-y-4">
          <Input type="password" inputMode="numeric" autoFocus value={pin} error={pinError || undefined}
            onChange={(e) => { setPin(e.target.value); setPinError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && confirmPin()} placeholder="PIN แอดมิน" />
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setPinFor(null)}>ยกเลิก</Button>
            <Button fullWidth onClick={confirmPin} disabled={!pin}>ยืนยัน</Button>
          </div>
        </div>
      </Modal>

      <Sheet
        open={!!editing}
        onClose={() => { if (!saving) setEditing(null); }}
        title={editing ? `แก้ไขสูตร · ${editing.item.name}` : ''}
        description="เว้นว่างแล้วบันทึก = ลบสูตรของเมนูนี้"
        width={560}
        footer={(
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setEditing(null)}>ยกเลิก</Button>
            <Button loading={saving} onClick={save}>บันทึกสูตร</Button>
          </>
        )}
      >
        {editing && (
          <Textarea
            label="สูตร"
            rows={14}
            value={editing.text}
            onChange={(e) => setEditing((prev) => ({ ...prev, text: e.target.value }))}
            placeholder={'เช่น\nแก้ว 16 oz · น้ำแข็งเต็มแก้ว\n1. ช็อตกาแฟ 2 ช็อต (36 ml)\n2. นมสด 150 ml\n3. ไซรัปคาราเมล 20 ml (หวาน 100%)'}
          />
        )}
      </Sheet>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { BookOpen, Search, Lock, Pencil } from 'lucide-react';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { Button, Input, Textarea, Modal, EmptyState, useToast } from '../ui';
import RecipeSheet from '../RecipeSheet';

const ALL = 'ทั้งหมด';

/**
 * สูตรเมนู — every staff member can read; editing asks for the admin PIN each
 * time (when PIN security is on). Recipes live in recipes/{menuId}, separate
 * from menu docs because menu is published to the customer QR page.
 */
export default function RecipesView() {
  const { menu, recipes = {}, dynamicCategories, pinEnabled, adminPin, runDbAction } = useAppContext();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
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

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (menu || [])
      .filter((m) => (category === ALL || m.category === category))
      .filter((m) => !q || String(m.name || '').toLowerCase().includes(q) || String(recipes[m.id]?.text || '').toLowerCase().includes(q))
      .sort((a, b) => String(a.category || '').localeCompare(String(b.category || ''), 'th') || String(a.name || '').localeCompare(String(b.name || ''), 'th'));
  }, [menu, recipes, category, query]);

  const withRecipe = (menu || []).filter((m) => String(recipes[m.id]?.text || '').trim()).length;

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
    <div className="h-full flex flex-col gap-4 p-4 md:p-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-500"><BookOpen size={22} /></div>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-[var(--text-primary)]">สูตรเมนู</h1>
            <p className="text-xs text-[var(--text-muted)]">มีสูตรแล้ว {withRecipe} จาก {(menu || []).length} เมนู · แตะเมนูเพื่อดู{needsPin ? ' · แก้ไขต้องใส่ PIN' : ''}</p>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเมนูหรือคำในสูตร..."
            className="w-full min-h-[44px] pl-9 pr-3 rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] border border-[var(--border-color)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent-emerald)]/20" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide shrink-0">
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
            className={`min-h-[44px] px-4 rounded-full text-sm font-semibold whitespace-nowrap border ${category === c ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)]'}`}>
            {c}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState icon="search" title="ไม่พบเมนู" description="ลองเปลี่ยนหมวดหรือคำค้น" />
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 pb-24">
            {items.map((m) => {
              const text = String(recipes[m.id]?.text || '').trim();
              return (
                <button key={m.id} type="button" onClick={() => setViewing(m)}
                  className="text-left p-4 rounded-[var(--radius)] bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-[var(--elev-1)] hover:border-emerald-300 active:scale-[0.99] transition-all flex gap-3">
                  {m.image ? <img src={m.image} alt="" className="w-14 h-14 rounded-[var(--radius-sm)] object-cover shrink-0" loading="lazy" /> : <div className="w-14 h-14 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--text-primary)] leading-snug break-words">{m.name}</p>
                    <p className="text-xs text-[var(--text-muted)] mb-1">{m.category || '—'}</p>
                    {text
                      ? <p className="text-sm text-[var(--text-secondary)] line-clamp-2 whitespace-pre-line">{text}</p>
                      : <p className="text-sm text-orange-500 font-medium">ยังไม่มีสูตร</p>}
                  </div>
                </button>
              );
            })}
          </div>
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

      <Modal isOpen={!!editing} onClose={() => { if (!saving) setEditing(null); }} title={editing ? `แก้ไขสูตร · ${editing.item.name}` : ''} size="lg">
        {editing && (
          <div className="space-y-4">
            <Textarea rows={12} value={editing.text} autoFocus
              onChange={(e) => setEditing((prev) => ({ ...prev, text: e.target.value }))}
              placeholder={'เช่น\nแก้ว 16 oz · น้ำแข็งเต็มแก้ว\n1. ช็อตกาแฟ 2 ช็อต (36 ml)\n2. นมสด 150 ml\n3. ไซรัปคาราเมล 20 ml (หวาน 100%)'} />
            <p className="text-xs text-[var(--text-muted)]">เว้นว่างแล้วบันทึก = ลบสูตรของเมนูนี้</p>
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth disabled={saving} onClick={() => setEditing(null)}>ยกเลิก</Button>
              <Button fullWidth loading={saving} onClick={save}>บันทึกสูตร</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

import { roundUpTo5 } from '../../../config/constants';
import { useEffect, useRef, useState } from 'react';
import {
  Link2, Plus, Trash2, Sparkles, PackagePlus, Coffee, Candy, Star, TrendingUp, Store, Clock,
  ImagePlus, Upload, FileText, Settings2, Tag, CookingPot,
} from 'lucide-react';
import { Banner, Button, Input, Textarea, SearchSelect, SegmentedControl, StockUsageInput, Money, Sheet, Spinner } from '../../ui';
import { isPieceUnit, isPrep, usagePerPiece } from '../../../utils/production';
import { formatNumber } from '../../../utils/format';
import { getModifierGroups } from '../../../config/constants';
import { supportsSweetnessChoice } from '../../../utils/promotions';
import { compressImage } from '../../../utils/calculations';
import { generateMenuImage } from '../../../services/aiService';
import { uploadImageToR2 } from '../../../services/imageUpload';
import { SheetSection, ToggleRow } from './parts';

const EDITOR_FORM_ID = 'menu-editor-form';

const FIELD = 'w-full min-h-11 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-base text-[var(--text-primary)] outline-none focus-visible:shadow-[var(--focus-ring)] focus:border-[var(--accent)]';
const SEARCH_SELECT = `${FIELD} placeholder:text-[var(--text-muted)]`;
const LABEL = 'block text-sm font-semibold text-[var(--text-primary)] mb-1.5';
const CHIP = 'min-h-11 px-3.5 rounded-full border text-sm transition-colors outline-none focus-visible:shadow-[var(--focus-ring)]';
const chipClass = (on) => `${CHIP} ${on
  ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-soft-fg)] font-semibold'
  : 'bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`;

/**
 * Create / edit a menu item in a Sheet (right panel on iPad/desktop, bottom on
 * phone). The form state and the save/delete/cake handlers live in
 * MenuManageView (unchanged Firestore writes); the AI helpers only fill the form.
 */
export default function MenuEditorSheet({
  open, onClose, focusSection,
  editingItem, newItem, setNewItem, onSubmit, onDelete, onCakeStock,
  menu, stock, stockById, stockLinkGroups, dynamicCategories, beanModifiers, cakeSaleCategories,
  geminiApiKey, callGeminiAPI, toast,
  isUploading, isUploadingPoster, onImageUpload, onPosterUpload,
}) {
  const [isSuggestingStock, setIsSuggestingStock] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isMagicWriting, setIsMagicWriting] = useState(false);
  const stockSectionRef = useRef(null);

  // Arriving from "ไปผูกสต็อก" · show the stock-link section first.
  useEffect(() => {
    if (!open || focusSection !== 'stock') return undefined;
    const t = setTimeout(() => stockSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 320);
    return () => clearTimeout(t);
  }, [open, focusSection, editingItem?.id]);

  const candidates = menu.filter((m) => m.id !== editingItem?.id && m.stockLinks?.length > 0 && m.category === newItem.category);
  const links = newItem.stockLinks || [];
  const deadLinks = links.filter((l) => l?.stockId && !stockById.has(l.stockId)).length;
  const aliveLinks = links.filter((l) => l?.stockId && stockById.has(l.stockId)).length;

  // "สูตรทั้งก้อน ÷ ตัดได้กี่ชิ้น" · usage stays per piece (what the POS deducts);
  // the per-cake amounts live only in the form (`perWhole`) and are stripped on save.
  const wholeMode = newItem.recipeMode === 'whole';
  const pieces = Number(newItem.recipePieces) || 0;
  const wholeFromUsage = (usage, n) => (n > 0 && Number(usage) > 0 ? String(Math.round(Number(usage) * n * 1000) / 1000) : '');
  const perWholeOf = (link) => (link.perWhole !== undefined ? link.perWhole : wholeFromUsage(link.usage, pieces));
  const setLinkMode = (mode) => setNewItem((p) => {
    if (mode === 'whole') {
      const n = Number(p.recipePieces) || 0;
      return {
        ...p,
        recipeMode: 'whole',
        recipePieces: p.recipePieces || '',
        stockLinks: (p.stockLinks || []).map((l) => ({ ...l, perWhole: wholeFromUsage(l.usage, n) })),
      };
    }
    return { ...p, recipeMode: null, recipePieces: null, stockLinks: (p.stockLinks || []).map((l) => { const { perWhole: _pw, ...rest } = l; return rest; }) };
  });
  const setPieces = (value) => setNewItem((p) => ({
    ...p,
    recipePieces: value,
    stockLinks: (p.stockLinks || []).map((l) => {
      const whole = l.perWhole !== undefined ? l.perWhole : wholeFromUsage(l.usage, Number(p.recipePieces) || 0);
      return { ...l, perWhole: whole, usage: usagePerPiece(whole, value) };
    }),
  }));
  const setPerWhole = (i, value) => setNewItem((p) => {
    const next = [...p.stockLinks];
    next[i] = { ...next[i], perWhole: value, usage: usagePerPiece(value, p.recipePieces) };
    return { ...p, stockLinks: next };
  });
  // Cake slices made on the production screen · link 1 piece and nothing else
  // (the raw ingredients were already deducted when the cake was made).
  const producedSlices = stock.filter((s) => isPrep(s) && isPieceUnit(s.unit));
  const [pickSlice, setPickSlice] = useState(false);
  const linkProducedSlice = (id) => {
    if (!id) return;
    setNewItem((p) => ({ ...p, recipeMode: null, recipePieces: null, stockLinks: [{ stockId: id, usage: 1 }] }));
    setPickSlice(false);
    toast.success('ผูกกับเค้กชิ้นที่ผลิต 1 ชิ้นแล้ว · ถ้าใช้กล่อง/ส้อม เพิ่มวัตถุดิบเองได้');
  };

  // Stock link handlers (same shape as v1)
  const addStockLink = () => setNewItem((p) => ({
    ...p,
    stockLinks: [...(p.stockLinks || []), p.recipeMode === 'whole' ? { stockId: '', usage: 0, perWhole: '' } : { stockId: '', usage: 1 }],
  }));
  const removeStockLink = (i) => setNewItem((p) => ({ ...p, stockLinks: p.stockLinks.filter((_, idx) => idx !== i) }));
  const updateStockLink = (i, f, v) => setNewItem((p) => {
    const next = [...p.stockLinks];
    next[i] = { ...next[i], [f]: v };
    return { ...p, stockLinks: next };
  });

  const magicWrite = async () => {
    if (!newItem.name || !newItem.category) { toast.warning('กรุณาระบุชื่อและหมวดหมู่ก่อนใช้ Magic Write'); return; }
    if (!geminiApiKey) { toast.warning('กรุณาใส่ Gemini API Key ในการตั้งค่าก่อน'); return; }
    setIsMagicWriting(true);
    try {
      const prompt = `Write a short, appetizing, and premium description for a menu item named '${newItem.name}' in the category '${newItem.category}' for a modern cafe. Keep it under 150 characters. Thai language.`;
      const result = await callGeminiAPI(prompt, false);
      if (result.success) setNewItem((prev) => ({ ...prev, description: result.data }));
      else throw new Error(result.error || 'AI ไม่สามารถเขียนคำบรรยายได้');
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setIsMagicWriting(false);
    }
  };

  const suggestStock = async () => {
    if (!newItem.name) { toast.warning('กรุณาระบุชื่อเมนูก่อน'); return; }
    if (!stock.length) { toast.warning('ยังไม่มีวัตถุดิบในระบบ'); return; }
    if (!geminiApiKey) { toast.warning('กรุณาตั้งค่า Gemini API Key ก่อน'); return; }
    setIsSuggestingStock(true);
    try {
      const stockList = stock.map((s) => `- id:"${s.id}" name:"${s.name}" unit:"${s.unit}"`).join('\n');
      const prompt = `You are a Thai cafe recipe expert. Given menu item "${newItem.name}" (category: ${newItem.category || 'ไม่ระบุ'}), suggest which ingredients from the available stock are needed and how much of each.

Available stock:
${stockList}

Return ONLY a JSON array. Each element: { "stockId": "exact id from list", "usage": number (amount per 1 serving) }
Only include ingredients that are relevant. Be realistic with quantities (e.g. milk 30ml, ice 100g, coffee 18g).
Return [] if no stock items match.`;
      const result = await callGeminiAPI(prompt, true);
      if (result.success && Array.isArray(result.data)) {
        const validLinks = result.data.filter((l) => stock.some((s) => s.id === l.stockId));
        if (validLinks.length > 0) {
          setNewItem((prev) => ({ ...prev, stockLinks: validLinks.map((l) => ({ stockId: l.stockId, usage: Number(l.usage) || 1 })) }));
          toast.success(`AI แนะนำวัตถุดิบ ${validLinks.length} รายการ`);
        } else {
          toast.warning('AI ไม่พบวัตถุดิบที่เหมาะสมในระบบ');
        }
      } else {
        toast.error('AI ไม่สามารถแนะนำได้: ' + (result.error || ''));
      }
    } catch (e) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
      setIsSuggestingStock(false);
    }
  };

  const generateImage = async () => {
    if (!newItem.name) { toast.warning('กรุณาระบุชื่อเมนูก่อน'); return; }
    if (!geminiApiKey) { toast.warning('กรุณาตั้งค่า Gemini API Key ก่อน'); return; }
    setIsGeneratingImage(true);
    try {
      const result = await generateMenuImage(geminiApiKey, newItem.name, newItem.category);
      if (result.success && result.imageBase64) {
        const compressed = await compressImage(result.imageBase64);
        let image;
        try {
          image = await uploadImageToR2(compressed); // CDN URL (small)
        } catch {
          image = compressed; // image host not configured yet → keep base64
        }
        setNewItem((prev) => ({ ...prev, image }));
        toast.success('AI สร้างรูปภาพสำเร็จ!');
      } else {
        toast.error(result.error || 'ไม่สามารถสร้างรูปภาพได้');
      }
    } catch (e) {
      toast.error('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Profit estimate (same formula as v1)
  const linkedCost = links.reduce((sum, link) => {
    const s = stock.find((item) => item.id === link.stockId);
    return sum + (Number(s?.unitCost || 0) * Number(link.usage || 0));
  }, 0);
  const totalCost = linkedCost + Number(newItem.additionalCost || 0);
  const margin = Number(newItem.price) - totalCost;
  const marginPercent = Math.round((margin / (Number(newItem.price) || 1)) * 100);
  const askSweetness = supportsSweetnessChoice(newItem, { cakeSaleCategories });

  const footer = (
    <div className="flex w-full items-center gap-2">
      {editingItem && (
        <button
          type="button"
          onClick={() => onDelete(editingItem)}
          className="inline-flex items-center gap-2 min-h-11 px-3 rounded-[var(--radius-sm)] text-sm font-semibold text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <Trash2 size={18} aria-hidden="true" /> ลบเมนู
        </button>
      )}
      <div className="flex-1" />
      <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
      <Button type="submit" form={EDITOR_FORM_ID} disabled={isUploading}>
        {editingItem ? 'บันทึกการแก้ไข' : 'เพิ่มเมนู'}
      </Button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={600}
      title={editingItem ? `แก้ไขเมนู · ${editingItem.name || ''}` : 'เพิ่มเมนูใหม่'}
      footer={footer}
    >
      <form id={EDITOR_FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-7 pb-4">
        <SheetSection title="ข้อมูลหลัก" icon={Tag}>
          <Input label="ชื่อเมนู" required value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
          <Input label="ชื่อ (EN)" value={newItem.nameEn || ''} placeholder="e.g. Hot Americano" onChange={(e) => setNewItem({ ...newItem, nameEn: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="ราคา (บาท)" type="number" inputMode="decimal" required value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} />
            <div>
              <label htmlFor="menu-editor-category" className={LABEL}>หมวดหมู่ <span className="text-[var(--state-danger)]">*</span></label>
              <select id="menu-editor-category" required value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className={FIELD}>
                <option value="">เลือก...</option>
                {dynamicCategories.map((c) => <option key={c.id} value={c.name}>{String(c.name)}</option>)}
              </select>
            </div>
          </div>
        </SheetSection>

        <div ref={stockSectionRef} className="scroll-mt-2">
          <SheetSection id="menu-editor-stock" title="ผูกสต็อก (ตัดวัตถุดิบเมื่อขาย)" icon={Link2}>
            {deadLinks > 0 ? (
              <Banner tone="danger" title={`ลิงก์เสีย ${deadLinks} รายการ · สต็อกที่ผูกไว้ถูกลบแล้ว ขายแล้วส่วนนี้ไม่ถูกตัด`}>
                เลือกวัตถุดิบใหม่ในแถวที่ขึ้นสีแดง หรือลบแถวนั้นออก แล้วกดบันทึก
              </Banner>
            ) : aliveLinks === 0 ? (
              <Banner tone="warn" title="ยังไม่ผูกสต็อก · ขายเมนูนี้แล้วสต็อกจะไม่ลด">
                เพิ่มวัตถุดิบที่ใช้ต่อ 1 ที่ หรือกด AI แนะนำ / คัดลอกจากเมนูที่คล้ายกัน
              </Banner>
            ) : null}

            <SegmentedControl
              fullWidth
              ariaLabel="วิธีกรอกปริมาณ"
              value={wholeMode ? 'whole' : 'piece'}
              onChange={setLinkMode}
              options={[{ value: 'piece', label: 'ต่อ 1 ที่' }, { value: 'whole', label: 'สูตรทั้งก้อน ÷ ชิ้น' }]}
            />
            {wholeMode && (
              <div className="rounded-[var(--radius)] border-2 border-[var(--accent)] p-3">
                <Input
                  label="ตัดได้กี่ชิ้น"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={newItem.recipePieces ?? ''}
                  placeholder="เช่น 10"
                  onChange={(e) => setPieces(e.target.value)}
                  hint={pieces > 0 ? 'กรอกปริมาณวัตถุดิบทั้งก้อนด้านล่าง ระบบหารเป็นต่อชิ้นให้' : undefined}
                  error={pieces > 0 ? undefined : 'ใส่จำนวนชิ้นที่ตัดได้จากเค้ก 1 ก้อน'}
                />
                <div className="mt-3">
                  <Input
                    label="ราคาขายทั้งก้อน (บาท)"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={newItem.recipeWholePrice ?? ''}
                    placeholder="เช่น 590"
                    onChange={(e) => setNewItem((p) => ({ ...p, recipeWholePrice: e.target.value }))}
                    hint="ไม่บังคับ · ระบบหารด้วยจำนวนชิ้นเป็นราคาต่อชิ้น"
                  />
                  {pieces > 0 && Number(newItem.recipeWholePrice) > 0 && (() => {
                    const per = Math.round((Number(newItem.recipeWholePrice) / pieces) * 100) / 100;
                    const rounded = roundUpTo5(per);
                    return (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <span>ราคาต่อชิ้น <b className="num text-[var(--text-primary)]">฿{per.toLocaleString('th-TH')}</b> (ปัดเป็น ฿{rounded})</span>
                        {Number(newItem.price) !== rounded && (
                          <Button size="sm" variant="secondary" onClick={() => setNewItem((p) => ({ ...p, price: String(rounded) }))}>ใช้ ฿{rounded} เป็นราคาเมนูนี้</Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" leftIcon={<Plus size={18} />} onClick={addStockLink}>เพิ่มวัตถุดิบ</Button>
              <Button variant="secondary" leftIcon={<CookingPot size={18} />} onClick={() => setPickSlice((v) => !v)} aria-expanded={pickSlice}>ผูกกับเค้กชิ้นที่ผลิต</Button>
              <Button variant="ai" leftIcon={<Sparkles size={18} />} loading={isSuggestingStock} onClick={suggestStock}>AI แนะนำ</Button>
              {editingItem && !links.length && onCakeStock && (
                <Button variant="secondary" leftIcon={<PackagePlus size={18} />} onClick={() => onCakeStock(editingItem)}>สร้างสต็อกก้อน</Button>
              )}
            </div>
            {pickSlice && (
              <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-canvas)] p-3 flex flex-col gap-2">
                {producedSlices.length ? (
                  <>
                    <span className={LABEL}>เลือกเค้กชิ้นที่ผลิต (ตัด 1 ชิ้นต่อที่ แทนสูตรเดิม)</span>
                    <SearchSelect
                      className={SEARCH_SELECT}
                      value=""
                      onChange={linkProducedSlice}
                      groups={[['ของเตรียม หน่วยชิ้น', producedSlices]]}
                      getOptionLabel={(s) => `${s.name} · มี ${formatNumber(s.quantity, { maxDecimals: 2 })} ชิ้น`}
                      getOptionValue={(s) => s.id}
                      placeholder="พิมพ์ชื่อเค้กชิ้น..."
                    />
                  </>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">ยังไม่มีเค้กชิ้นที่ผลิต · สร้างของเตรียมหน่วย "ชิ้น" ที่หน้า "ผลิตวันนี้" ก่อน</p>
                )}
              </div>
            )}

            {candidates.length > 0 && (
              <div>
                <span className={LABEL}>คัดลอกสูตรจากเมนูในหมวดเดียวกัน</span>
                <SearchSelect
                  className={SEARCH_SELECT}
                  // ช่องนี้สั่งคัดลอกสูตร จึงไม่เก็บเมนูที่เลือกไว้ให้เข้าใจว่าเป็นการผูกกับต้นทาง
                  value=""
                  onChange={(id) => {
                    const sourceItem = menu.find((m) => m.id === id);
                    if (sourceItem && sourceItem.stockLinks) setNewItem({ ...newItem, stockLinks: [...sourceItem.stockLinks] });
                  }}
                  groups={[['เมนูในหมวดเดียวกัน', candidates]]}
                  getOptionLabel={(m) => `${m.name} (${m.stockLinks.length} รายการ)`}
                  getOptionValue={(m) => m.id}
                  placeholder="พิมพ์ชื่อเมนูที่จะคัดลอกสูตร..."
                />
              </div>
            )}

            {links.length > 0 && (
              <ol className="flex flex-col gap-3">
                {links.map((link, idx) => {
                  const s = stockById.get(link.stockId);
                  const dead = Boolean(link.stockId) && !s;
                  const unitCost = Number(s?.unitCost || 0);
                  const usage = Number(link.usage || 0);
                  return (
                    <li
                      key={idx}
                      className={`rounded-[var(--radius)] border p-3 flex flex-col gap-3 ${dead ? 'border-[var(--state-danger)] bg-[var(--state-danger-soft)]' : 'border-[var(--border-color)] bg-[var(--bg-canvas)]'}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <span className={LABEL}>วัตถุดิบ {idx + 1}</span>
                          <SearchSelect
                            className={SEARCH_SELECT}
                            value={link.stockId}
                            onChange={(id) => updateStockLink(idx, 'stockId', id)}
                            groups={stockLinkGroups}
                            getOptionValue={(item) => item.id}
                            getOptionLabel={(item) => String(item.name)}
                            placeholder={dead ? 'สต็อกเดิมถูกลบแล้ว · เลือกใหม่' : 'พิมพ์ค้นหาวัตถุดิบ...'}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStockLink(idx)}
                          aria-label={`ลบวัตถุดิบ ${idx + 1}`}
                          className="mt-7 shrink-0 w-11 h-11 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                      {dead && <p className="text-sm font-medium text-[var(--state-danger)]">สต็อกที่ผูกไว้ถูกลบแล้ว · ขายแล้วส่วนนี้ไม่ถูกตัด</p>}
                      {s && (
                        <p className="text-sm text-[var(--text-secondary)] flex flex-wrap gap-x-3">
                          <span>ราคาต่อหน่วย <Money value={unitCost} />/{s.unit}</span>
                          {usage > 0 && <span className="font-semibold text-[var(--text-primary)]">ต้นทุน <Money value={unitCost * usage} decimals={2} /></span>}
                        </p>
                      )}
                      {wholeMode ? (
                        <div>
                          <label htmlFor={`whole-${idx}`} className={LABEL}>ปริมาณทั้งก้อน</label>
                          <div className="flex items-center gap-2">
                            <input
                              id={`whole-${idx}`}
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              value={perWholeOf(link)}
                              onChange={(e) => setPerWhole(idx, e.target.value)}
                              className={`${FIELD} num text-right`}
                            />
                            <span className="shrink-0 text-sm text-[var(--text-secondary)]">{s?.unit || 'หน่วย'}</span>
                          </div>
                          <p className="num mt-1 text-sm text-[var(--text-secondary)]">
                            {pieces > 0
                              ? <>= <b className="text-[var(--text-primary)]">{formatNumber(link.usage, { maxDecimals: 4 })} {s?.unit || 'หน่วย'}</b> ต่อชิ้น (÷ {formatNumber(pieces)} ชิ้น)</>
                              : 'ใส่จำนวนชิ้นด้านบนก่อน'}
                          </p>
                        </div>
                      ) : (
                        <StockUsageInput
                          key={String(editingItem?.id || 'new') + '-' + link.stockId + '-' + idx}
                          usage={link.usage}
                          unit={s?.unit || 'หน่วย'}
                          onChange={(value) => updateStockLink(idx, 'usage', value)}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            <Input
              label="ต้นทุนแฝงเพิ่มเติม (ค่าแก้ว/ถุง/จ้าง)"
              type="number"
              inputMode="decimal"
              value={newItem.additionalCost || ''}
              placeholder="0.00"
              onChange={(e) => setNewItem({ ...newItem, additionalCost: e.target.value })}
            />

            {newItem.price && (
              <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-sunken)] p-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--text-secondary)]">ประมาณการกำไรต่อที่</p>
                  <Money value={margin} size="2xl" className="font-semibold text-[var(--text-primary)]" />
                  <p className="text-sm text-[var(--text-muted)]">จากต้นทุนรวม <Money value={totalCost} /></p>
                </div>
                <span className={`num rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-semibold ${marginPercent < 30 ? 'bg-[var(--state-danger-soft)] text-[var(--state-danger)]' : 'bg-[var(--state-ok-soft)] text-[var(--state-ok)]'}`}>
                  กำไร {marginPercent}%
                </span>
              </div>
            )}
          </SheetSection>
        </div>

        <SheetSection title="การขายและการแสดงผล" icon={Settings2}>
          <div className="divide-y divide-[var(--border-light)]">
            <ToggleRow
              icon={Store}
              title="พร้อมขาย"
              hint={newItem.available !== false ? 'เปิดขายอยู่' : 'สินค้าหมด · ไม่แสดงให้สั่ง'}
              checked={newItem.available !== false}
              onChange={() => setNewItem({ ...newItem, available: newItem.available === false ? true : false })}
            />
            <ToggleRow icon={Star} title="เมนูแนะนำ" hint="แสดงในหน้าแรก" checked={Boolean(newItem.isFeatured)} onChange={() => setNewItem({ ...newItem, isFeatured: !newItem.isFeatured })} />
            <ToggleRow icon={TrendingUp} title="ปักหมุดขายดี" hint="แสดงบนสุดหน้า QR" checked={Boolean(newItem.isPinnedBest)} onChange={() => setNewItem({ ...newItem, isPinnedBest: !newItem.isPinnedBest })} />
            <ToggleRow icon={Clock} title="ยกเว้นลด Happy Hour" hint="เค้กใหม่/พึ่งทำ ไม่ลดราคา" checked={Boolean(newItem.excludeFromSale)} onChange={() => setNewItem({ ...newItem, excludeFromSale: !newItem.excludeFromSale })} />
            <ToggleRow icon={Candy} title="ให้เลือกระดับความหวาน" hint="หน้าร้าน + QR" checked={askSweetness} onChange={() => setNewItem({ ...newItem, sweetnessChoice: !askSweetness })} />
            <ToggleRow icon={Coffee} title="เปิดใช้ตัวเลือก (เมล็ด/มัทฉะ)" hint="ลูกค้าเลือกตัวเลือกจากกลุ่มที่กำหนด" checked={Boolean(newItem.allowBeanModifier)} onChange={() => setNewItem({ ...newItem, allowBeanModifier: !newItem.allowBeanModifier })} />
          </div>

          {newItem.allowBeanModifier && (
            <div className="rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-canvas)] p-4 flex flex-col gap-4">
              <div>
                <span className={LABEL}>กลุ่มตัวเลือกที่ใช้ (เลือกได้หลายกลุ่ม)</span>
                {(() => {
                  const allGroups = [...new Set(['เมล็ดกาแฟ', ...(beanModifiers || []).map((b) => b.group || 'เมล็ดกาแฟ')])];
                  const selectedGroups = getModifierGroups(newItem);
                  return (
                    <div className="flex flex-wrap gap-2">
                      {allGroups.map((g) => {
                        const selected = selectedGroups.includes(g);
                        return (
                          <button
                            key={g}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              // ต้องเหลืออย่างน้อย 1 กลุ่ม
                              const next = selected
                                ? (selectedGroups.length > 1 ? selectedGroups.filter((x) => x !== g) : selectedGroups)
                                : [...selectedGroups, g];
                              // ตัด baseBeanIds ที่ไม่อยู่ในกลุ่มที่เลือกแล้วออก
                              const allowedIds = (beanModifiers || []).filter((b) => next.includes(b.group || 'เมล็ดกาแฟ')).map((b) => b.id);
                              const baseBeanIds = (newItem.baseBeanIds || []).filter((id) => allowedIds.includes(id));
                              setNewItem({ ...newItem, modifierGroups: next, modifierGroup: next[0], baseBeanIds });
                            }}
                            className={chipClass(selected)}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                <p className="text-xs leading-[var(--lh-xs)] text-[var(--text-muted)] mt-2">ลูกค้าจะเลือกทีละกลุ่ม เช่น <strong>ส้ม</strong> (ฐานราคา) + <strong>เมล็ดกาแฟ</strong> (บวกเพิ่ม)</p>
              </div>

              <Input
                label="ราคาส่วนเพิ่มเมื่อเลือกเมล็ด (เช่น น้ำช่อ)"
                type="number"
                inputMode="decimal"
                value={newItem.beanExtra ?? ''}
                placeholder="0"
                hint="ราคารวม = ราคาเมนู + ส่วนเพิ่มของแต่ละตัวเลือกที่ไม่ใช่เบส (กลุ่มเดียว = ค่าที่สูงกว่าระหว่างราคาเมนูกับราคาตัวเลือก)"
                onChange={(e) => setNewItem({ ...newItem, beanExtra: e.target.value })}
              />

              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium text-[var(--text-secondary)]">ตัวเลือกที่คงราคาเมนู (เบส · ไม่บวกเพิ่ม)</span>
                {getModifierGroups(newItem).map((group) => {
                  const groupBeans = (beanModifiers || []).filter((b) => (b.group || 'เมล็ดกาแฟ') === group);
                  return (
                    <div key={group}>
                      <p className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">{group}</p>
                      {groupBeans.length === 0 ? (
                        <p className="text-sm text-[var(--text-muted)]">ยังไม่มีตัวเลือกในกลุ่มนี้ (เพิ่มที่หน้าตั้งค่า)</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {groupBeans.map((b) => {
                            const selected = (newItem.baseBeanIds || []).includes(b.id);
                            return (
                              <button
                                key={b.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => {
                                  const cur = newItem.baseBeanIds || [];
                                  const next = selected ? cur.filter((x) => x !== b.id) : [...cur, b.id];
                                  setNewItem({ ...newItem, baseBeanIds: next });
                                }}
                                className={chipClass(selected)}
                              >
                                {b.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SheetSection>

        <SheetSection
          title="คำบรรยาย"
          icon={FileText}
          actions={<Button variant="ai" leftIcon={<Sparkles size={18} />} loading={isMagicWriting} onClick={magicWrite}>Magic Write</Button>}
        >
          <Textarea label="คำบรรยาย (ไทย)" rows={3} value={newItem.description || ''} placeholder="ใส่คำบรรยายสินค้า..." onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
          <Textarea label="คำอธิบาย (EN)" rows={3} value={newItem.descriptionEn || ''} placeholder="English description..." onChange={(e) => setNewItem({ ...newItem, descriptionEn: e.target.value })} />
        </SheetSection>

        <SheetSection title="รูปภาพ" icon={ImagePlus}>
          <div className="flex items-center gap-4">
            <div className="relative w-28 h-28 shrink-0 rounded-[var(--radius)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-sunken)] overflow-hidden flex items-center justify-center">
              {isUploading && <div className="absolute inset-0 bg-[var(--bg-surface)]/80 flex items-center justify-center"><Spinner /></div>}
              {newItem.image
                ? <img src={newItem.image} alt="" width={112} height={112} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                : <Upload className="text-[var(--text-muted)]" size={28} aria-hidden="true" />}
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <label className={`inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus-within:shadow-[var(--focus-ring)] ${isUploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                <Upload size={18} aria-hidden="true" /> เลือกรูปภาพสินค้า
                <input type="file" accept="image/*" className="sr-only" onChange={onImageUpload} disabled={isUploading} />
              </label>
              <Button variant="ai" leftIcon={<Sparkles size={18} />} loading={isGeneratingImage} onClick={generateImage}>AI เจนรูปเมนู</Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-[var(--text-secondary)]">โปสเตอร์เรื่องราว (ไม่บังคับ)</p>
            <p className="text-xs leading-[var(--lh-xs)] text-[var(--text-muted)]">ลูกค้าแตะเมนูในหน้า QR แล้วเห็นโปสเตอร์เต็มจอก่อนกดเพิ่มลงตะกร้า · ใช้ภาพแนวตั้ง</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-28 aspect-[2/3] shrink-0 rounded-[var(--radius)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-sunken)] overflow-hidden flex items-center justify-center">
              {isUploadingPoster && <div className="absolute inset-0 bg-[var(--bg-surface)]/80 flex items-center justify-center"><Spinner /></div>}
              {newItem.posterImage
                ? <img src={newItem.posterImage} alt="" width={112} height={168} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                : <ImagePlus className="text-[var(--text-muted)]" size={28} aria-hidden="true" />}
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <label className={`inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus-within:shadow-[var(--focus-ring)] ${isUploadingPoster ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                <ImagePlus size={18} aria-hidden="true" /> {newItem.posterImage ? 'เปลี่ยนโปสเตอร์' : 'เลือกภาพโปสเตอร์'}
                <input type="file" accept="image/*" className="sr-only" onChange={onPosterUpload} disabled={isUploadingPoster} />
              </label>
              {newItem.posterImage && (
                <Button variant="outline-danger" onClick={() => setNewItem((prev) => ({ ...prev, posterImage: '' }))}>เอาโปสเตอร์ออก</Button>
              )}
            </div>
          </div>
        </SheetSection>
      </form>
    </Sheet>
  );
}

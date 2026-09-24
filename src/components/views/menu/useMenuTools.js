import { useState, useMemo } from 'react';
import { doc, collection, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, appId } from '../../../services/firebase';
import { getISODate, getOrderDate } from '../../../utils/calculations';
import { uploadImageToR2, isBase64Image } from '../../../services/imageUpload';

/**
 * Menu-page tools behind the "เครื่องมือ" menu: promotions, categories, AI
 * translation and the one-time R2 image migration. Moved verbatim out of
 * MenuManageView (v1 handlers, same Firestore writes) to keep the view < 800 lines.
 */
export default function useMenuTools({
  menu, dynamicCategories, beanModifiers, orders, expenses,
  aiReady, runDbAction, callGeminiAPI, setActivePromotion, toast,
}) {
  const [isTranslating, setIsTranslating] = useState(false);
  // ── Promotion ──────────────────────────────────────────────────────────
  const [promotionIdeas, setPromotionIdeas] = useState([]);
  const [isGeneratingPromo, setIsGeneratingPromo] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoMode, setPromoMode] = useState('ai'); // 'ai' | 'manual'
  const [manualPromo, setManualPromo] = useState({ title: '', description: '', code: '', discountPercent: 0 });
  const [showPromoInputModal, setShowPromoInputModal] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState(null);

  // ── Categories ─────────────────────────────────────────────────────────
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', nameEn: '', icon: '📁', color: 'gray' });

  // AI Promotion Generator
  const handleGeneratePromotions = async () => {
    if (!aiReady) {
      toast.warning('กรุณาใส่ Gemini API Key ในการตั้งค่าก่อน');
      return;
    }

    setIsGeneratingPromo(true);
    setPromotionIdeas([]);
    setShowPromoModal(true);

    try {
      // Get Financial Context for Prompt
      const today = getISODate();
      const monthPrefix = today.substring(0, 7);
      const mOrders = orders.filter(o => o.status === 'completed' && (getOrderDate(o) || '').startsWith(monthPrefix));
      const mExpenses = expenses.filter(e => (e.date || '').startsWith(monthPrefix));
      const mRev = mOrders.reduce((s, o) => s + (Number(o.total || 0)), 0);
      const mExp = mExpenses.reduce((s, e) => s + (Number(e.amount || 0)), 0);
      const mProfit = mRev - mExp;

      const categoriesList = dynamicCategories.map(c => c.name).join(', ');
      const timeContext = new Date().toLocaleTimeString('th-TH');
      const dayContext = new Date().toLocaleDateString('th-TH', { weekday: 'long' });

      const prompt = `
        Role: Marketing Expert for a Cafe.
        Current Shop Status (Month ${monthPrefix}):
        - Revenue: ${mRev.toLocaleString()} THB
        - Total Expenses: ${mExp.toLocaleString()} THB
        - Net Profit: ${mProfit.toLocaleString()} THB

        Time Context: ${dayContext} at ${timeContext}.
        Shop Operating Hours: 10:00 - 17:00.
        Menu Categories: ${categoriesList}.

        Task: Create 3 creative, catchy promotion campaigns to boost sales.
        CRITICAL RULE: The promotions MUST protect profit margins.
        - If profit is low/negative, avoid deep discounts and focus on high-margin upselling (e.g., "Add a snack for only X").
        - If profit is healthy, more aggressive acquisition deals are fine.
        - Avoid any deal that could cause a direct loss for the shop.

        Format: Return a JSON array of objects with "title", "description", and "code" keys.
        Language: Thai.
      `;

      const result = await callGeminiAPI(prompt, true);
      if (result.success) {
        setPromotionIdeas(result.data);
      } else {
        throw new Error("AI Busy");
      }

    } catch (e) {
      toast.error('เกิดข้อผิดพลาดในการคิดโปรโมชั่น: ' + e.message);
      setShowPromoModal(false);
    } finally {
      setIsGeneratingPromo(false);
    }
  };

  const handleSelectPromotion = (promo) => {
    setSelectedPromo(promo);
    setShowPromoInputModal(true);
  };

  const confirmPromoDiscount = (formData) => {
    const discountPercent = Number(formData.discount) || 0;
    setActivePromotion({ ...selectedPromo, discountPercent });
    setShowPromoModal(false);
    setShowPromoInputModal(false);
    setSelectedPromo(null);
  };
  // Manual Promotion Handler
  const handleApplyManualPromotion = () => {
    if (!manualPromo.title.trim()) {
      toast.warning('กรุณาใส่ชื่อโปรโมชั่น');
      return;
    }

    setActivePromotion({
      title: manualPromo.title,
      description: manualPromo.description || '',
      code: manualPromo.code || '',
      discountPercent: Number(manualPromo.discountPercent) || 0
    });

    // Reset form and close
    setManualPromo({ title: '', description: '', code: '', discountPercent: 0 });
    setShowPromoModal(false);
  };

  // One-time migration: move existing inline base64 menu images to R2. Until this
  // runs, the publicMenu bundle stays oversized and customers fall back to slower
  // per-collection reads. Safe to re-run — it only touches items still on base64.
  const [isMigratingImages, setIsMigratingImages] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState(0);
  const pendingImageMigration = useMemo(
    () => menu.filter((m) => isBase64Image(m.image)).length,
    [menu],
  );

  const migrateImagesToR2 = async () => {
    const targets = menu.filter((m) => isBase64Image(m.image));
    if (targets.length === 0) {
      toast.success('ทุกรูปอยู่บน R2 แล้ว');
      return;
    }
    setIsMigratingImages(true);
    setMigrateProgress(0);
    let done = 0;
    let failed = 0;
    for (const item of targets) {
      try {
        const url = await uploadImageToR2(item.image);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id), { image: url });
        done++;
      } catch (err) {
        failed++;
        console.error('[migrate] failed for', item.id, err);
      }
      setMigrateProgress(done + failed);
    }
    setIsMigratingImages(false);
    toast[failed ? 'warning' : 'success'](`ย้ายรูปเสร็จ: สำเร็จ ${done}${failed ? ` · ล้มเหลว ${failed}` : ''}`);
  };

  // Category Management Handlers
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.name.trim()) return;

    // Check if category name already exists
    const exists = dynamicCategories.some(c => c.name.toLowerCase() === newCategory.name.trim().toLowerCase());
    if (exists) {
      toast.warning('หมวดหมู่นี้มีอยู่แล้ว');
      return;
    }

    await runDbAction(async () => {
      // New categories go to the end of the tab order.
      const nextOrder = dynamicCategories.length
        ? Math.max(...dynamicCategories.map(c => c.order ?? 0)) + 1
        : 0;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'categories'), {
        name: newCategory.name.trim(),
        nameEn: newCategory.nameEn?.trim() || '',
        icon: newCategory.icon,
        color: newCategory.color,
        order: nextOrder
      });
      setNewCategory({ name: '', nameEn: '', icon: '📁', color: 'gray' });
    }, 'เพิ่มหมวดหมู่ไม่สำเร็จ');
  };

  // Reorder a category up (dir=-1) or down (dir=+1) in the tab sequence.
  // `dynamicCategories` is already sorted by `order`, so we swap two neighbours
  // then re-index the whole list to a clean 0..n sequence (few docs, cheap) —
  // this also heals any missing/duplicate `order` values along the way. The tab
  // order drives both the POS view and the customer QR page.
  const moveCategory = async (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= dynamicCategories.length) return;
    const list = [...dynamicCategories];
    [list[index], list[target]] = [list[target], list[index]];
    await runDbAction(async () => {
      await Promise.all(
        list
          .map((c, i) => (c.order === i
            ? null
            : updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'categories', c.id), { order: i })))
          .filter(Boolean)
      );
    }, 'จัดลำดับหมวดหมู่ไม่สำเร็จ');
  };

  const handleDeleteCategory = async (category) => {
    // Check if any menu items use this category
    const itemsUsingCategory = menu.filter(m => m.category === category.name);
    if (itemsUsingCategory.length > 0) {
      toast.error(`ไม่สามารถลบหมวดหมู่ "${category.name}" ได้ เนื่องจากมีเมนู ${itemsUsingCategory.length} รายการใช้อยู่`);
      return;
    }

    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'categories', category.id));
    }, 'ลบหมวดหมู่ไม่สำเร็จ');
  };

  // AI Batch English Translation — fills nameEn/descriptionEn only for items that
  // don't already have one, so manually-entered EN text is never overwritten.
  // Runs in batches of ~30 items per call to keep the Gemini prompt short.
  const translateItemsBatch = async (items, collectionName, withDescription) => {
    if (!items.length) return 0;
    const batchSize = 30;
    let successCount = 0;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const payload = batch.map(it => withDescription
        ? { id: it.id, name: it.name || '', description: it.description || '' }
        : { id: it.id, name: it.name || '' });

      const prompt = `You are translating Thai cafe/coffee shop menu ${withDescription ? 'item names and descriptions' : 'names'} into natural, accurate English using correct coffee shop terminology.
Examples: "อเมริกาโน่ร้อน" -> "Hot Americano", "ชาเขียวเย็น" -> "Iced Green Tea", "ลาเต้ร้อน" -> "Hot Latte".

Input (JSON array):
${JSON.stringify(payload)}

Return ONLY a raw JSON array (no markdown code fences, no explanation), same length and order as input, each element shaped exactly as:
${withDescription
  ? '{ "id": "<same id as input>", "nameEn": "<short English name>", "descriptionEn": "<English description, or empty string if input description was empty>" }'
  : '{ "id": "<same id as input>", "nameEn": "<short English name>" }'}`;

      try {
        const result = await callGeminiAPI(prompt, true);
        if (!result.success || !Array.isArray(result.data)) continue;
        for (const entry of result.data) {
          const original = batch.find(b => b.id === entry.id);
          if (!original || !entry.nameEn) continue;
          try {
            const updates = withDescription
              ? { nameEn: entry.nameEn, descriptionEn: entry.descriptionEn || '' }
              : { nameEn: entry.nameEn };
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, original.id), updates);
            successCount++;
          } catch (err) {
            console.error(`[translate] update failed for ${collectionName}/${original.id}`, err);
          }
        }
      } catch (err) {
        console.error(`[translate] batch failed for ${collectionName}`, err);
      }
    }
    return successCount;
  };

  const handleTranslateToEnglish = async () => {
    if (!aiReady) {
      toast.warning('กรุณาตั้งค่า Gemini API Key ก่อน');
      return;
    }

    const menuTargets = menu.filter(m => !m.nameEn);
    const catTargets = dynamicCategories.filter(c => !c.nameEn);
    const beanTargets = (beanModifiers || []).filter(b => !b.nameEn);

    if (!menuTargets.length && !catTargets.length && !beanTargets.length) {
      toast.success('ทุกรายการมีชื่อภาษาอังกฤษครบแล้ว');
      return;
    }

    setIsTranslating(true);
    try {
      const menuCount = await translateItemsBatch(menuTargets, 'menu', true);
      const catCount = await translateItemsBatch(catTargets, 'categories', false);
      const beanCount = await translateItemsBatch(beanTargets, 'beanModifiers', false);
      toast.success(`แปลแล้ว ${menuCount} เมนู, ${catCount} หมวด, ${beanCount} ตัวเลือก`);
    } catch (e) {
      toast.error('เกิดข้อผิดพลาดในการแปล: ' + e.message);
    } finally {
      setIsTranslating(false);
    }
  };


  return {
    isTranslating, promotionIdeas, isGeneratingPromo, showPromoModal, setShowPromoModal, promoMode,
    setPromoMode, manualPromo, setManualPromo, showPromoInputModal, setShowPromoInputModal,
    selectedPromo, setSelectedPromo, showCategoryModal, setShowCategoryModal, newCategory,
    setNewCategory, handleGeneratePromotions, handleSelectPromotion, confirmPromoDiscount,
    handleApplyManualPromotion, isMigratingImages, migrateProgress, pendingImageMigration,
    migrateImagesToR2, handleAddCategory, moveCategory, handleDeleteCategory,
    handleTranslateToEnglish,
  };
}

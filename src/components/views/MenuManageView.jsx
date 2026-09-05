import React, { useState, useMemo, useEffect } from 'react';
import {
  ClipboardList, RefreshCcw, Zap, CheckCircle2, Trash2,
  ChevronDown, ChevronUp, Star, Eye, EyeOff, Edit, PackagePlus,
  Coffee, Link2, Plus, Upload, TrendingUp, Store, AlertTriangle, FolderCog, Clock, Languages
} from 'lucide-react';
import { doc, collection, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate, compressImage } from '../../utils/calculations';
import { getModifierGroups, STOCK_CATEGORIES, getStockCategory } from '../../config/constants';
import { generateMenuImage } from '../../services/aiService';
import { uploadImageToR2, isBase64Image } from '../../services/imageUpload';
import { Button, Modal, Input, Select, EmptyState, useToast, ConfirmModal, InputModal, Skeleton } from '../ui';

export default function MenuManageView() {
  const {
    menu,
    stock,
    dynamicCategories,
    beanModifiers,
    orders,
    expenses,
    isSyncing,
    geminiApiKey,
    runDbAction,
    callGeminiAPI,
    activePromotion,
    setActivePromotion
  } = useAppContext();

  const stockLinkGroups = useMemo(() => {
    const categoryOrder = new Map(STOCK_CATEGORIES.map((category, index) => [category, index]));
    const groups = new Map();
    stock.forEach(item => {
      const category = getStockCategory(item);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    });
    return [...groups.entries()]
      .sort(([a], [b]) => (categoryOrder.get(a) ?? STOCK_CATEGORIES.length) - (categoryOrder.get(b) ?? STOCK_CATEGORIES.length))
      .map(([category, items]) => [category, items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'))]);
  }, [stock]);

  const toast = useToast();

  // Local states - Menu form
  const [newItem, setNewItem] = useState({
    name: '', nameEn: '', price: '', category: '', image: '', description: '', descriptionEn: '', recommended: false, isFeatured: false, isPinnedBest: false, available: true,
    stockLinks: []
  });
  const [editingItem, setEditingItem] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuggestingStock, setIsSuggestingStock] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isMagicWriting, setIsMagicWriting] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Local states - Collapsed categories
  const [collapsedCategories, setCollapsedCategories] = useState({});

  // Local states - Promotion generator
  const [promotionIdeas, setPromotionIdeas] = useState([]);
  const [isGeneratingPromo, setIsGeneratingPromo] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoMode, setPromoMode] = useState('ai'); // 'ai' | 'manual'
  const [manualPromo, setManualPromo] = useState({
    title: '',
    description: '',
    code: '',
    discountPercent: 0
  });

  // Local states - Category management
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', nameEn: '', icon: '📁', color: 'gray' });
  const [categoryToDelete, setCategoryToDelete] = useState(null);

  // Local states - Delete menu confirmation
  const [showDeleteMenuConfirm, setShowDeleteMenuConfirm] = useState(false);
  const [menuToDelete, setMenuToDelete] = useState(null);

  // Local states - Promotion input modal
  const [showPromoInputModal, setShowPromoInputModal] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState(null);

  // Memoized groupedMenu
  const groupedMenu = useMemo(() => {
    const groups = {};
    menu.forEach(item => {
      const cat = item.category || 'ไม่ระบุหมวดหมู่';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return Object.keys(groups).sort((a, b) => {
      if (a === 'แนะนำ') return -1;
      if (b === 'แนะนำ') return 1;
      return a.localeCompare(b);
    }).map(cat => ({
      name: cat,
      // Items currently on sale (available) bubble to the top for easy management;
      // out-of-stock items sink to the bottom of their category.
      items: groups[cat].slice().sort((a, b) => {
        const aOut = a.available === false ? 1 : 0;
        const bOut = b.available === false ? 1 : 0;
        return aOut - bOut;
      })
    }));
  }, [menu]);

  // Set all categories collapsed by default
  useEffect(() => {
    if (groupedMenu.length > 0) {
      const allCollapsed = {};
      groupedMenu.forEach(g => { allCollapsed[g.name] = true; });
      setCollapsedCategories(prev => {
        if (Object.keys(prev).length === 0) return allCollapsed;
        return prev;
      });
    }
  }, [groupedMenu]);

  // --- Handlers ---

  // AI Promotion Generator
  const handleGeneratePromotions = async () => {
    if (!geminiApiKey) {
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

  const confirmDeleteMenu = async () => {
    setShowDeleteMenuConfirm(false);
    if (!menuToDelete) return;
    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', menuToDelete.id));
    }, 'ลบเมนูไม่สำเร็จ');
    setMenuToDelete(null);
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

    // Reset form and close modal
    setManualPromo({ title: '', description: '', code: '', discountPercent: 0 });
    setShowPromoModal(false);
  };

  // Menu CRUD
  const saveMenuItem = async (e) => {
    e.preventDefault();
    const col = collection(db, 'artifacts', appId, 'public', 'data', 'menu');
    // modifierGroups (array) คือค่าหลักรองรับหลายกลุ่ม; modifierGroup (string)
    // เก็บไว้ให้เข้ากันได้กับเมนู/โค้ดเดิม = กลุ่มแรกที่เลือก
    const groups = (Array.isArray(newItem.modifierGroups) && newItem.modifierGroups.length)
      ? newItem.modifierGroups
      : [newItem.modifierGroup || 'เมล็ดกาแฟ'];
    // Strip the doc's own `id` (must not be written back as a field) and coerce
    // numeric inputs — text inputs yield strings, which would corrupt calculations.
    const { id: _id, ...rest } = newItem;
    const data = {
      ...rest,
      price: Number(newItem.price),
      additionalCost: Number(newItem.additionalCost) || 0,
      beanExtra: Number(newItem.beanExtra) || 0,
      baseBeanIds: Array.isArray(newItem.baseBeanIds) ? newItem.baseBeanIds : [],
      stockLinks: (newItem.stockLinks || []).map(l => ({ ...l, usage: Number(l.usage) || 0 })),
      modifierGroups: groups,
      modifierGroup: groups[0]
    };
    if (!data.category && dynamicCategories.length > 0) data.category = dynamicCategories[0].name;
    await runDbAction(async () => {
      if (editingItem) await updateDoc(doc(col, editingItem.id), data); else await addDoc(col, data);
      toast.success(editingItem ? 'แก้ไขเมนูสำเร็จ' : 'เพิ่มเมนูใหม่สำเร็จ');
      setEditingItem(null);
      setNewItem({ name: '', nameEn: '', price: '', category: '', image: '', description: '', descriptionEn: '', recommended: false, isFeatured: false, isPinnedBest: false, available: true, stockLinks: [] });
    }, 'บันทึกเมนูไม่สำเร็จ');
  };

  const toggleAvailability = async (item) => {
    await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id), { available: !item.available });
    }, 'อัปเดตเมนูไม่สำเร็จ');
  };

  // Quick toggle a cake's Happy Hour exclusion straight from the list — new
  // cakes can be kept at full price with one tap, no need to open the editor.
  const toggleExcludeFromSale = async (item) => {
    await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id), { excludeFromSale: !item.excludeFromSale });
    }, 'อัปเดตเมนูไม่สำเร็จ');
  };

  // Stock link handlers
  const addStockLink = () => setNewItem(p => ({ ...p, stockLinks: [...(p.stockLinks || []), { stockId: '', usage: 1 }] }));
  const removeStockLink = (i) => setNewItem(p => ({ ...p, stockLinks: p.stockLinks.filter((_, idx) => idx !== i) }));
  const updateStockLink = (i, f, v) => setNewItem(p => {
    const next = [...p.stockLinks];
    next[i] = { ...next[i], [f]: v };
    return { ...p, stockLinks: next };
  });

  // Image upload — compress, then push to R2 and store the public URL (not base64)
  // so menu docs stay small and the customer publicMenu bundle fits Firestore.
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const compressed = await compressImage(reader.result);
          let image;
          try {
            image = await uploadImageToR2(compressed); // CDN URL (small)
          } catch {
            image = compressed; // image host not configured yet → keep base64 so upload still works
          }
          setNewItem((prev) => ({ ...prev, image }));
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(file);
    }
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
      toast.success('ทุกรูปอยู่บน R2 แล้ว ✓');
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
      setCategoryToDelete(null);
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
    if (!geminiApiKey) {
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

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-[var(--text-primary)]">
      <header className="h-16 md:h-20 lg:h-24 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] px-4 md:px-8 lg:px-12 flex items-center justify-between shadow-sm z-[var(--z-nav)] font-semibold text-[var(--text-primary)]">
        <div className="flex items-center gap-2 md:gap-4 text-emerald-600  font-semibold"><ClipboardList size={24} className="md:w-8 md:h-8 lg:w-9 lg:h-9" /><h1 className="text-base md:text-xl lg:text-2xl font-bold  tracking-tight text-[var(--text-primary)]">คลังเมนู</h1></div>
        <div className="flex items-center gap-2 md:gap-4">
          <Button
            onClick={handleTranslateToEnglish}
            disabled={isTranslating}
            variant="secondary"
            size="lg"
            leftIcon={<Languages size={16} className={isTranslating ? 'animate-spin' : ''} />}
          >
            {isTranslating ? 'กำลังแปล...' : 'แปลเมนูเป็นอังกฤษด้วย AI'}
          </Button>
          <Button
            onClick={() => setShowCategoryModal(true)}
            variant="warning"
            size="lg"
            leftIcon={<FolderCog size={16} />}
          >
            จัดการหมวดหมู่
          </Button>
          <Button
            onClick={() => setShowPromoModal(true)}
            variant="secondary"
            size="lg"
            leftIcon={<Zap size={16} fill="white" />}
            className="bg-gradient-to-r from-violet-500 to-fuchsia-500 border-violet-700"
          >
            จัดการโปรโมชั่น
          </Button>
          <Button
            onClick={() => { setEditingItem(null); setNewItem({ name: '', nameEn: '', price: '', category: '', image: '', description: '', descriptionEn: '', recommended: false, available: true, stockLinks: [] }); }}
            variant="primary"
            size="lg"
          >
            เตรียมเพิ่มเมนูใหม่
          </Button>
        </div>
      </header>

      {/* 🏷️ Promotion Generator Modal */}
      <Modal
        isOpen={showPromoModal}
        onClose={() => setShowPromoModal(false)}
        size="xl"
        title={
          <div className="text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-3 shadow-[var(--elev-2)] transition-all ${promoMode === 'ai' ? 'bg-gradient-to-tr from-violet-500 to-fuchsia-500 shadow-violet-500/30' : 'bg-gradient-to-tr from-emerald-500 to-teal-500 shadow-emerald-500/30'}`}>
              {promoMode === 'ai' ? <Zap size={32} fill="white" /> : <Edit size={32} />}
            </div>
            <span className="text-2xl font-semibold text-[var(--text-primary)]  tracking-tighter">
              {promoMode === 'ai' ? 'AI Promotion Ideas' : 'สร้างโปรโมชั่นเอง'}
            </span>
            <p className="text-[var(--text-muted)] font-bold mt-2 text-sm">
              {promoMode === 'ai' ? 'โปรโมชั่นที่ AI แนะนำสำหรับร้านของคุณ' : 'กำหนดโปรโมชั่นและส่วนลดตามใจคุณ'}
            </p>

            {/* Mode Toggle Tabs */}
            <div className="flex justify-center mt-4 gap-2 bg-[var(--bg-tertiary)] p-1.5 rounded-2xl w-fit mx-auto">
              <button
                onClick={() => setPromoMode('ai')}
                className={`px-6 py-3 rounded-xl text-xs font-semibold  tracking-wider transition-all flex items-center gap-2 ${promoMode === 'ai' ? 'bg-[var(--bg-secondary)] text-violet-600 shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >
                <Zap size={14} fill={promoMode === 'ai' ? 'currentColor' : 'none'} /> AI สร้างให้
              </button>
              <button
                onClick={() => setPromoMode('manual')}
                className={`px-6 py-3 rounded-xl text-xs font-medium  tracking-wider transition-all flex items-center gap-2 ${promoMode === 'manual' ? 'bg-[var(--bg-secondary)] text-emerald-600 shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >
                <Edit size={14} /> สร้างเอง
              </button>
            </div>
          </div>
        }
      >

            {/* AI Mode Content */}
            {promoMode === 'ai' && (
              <>
                {isGeneratingPromo ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-4">
                    <RefreshCcw size={48} className="animate-spin text-violet-500" />
                    <p className="text-[var(--text-secondary)] font-bold">AI กำลังคิดโปรโมชั่นให้...</p>
                  </div>
                ) : promotionIdeas.length === 0 ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-4">
                    <Zap size={48} className="text-[var(--text-muted)]" />
                    <p className="text-[var(--text-muted)] font-bold">กดปุ่มด้านล่างเพื่อให้ AI คิดโปรโมชั่น</p>
                    <button
                      onClick={handleGeneratePromotions}
                      className="mt-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-8 py-4 rounded-2xl text-xs font-medium  tracking-widest shadow-[var(--elev-2)] shadow-violet-500/30 hover:scale-105 transition-transform flex items-center gap-2"
                    >
                      <Zap size={16} fill="white" /> เริ่มคิดโปรโมชั่น
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {promotionIdeas.map((idea, idx) => (
                      <div key={idx} className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] p-6 rounded-[var(--radius)] relative group hover:bg-[var(--bg-secondary)] hover:border-violet-200 hover:shadow-[var(--elev-2)] hover:shadow-violet-500/10 transition-all">
                        <div className="absolute -top-3 -right-3 w-10 h-10 bg-violet-500 text-white rounded-full flex items-center justify-center font-semibold shadow-[var(--elev-2)]">{idx + 1}</div>
                        <h3 className="text-xl font-semibold text-violet-600 mb-3 leading-tight">{idea.title}</h3>
                        <p className="text-[var(--text-secondary)] text-sm font-bold mb-6 leading-relaxed opacity-80">{idea.description}</p>
                        <div className="bg-[var(--bg-secondary)] border-2 border-dashed border-violet-200 p-3 rounded-xl text-center mb-6">
                          <span className="text-xs font-medium text-[var(--text-muted)]  tracking-widest block mb-1">Code</span>
                          <span className="text-lg font-semibold text-[var(--text-primary)]">{idea.code}</span>
                        </div>
                        <button
                          onClick={() => handleSelectPromotion(idea)}
                          className="w-full py-4 bg-violet-600 text-white rounded-2xl text-xs font-medium  tracking-widest hover:bg-violet-700 transition-all shadow-[var(--elev-2)] shadow-violet-500/20 active:scale-95 flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 size={16} /> ใช้โปรโมชั่นนี้
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {promotionIdeas.length > 0 && (
                  <div className="mt-8 flex items-center justify-center gap-6">
                    <button onClick={handleGeneratePromotions} className="text-[var(--text-muted)] font-semibold text-xs  hover:text-violet-500 transition-colors flex items-center justify-center gap-2"><RefreshCcw size={14} /> ลองคิดใหม่</button>
                    {activePromotion && (
                      <button onClick={() => setActivePromotion(null)} className="text-red-400 font-semibold text-xs  hover:text-red-600 transition-colors flex items-center justify-center gap-2 border-l border-[var(--border-color)] pl-6"><Trash2 size={14} /> ยกเลิกโปรโมชั่นที่ใช้อยู่</button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Manual Mode Content */}
            {promoMode === 'manual' && (
              <div className="max-w-xl mx-auto space-y-6">
                <div>
                  <label className="text-xs font-medium text-[var(--text-muted)]  tracking-widest block mb-3 ml-2">ชื่อโปรโมชั่น *</label>
                  <input
                    type="text"
                    value={manualPromo.title}
                    onChange={e => setManualPromo({ ...manualPromo, title: e.target.value })}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-2xl p-4 text-base font-semibold outline-none focus:bg-[var(--bg-secondary)] focus:border-emerald-300 transition-all"
                    placeholder="เช่น ลด 20% ทุกเมนู, ซื้อ 2 แถม 1"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--text-muted)]  tracking-widest block mb-3 ml-2">รายละเอียด</label>
                  <textarea
                    value={manualPromo.description}
                    onChange={e => setManualPromo({ ...manualPromo, description: e.target.value })}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-2xl p-4 text-sm font-bold outline-none focus:bg-[var(--bg-secondary)] focus:border-emerald-300 transition-all min-h-[100px]"
                    placeholder="รายละเอียดเพิ่มเติมของโปรโมชั่น..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-[var(--text-muted)]  tracking-widest block mb-3 ml-2">โค้ดโปรโมชั่น</label>
                    <input
                      type="text"
                      value={manualPromo.code}
                      onChange={e => setManualPromo({ ...manualPromo, code: e.target.value.toUpperCase() })}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-2xl p-4 text-base font-semibold outline-none focus:bg-[var(--bg-secondary)] focus:border-emerald-300 transition-all "
                      placeholder="เช่น SAVE20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-muted)]  tracking-widest block mb-3 ml-2">ส่วนลด (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={manualPromo.discountPercent}
                      onChange={e => setManualPromo({ ...manualPromo, discountPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-2xl p-4 text-base font-semibold outline-none focus:bg-[var(--bg-secondary)] focus:border-emerald-300 transition-all"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Preview Card */}
                {manualPromo.title && (
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-3xl p-6 mt-8">
                    <p className="text-xs font-medium text-emerald-600  tracking-widest mb-3">ตัวอย่างโปรโมชั่น</p>
                    <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{manualPromo.title}</h3>
                    {manualPromo.description && <p className="text-sm text-[var(--text-secondary)] font-bold mb-4">{manualPromo.description}</p>}
                    <div className="flex items-center gap-4">
                      {manualPromo.code && (
                        <span className="bg-[var(--bg-secondary)] border-2 border-dashed border-emerald-300 px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-primary)]">
                          Code: {manualPromo.code}
                        </span>
                      )}
                      {manualPromo.discountPercent > 0 && (
                        <span className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                          ลด {manualPromo.discountPercent}%
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-4 mt-8">
                  <button
                    onClick={handleApplyManualPromotion}
                    disabled={!manualPromo.title.trim()}
                    className="flex-1 py-5 bg-emerald-500 text-white rounded-2xl text-xs font-medium  tracking-widest hover:bg-emerald-600 transition-all shadow-[var(--elev-2)] shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 size={18} /> ใช้โปรโมชั่นนี้
                  </button>
                </div>

                {activePromotion && (
                  <div className="text-center mt-4">
                    <button onClick={() => setActivePromotion(null)} className="text-red-400 font-semibold text-xs  hover:text-red-600 transition-colors flex items-center justify-center gap-2 mx-auto">
                      <Trash2 size={14} /> ยกเลิกโปรโมชั่นที่ใช้อยู่
                    </button>
                  </div>
                )}
              </div>
            )}
      </Modal>

      {/* 🗂️ Category Management Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); setCategoryToDelete(null); }}
        size="lg"
        title={
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-3 shadow-[var(--elev-2)] bg-gradient-to-tr from-amber-500 to-orange-500 shadow-amber-500/30">
              <FolderCog size={32} />
            </div>
            <span className="text-2xl font-semibold text-[var(--text-primary)]  tracking-tighter">จัดการหมวดหมู่</span>
            <p className="text-[var(--text-muted)] font-bold mt-2 text-sm">เพิ่มหรือลบหมวดหมู่สินค้า</p>
          </div>
        }
      >
        {/* Add Category Form */}
        <form onSubmit={handleAddCategory} className="bg-[var(--bg-tertiary)] rounded-3xl p-6 mb-8 border border-[var(--border-color)]">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)]  tracking-wider mb-4 flex items-center gap-2">
                <Plus size={18} className="text-emerald-500" /> เพิ่มหมวดหมู่ใหม่
              </h3>
              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <input
                    type="text"
                    value={newCategory.name}
                    onChange={e => setNewCategory({ ...newCategory, name: e.target.value })}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-4 text-base font-semibold outline-none focus:border-amber-300 transition-all"
                    placeholder="ชื่อหมวดหมู่ เช่น กาแฟ, ชา, ขนม..."
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <input
                    type="text"
                    value={newCategory.nameEn}
                    onChange={e => setNewCategory({ ...newCategory, nameEn: e.target.value })}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-4 text-base font-semibold outline-none focus:border-amber-300 transition-all"
                    placeholder="ชื่อ (EN) เช่น Coffee, Tea..."
                  />
                </div>
                <select
                  value={newCategory.icon}
                  onChange={e => setNewCategory({ ...newCategory, icon: e.target.value })}
                  className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl px-4 text-2xl cursor-pointer outline-none focus:border-amber-300"
                >
                  <option value="📁">📁</option>
                  <option value="☕">☕</option>
                  <option value="🧋">🧋</option>
                  <option value="🍵">🍵</option>
                  <option value="🧁">🧁</option>
                  <option value="🍰">🍰</option>
                  <option value="🥐">🥐</option>
                  <option value="🥪">🥪</option>
                  <option value="🍜">🍜</option>
                  <option value="🍕">🍕</option>
                  <option value="🍔">🍔</option>
                  <option value="🥗">🥗</option>
                  <option value="🍹">🍹</option>
                  <option value="🧃">🧃</option>
                  <option value="🍦">🍦</option>
                  <option value="⭐">⭐</option>
                </select>
                <button
                  type="submit"
                  disabled={!newCategory.name.trim()}
                  className="bg-emerald-500 text-white px-8 rounded-2xl font-semibold text-xs  tracking-wider hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  เพิ่ม
                </button>
              </div>
            </form>

            {/* Category List */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)]  tracking-wider mb-4 flex items-center gap-2">
                <ClipboardList size={18} className="text-amber-500" /> หมวดหมู่ทั้งหมด ({dynamicCategories.length})
              </h3>

              {dynamicCategories.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-muted)] font-bold">
                  ยังไม่มีหมวดหมู่
                </div>
              ) : (
                dynamicCategories.map((cat, index) => {
                  const itemCount = menu.filter(m => m.category === cat.name).length;
                  const isDeleting = categoryToDelete?.id === cat.id;

                  return (
                    <div
                      key={cat.id}
                      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${isDeleting ? 'bg-red-50 border-red-200' : 'bg-[var(--bg-secondary)] border-[var(--border-color)] hover:border-amber-200'}`}
                    >
                      {/* Reorder controls — moves this category earlier/later in the tab bar */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => moveCategory(index, -1)}
                          disabled={index === 0}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-amber-50 hover:text-amber-600 transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          title="เลื่อนขึ้น (แสดงก่อน)"
                        >
                          <ChevronUp size={18} />
                        </button>
                        <button
                          onClick={() => moveCategory(index, 1)}
                          disabled={index === dynamicCategories.length - 1}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-amber-50 hover:text-amber-600 transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          title="เลื่อนลง (แสดงทีหลัง)"
                        >
                          <ChevronDown size={18} />
                        </button>
                      </div>
                      <span className="text-3xl">{cat.icon || '📁'}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-[var(--text-primary)] text-lg">{cat.name}</p>
                        <p className="text-xs font-bold text-[var(--text-muted)]">
                          {itemCount > 0 ? `${itemCount} เมนูในหมวดหมู่นี้` : 'ไม่มีเมนู'}
                        </p>
                      </div>

                      {isDeleting ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-red-500 mr-2">ยืนยันลบ?</span>
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-medium  hover:bg-red-600 transition-all active:scale-95"
                          >
                            ลบ
                          </button>
                          <button
                            onClick={() => setCategoryToDelete(null)}
                            className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-4 py-2 rounded-xl text-xs font-medium  hover:bg-[var(--bg-tertiary)] transition-all active:scale-95"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCategoryToDelete(cat)}
                          disabled={itemCount > 0}
                          className={`p-3 rounded-xl transition-all ${itemCount > 0 ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed' : 'bg-red-50 text-red-500 hover:bg-red-500 hover:text-white active:scale-95'}`}
                          title={itemCount > 0 ? `ไม่สามารถลบได้ มี ${itemCount} เมนูใช้อยู่` : 'ลบหมวดหมู่'}
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

        {/* Info Note */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs font-bold text-amber-700">
            หมายเหตุ: ใช้ปุ่ม ▲▼ เพื่อจัดลำดับแถบหมวดหมู่ (มีผลทั้งหน้าขายและหน้า QR ลูกค้า) · ไม่สามารถลบหมวดหมู่ที่มีเมนูใช้อยู่ได้ กรุณาย้ายหรือลบเมนูในหมวดหมู่นั้นก่อน
          </p>
        </div>
      </Modal>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 lg:gap-8 p-4 md:p-6 lg:p-6 overflow-hidden text-[var(--text-primary)]">
        <div className="flex-1 bg-[var(--bg-secondary)] rounded-2xl md:rounded-[var(--radius)] lg:rounded-[var(--radius)] shadow-sm border border-[var(--border-color)] overflow-hidden flex flex-col animate-in slide-in-from-left shadow-emerald-500/5">
          <div className="p-4 md:p-6 lg:p-6 bg-[var(--bg-tertiary)]/50 border-b font-semibold text-[var(--text-muted)] text-xs md:text-xs  flex justify-between items-center px-4 md:px-8 lg:px-10 tracking-[0.2em] leading-none">
            <span>รายการเมนูอาหารทั้งหมด ({menu.length})</span>
            {pendingImageMigration > 0 && (
              <button
                type="button"
                onClick={migrateImagesToR2}
                disabled={isMigratingImages}
                title="ย้ายรูป base64 เดิมขึ้น R2 เพื่อให้เมนูลูกค้าโหลดเร็วและประหยัด Firestore read"
                className="normal-case tracking-normal bg-amber-50 text-amber-700 border-2 border-amber-200 px-4 py-2 rounded-xl font-bold hover:bg-amber-100 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                <Upload size={14} />
                {isMigratingImages
                  ? `กำลังย้าย ${migrateProgress}/${pendingImageMigration}...`
                  : `ย้ายรูปขึ้น R2 (${pendingImageMigration})`}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-hide px-6">
            {isSyncing && (
              <div className="py-6 px-4 space-y-4">
                {[...Array(6)].map((_, i) => <Skeleton.Card key={i} />)}
              </div>
            )}
            {!isSyncing && menu.length === 0 && (
              <EmptyState
                icon={ClipboardList}
                title="ยังไม่มีเมนู"
                description="เริ่มเพิ่มเมนูอาหารและเครื่องดื่มใหม่"
                action={{ label: "เพิ่มเมนูใหม่", onClick: () => { setEditingItem(null); setNewItem({ name: '', nameEn: '', price: '', category: '', image: '', description: '', descriptionEn: '', recommended: false, available: true, stockLinks: [] }); } }}
              />
            )}
            {groupedMenu.map(group => (
              <div key={group.name} className="py-4">
                <button onClick={() => setCollapsedCategories(prev => ({ ...prev, [group.name]: !prev[group.name] }))} className="w-full flex items-center gap-4 mb-2 sticky top-0 bg-[var(--bg-secondary)]/95 backdrop-blur-sm py-3 z-[var(--z-dropdown)] border-b border-[var(--border-color)] -mx-6 px-6 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
                  <div className={`w-1.5 h-6 rounded-full transition-colors ${collapsedCategories[group.name] ? 'bg-[var(--text-muted)]' : 'bg-emerald-500'}`}></div>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]  tracking-tight">{group.name}</h3>
                  <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-xl text-xs font-medium border border-emerald-100">{group.items.length} รายการ</span>
                  <div className="ml-auto text-[var(--text-muted)]">{collapsedCategories[group.name] ? <ChevronDown size={20} /> : <ChevronUp size={20} />}</div>
                </button>
                {!collapsedCategories[group.name] && group.items.map(i => (
                  <div key={i.id} className={`p-6 flex items-center gap-8 group rounded-[var(--radius)] transition-all my-2 ${i.available === false ? 'opacity-50 grayscale' : 'hover:bg-[var(--bg-tertiary)]'}`}>
                    <div className="relative shadow-[var(--elev-2)] rounded-3xl overflow-hidden border-2 border-white">{i.image ? <img src={i.image} className="w-24 h-24 object-cover" /> : <div className="w-24 h-24 flex items-center justify-center bg-[var(--bg-tertiary)] text-[var(--text-muted)]"><Coffee size={32} /></div>}{i.available === false && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-semibold text-xs  tracking-widest text-center">เมนูหมด</div>}</div>
                    <div className="flex-1 font-semibold text-[var(--text-primary)] text-xl leading-tight">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="leading-none">{String(i.name)}</p>
                        {(i.isFeatured || i.recommended) && <Star size={18} className="text-yellow-500 fill-yellow-500" />}
                        {i.isPinnedBest && <TrendingUp size={18} className="text-orange-500" title="ปักหมุดขายดี" />}
                        {i.excludeFromSale && <Clock size={18} className="text-indigo-500" title="ยกเว้นลด Happy Hour" />}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-emerald-500  bg-emerald-50 w-fit px-4 py-1 rounded-full border border-emerald-100 font-medium leading-none">฿{Number(i.price).toLocaleString()} • {String(i.category)}</p>
                        {(() => {
                          const linkedCost = (i.stockLinks || []).reduce((sum, link) => {
                            const s = stock.find(item => item.id === link.stockId);
                            return sum + (Number(s?.unitCost || 0) * Number(link.usage || 0));
                          }, 0);
                          const totalCost = linkedCost + Number(i.additionalCost || 0);
                          const margin = Number(i.price) - totalCost;
                          const marginPercent = Math.round((margin / (Number(i.price) || 1)) * 100);
                          return (
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium px-3 py-1 rounded-full border ${marginPercent < 30 ? 'bg-red-50 text-red-500 border-red-100' : 'bg-blue-50 text-blue-500 border-blue-100'}`}>กำไร {marginPercent}%</span>
                              {marginPercent < 30 && <AlertTriangle size={14} className="text-red-500 animate-pulse" title="กำไรต่ำกว่า 30%" />}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => toggleExcludeFromSale(i)} title={i.excludeFromSale ? 'ยกเว้นลด Happy Hour (กดเพื่อให้ร่วมลด)' : 'ร่วมลด Happy Hour (กดเพื่อยกเว้น เช่น เค้กใหม่)'} className={`p-4 rounded-2xl transition-all shadow-sm active:scale-90 ${i.excludeFromSale ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-color)]'}`}><Clock size={22} /></button>
                      <button onClick={() => toggleAvailability(i)} className={`p-4 rounded-2xl transition-all shadow-sm active:scale-90 ${i.available !== false ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-color)]'}`}>{i.available !== false ? <Eye size={22} /> : <EyeOff size={22} />}</button>
                      <button onClick={() => { setEditingItem(i); setNewItem({ ...i, nameEn: i.nameEn || '', descriptionEn: i.descriptionEn || '' }); }} aria-label="แก้ไขเมนู" className="p-4 bg-blue-50 text-blue-500 rounded-2xl transition-all shadow-sm border border-blue-100 active:scale-90"><Edit size={22} /></button>
                      <button onClick={() => {
                        setMenuToDelete(i);
                        setShowDeleteMenuConfirm(true);
                      }} className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm border border-red-100 active:scale-90"><Trash2 size={22} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="w-full lg:w-[400px] xl:w-[500px] bg-[var(--bg-secondary)] rounded-2xl md:rounded-[var(--radius)] lg:rounded-[var(--radius)] shadow-[var(--elev-3)] border border-emerald-50 p-6 md:p-6 lg:p-12 overflow-y-auto flex flex-col shadow-emerald-500/10 text-[var(--text-primary)] order-first lg:order-last">
          <h2 className="font-semibold text-3xl text-[var(--text-primary)] mb-10 flex items-center gap-4  font-semibold leading-none"><div className={`p-3.5 rounded-3xl shadow-[var(--elev-2)] ${editingItem ? 'bg-blue-500 shadow-blue-500/20' : 'bg-emerald-500 shadow-emerald-500/20'} text-white`}><PackagePlus size={32} /></div>{editingItem ? 'แก้ไขเมนูเดิม' : 'เพิ่มเมนูใหม่'}</h2>
          <form onSubmit={saveMenuItem} className="space-y-8 text-[var(--text-primary)]">
            <div><label className="text-xs font-medium text-[var(--text-muted)]  tracking-[0.2em] block mb-3 ml-2 leading-none">ชื่อรายการอาหาร</label><input type="text" required value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} className="w-full bg-[#f8faf9] border border-[var(--border-color)] rounded-[var(--radius)] p-6 text-base font-semibold outline-none focus:bg-[var(--bg-secondary)] transition-all shadow-inner leading-none" /></div>

            <div><label className="text-xs font-medium text-[var(--text-muted)]  tracking-[0.2em] block mb-3 ml-2 leading-none">ชื่อ (EN)</label><input type="text" value={newItem.nameEn || ''} onChange={e => setNewItem({ ...newItem, nameEn: e.target.value })} placeholder="e.g. Hot Americano" className="w-full bg-[#f8faf9] border border-[var(--border-color)] rounded-[var(--radius)] p-6 text-base font-semibold outline-none focus:bg-[var(--bg-secondary)] transition-all shadow-inner leading-none" /></div>

            {/* ✨ AI Magic Write */}
            <div className="relative">
              <label className="text-xs font-medium text-[var(--text-muted)]  tracking-[0.2em] block mb-3 ml-2 leading-none flex justify-between items-center">
                <span>คำบรรยาย (Description)</span>
                <button
                  type="button"
                  disabled={isMagicWriting}
                  onClick={async () => {
                    if (!newItem.name || !newItem.category) {
                      toast.warning('กรุณาระบุชื่อและหมวดหมู่ก่อนใช้ Magic Write');
                      return;
                    }
                    if (!geminiApiKey) {
                      toast.warning('กรุณาใส่ Gemini API Key ในการตั้งค่าก่อน');
                      return;
                    }

                    setIsMagicWriting(true);
                    try {
                      const prompt = `Write a short, appetizing, and premium description for a menu item named '${newItem.name}' in the category '${newItem.category}' for a modern cafe. Keep it under 150 characters. Thai language.`;

                      const result = await callGeminiAPI(prompt, false);
                      if (result.success) {
                        setNewItem(prev => ({ ...prev, description: result.data }));
                      } else {
                        throw new Error(result.error || 'AI ไม่สามารถเขียนคำบรรยายได้');
                      }

                    } catch (error) {
                      toast.error('เกิดข้อผิดพลาด: ' + error.message);
                    } finally {
                      setIsMagicWriting(false);
                    }
                  }}
                  className="text-xs bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-3 py-1 rounded-xl shadow-[var(--elev-2)] shadow-violet-500/30 hover:scale-105 transition-transform flex items-center gap-1 disabled:opacity-60"
                >
                  <Zap size={12} fill="currentColor" /> {isMagicWriting ? 'กำลังเสก...' : 'Magic Write'}
                </button>
              </label>
              <textarea
                value={newItem.description || ''}
                onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                className="w-full bg-[#f8faf9] border border-[var(--border-color)] rounded-[var(--radius)] p-6 text-sm font-bold outline-none focus:bg-[var(--bg-secondary)] transition-all shadow-inner leading-relaxed min-h-[120px]"
                placeholder="ใส่คำบรรยายสินค้า..."
              />
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--text-muted)]  tracking-[0.2em] block mb-3 ml-2 leading-none">คำอธิบาย (EN)</label>
              <textarea
                value={newItem.descriptionEn || ''}
                onChange={e => setNewItem({ ...newItem, descriptionEn: e.target.value })}
                className="w-full bg-[#f8faf9] border border-[var(--border-color)] rounded-[var(--radius)] p-6 text-sm font-bold outline-none focus:bg-[var(--bg-secondary)] transition-all shadow-inner leading-relaxed min-h-[120px]"
                placeholder="English description..."
              />
            </div>

            <div className="grid grid-cols-2 gap-6 text-[var(--text-primary)]">
              <div><label className="text-xs font-medium text-[var(--text-muted)]  tracking-[0.2em] block mb-3 ml-2 leading-none">ราคา (บาท)</label><input type="number" required value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} className="w-full bg-[#f8faf9] border border-[var(--border-color)] rounded-[var(--radius)] p-6 text-base font-semibold outline-none shadow-inner leading-none" /></div>
              <div><label className="text-xs font-medium text-[var(--text-muted)]  tracking-[0.2em] block mb-3 ml-2 leading-none">หมวดหมู่สินค้า</label><select required value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} className="w-full bg-[#f8faf9] border border-[var(--border-color)] rounded-[var(--radius)] p-6 text-sm font-semibold outline-none cursor-pointer shadow-inner leading-none"><option value="">เลือก...</option>{dynamicCategories.map(c => <option key={c.id} value={c.name}>{String(c.name)}</option>)}</select></div>
            </div>

            {/* Bean Modifier Toggle */}
            <div className="flex items-center justify-between bg-amber-50/50 p-4 rounded-[var(--radius)] border border-amber-100">
              <div className="flex items-center gap-3">
                <Coffee size={20} className="text-amber-500" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">เปิดใช้ตัวเลือก (เมล็ด/มัทฉะ)</span>
                <span className="text-xs font-bold text-[var(--text-muted)]">(#แท็ก)</span>
              </div>
              <button
                type="button"
                onClick={() => setNewItem({ ...newItem, allowBeanModifier: !newItem.allowBeanModifier })}
                className={`relative w-14 h-8 rounded-full transition-all ${newItem.allowBeanModifier ? 'bg-amber-500' : 'bg-[var(--bg-tertiary)]'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-[var(--bg-secondary)] rounded-full shadow-md transition-all ${newItem.allowBeanModifier ? 'right-1' : 'left-1'}`}></div>
              </button>
            </div>

            {/* Bean special add-on price (only when bean selection is on) */}
            {newItem.allowBeanModifier && (
              <div className="bg-amber-50/30 p-4 rounded-[var(--radius)] border border-amber-100">
                <label className="text-xs font-medium text-[var(--text-secondary)]  tracking-widest block mb-2">กลุ่มตัวเลือกที่ใช้ (เลือกได้หลายกลุ่ม)</label>
                {(() => {
                  const allGroups = [...new Set(['เมล็ดกาแฟ', ...(beanModifiers || []).map(b => b.group || 'เมล็ดกาแฟ')])];
                  const selectedGroups = getModifierGroups(newItem);
                  return (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {allGroups.map(g => {
                        const selected = selectedGroups.includes(g);
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => {
                              // ต้องเหลืออย่างน้อย 1 กลุ่ม
                              const next = selected
                                ? (selectedGroups.length > 1 ? selectedGroups.filter(x => x !== g) : selectedGroups)
                                : [...selectedGroups, g];
                              // ตัด baseBeanIds ที่ไม่อยู่ในกลุ่มที่เลือกแล้วออก
                              const allowedIds = (beanModifiers || []).filter(b => next.includes(b.group || 'เมล็ดกาแฟ')).map(b => b.id);
                              const baseBeanIds = (newItem.baseBeanIds || []).filter(id => allowedIds.includes(id));
                              setNewItem({ ...newItem, modifierGroups: next, modifierGroup: next[0], baseBeanIds });
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all ${selected ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-amber-300 hover:text-amber-600'}`}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                <p className="text-xs text-[var(--text-muted)] mb-4 font-bold leading-relaxed">เลือกหลายกลุ่มได้ ลูกค้าจะเลือกทีละกลุ่ม เช่น <strong>ส้ม</strong> (ฐานราคา) + <strong>เมล็ดกาแฟ</strong> (บวกเพิ่ม)</p>

                <label className="text-xs font-medium text-[var(--text-secondary)]  tracking-widest block mb-2">ราคาส่วนเพิ่มเมื่อเลือกเมล็ด (เช่น น้ำช่อ)</label>
                <input
                  type="number"
                  value={newItem.beanExtra ?? ''}
                  onChange={e => setNewItem({ ...newItem, beanExtra: e.target.value })}
                  className="w-full bg-[var(--bg-secondary)] border border-amber-200 rounded-2xl p-4 text-sm font-semibold outline-none"
                  placeholder="0"
                />
                <p className="text-xs text-[var(--text-muted)] mt-2 font-bold leading-relaxed">ราคารวม = ราคาเมนู + ส่วนเพิ่มของแต่ละตัวเลือกที่ไม่ใช่เบส (กลุ่มเดียว = ค่าที่สูงกว่าระหว่างราคาเมนูกับราคาตัวเลือก)</p>

                {/* Base options per group: selecting one keeps the menu price (no surcharge) */}
                <div className="mt-4 space-y-4">
                  <label className="text-xs font-medium text-[var(--text-secondary)]  tracking-widest block">ตัวเลือกที่คงราคาเมนู (เบส — ไม่บวกเพิ่ม)</label>
                  {getModifierGroups(newItem).map(group => {
                    const groupBeans = (beanModifiers || []).filter(b => (b.group || 'เมล็ดกาแฟ') === group);
                    return (
                      <div key={group}>
                        <p className="text-xs font-medium text-amber-600 mb-2">{group}</p>
                        {groupBeans.length === 0 ? (
                          <p className="text-xs text-[var(--text-muted)] italic font-bold">ยังไม่มีตัวเลือกในกลุ่มนี้ (เพิ่มที่หน้าแอดมิน)</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {groupBeans.map(b => {
                              const selected = (newItem.baseBeanIds || []).includes(b.id);
                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => {
                                    const cur = newItem.baseBeanIds || [];
                                    const next = selected ? cur.filter(x => x !== b.id) : [...cur, b.id];
                                    setNewItem({ ...newItem, baseBeanIds: next });
                                  }}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${selected ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-amber-300 hover:text-amber-600'}`}
                                >
                                  #{b.name}
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

            {/* Featured/Recommended Toggle */}
            <div className="flex items-center justify-between bg-yellow-50/50 p-4 rounded-[var(--radius)] border border-yellow-200">
              <div className="flex items-center gap-3">
                <Star size={20} className="text-yellow-500" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">เมนูแนะนำ</span>
                <span className="text-xs font-bold text-[var(--text-muted)]">(แสดงในหน้าแรก)</span>
              </div>
              <button
                type="button"
                onClick={() => setNewItem({ ...newItem, isFeatured: !newItem.isFeatured })}
                className={`relative w-14 h-8 rounded-full transition-all ${newItem.isFeatured ? 'bg-yellow-500' : 'bg-[var(--bg-tertiary)]'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-[var(--bg-secondary)] rounded-full shadow-md transition-all ${newItem.isFeatured ? 'right-1' : 'left-1'}`}></div>
              </button>
            </div>

            {/* Pinned Best-Seller Toggle */}
            <div className="flex items-center justify-between bg-orange-50/50 p-4 rounded-[var(--radius)] border border-orange-200">
              <div className="flex items-center gap-3">
                <TrendingUp size={20} className="text-orange-500" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">ปักหมุดขายดี</span>
                <span className="text-xs font-bold text-[var(--text-muted)]">(แสดงบนสุดหน้า QR)</span>
              </div>
              <button
                type="button"
                onClick={() => setNewItem({ ...newItem, isPinnedBest: !newItem.isPinnedBest })}
                className={`relative w-14 h-8 rounded-full transition-all ${newItem.isPinnedBest ? 'bg-orange-500' : 'bg-[var(--bg-tertiary)]'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-[var(--bg-secondary)] rounded-full shadow-md transition-all ${newItem.isPinnedBest ? 'right-1' : 'left-1'}`}></div>
              </button>
            </div>

            {/* Available / Out of Stock Toggle */}
            <div className="flex items-center justify-between bg-zinc-100 p-4 rounded-[var(--radius)] border border-zinc-200">
              <div className="flex items-center gap-3">
                <Store size={20} className={newItem.available !== false ? "text-emerald-500" : "text-red-500"} />
                <span className="text-sm font-semibold text-[var(--text-primary)]">สถานะสินค้า</span>
                <span className={`text-xs font-bold  tracking-wider ${newItem.available !== false ? "text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded" : "text-red-600 bg-red-100 px-2 py-0.5 rounded"}`}>
                  {newItem.available !== false ? 'พร้อมขาย' : 'สินค้าหมด'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setNewItem({ ...newItem, available: newItem.available === false ? true : false })}
                className={`relative w-14 h-8 rounded-full transition-all ${newItem.available !== false ? 'bg-emerald-500' : 'bg-[var(--text-muted)]'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-[var(--bg-secondary)] rounded-full shadow-md transition-all ${newItem.available !== false ? 'right-1' : 'left-1'}`}></div>
              </button>
            </div>

            {/* Exclude from Happy Hour cake sale Toggle */}
            <div className="flex items-center justify-between bg-indigo-50/50 p-4 rounded-[var(--radius)] border border-indigo-200">
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-indigo-500" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">ยกเว้นลด Happy Hour</span>
                <span className="text-xs font-bold text-[var(--text-muted)]">(เค้กใหม่/พึ่งทำ ไม่ลดราคา)</span>
              </div>
              <button
                type="button"
                onClick={() => setNewItem({ ...newItem, excludeFromSale: !newItem.excludeFromSale })}
                className={`relative w-14 h-8 rounded-full transition-all ${newItem.excludeFromSale ? 'bg-indigo-500' : 'bg-[var(--bg-tertiary)]'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-[var(--bg-secondary)] rounded-full shadow-md transition-all ${newItem.excludeFromSale ? 'right-1' : 'left-1'}`}></div>
              </button>
            </div>

            <div className="bg-emerald-50/50 p-6 rounded-[var(--radius)] border border-emerald-100 space-y-5 shadow-inner">
              <div className="flex items-center justify-between px-2 text-[var(--text-primary)] flex-wrap gap-2">
                <div className="flex items-center gap-3 text-xs font-medium text-emerald-600  tracking-[0.1em] leading-none"><Link2 size={20} /> ผูกสต็อกพัสดุ</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="text-xs font-bold bg-[var(--bg-secondary)] border border-blue-100 px-3 py-2 rounded-xl outline-none text-blue-600 cursor-pointer"
                    value=""
                    onChange={(e) => {
                      const sourceItem = menu.find(m => m.id === e.target.value);
                      if (sourceItem && sourceItem.stockLinks) {
                        setNewItem({ ...newItem, stockLinks: [...sourceItem.stockLinks] });
                      }
                    }}
                  >
                    <option value="">📋 คัดลอกจากเมนูอื่น...</option>
                    {menu.filter(m => m.id !== editingItem?.id && m.stockLinks?.length > 0 && m.category === newItem.category).map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.stockLinks.length} รายการ)</option>
                    ))}
                  </select>
                  <button type="button" onClick={addStockLink} className="flex items-center gap-2 text-emerald-600 font-semibold text-xs bg-[var(--bg-secondary)] border border-emerald-100 px-5 py-2.5 rounded-2xl shadow-sm hover:bg-emerald-50 active:scale-95 leading-none"><Plus size={16} /> เพิ่มพัสดุ</button>
                  <button
                    type="button"
                    disabled={isSuggestingStock}
                    onClick={async () => {
                      if (!newItem.name) { toast.warning('กรุณาระบุชื่อเมนูก่อน'); return; }
                      if (!stock.length) { toast.warning('ยังไม่มีวัตถุดิบในระบบ'); return; }
                      if (!geminiApiKey) { toast.warning('กรุณาตั้งค่า Gemini API Key ก่อน'); return; }
                      setIsSuggestingStock(true);
                      try {
                        const stockList = stock.map(s => `- id:"${s.id}" name:"${s.name}" unit:"${s.unit}"`).join('\n');
                        const prompt = `You are a Thai cafe recipe expert. Given menu item "${newItem.name}" (category: ${newItem.category || 'ไม่ระบุ'}), suggest which ingredients from the available stock are needed and how much of each.

Available stock:
${stockList}

Return ONLY a JSON array. Each element: { "stockId": "exact id from list", "usage": number (amount per 1 serving) }
Only include ingredients that are relevant. Be realistic with quantities (e.g. milk 30ml, ice 100g, coffee 18g).
Return [] if no stock items match.`;

                        const result = await callGeminiAPI(prompt, true);
                        if (result.success && Array.isArray(result.data)) {
                          const validLinks = result.data.filter(l => stock.some(s => s.id === l.stockId));
                          if (validLinks.length > 0) {
                            setNewItem(prev => ({ ...prev, stockLinks: validLinks.map(l => ({ stockId: l.stockId, usage: Number(l.usage) || 1 })) }));
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
                    }}
                    className="flex items-center gap-2 text-violet-600 font-semibold text-xs bg-violet-50 border border-violet-100 px-5 py-2.5 rounded-2xl shadow-sm hover:bg-violet-100 active:scale-95 leading-none disabled:opacity-50"
                  >
                    <Zap size={14} /> {isSuggestingStock ? 'กำลังวิเคราะห์...' : 'AI แนะนำ'}
                  </button>
                </div>
              </div>

              {/* Additional Overhead Cost */}
              <div className="px-2">
                <label className="text-xs font-medium text-[var(--text-muted)]  tracking-widest block mb-2">ต้นทุนแฝงเพิ่มเติม (ค่าแก้ว/ถุง/จ้าง)</label>
                <input
                  type="number"
                  value={newItem.additionalCost || ''}
                  onChange={e => setNewItem({ ...newItem, additionalCost: e.target.value })}
                  className="w-full bg-[var(--bg-secondary)] border border-emerald-100 rounded-xl p-3 text-xs font-medium outline-none"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-4 text-[var(--text-primary)]">
                {(newItem.stockLinks || []).map((link, idx) => (
                  <div key={idx} className="bg-[var(--bg-secondary)]/80 p-4 rounded-[var(--radius)] border border-emerald-50 shadow-sm space-y-4 relative group text-[var(--text-primary)]">
                    <div className="flex flex-col gap-3">
                      <label className="text-xs font-medium text-[var(--text-muted)]  tracking-widest ml-2">เลือกวัตถุดิบ</label>
                      <select
                        value={link.stockId}
                        onChange={(e) => updateStockLink(idx, 'stockId', e.target.value)}
                        className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl px-5 h-14 text-sm font-semibold outline-none text-[var(--text-primary)]"
                      >
                        <option value="">เลือกพัสดุในคลัง...</option>
                        {stockLinkGroups.map(([category, items]) => (
                          <optgroup key={category} label={category}>
                            {items.map(s => <option key={s.id} value={s.id}>{String(s.name)}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      {(() => {
                        const s = stock.find(s => s.id === link.stockId);
                        if (!s) return null;
                        const unitCost = Number(s.unitCost || 0);
                        const usage = Number(link.usage || 0);
                        const lineCost = unitCost * usage;
                        return (
                          <div className="flex items-center gap-3 mt-1 ml-2 text-xs font-bold">
                            <span className="text-[var(--text-muted)]">ราคาต่อหน่วย: <span className="text-[var(--text-secondary)]">฿{unitCost.toLocaleString()}/{s.unit}</span></span>
                            {usage > 0 && <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">ต้นทุน: ฿{lineCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex items-end gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-xs font-medium text-[var(--text-muted)]  tracking-widest ml-2">ปริมาณที่ใช้</label>
                        <div className="relative flex items-center bg-[var(--bg-tertiary)] rounded-xl px-5 h-14 border border-[var(--border-color)]">
                          <input
                            type="number"
                            step="any"
                            value={link.usage}
                            onChange={(e) => updateStockLink(idx, 'usage', e.target.value)}
                            className="w-full bg-transparent border-none text-left text-lg font-semibold outline-none text-[var(--text-primary)]"
                            placeholder="0.00"
                          />
                          <div className="bg-[var(--bg-secondary)] px-4 py-2 rounded-lg border border-[var(--border-color)] text-xs font-medium text-emerald-600  shadow-sm shrink-0">
                            {stock.find(s => s.id === link.stockId)?.unit || 'หน่วย'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStockLink(idx)}
                        className="h-14 w-14 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-90"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--text-muted)]  tracking-[0.2em] block mb-4 ml-3 leading-none">ภาพประกอบเมนู</label>
              <div className="flex items-center gap-8 text-[var(--text-primary)]">
                <div className="w-28 h-28 lg:w-32 lg:h-32 bg-[var(--bg-secondary)] rounded-[var(--radius)] border-4 border-dashed border-[var(--border-color)] flex items-center justify-center overflow-hidden shadow-inner relative shrink-0">
                  {isUploading && <div className="absolute inset-0 bg-[var(--bg-secondary)]/80 flex items-center justify-center z-[var(--z-nav)] text-emerald-500 leading-none"><RefreshCcw className="animate-spin" size={32} /></div>}
                  {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" /> : <Upload className="text-[var(--text-muted)]" size={32} />}
                </div>
                <div className="flex-1 flex flex-col gap-3">
                  <label className="bg-emerald-50 text-emerald-600 px-6 py-6 rounded-[var(--radius)] text-center text-[12px] font-semibold cursor-pointer hover:bg-emerald-100 transition-all  tracking-[0.2em] border-2 border-emerald-100 shadow-sm active:scale-95 leading-none">เลือกรูปภาพสินค้า<input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isUploading} /></label>
                  <button
                    type="button"
                    disabled={isGeneratingImage}
                    onClick={async () => {
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
                          setNewItem(prev => ({ ...prev, image }));
                          toast.success('AI สร้างรูปภาพสำเร็จ!');
                        } else {
                          toast.error(result.error || 'ไม่สามารถสร้างรูปภาพได้');
                        }
                      } catch (e) {
                        toast.error('เกิดข้อผิดพลาด: ' + e.message);
                      } finally {
                        setIsGeneratingImage(false);
                      }
                    }}
                    className="bg-violet-50 text-violet-600 px-6 py-5 rounded-[var(--radius)] text-center text-[12px] font-semibold hover:bg-violet-100 transition-all  tracking-[0.2em] border-2 border-violet-100 shadow-sm active:scale-95 leading-none disabled:opacity-50"
                  >
                    {isGeneratingImage ? '✨ กำลังสร้างรูป...' : '✨ AI เจนรูปเมนู'}
                  </button>
                </div>
              </div>
            </div>

            {/* Profit Prediction */}
            {newItem.price && (
              <div className="bg-[var(--surface-inverse)] rounded-[var(--radius)] p-6 text-white border-b-4 border-emerald-500 shadow-[var(--elev-2)]">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-medium  tracking-[0.2em] opacity-50">ประมาณการกำไร</span>
                  <TrendingUp size={18} className="text-emerald-500" />
                </div>
                {(() => {
                  const linkedCost = (newItem.stockLinks || []).reduce((sum, link) => {
                    const s = stock.find(item => item.id === link.stockId);
                    return sum + (Number(s?.unitCost || 0) * Number(link.usage || 0));
                  }, 0);
                  const totalCost = linkedCost + Number(newItem.additionalCost || 0);
                  const margin = Number(newItem.price) - totalCost;
                  const marginPercent = Math.round((margin / (Number(newItem.price) || 1)) * 100);
                  return (
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-3xl font-semibold tracking-tighter">฿{margin.toLocaleString()}</p>
                        <p className="text-xs font-bold text-[var(--text-secondary)] mt-1">จากต้นทุนรวม ฿{totalCost.toLocaleString()}</p>
                      </div>
                      <div className={`px-4 py-2 rounded-xl font-semibold text-sm ${marginPercent < 30 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {marginPercent}% Margin
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <button type="submit" disabled={isUploading} className={`w-full ${editingItem ? 'bg-blue-600 shadow-blue-500/20' : 'bg-emerald-500 shadow-emerald-500/20'} text-white py-8 lg:py-10 rounded-[var(--radius)] font-semibold shadow-[var(--elev-3)] active:scale-95 transition-all text-sm  tracking-[0.3em] border-b-8 border-emerald-800 leading-none`}>{editingItem ? 'อัปเดตข้อมูลเมนู' : 'บันทึกเมนูใหม่'}</button>
          </form>
        </div>
      </div>

      {/* Delete Menu Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteMenuConfirm}
        onClose={() => { setShowDeleteMenuConfirm(false); setMenuToDelete(null); }}
        onConfirm={confirmDeleteMenu}
        title="ลบเมนู"
        message={`ต้องการลบ "${menuToDelete?.name || 'เมนู'}" ออกจากระบบใช่หรือไม่?`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />

      {/* Promotion Discount Input Modal */}
      <InputModal
        isOpen={showPromoInputModal}
        onClose={() => { setShowPromoInputModal(false); setSelectedPromo(null); }}
        onSubmit={confirmPromoDiscount}
        title="ระบุส่วนลด"
        description={selectedPromo?.title || ''}
        variant="primary"
        icon={Star}
        fields={[
          { name: 'discount', label: 'เปอร์เซ็นต์ส่วนลด (%)', placeholder: '0', type: 'number', defaultValue: '0' }
        ]}
        submitText="ใช้โปรโมชั่น"
      />
    </div>
  );
}

import { useState, useMemo, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { isArchivedStock } from '../../utils/stockMerge';
import {
  ClipboardList, Plus, Wrench, FolderCog, Zap, Languages, ListOrdered, Upload, Star,
} from 'lucide-react';
import { doc, collection, addDoc, updateDoc, deleteDoc, writeBatch, increment, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { computeMenuWaste, buildWasteExpenseTitle, buildStaffMealExpenseTitle, usageFromPortions } from '../../utils/wastage';
import { db, appId } from '../../services/firebase';
import { useDataContext, useConfigContext, useUIContext } from '../../context/AppContext';
import { getISODate, compressImage } from '../../utils/calculations';
import { STOCK_CATEGORIES, getStockCategory, DEFAULT_STOCK_UNIT, DEFAULT_MIN_QUANTITY, WASTE_CATEGORY, STAFF_MEAL_CATEGORY } from '../../config/constants';
import { uploadImageToR2 } from '../../services/imageUpload';
import { sortByFeaturedOrder, moveItem, featuredOrderUpdates } from '../../utils/featuredOrder';
import { auditMenuLinks } from '../../utils/stockAudit';
import { useNavigate, useRouteParams } from '../../navigation';
import {
  Badge, Banner, Button, EmptyState, FilterChips, PageHeader, Skeleton, Toolbar, useMediaQuery, useToast, ConfirmModal, InputModal,
} from '../ui';
import MenuTable from './menu/MenuTable';
import MenuEditorSheet from './menu/MenuEditorSheet';
import { resolvePackagingPresets } from '../../utils/packagingPresets';
import CategoryManagerSheet from './menu/CategoryManagerSheet';
import PromotionSheet from './menu/PromotionSheet';
import { FeaturedOrderSheet, WasteSheet, CakeStockSheet } from './menu/ItemActionSheets';
import RowMenu from './menu/RowMenu';
import useMenuTools from './menu/useMenuTools';
import { OnTop } from './menu/parts';
import {
  emptyMenuItem, buildMenuStatus, countStockFilters, groupMenu,
  matchesHighlight, matchesSearch, matchesStockFilter, stockFilterFromParam,
} from './menu/menuModel';

const FOCUS_KEY = 'menuManage:focus';

/** Keeps a CSS pixel height of an element in state (for stacked sticky offsets). */
function useHeight(ref) {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setH(el.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return h;
}

/**
 * เมนู (UX v2 · WP5) · list grouped by category, editor in a Sheet.
 * Deep links: `#/menu?focus=<menuId>` opens that menu's editor at the stock
 * section · `#/menu?filter=unlinked|broken|linked|modifier` pre-filters.
 * StockAudit's "ผูกสต็อก" hands off through sessionStorage['menuManage:focus'].
 * All Firestore writes are the v1 ones, unchanged.
 */
export default function MenuManageView() {
  const { menu, stock, dynamicCategories, beanModifiers, orders, expenses, isSyncing } = useDataContext();
  const { aiReady, cakeSaleCategories, packagingPresetsSetting } = useConfigContext();
  const { runDbAction, callGeminiAPI, activePromotion, setActivePromotion } = useUIContext();
  const params = useRouteParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isPhone = useMediaQuery('(max-width: 767px)');

  const stockLinkGroups = useMemo(() => {
    const categoryOrder = new Map(STOCK_CATEGORIES.map((category, index) => [category, index]));
    const groups = new Map();
    // สต็อกที่ถูกรวมไปแล้ว (mergedInto) ไม่ให้เลือกผูกใหม่
    stock.filter(item => !isArchivedStock(item)).forEach(item => {
      const category = getStockCategory(item);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    });
    return [...groups.entries()]
      .sort(([a], [b]) => (categoryOrder.get(a) ?? STOCK_CATEGORIES.length) - (categoryOrder.get(b) ?? STOCK_CATEGORIES.length))
      .map(([category, items]) => [category, items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'))]);
  }, [stock]);
  const stockById = useMemo(() => new Map(stock.map(item => [item.id, item])), [stock]);
  const packagingPresets = useMemo(() => resolvePackagingPresets(packagingPresetsSetting, stock).presets, [packagingPresetsSetting, stock]);
  const pickStock = useMemo(() => stock.filter(item => !isArchivedStock(item)), [stock]);

  // ── Editor form state ───────────────────────────────────────────────────
  const [newItem, setNewItem] = useState(emptyMenuItem);
  const [editingItem, setEditingItem] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFocus, setEditorFocus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPoster, setIsUploadingPoster] = useState(false);

  const {
    isTranslating, promotionIdeas, isGeneratingPromo, showPromoModal, setShowPromoModal, promoMode,
    setPromoMode, manualPromo, setManualPromo, showPromoInputModal, setShowPromoInputModal,
    selectedPromo, setSelectedPromo, showCategoryModal, setShowCategoryModal, newCategory,
    setNewCategory, handleGeneratePromotions, handleSelectPromotion, confirmPromoDiscount,
    handleApplyManualPromotion, isMigratingImages, migrateProgress, pendingImageMigration,
    migrateImagesToR2, handleAddCategory, moveCategory, handleDeleteCategory,
    handleTranslateToEnglish,
  } = useMenuTools({
    menu, dynamicCategories, beanModifiers, orders, expenses,
    aiReady, runDbAction, callGeminiAPI, setActivePromotion, toast,
  });

  // ── Delete ─────────────────────────────────────────────────────────────
  const [showDeleteMenuConfirm, setShowDeleteMenuConfirm] = useState(false);
  const [menuToDelete, setMenuToDelete] = useState(null);

  // ── Filters (initial from the URL) ─────────────────────────────────────
  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState(() => stockFilterFromParam(params.filter));
  const [highlightFilter, setHighlightFilter] = useState('all');
  const [seenFilterParam, setSeenFilterParam] = useState(params.filter);
  if (params.filter !== seenFilterParam) { // deep link arrived while the page is open
    setSeenFilterParam(params.filter);
    setStockFilter(stockFilterFromParam(params.filter)); // the URL is the source of truth
  }

  // ── Waste ──────────────────────────────────────────────────────────────
  const [wasteMenuId, setWasteMenuId] = useState(null);
  const [wasteQuantity, setWasteQuantity] = useState('');
  const [wasteReason, setWasteReason] = useState('waste');
  const [savingWaste, setSavingWaste] = useState(false);
  const wasteLock = useRef(false);

  // ── Cake stock ─────────────────────────────────────────────────────────
  const [cakeMenuId, setCakeMenuId] = useState(null);
  const [cakeStock, setCakeStock] = useState({ name: '', unit: 'ก้อน', quantity: '0', unitCost: '', portions: '8' });
  const [savingCakeStock, setSavingCakeStock] = useState(false);
  const cakeStockLock = useRef(false);
  const cakeMenu = menu.find(item => item.id === cakeMenuId);
  const cakeUnit = cakeStock.unit.trim() || DEFAULT_STOCK_UNIT;
  const cakeCost = Number(cakeStock.unitCost);
  const cakePortions = Number(cakeStock.portions);
  const validCakeCost = Number.isFinite(cakeCost) && cakeCost > 0;
  const validCakePortions = Number.isSafeInteger(cakePortions) && cakePortions > 0;
  const validCakeQuantity = Number.isFinite(Number(cakeStock.quantity)) && Number(cakeStock.quantity) >= 0;
  const cakeUsage = validCakePortions ? usageFromPortions(cakePortions) : 0;
  const validCakeStock = Boolean(cakeMenu && cakeStock.name.trim() && validCakeCost && validCakePortions && validCakeQuantity);
  const duplicateCakeStock = stock.some(item => String(item.name).trim().toLocaleLowerCase('th-TH') === cakeStock.name.trim().toLocaleLowerCase('th-TH'));
  const openCakeStock = useCallback((item) => {
    setCakeStock({ name: `${item.name} (ก้อน)`, unit: 'ก้อน', quantity: '0', unitCost: '', portions: '8' });
    setCakeMenuId(item.id);
  }, []);
  const confirmCakeStock = async event => {
    event.preventDefault();
    // ใช้ ref เพราะการกดซ้ำอาจเกิดก่อน React อัปเดตสถานะปุ่ม
    if (cakeStockLock.current || !validCakeStock) return;
    cakeStockLock.current = true;
    setSavingCakeStock(true);
    try {
      await runDbAction(async () => {
        const stockRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stock'));
        const link = { stockId: stockRef.id, usage: cakeUsage };
        // บันทึกพร้อมกันเพื่อไม่ให้เหลือสต็อกลอยเมื่อผูกเมนูไม่สำเร็จ
        const batch = writeBatch(db);
        batch.set(stockRef, {
          name: cakeStock.name.trim(), quantity: Number(cakeStock.quantity), unit: cakeUnit,
          minQuantity: DEFAULT_MIN_QUANTITY, unitCost: cakeCost, category: 'วัตถุดิบเบเกอรี่'
        });
        // ต่อท้ายบนฐานข้อมูลเพื่อรักษาลิงก์ที่อาจถูกเพิ่มจากเครื่องอื่นระหว่างเปิดฟอร์ม
        batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'menu', cakeMenu.id), { stockLinks: arrayUnion(link) });
        await batch.commit();
        // ฟอร์มแก้ไขต้องเก็บลิงก์ใหม่ด้วย เพื่อไม่ให้การบันทึกครั้งถัดไปลบทิ้ง
        const appendLink = item => item?.id === cakeMenu.id ? { ...item, stockLinks: [...(item.stockLinks || []), link] } : item;
        setNewItem(appendLink);
        setEditingItem(appendLink);
        setCakeMenuId(null);
        toast.success('สร้างสต็อกและผูกเมนูแล้ว · ไปเพิ่มจำนวนก้อนได้ที่หน้าคลังพัสดุ');
      }, 'สร้างสต็อกและผูกเมนูไม่สำเร็จ');
    } finally {
      cakeStockLock.current = false;
      setSavingCakeStock(false);
    }
  };

  // ── Stock-link status (same source as nav badge + stock-audit) ─────────
  const statusById = useMemo(() => buildMenuStatus({ menu, stock, beanModifiers }), [menu, stock, beanModifiers]);
  const filterCounts = useMemo(() => countStockFilters(menu, statusById), [menu, statusById]);
  // Banner counts only menus on sale, exactly like the nav badge / stock-audit tab.
  const saleAudit = useMemo(() => auditMenuLinks({ menu, stock, beanModifiers }), [menu, stock, beanModifiers]);

  const stockFilteredMenu = useMemo(
    () => menu.filter(item => matchesStockFilter(statusById.get(item.id), stockFilter) && matchesSearch(item, query)),
    [menu, statusById, stockFilter, query],
  );
  const filteredMenu = useMemo(() => stockFilteredMenu.filter(item => matchesHighlight(item, highlightFilter)), [stockFilteredMenu, highlightFilter]);
  const groupedMenu = useMemo(() => groupMenu(filteredMenu, dynamicCategories), [filteredMenu, dynamicCategories]);

  const wasteMenu = menu.find(item => item.id === wasteMenuId);
  const waste = computeMenuWaste({ menuItem: wasteMenu, quantity: Number(wasteQuantity), stockById });
  const unitWaste = computeMenuWaste({ menuItem: wasteMenu, quantity: 1, stockById });
  const validWasteQuantity = Number.isFinite(Number(wasteQuantity)) && Number(wasteQuantity) > 0;

  const editMenu = useCallback((item, focus = null) => {
    setEditingItem(item);
    setNewItem({ ...item, nameEn: item.nameEn || '', descriptionEn: item.descriptionEn || '' });
    setEditorFocus(focus);
    setEditorOpen(true);
  }, []);
  const startNewMenu = () => {
    setEditingItem(null);
    setNewItem(emptyMenuItem());
    setEditorFocus(null);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    // a nested sheet/confirm (cake stock) is on top · let it handle Esc/backdrop first
    if (cakeMenuId !== null) return;
    setEditorOpen(false);
    setEditingItem(null);
  };

  // มาจากปุ่ม "ไปผูกสต็อก" หน้าสรุปการขาย & สต็อก หรือ #/menu?focus=<id> · เปิดฟอร์มแก้เมนูนั้นทันที
  const focusHandled = useRef(null);
  useEffect(() => {
    if (!menu.length) return;
    let focusId = null;
    if (focusHandled.current === null) {
      try { focusId = sessionStorage.getItem(FOCUS_KEY); sessionStorage.removeItem(FOCUS_KEY); } catch { /* storage ปิด */ }
    }
    if (!focusId && params.focus && focusHandled.current !== params.focus) focusId = params.focus;
    focusHandled.current = params.focus || focusId || '';
    const target = focusId && menu.find(item => item.id === focusId);
    if (!target) return;
    requestAnimationFrame(() => {
      editMenu(target, 'stock');
      document.querySelector(`[data-menu-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({ block: 'center' });
    });
  }, [menu, params.focus, editMenu]);

  const changeStockFilter = (value) => {
    setStockFilter(value);
    setSeenFilterParam(value === 'all' ? undefined : value);
    navigate('menu_manage', { filter: value === 'all' ? undefined : value }, { replace: true });
  };

  const confirmWaste = async () => {
    if (wasteLock.current || !wasteMenu || !validWasteQuantity || !waste.costed) return;
    wasteLock.current = true;
    setSavingWaste(true);
    try {
      await runDbAction(async () => {
        // เขียนพร้อมกันเพื่อไม่ให้ยอดสต็อกกับบัญชีเหลื่อมกันเมื่อรายการใดล้มเหลว
        const batch = writeBatch(db);
        Object.entries(waste.usageByStock).forEach(([stockId, used]) => {
          batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'stock', stockId), { quantity: increment(-used) });
        });
        const expenseRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'));
        const isStaffMeal = wasteReason === 'staff';
        batch.set(expenseRef, { title: isStaffMeal ? buildStaffMealExpenseTitle(wasteMenu.name, Number(wasteQuantity)) : buildWasteExpenseTitle(wasteMenu.name, Number(wasteQuantity)), amount: waste.cost, category: isStaffMeal ? STAFF_MEAL_CATEGORY : WASTE_CATEGORY, date: getISODate(), createdAt: serverTimestamp() });
        await batch.commit();
        toast.success(wasteReason === 'staff' ? 'บันทึกเจ้าของ/พนักงานกินแล้ว' : 'บันทึกของเสียสำเร็จ');
        setWasteMenuId(null);
      }, 'บันทึกไม่สำเร็จ');
    } finally { wasteLock.current = false; setSavingWaste(false); }
  };
  const toggleHighlight = useCallback(async (item, field) => {
    // แก้เฉพาะธงที่กด เพราะ recommended เป็นข้อมูลเก่าที่ต้องเก็บไว้
    await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id), { [field]: !item[field] });
    }, 'อัปเดตเมนูไม่สำเร็จ');
  }, [runDbAction]);

  // จัดลำดับเมนูแนะนำ (featuredOrder) · ใช้ทั้งแถบ "เมนูแนะนำ" หน้า QR และแท็บ "แนะนำ" หน้าร้าน
  const [featuredDraft, setFeaturedDraft] = useState(null); // null = ปิด
  const [savingFeaturedOrder, setSavingFeaturedOrder] = useState(false);
  const openFeaturedOrder = () => setFeaturedDraft(sortByFeaturedOrder(menu.filter(m => m.isFeatured === true)));
  const saveFeaturedOrder = async () => {
    const updates = featuredOrderUpdates(featuredDraft || []);
    if (updates.length === 0) { setFeaturedDraft(null); return; }
    setSavingFeaturedOrder(true);
    try {
      await runDbAction(async () => {
        const batch = writeBatch(db);
        updates.forEach(({ id, featuredOrder }) => batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'menu', id), { featuredOrder }));
        await batch.commit();
        toast.success('บันทึกลำดับเมนูแนะนำแล้ว');
        setFeaturedDraft(null);
      }, 'บันทึกลำดับไม่สำเร็จ');
    } finally { setSavingFeaturedOrder(false); }
  };

  // --- Handlers ---


  const confirmDeleteMenu = async () => {
    setShowDeleteMenuConfirm(false);
    if (!menuToDelete) return;
    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', menuToDelete.id));
    }, 'ลบเมนูไม่สำเร็จ');
    setMenuToDelete(null);
  };
  const askDeleteMenu = useCallback((item) => {
    setEditorOpen(false);
    setEditingItem(null);
    setMenuToDelete(item);
    setShowDeleteMenuConfirm(true);
  }, []);

  // Menu CRUD
  const withoutPerWhole = (link) => {
    const { perWhole: _perWhole, _k: _key, ...rest } = link;
    return rest;
  };
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
      // perWhole = form-only helper of the "สูตรทั้งก้อน ÷ ชิ้น" mode · usage (per piece) is what gets deducted
      stockLinks: (newItem.stockLinks || []).map(l => ({ ...withoutPerWhole(l), usage: Number(l.usage) || 0 })),

      modifierGroups: groups,
      modifierGroup: groups[0]
    };
    // "สูตรทั้งก้อน ÷ ชิ้น" remembers the piece count so the editor reopens in that mode
    if (newItem.recipeMode === 'whole' && Number(newItem.recipePieces) > 0) {
      data.recipeMode = 'whole';
      data.recipePieces = Number(newItem.recipePieces);
      data.recipeWholePrice = Number(newItem.recipeWholePrice) > 0 ? Number(newItem.recipeWholePrice) : null;
    } else if ('recipeMode' in data || 'recipePieces' in data || editingItem?.recipeMode) {
      data.recipeMode = null;
      data.recipePieces = null;
      data.recipeWholePrice = null;
    }
    if (!data.category && dynamicCategories.length > 0) data.category = dynamicCategories[0].name;
    await runDbAction(async () => {
      if (editingItem) await updateDoc(doc(col, editingItem.id), data); else await addDoc(col, data);
      toast.success(editingItem ? 'แก้ไขเมนูสำเร็จ' : 'เพิ่มเมนูใหม่สำเร็จ');
      setEditingItem(null);
      setNewItem(emptyMenuItem());
      setEditorOpen(false);
    }, 'บันทึกเมนูไม่สำเร็จ');
  };

  const toggleAvailability = useCallback(async (item) => {
    await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id), { available: !item.available });
    }, 'อัปเดตเมนูไม่สำเร็จ');
  }, [runDbAction]);

  // Quick toggle a cake's Happy Hour exclusion straight from the list — new
  // cakes can be kept at full price with one tap, no need to open the editor.
  const toggleExcludeFromSale = useCallback(async (item) => {
    await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id), { excludeFromSale: !item.excludeFromSale });
    }, 'อัปเดตเมนูไม่สำเร็จ');
  }, [runDbAction]);

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

  // Story poster (optional) — shown full-screen when a customer taps the menu on
  // the QR page. Kept big enough to read its copy on a phone, so it MUST live on
  // R2: a ~1080px base64 JPEG would blow the 1 MiB publicMenu bundle.
  const handlePosterUpload = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingPoster(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result, 1080, 1620, 0.85);
        const posterImage = await uploadImageToR2(compressed);
        setNewItem((prev) => ({ ...prev, posterImage }));
      } catch (err) {
        toast.error(err.message || 'อัปโหลดโปสเตอร์ไม่สำเร็จ');
      } finally {
        setIsUploadingPoster(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Layout: header + toolbar are sticky; group headers stick under them ──
  const headerRef = useRef(null);
  const toolbarRef = useRef(null);
  const headerH = useHeight(headerRef);
  const toolbarH = useHeight(toolbarRef);

  const rowActions = useMemo(() => ({
    onEdit: (item) => editMenu(item),
    onToggleAvailability: toggleAvailability,
    onToggleHighlight: toggleHighlight,
    onToggleExcludeFromSale: toggleExcludeFromSale,
    onWaste: (item) => { setWasteMenuId(item.id); setWasteQuantity(''); setWasteReason('waste'); },
    onCakeStock: openCakeStock,
    onDelete: askDeleteMenu,
  }), [editMenu, toggleAvailability, toggleHighlight, toggleExcludeFromSale, openCakeStock, askDeleteMenu]);

  const toolItems = [
    { key: 'categories', label: 'จัดการหมวดหมู่', icon: FolderCog, onSelect: () => setShowCategoryModal(true) },
    { key: 'promo', label: 'โปรโมชั่น', hint: activePromotion ? `ใช้อยู่: ${activePromotion.title}` : undefined, icon: Zap, onSelect: () => setShowPromoModal(true) },
    { key: 'translate', label: isTranslating ? 'กำลังแปล...' : aiReady ? 'แปลเมนูเป็นอังกฤษ (AI)' : 'แปลเมนูเป็นอังกฤษ (AI ออฟไลน์ · เปิดคอมที่ร้าน)', icon: Languages, disabled: isTranslating || !aiReady, onSelect: handleTranslateToEnglish },
    { key: 'featured', label: 'จัดลำดับแนะนำ', icon: ListOrdered, onSelect: openFeaturedOrder },
    pendingImageMigration > 0 && {
      key: 'migrate',
      label: isMigratingImages ? `กำลังย้าย ${migrateProgress}/${pendingImageMigration}...` : `ย้ายรูปขึ้น R2 (${pendingImageMigration})`,
      hint: 'ให้เมนูลูกค้าโหลดเร็ว ประหยัด Firestore read',
      icon: Upload,
      disabled: isMigratingImages,
      onSelect: migrateImagesToR2,
    },
  ];

  const featuredCount = stockFilteredMenu.filter(item => matchesHighlight(item, 'featured')).length;
  const pinnedCount = stockFilteredMenu.filter(item => matchesHighlight(item, 'pinned')).length;
  const stockChips = [
    { value: 'all', label: 'ทั้งหมด', count: filterCounts.all },
    { value: 'unlinked', label: 'ยังไม่ผูก', count: filterCounts.unlinked, tone: filterCounts.unlinked ? 'warn' : undefined },
    ...(filterCounts.broken ? [{ value: 'broken', label: 'ลิงก์เสีย', count: filterCounts.broken, tone: 'danger' }] : []),
    ...(filterCounts.modifier ? [{ value: 'modifier', label: 'ผูกแค่ตัวเลือก', count: filterCounts.modifier, tone: 'info' }] : []),
    { value: 'linked', label: 'ผูกแล้ว', count: filterCounts.linked, tone: 'ok' },
  ];
  const highlightChips = [
    { value: 'featured', label: 'แนะนำ', count: featuredCount },
    { value: 'pinned', label: 'ปักหมุดขายดี', count: pinnedCount },
  ];

  const attention = saleAudit.needsAttention;
  const brokenOnSale = saleAudit.counts.dead + saleAudit.counts.partial;
  const selectedId = editorOpen ? editingItem?.id : null;
  const filtersActive = stockFilter !== 'all' || highlightFilter !== 'all' || query.trim() !== '';

  return (
    <div className="min-h-full bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div ref={headerRef} className="sticky top-0 z-[20]">
        <PageHeader
          sticky={false}
          title="เมนู"
          icon={ClipboardList}
          subtitle={isPhone
            ? `${menu.length} เมนู · ยังไม่ผูก ${filterCounts.unlinked}`
            : `${menu.length} เมนู · ผูกสต็อกแล้ว ${filterCounts.linked} · ยังไม่ผูก ${filterCounts.unlinked}`}
          meta={(isTranslating || isMigratingImages || activePromotion) ? (
            <>
              {activePromotion && <Badge tone="ok">โปรที่ใช้อยู่: {activePromotion.title}</Badge>}
              {isTranslating && <Badge tone="info">กำลังแปลเมนูเป็นอังกฤษ...</Badge>}
              {isMigratingImages && <Badge tone="info" className="num">กำลังย้ายรูป {migrateProgress}/{pendingImageMigration}</Badge>}
            </>
          ) : null}
          actions={(
            <>
              <RowMenu items={toolItems} label="เครื่องมือ" text={isPhone ? undefined : 'เครื่องมือ'} icon={Wrench} className={isPhone ? 'border border-[var(--border-strong)]' : ''} />
              <Button leftIcon={<Plus size={18} />} onClick={startNewMenu}>เพิ่มเมนู</Button>
            </>
          )}
          className="[&>div]:flex-nowrap [&>div>div:last-child]:w-auto"
        />
      </div>

      {attention > 0 && (
        <div className="px-[var(--page-pad)] pt-4">
          <Banner
            tone={brokenOnSale > 0 ? 'danger' : 'warn'}
            title={`มี ${attention} เมนูที่ขายอยู่แต่ตัดสต็อกไม่ได้`}
            action={{ label: 'ดูรายการ', onClick: () => navigate('stock_audit', { tab: 'links' }) }}
          >
            {[
              saleAudit.counts.unlinked > 0 && `ยังไม่ผูกสต็อก ${saleAudit.counts.unlinked}`,
              brokenOnSale > 0 && `ลิงก์เสีย ${brokenOnSale}`,
            ].filter(Boolean).join(' · ')} · ขายแล้วสต็อกไม่ลด ของหมดโดยไม่รู้ตัว
          </Banner>
        </div>
      )}

      <div ref={toolbarRef} className="sticky z-[15]" style={{ top: headerH }}>
        <Toolbar
          search={{ value: query, onChange: setQuery, placeholder: 'ค้นหาชื่อเมนู / หมวด' }}
          filters={(
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              <FilterChips
                ariaLabel="กรองสถานะการผูกสต็อก"
                value={stockFilter}
                onChange={changeStockFilter}
                chips={stockChips}
                className="shrink-0 overflow-visible"
              />
              <span aria-hidden="true" className="shrink-0 w-px h-6 bg-[var(--border-strong)]" />
              <FilterChips
                ariaLabel="กรองเมนูไฮไลต์"
                value={highlightFilter}
                onChange={(v) => setHighlightFilter(highlightFilter === v ? 'all' : v)}
                chips={highlightChips}
                className="shrink-0 overflow-visible"
              />
            </div>
          )}
        />
      </div>

      <div className="px-[var(--page-pad)] pb-24 md:pb-10 pt-1">
        {isSyncing && (
          <div className="flex flex-col gap-3">
            {[...Array(6)].map((_, i) => <Skeleton.Card key={i} />)}
          </div>
        )}
        {!isSyncing && menu.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="ยังไม่มีเมนู"
            description="เริ่มเพิ่มเมนูอาหารและเครื่องดื่มใหม่"
            action={{ label: 'เพิ่มเมนูใหม่', onClick: startNewMenu }}
          />
        )}
        {!isSyncing && menu.length > 0 && filteredMenu.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="ไม่มีเมนูที่ตรงกับตัวกรอง"
            action={filtersActive ? { label: 'ล้างตัวกรอง', onClick: () => { setQuery(''); setHighlightFilter('all'); changeStockFilter('all'); } } : undefined}
          />
        )}
        {!isSyncing && filteredMenu.length > 0 && (
          <MenuTable
            groups={groupedMenu}
            statusById={statusById}
            selectedId={selectedId}
            stickyTop={headerH + toolbarH}
            actions={rowActions}
          />
        )}
      </div>

      <MenuEditorSheet
        open={editorOpen}
        onClose={closeEditor}
        focusSection={editorFocus}
        editingItem={editingItem}
        newItem={newItem}
        setNewItem={setNewItem}
        onSubmit={saveMenuItem}
        onDelete={askDeleteMenu}
        onCakeStock={openCakeStock}
        menu={menu}
        stock={pickStock}
        stockById={stockById}
        stockLinkGroups={stockLinkGroups}
        dynamicCategories={dynamicCategories}
        beanModifiers={beanModifiers}
        cakeSaleCategories={cakeSaleCategories}
        aiReady={aiReady}
        packagingPresets={packagingPresets}
        callGeminiAPI={callGeminiAPI}
        toast={toast}
        isUploading={isUploading}
        isUploadingPoster={isUploadingPoster}
        onImageUpload={handleImageUpload}
        onPosterUpload={handlePosterUpload}
      />

      <CategoryManagerSheet
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        categories={dynamicCategories}
        menu={menu}
        newCategory={newCategory}
        setNewCategory={setNewCategory}
        onAdd={handleAddCategory}
        onMove={moveCategory}
        onDelete={handleDeleteCategory}
      />

      <PromotionSheet
        open={showPromoModal}
        onClose={() => setShowPromoModal(false)}
        mode={promoMode}
        setMode={setPromoMode}
        ideas={promotionIdeas}
        isGenerating={isGeneratingPromo}
        onGenerate={handleGeneratePromotions}
        onSelectIdea={handleSelectPromotion}
        manualPromo={manualPromo}
        setManualPromo={setManualPromo}
        onApplyManual={handleApplyManualPromotion}
        activePromotion={activePromotion}
        onCancelActive={() => setActivePromotion(null)}
      />

      <FeaturedOrderSheet
        draft={featuredDraft}
        setDraft={setFeaturedDraft}
        saving={savingFeaturedOrder}
        onSave={saveFeaturedOrder}
        onClose={() => setFeaturedDraft(null)}
        moveItem={moveItem}
      />

      <WasteSheet
        open={wasteMenuId !== null}
        onClose={() => setWasteMenuId(null)}
        menuItem={wasteMenu}
        quantity={wasteQuantity}
        setQuantity={setWasteQuantity}
        saving={savingWaste}
        waste={waste}
        unitWaste={unitWaste}
        validQuantity={validWasteQuantity}
        stockById={stockById}
        onConfirm={confirmWaste}
        reason={wasteReason}
        setReason={setWasteReason}
        onGoLink={() => { const item = wasteMenu; setWasteMenuId(null); if (item) editMenu(item, 'stock'); }}
      />

      <CakeStockSheet
        open={cakeMenuId !== null}
        onClose={() => { if (!cakeStockLock.current) setCakeMenuId(null); }}
        menuItem={cakeMenu}
        cakeStock={cakeStock}
        setCakeStock={setCakeStock}
        saving={savingCakeStock}
        onSubmit={confirmCakeStock}
        duplicate={duplicateCakeStock}
        validQuantity={validCakeQuantity}
        validCost={validCakeCost}
        validPortions={validCakePortions}
        validAll={validCakeStock}
        cakeCost={cakeCost}
        cakePortions={cakePortions}
        cakeUsage={cakeUsage}
        cakeUnit={cakeUnit}
        defaultUnit={DEFAULT_STOCK_UNIT}
      />

      <OnTop>
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
      </OnTop>
    </div>
  );
}

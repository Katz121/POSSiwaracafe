import React, { useState, useMemo, useEffect } from 'react';
import {
  ClipboardList, RefreshCcw, Zap, X, CheckCircle2, Trash2,
  ChevronDown, ChevronUp, Star, Eye, EyeOff, Edit, PackagePlus,
  Coffee, Link2, Plus, Upload, TrendingUp, Store, AlertTriangle
} from 'lucide-react';
import { doc, collection, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate, compressImage } from '../../utils/calculations';

export default function MenuManageView() {
  const {
    menu,
    stock,
    dynamicCategories,
    orders,
    expenses,
    isSyncing,
    geminiApiKey,
    runDbAction,
    callGeminiAPI,
    activePromotion,
    setActivePromotion,
    setView
  } = useAppContext();

  // Local states - Menu form
  const [newItem, setNewItem] = useState({
    name: '', price: '', category: '', image: '', recommended: false, isFeatured: false, available: true,
    stockLinks: []
  });
  const [editingItem, setEditingItem] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Local states - Collapsed categories
  const [collapsedCategories, setCollapsedCategories] = useState({});

  // Local states - Promotion generator
  const [promotionIdeas, setPromotionIdeas] = useState([]);
  const [isGeneratingPromo, setIsGeneratingPromo] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);

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
      items: groups[cat]
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
      alert('กรุณาใส่ Gemini API Key ในการตั้งค่าก่อน');
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
      console.error(e);
      alert('เกิดข้อผิดพลาดในการคิดโปรโมชั่น: ' + e.message);
      setShowPromoModal(false);
    } finally {
      setIsGeneratingPromo(false);
    }
  };

  const handleSelectPromotion = (promo) => {
    const discountInput = window.prompt(`ใช้โปรโมชั่นนี้: ${promo.title}\nระบุเปอร์เซ็นต์ส่วนลด (%) หรือใส่ 0 ถ้าไม่มีส่วนลดราคา`, "0");
    if (discountInput === null) return;
    const discountPercent = Number(discountInput) || 0;

    setActivePromotion({ ...promo, discountPercent: discountPercent });
    setShowPromoModal(false);
  };

  // Menu CRUD
  const saveMenuItem = async (e) => {
    e.preventDefault();
    const col = collection(db, 'artifacts', appId, 'public', 'data', 'menu');
    const data = { ...newItem, price: Number(newItem.price) };
    if (!data.category && dynamicCategories.length > 0) data.category = dynamicCategories[0].name;
    await runDbAction(async () => {
      if (editingItem) await updateDoc(doc(col, editingItem.id), data); else await addDoc(col, data);
      setEditingItem(null);
      setNewItem({ name: '', price: '', category: '', image: '', recommended: false, isFeatured: false, available: true, stockLinks: [] });
    }, 'บันทึกเมนูไม่สำเร็จ');
  };

  const toggleAvailability = async (item) => {
    await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', item.id), { available: !item.available });
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

  // Image upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result);
        setNewItem({ ...newItem, image: compressed });
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-gray-800">
      <header className="h-24 bg-white border-b border-gray-100 px-12 flex items-center justify-between shadow-sm z-10 font-black text-gray-800">
        <div className="flex items-center gap-4 text-emerald-600 uppercase font-black"><ClipboardList size={36} /><h1 className="text-2xl font-black uppercase tracking-tight text-gray-800">คลังเมนูอาหารและเครื่องดื่ม</h1></div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleGeneratePromotions}
            disabled={isGeneratingPromo}
            className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-6 py-4.5 rounded-2xl text-xs font-black shadow-lg shadow-violet-500/30 uppercase border-b-4 border-violet-700 active:scale-95 tracking-widest leading-none flex items-center gap-2 transition-all hover:scale-105"
          >
            {isGeneratingPromo ? <RefreshCcw size={16} className="animate-spin" /> : <Zap size={16} fill="white" />}
            {isGeneratingPromo ? 'กำลังระดมสมอง...' : 'ช่วยคิดโปรโมชั่น (AI)'}
          </button>
          <button onClick={() => { setEditingItem(null); setNewItem({ name: '', price: '', category: '', image: '', recommended: false, available: true, stockLinks: [] }); }} className="bg-emerald-500 text-white px-10 py-4.5 rounded-2xl text-xs font-black shadow-lg uppercase border-b-4 border-emerald-700 active:scale-95 tracking-widest leading-none">เตรียมเพิ่มเมนูใหม่</button>
        </div>
      </header>

      {/* 🏷️ Promotion Generator Modal */}
      {showPromoModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-[3rem] p-10 max-w-4xl w-full shadow-2xl relative animate-in zoom-in-95 border border-white/20">
            <button onClick={() => setShowPromoModal(false)} className="absolute top-6 right-6 p-4 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"><X size={24} /></button>
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-gradient-to-tr from-violet-500 to-fuchsia-500 rounded-3xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-violet-500/30"><Zap size={40} fill="white" /></div>
              <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter">AI Promotion Ideas</h2>
              <p className="text-gray-400 font-bold mt-2">โปรโมชั่นที่ AI แนะนำสำหรับร้านของคุณตอนนี้</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {promotionIdeas.map((idea, idx) => (
                <div key={idx} className="bg-gray-50 border border-gray-100 p-8 rounded-[2.5rem] relative group hover:bg-white hover:border-violet-200 hover:shadow-xl hover:shadow-violet-500/10 transition-all">
                  <div className="absolute -top-3 -right-3 w-10 h-10 bg-violet-500 text-white rounded-full flex items-center justify-center font-black shadow-lg">{idx + 1}</div>
                  <h3 className="text-xl font-black text-violet-600 mb-3 leading-tight">{idea.title}</h3>
                  <p className="text-gray-600 text-sm font-bold mb-6 leading-relaxed opacity-80">{idea.description}</p>
                  <div className="bg-white border-2 border-dashed border-violet-200 p-3 rounded-xl text-center mb-6">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest block mb-1">Code</span>
                    <span className="text-lg font-black text-gray-800">{idea.code}</span>
                  </div>
                  <button
                    onClick={() => handleSelectPromotion(idea)}
                    className="w-full py-4 bg-violet-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-500/20 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={16} /> ใช้โปรโมชั่นนี้
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center justify-center gap-6">
              <button onClick={handleGeneratePromotions} className="text-gray-400 font-black text-xs uppercase hover:text-violet-500 transition-colors flex items-center justify-center gap-2"><RefreshCcw size={14} /> ลองคิดใหม่</button>
              {activePromotion && (
                <button onClick={() => setActivePromotion(null)} className="text-red-400 font-black text-xs uppercase hover:text-red-600 transition-colors flex items-center justify-center gap-2 border-l border-gray-100 pl-6"><Trash2 size={14} /> ยกเลิกโปรโมชั่นที่ใช้อยู่</button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex gap-8 p-8 overflow-hidden text-gray-800">
        <div className="flex-1 bg-white rounded-[4rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col animate-in slide-in-from-left shadow-emerald-500/5">
          <div className="p-8 bg-gray-50/50 border-b font-black text-gray-400 text-xs uppercase flex justify-between px-10 tracking-[0.2em] leading-none">
            <span>รายการเมนูอาหารทั้งหมด ({menu.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-hide px-6">
            {isSyncing && (
              <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-gray-400">
                กำลังโหลดเมนู...
              </div>
            )}
            {!isSyncing && menu.length === 0 && (
              <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-gray-400">
                ยังไม่มีเมนู
              </div>
            )}
            {groupedMenu.map(group => (
              <div key={group.name} className="py-4">
                <button onClick={() => setCollapsedCategories(prev => ({ ...prev, [group.name]: !prev[group.name] }))} className="w-full flex items-center gap-4 mb-2 sticky top-0 bg-white/95 backdrop-blur-sm py-3 z-[5] border-b border-gray-100 -mx-6 px-6 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className={`w-1.5 h-6 rounded-full transition-colors ${collapsedCategories[group.name] ? 'bg-gray-300' : 'bg-emerald-500'}`}></div>
                  <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">{group.name}</h3>
                  <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-xl text-[10px] font-black border border-emerald-100">{group.items.length} รายการ</span>
                  <div className="ml-auto text-gray-400">{collapsedCategories[group.name] ? <ChevronDown size={20} /> : <ChevronUp size={20} />}</div>
                </button>
                {!collapsedCategories[group.name] && group.items.map(i => (
                  <div key={i.id} className={`p-6 flex items-center gap-8 group rounded-[2.5rem] transition-all my-2 ${i.available === false ? 'opacity-50 grayscale' : 'hover:bg-gray-50'}`}>
                    <div className="relative shadow-xl rounded-3xl overflow-hidden border-2 border-white"><img src={i.image || 'https://via.placeholder.com/100'} className="w-24 h-24 object-cover" />{i.available === false && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-black text-[10px] uppercase tracking-widest text-center">เมนูหมด</div>}</div>
                    <div className="flex-1 font-black text-gray-800 text-xl leading-tight">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="leading-none">{String(i.name)}</p>
                        {(i.isFeatured || i.recommended) && <Star size={18} className="text-yellow-500 fill-yellow-500" />}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-[11px] text-emerald-500 uppercase bg-emerald-50 w-fit px-4 py-1 rounded-full border border-emerald-100 font-black leading-none">฿{Number(i.price).toLocaleString()} • {String(i.category)}</p>
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
                              <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${marginPercent < 30 ? 'bg-red-50 text-red-500 border-red-100' : 'bg-blue-50 text-blue-500 border-blue-100'}`}>กำไร {marginPercent}%</span>
                              {marginPercent < 30 && <AlertTriangle size={14} className="text-red-500 animate-pulse" title="กำไรต่ำกว่า 30%" />}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => toggleAvailability(i)} className={`p-4 rounded-2xl transition-all shadow-sm active:scale-90 ${i.available !== false ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>{i.available !== false ? <Eye size={22} /> : <EyeOff size={22} />}</button>
                      <button onClick={() => { setEditingItem(i); setNewItem(i); }} className="p-4 bg-blue-50 text-blue-500 rounded-2xl transition-all shadow-sm border border-blue-100 active:scale-90"><Edit size={22} /></button>
                      <button onClick={async () => {
                        if (!window.confirm("ลบเมนูนี้ออกจากระบบ?")) return;
                        await runDbAction(async () => {
                          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', i.id));
                        }, 'ลบเมนูไม่สำเร็จ');
                      }} className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm border border-red-100 active:scale-90"><Trash2 size={22} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="w-[500px] bg-white rounded-[4rem] shadow-2xl border border-emerald-50 p-12 overflow-y-auto flex flex-col shadow-emerald-500/10 text-gray-800">
          <h2 className="font-black text-3xl text-gray-800 mb-10 flex items-center gap-5 uppercase font-black leading-none"><div className={`p-3.5 rounded-3xl shadow-lg ${editingItem ? 'bg-blue-500 shadow-blue-500/20' : 'bg-emerald-500 shadow-emerald-500/20'} text-white`}><PackagePlus size={32} /></div>{editingItem ? 'แก้ไขเมนูเดิม' : 'เพิ่มเมนูใหม่'}</h2>
          <form onSubmit={saveMenuItem} className="space-y-8 text-gray-800">
            <div><label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] block mb-3 ml-2 leading-none">ชื่อรายการอาหาร</label><input type="text" required value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} className="w-full bg-[#f8faf9] border border-gray-100 rounded-[2rem] p-6 text-base font-black outline-none focus:bg-white transition-all shadow-inner leading-none" /></div>

            {/* ✨ AI Magic Write */}
            <div className="relative">
              <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] block mb-3 ml-2 leading-none flex justify-between items-center">
                <span>คำบรรยาย (Description)</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!newItem.name || !newItem.category) {
                      alert('กรุณาระบุชื่อและหมวดหมู่ก่อนใช้ Magic Write');
                      return;
                    }
                    if (!geminiApiKey) {
                      alert('กรุณาใส่ Gemini API Key ในการตั้งค่าก่อน');
                      return;
                    }

                    const btn = document.getElementById('magic-write-btn');
                    if (btn) btn.innerText = '✨ กำลังเสก...';

                    try {
                      const prompt = `Write a short, appetizing, and premium description for a menu item named '${newItem.name}' in the category '${newItem.category}' for a modern cafe. Keep it under 150 characters. Thai language.`;

                      const result = await callGeminiAPI(prompt, false);
                      if (result.success) {
                        setNewItem(prev => ({ ...prev, description: result.data }));
                      } else {
                        throw new Error(result.error || 'AI ไม่สามารถเขียนคำบรรยายได้');
                      }

                    } catch (error) {
                      console.error('Magic Write Error:', error);
                      alert('เกิดข้อผิดพลาด: ' + error.message);
                    } finally {
                      if (btn) btn.innerText = '✨ Magic Write';
                    }
                  }}
                  id="magic-write-btn"
                  className="text-[10px] bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-3 py-1 rounded-xl shadow-lg shadow-violet-500/30 hover:scale-105 transition-transform flex items-center gap-1"
                >
                  <Zap size={12} fill="currentColor" /> Magic Write
                </button>
              </label>
              <textarea
                value={newItem.description || ''}
                onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                className="w-full bg-[#f8faf9] border border-gray-100 rounded-[2rem] p-6 text-sm font-bold outline-none focus:bg-white transition-all shadow-inner leading-relaxed min-h-[120px]"
                placeholder="ใส่คำบรรยายสินค้า..."
              />
            </div>

            <div className="grid grid-cols-2 gap-6 text-gray-800">
              <div><label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] block mb-3 ml-2 leading-none">ราคา (บาท)</label><input type="number" required value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} className="w-full bg-[#f8faf9] border border-gray-100 rounded-[2rem] p-6 text-base font-black outline-none shadow-inner leading-none" /></div>
              <div><label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] block mb-3 ml-2 leading-none">หมวดหมู่สินค้า</label><select required value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} className="w-full bg-[#f8faf9] border border-gray-100 rounded-[2rem] p-6 text-sm font-black outline-none cursor-pointer shadow-inner leading-none"><option value="">เลือก...</option>{dynamicCategories.map(c => <option key={c.id} value={c.name}>{String(c.name)}</option>)}</select></div>
            </div>

            {/* Bean Modifier Toggle */}
            <div className="flex items-center justify-between bg-amber-50/50 p-5 rounded-[2rem] border border-amber-100">
              <div className="flex items-center gap-3">
                <Coffee size={20} className="text-amber-500" />
                <span className="text-sm font-black text-gray-700">เปิดใช้ตัวเลือกเมล็ดกาแฟ</span>
                <span className="text-[10px] font-bold text-gray-400">(#แท็ก)</span>
              </div>
              <button
                type="button"
                onClick={() => setNewItem({ ...newItem, allowBeanModifier: !newItem.allowBeanModifier })}
                className={`relative w-14 h-8 rounded-full transition-all ${newItem.allowBeanModifier ? 'bg-amber-500' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${newItem.allowBeanModifier ? 'right-1' : 'left-1'}`}></div>
              </button>
            </div>

            {/* Featured/Recommended Toggle */}
            <div className="flex items-center justify-between bg-yellow-50/50 p-5 rounded-[2rem] border border-yellow-200">
              <div className="flex items-center gap-3">
                <Star size={20} className="text-yellow-500" />
                <span className="text-sm font-black text-gray-700">เมนูแนะนำ</span>
                <span className="text-[10px] font-bold text-gray-400">(แสดงในหน้าแรก)</span>
              </div>
              <button
                type="button"
                onClick={() => setNewItem({ ...newItem, isFeatured: !newItem.isFeatured })}
                className={`relative w-14 h-8 rounded-full transition-all ${newItem.isFeatured ? 'bg-yellow-500' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${newItem.isFeatured ? 'right-1' : 'left-1'}`}></div>
              </button>
            </div>

            {/* Available / Out of Stock Toggle */}
            <div className="flex items-center justify-between bg-zinc-100 p-5 rounded-[2rem] border border-zinc-200">
              <div className="flex items-center gap-3">
                <Store size={20} className={newItem.available !== false ? "text-emerald-500" : "text-red-500"} />
                <span className="text-sm font-black text-gray-700">สถานะสินค้า</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${newItem.available !== false ? "text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded" : "text-red-600 bg-red-100 px-2 py-0.5 rounded"}`}>
                  {newItem.available !== false ? 'พร้อมขาย' : 'สินค้าหมด'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setNewItem({ ...newItem, available: newItem.available === false ? true : false })}
                className={`relative w-14 h-8 rounded-full transition-all ${newItem.available !== false ? 'bg-emerald-500' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${newItem.available !== false ? 'right-1' : 'left-1'}`}></div>
              </button>
            </div>

            <div className="bg-emerald-50/50 p-8 rounded-[2.5rem] border border-emerald-100 space-y-5 shadow-inner">
              <div className="flex items-center justify-between px-2 text-gray-800 flex-wrap gap-2">
                <div className="flex items-center gap-3 text-xs font-black text-emerald-600 uppercase tracking-[0.1em] leading-none"><Link2 size={20} /> ผูกสต็อกพัสดุ</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="text-xs font-bold bg-white border border-blue-100 px-3 py-2 rounded-xl outline-none text-blue-600 cursor-pointer"
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
                  <button type="button" onClick={addStockLink} className="flex items-center gap-2 text-emerald-600 font-black text-[11px] bg-white border border-emerald-100 px-5 py-2.5 rounded-2xl shadow-sm hover:bg-emerald-50 active:scale-95 leading-none"><Plus size={16} /> เพิ่มพัสดุ</button>
                </div>
              </div>

              {/* Additional Overhead Cost */}
              <div className="px-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">ต้นทุนแฝงเพิ่มเติม (ค่าแก้ว/ถุง/จ้าง)</label>
                <input
                  type="number"
                  value={newItem.additionalCost || ''}
                  onChange={e => setNewItem({ ...newItem, additionalCost: e.target.value })}
                  className="w-full bg-white border border-emerald-100 rounded-xl p-3 text-xs font-black outline-none"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-4 text-gray-800">
                {(newItem.stockLinks || []).map((link, idx) => (
                  <div key={idx} className="bg-white/80 p-5 rounded-[2rem] border border-emerald-50 shadow-sm space-y-4 relative group text-gray-800">
                    <div className="flex flex-col gap-3">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">เลือกวัตถุดิบ</label>
                      <select
                        value={link.stockId}
                        onChange={(e) => updateStockLink(idx, 'stockId', e.target.value)}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-5 h-14 text-sm font-black outline-none text-gray-800"
                      >
                        <option value="">เลือกพัสดุในคลัง...</option>
                        {stock.map(s => <option key={s.id} value={s.id}>{String(s.name)}</option>)}
                      </select>
                    </div>

                    <div className="flex items-end gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">ปริมาณที่ใช้</label>
                        <div className="relative flex items-center bg-gray-50 rounded-xl px-5 h-14 border border-gray-100">
                          <input
                            type="number"
                            step="any"
                            value={link.usage}
                            onChange={(e) => updateStockLink(idx, 'usage', e.target.value)}
                            className="w-full bg-transparent border-none text-left text-lg font-black outline-none text-gray-800"
                            placeholder="0.00"
                          />
                          <div className="bg-white px-4 py-2 rounded-lg border border-gray-100 text-[10px] font-black text-emerald-600 uppercase shadow-sm shrink-0">
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
              <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] block mb-4 ml-3 leading-none">ภาพประกอบเมนู</label>
              <div className="flex items-center gap-8 text-gray-800">
                <div className="w-28 h-28 lg:w-32 lg:h-32 bg-white rounded-[2.5rem] border-4 border-dashed border-gray-100 flex items-center justify-center overflow-hidden shadow-inner relative shrink-0">
                  {isUploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 text-emerald-500 leading-none"><RefreshCcw className="animate-spin" size={32} /></div>}
                  {newItem.image ? <img src={newItem.image} className="w-full h-full object-cover" /> : <Upload className="text-gray-200" size={32} />}
                </div>
                <label className="flex-1 bg-emerald-50 text-emerald-600 px-6 py-6 rounded-[2rem] text-center text-[12px] font-black cursor-pointer hover:bg-emerald-100 transition-all uppercase tracking-[0.2em] border-2 border-emerald-100 shadow-sm active:scale-95 leading-none">เลือกรูปภาพสินค้า<input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isUploading} /></label>
              </div>
            </div>

            {/* Profit Prediction */}
            {newItem.price && (
              <div className="bg-gray-900 rounded-[2rem] p-6 text-white border-b-4 border-emerald-500 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">ประมาณการกำไร</span>
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
                        <p className="text-3xl font-black tracking-tighter">฿{margin.toLocaleString()}</p>
                        <p className="text-[10px] font-bold text-gray-500 mt-1">จากต้นทุนรวม ฿{totalCost.toLocaleString()}</p>
                      </div>
                      <div className={`px-4 py-2 rounded-xl font-black text-sm ${marginPercent < 30 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {marginPercent}% Margin
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <button type="submit" disabled={isUploading} className={`w-full ${editingItem ? 'bg-blue-600 shadow-blue-500/20' : 'bg-emerald-500 shadow-emerald-500/20'} text-white py-8 lg:py-10 rounded-[2.5rem] font-black shadow-2xl active:scale-95 transition-all text-sm uppercase tracking-[0.3em] border-b-8 border-emerald-800 leading-none`}>{editingItem ? 'อัปเดตข้อมูลเมนู' : 'บันทึกเมนูใหม่'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronUp, ChevronDown, Coffee, BarChart3 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { EmptyState } from '../ui';
import { getISODate, getOrderDate, isDateInRange } from '../../utils/calculations';

export default function CategorySummaryView() {
  const { orders, menu, handleViewChange } = useAppContext();

  // Local states
  const [categoryRangeMode, setCategoryRangeMode] = useState('custom');
  const [categoryRangeStart, setCategoryRangeStart] = useState(getISODate());
  const [categoryRangeEnd, setCategoryRangeEnd] = useState(getISODate());
  const [expandedCategory, setExpandedCategory] = useState(null);

  // Memoized category sales calculation
  const categorySales = useMemo(() => {
    const map = new Map();
    orders
      .filter(o => o.status === 'completed' && isDateInRange(getOrderDate(o), categoryRangeStart, categoryRangeEnd))
      .forEach(order => {
        (order.items || []).forEach(item => {
          const fallbackCategory = menu.find(m => m.id === item.id)?.category;
          const category = String(item.category || fallbackCategory || 'ไม่ระบุหมวดหมู่');
          const quantity = Number(item.quantity) || 0;
          const revenue = (Number(item.price) || 0) * quantity;
          const current = map.get(category) || { category, revenue: 0, quantity: 0 };
          current.revenue += revenue;
          current.quantity += quantity;
          map.set(category, current);
        });
      });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [orders, menu, categoryRangeStart, categoryRangeEnd]);

  const bestCategory = categorySales[0];

  // Items breakdown per category for drill-down
  const categoryItemsBreakdown = useMemo(() => {
    const breakdown = {};
    const beansBreakdown = {}; // Track bean modifiers per category
    orders
      .filter(o => o.status === 'completed' && isDateInRange(getOrderDate(o), categoryRangeStart, categoryRangeEnd))
      .forEach(order => {
        (order.items || []).forEach(item => {
          const fallbackCategory = menu.find(m => m.id === item.id)?.category;
          const category = String(item.category || fallbackCategory || 'ไม่ระบุหมวดหมู่');
          const quantity = Number(item.quantity) || 0;
          const revenue = (Number(item.price) || 0) * quantity;

          if (!breakdown[category]) breakdown[category] = {};
          const itemName = String(item.name);
          if (!breakdown[category][itemName]) {
            breakdown[category][itemName] = { name: itemName, quantity: 0, revenue: 0, price: Number(item.price) || 0 };
          }
          breakdown[category][itemName].quantity += quantity;
          breakdown[category][itemName].revenue += revenue;

          // Track bean modifier usage
          if (item.beanModifier && String(item.beanModifier).startsWith('#')) {
            const tag = String(item.beanModifier);
            if (!beansBreakdown[category]) beansBreakdown[category] = {};
            if (!beansBreakdown[category][tag]) {
              beansBreakdown[category][tag] = { tag, quantity: 0, revenue: 0 };
            }
            beansBreakdown[category][tag].quantity += quantity;
            beansBreakdown[category][tag].revenue += revenue;
          }
        });
      });

    // Convert to sorted arrays
    const result = {};
    Object.keys(breakdown).forEach(cat => {
      result[cat] = {
        items: Object.values(breakdown[cat]).sort((a, b) => b.quantity - a.quantity),
        beans: beansBreakdown[cat] ? Object.values(beansBreakdown[cat]).sort((a, b) => b.quantity - a.quantity) : []
      };
    });
    return result;
  }, [orders, menu, categoryRangeStart, categoryRangeEnd]);

  // Helper functions
  const setCategoryRangePreset = (mode) => {
    setCategoryRangeMode(mode);
    if (mode === 'all') {
      setCategoryRangeStart('');
      setCategoryRangeEnd('');
      return;
    }
    if (mode === 'week') {
      const end = getISODate();
      const start = getISODate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
      setCategoryRangeStart(start);
      setCategoryRangeEnd(end);
      return;
    }
    const today = getISODate();
    setCategoryRangeStart(prev => prev || today);
    setCategoryRangeEnd(prev => prev || today);
  };

  const getCategoryRangeLabel = () => {
    if (categoryRangeMode === 'all') return 'all';
    const start = categoryRangeStart || 'start';
    const end = categoryRangeEnd || 'end';
    return `${start}_to_${end}`;
  };

  const exportCategorySalesCsv = () => {
    const headers = ['category', 'quantity', 'revenue'];
    const rows = categorySales.map((cat) => ([
      `"${String(cat.category).replace(/"/g, '""')}"`,
      Number(cat.quantity) || 0,
      Number(cat.revenue) || 0,
    ].join(',')));
    const rangeInfo = `# range: ${getCategoryRangeLabel()}`;
    // UTF-8 BOM so Excel opens Thai text correctly
    const csv = '﻿' + [rangeInfo, headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `category-sales-${getCategoryRangeLabel()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderCategorySummary = (extraClassName = '') => (
    <div className={`bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-[var(--radius)] p-6 space-y-5 ${extraClassName}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-secondary)] tracking-[0.3em]">สรุปยอดขายตามหมวดหมู่</h3>
          <p className="text-base font-semibold text-[var(--text-primary)] mt-2">ดูหมวดที่ขายดีที่สุด</p>
        </div>
        {bestCategory ? (
          <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-2xl text-xs font-semibold tracking-widest">
            ขายดีที่สุด: {String(bestCategory.category)}
          </div>
        ) : (
          <div className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-4 py-2 rounded-2xl text-xs font-semibold tracking-widest">
            ไม่มีข้อมูล
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCategoryRangePreset('all')} className={`px-4 py-2 rounded-2xl text-xs font-semibold border transition-all ${categoryRangeMode === 'all' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-emerald-50'}`}>ทั้งหมด</button>
        <button onClick={() => setCategoryRangePreset('week')} className={`px-4 py-2 rounded-2xl text-xs font-semibold border transition-all ${categoryRangeMode === 'week' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-emerald-50'}`}>7 วันล่าสุด</button>
        <button onClick={() => setCategoryRangePreset('custom')} className={`px-4 py-2 rounded-2xl text-xs font-semibold border transition-all ${categoryRangeMode === 'custom' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-emerald-50'}`}>เลือกช่วงวันที่</button>
      </div>

      {categoryRangeMode === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={categoryRangeStart} onChange={(e) => setCategoryRangeStart(e.target.value)} className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl px-4 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none" />
          <input type="date" value={categoryRangeEnd} onChange={(e) => setCategoryRangeEnd(e.target.value)} className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl px-4 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none" />
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-[var(--text-primary)]">
      <header className="h-24 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] px-12 flex items-center justify-between shadow-sm z-[var(--z-nav)]">
        <div className="flex items-center gap-4 text-emerald-600 cursor-pointer font-semibold" onClick={() => handleViewChange('bills')}>
          <ChevronLeft size={32} />
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">สรุปยอดขายตามหมวดหมู่</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportCategorySalesCsv} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl text-xs font-semibold tracking-widest shadow-[var(--elev-2)] hover:bg-emerald-700 transition-all">
            Export CSV
          </button>
        </div>
      </header>
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          {renderCategorySummary('bg-[var(--bg-secondary)]')}
          <div className="bg-[var(--bg-secondary)] rounded-[var(--radius)] shadow-sm border border-[var(--border-color)] p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-[0.2em] mb-8">รายละเอียดรายหมวด <span className="text-[var(--text-muted)] font-bold text-sm normal-case">(คลิกเพื่อดูรายการ)</span></h2>
            <div className="space-y-4">
              {categorySales.length > 0 ? (
                categorySales.map((cat) => (
                  <div key={cat.category} className="space-y-2">
                    <button
                      onClick={() => setExpandedCategory(expandedCategory === cat.category ? null : cat.category)}
                      className={`w-full flex items-center justify-between bg-[var(--bg-tertiary)] rounded-[var(--radius)] px-6 py-5 border border-[var(--border-color)] hover:bg-emerald-50 hover:border-emerald-200 transition-all cursor-pointer ${expandedCategory === cat.category ? 'bg-emerald-50 border-emerald-200' : ''}`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${expandedCategory === cat.category ? 'bg-emerald-500 text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-color)]'}`}>
                          {expandedCategory === cat.category ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                        <div className="text-left min-w-0">
                          <p className="text-base font-semibold text-[var(--text-primary)] truncate">{String(cat.category)}</p>
                          <p className="num text-right text-xs font-bold text-[var(--text-muted)] tracking-widest mt-1">{Number(cat.quantity).toLocaleString()} ชิ้น • {categoryItemsBreakdown[cat.category]?.items?.length || 0} รายการ</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="num text-right text-xl font-semibold text-emerald-600">฿{Number(cat.revenue).toLocaleString()}</p>
                      </div>
                    </button>

                    {/* Expanded Items List */}
                    {expandedCategory === cat.category && categoryItemsBreakdown[cat.category] && (
                      <div className="ml-14 space-y-4 animate-in slide-in-from-top-2 duration-200">
                        {/* Bean Modifiers Summary */}
                        {categoryItemsBreakdown[cat.category].beans.length > 0 && (
                          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 tracking-wider">
                              <Coffee size={14} /> สรุปยอดเมล็ดกาแฟที่ใช้
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {categoryItemsBreakdown[cat.category].beans.map((bean, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-xl border border-amber-100 shadow-sm">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-amber-700 font-semibold text-sm truncate">{bean.tag}</span>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="num text-right text-xs font-semibold text-amber-600">x{bean.quantity}</p>
                                    <p className="num text-right text-xs font-bold text-[var(--text-muted)]">฿{bean.revenue.toLocaleString()}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Regular Items */}
                        <div className="space-y-2">
                          {categoryItemsBreakdown[cat.category].items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-color)] shadow-sm">
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-semibold text-sm shrink-0">
                                  <span className="num text-right">x{item.quantity}</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-[var(--text-primary)] text-sm truncate">{item.name}</p>
                                  <p className="num text-right text-xs font-bold text-[var(--text-muted)]">฿{item.price.toLocaleString()} / ชิ้น</p>
                                </div>
                              </div>
                              <p className="num text-right font-semibold text-emerald-600 text-base">฿{item.revenue.toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                ))
              ) : (
                <EmptyState icon={BarChart3} title="ไม่มีข้อมูลในช่วงวันที่นี้" description="ลองเลือกช่วงวันที่อื่น" size="sm" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { Users, Search, User, RefreshCcw, Edit, Trash2, Heart, ShoppingBag, TrendingUp, Star } from 'lucide-react';
import { doc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getNameKey } from '../../utils/calculations';
import useDebounce from '../../hooks/useDebounce';
import { Button, Modal, EmptyState, useToast, ConfirmModal, InputModal, Skeleton } from '../ui';
import {
  DEFAULT_REDEEM_POINTS_THRESHOLD,
  DEFAULT_REDEEM_DISCOUNT_VALUE,
  DEFAULT_OWN_GLASS_DISCOUNT
} from '../../config/constants';

export default function MembersView() {
  const {
    members,
    orders,
    isSyncing,
    redeemPointsThreshold,
    redeemDiscountValue,
    ownGlassDiscount,
    runDbAction
  } = useAppContext();

  const toast = useToast();

  const REDEEM_POINTS_THRESHOLD = Number(redeemPointsThreshold) || DEFAULT_REDEEM_POINTS_THRESHOLD;
  const REDEEM_DISCOUNT_VALUE = Number(redeemDiscountValue) || DEFAULT_REDEEM_DISCOUNT_VALUE;
  const OWN_GLASS_DISCOUNT = Number(ownGlassDiscount) || DEFAULT_OWN_GLASS_DISCOUNT;

  // Local states
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const debouncedMemberSearchTerm = useDebounce(memberSearchTerm, 200);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMemberForFavorites, setSelectedMemberForFavorites] = useState(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingMember, setDeletingMember] = useState(null);
  const [showFixAllConfirm, setShowFixAllConfirm] = useState(false);
  const [fixAllTargets, setFixAllTargets] = useState([]);

  // Memos
  const processedMembers = useMemo(() => {
    // 1. Calculate stats for members in the collection
    const memberStats = members.map(m => {
      const nameKey = getNameKey(m.name);
      const phone = String(m.phone || '').trim();
      const memberOrders = orders.filter(o => {
        if (o.status !== 'completed') return false;
        if (phone && o.memberPhone === phone) return true;
        if (!nameKey) return false;
        return !o.memberPhone && getNameKey(o.memberNickname) === nameKey;
      });
      const totalPurchases = memberOrders.reduce((sum, o) => sum + (o.items?.reduce((s, i) => s + Number(i.quantity), 0) || 0), 0);
      const totalSpent = memberOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

      // Calculate expected points based on history
      let expectedPoints = 0;
      memberOrders.forEach(o => {
        const earned = Math.floor(Number(o.total || 0) / 10);
        expectedPoints += earned;
        const d = Number(o.discount || 0);
        // Redemption check
        if (d === REDEEM_DISCOUNT_VALUE || d === (REDEEM_DISCOUNT_VALUE + OWN_GLASS_DISCOUNT)) {
          expectedPoints -= REDEEM_POINTS_THRESHOLD;
        }
      });
      const pointsDiscrepancy = Math.max(0, expectedPoints) !== Number(m.points || 0);

      return { ...m, totalPurchases, totalSpent, expectedPoints: Math.max(0, expectedPoints), pointsDiscrepancy };
    });

    // 2. Identify orders that don't belong to any member in the collection
    const nameOnlyMap = new Map();
    orders
      .filter(o => o.status === 'completed' && !o.memberPhone && o.memberNickname)
      .forEach((o) => {
        const key = getNameKey(o.memberNickname);
        if (!key) return;

        // Skip if this name already belongs to a registered member to avoid duplication
        const alreadyRegistered = members.some(m => getNameKey(m.name) === key);
        if (alreadyRegistered) return;

        const current = nameOnlyMap.get(key) || { id: `name-only:${key}`, name: key, phone: '', points: 0, totalPurchases: 0, totalSpent: 0, expectedPoints: 0, pointsDiscrepancy: false };
        const orderPurchases = o.items?.reduce((s, i) => s + Number(i.quantity), 0) || 0;
        current.totalPurchases += orderPurchases;
        current.totalSpent += Number(o.total) || 0;

        // Calculate points for name-only members too
        const earned = Math.floor(Number(o.total || 0) / 10);
        current.expectedPoints += earned;
        const d = Number(o.discount || 0);
        if (d === REDEEM_DISCOUNT_VALUE || d === (REDEEM_DISCOUNT_VALUE + OWN_GLASS_DISCOUNT)) {
          current.expectedPoints -= REDEEM_POINTS_THRESHOLD;
        }
        nameOnlyMap.set(key, current);
      });

    return [...memberStats, ...nameOnlyMap.values()].sort((a, b) => b.totalPurchases - a.totalPurchases);
  }, [members, orders, REDEEM_POINTS_THRESHOLD, REDEEM_DISCOUNT_VALUE, OWN_GLASS_DISCOUNT]);

  const filteredMembers = useMemo(() => {
    const term = String(debouncedMemberSearchTerm || '').trim();
    return processedMembers.filter((m) => {
      const phone = String(m.phone || '');
      const name = String(m.name || '');
      if (!term) return phone !== '' || name !== '';
      return phone.includes(term) || name.includes(term);
    });
  }, [processedMembers, debouncedMemberSearchTerm]);

  // Calculate member's favorite items
  const getMemberFavorites = useMemo(() => {
    return (member) => {
      const nameKey = getNameKey(member.name);
      const phone = String(member.phone || '').trim();

      // Get all orders for this member
      const memberOrders = orders.filter(o => {
        if (o.status !== 'completed') return false;
        if (phone && o.memberPhone === phone) return true;
        if (!nameKey) return false;
        return !o.memberPhone && getNameKey(o.memberNickname) === nameKey;
      });

      // Count items
      const itemCounts = {};
      memberOrders.forEach(order => {
        (order.items || []).forEach(item => {
          const key = item.name;
          if (!itemCounts[key]) {
            itemCounts[key] = {
              name: item.name,
              image: item.image || '',
              category: item.category || '',
              count: 0,
              totalSpent: 0
            };
          }
          itemCounts[key].count += Number(item.quantity || 1);
          itemCounts[key].totalSpent += Number(item.price || 0) * Number(item.quantity || 1);
        });
      });

      // Convert to array and sort by count
      const favorites = Object.values(itemCounts).sort((a, b) => b.count - a.count);

      // Get recent orders (last 10)
      const recentOrders = memberOrders
        .sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt))
        .slice(0, 10);

      return {
        favorites,
        recentOrders,
        totalOrders: memberOrders.length,
        uniqueItems: Object.keys(itemCounts).length
      };
    };
  }, [orders]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  // Handlers
  const syncMemberPoints = async (member) => {
    await runDbAction(async () => {
      const nameKey = getNameKey(member.name);
      const memberId = member.phone || (String(member.id).startsWith('name-only:') ? member.id : (nameKey ? `name:${nameKey}` : null));
      if (!memberId) return;

      const memRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', memberId);
      await setDoc(memRef, { points: member.expectedPoints }, { merge: true });

      // Mark orders as processed
      const memberOrders = orders.filter(o => {
        if (o.status !== 'completed' || o.pointsProcessed) return false;
        const mPhone = String(member.phone || '').trim();
        const mName = getNameKey(member.name);
        if (mPhone && o.memberPhone === mPhone) return true;
        return !o.memberPhone && getNameKey(o.memberNickname) === mName;
      });

      if (memberOrders.length > 0) {
        const batch = writeBatch(db);
        memberOrders.forEach(o => {
          batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'orders', o.id), { pointsProcessed: true });
        });
        await batch.commit();
      }
    }, `ปรับปรุงแต้มของ ${member.name} เป็น ${member.expectedPoints} แต้มเรียบร้อย`);
  };

  const fixAllPoints = () => {
    const targets = processedMembers.filter(m => m.pointsDiscrepancy);
    if (targets.length === 0) {
      toast.info('ข้อมูลสมาชิกทุกคนถูกต้องตรงตามประวัติแล้วครับ');
      return;
    }
    setFixAllTargets(targets);
    setShowFixAllConfirm(true);
  };

  const confirmFixAllPoints = async () => {
    setShowFixAllConfirm(false);
    toast.info('กำลังปรับปรุงแต้ม... กรุณารอสักครู่');
    let count = 0;
    let errorCount = 0;
    for (const m of fixAllTargets) {
      try {
        await syncMemberPoints(m);
        count++;
      } catch (e) {
        errorCount++;
      }
    }
    if (errorCount > 0) {
      toast.warning(`ปรับปรุงสำเร็จ ${count} รายการ, ล้มเหลว ${errorCount} รายการ`);
    } else {
      toast.success(`ปรับปรุงข้อมูลสมาชิกสำเร็จ ${count} รายการ`);
    }
    setFixAllTargets([]);
  };

  const deleteMember = (member) => {
    const memberId = member?.id || member?.phone;
    if (!memberId || String(memberId).startsWith('name-only:')) return;
    setDeletingMember(member);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteMember = async () => {
    setShowDeleteConfirm(false);
    const memberId = deletingMember?.id || deletingMember?.phone;
    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', memberId));
    }, 'ไม่สามารถลบสมาชิกได้');
    setDeletingMember(null);
  };

  const editMember = (member) => {
    setEditingMember(member);
    setShowEditModal(true);
  };

  const submitEditMember = async (formData) => {
    setShowEditModal(false);
    const member = editingMember;
    const currentName = String(member?.name || '');
    const nextName = String(formData.name || '').trim();
    const nextPhone = String(formData.phone || '').trim();
    const nameKey = getNameKey(nextName || currentName);

    if (!nextPhone && !nameKey) {
      toast.warning('กรุณาระบุชื่อหรือเบอร์โทรศัพท์');
      return;
    }

    const newId = nextPhone || `name:${nameKey}`;
    const currentId = member?.id || member?.phone;
    const data = {
      name: nextName || currentName || 'ลูกค้าทั่วไป',
      phone: nextPhone || '',
      points: Number(member?.points || 0),
      createdAt: member?.createdAt || serverTimestamp(),
    };

    await runDbAction(async () => {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', newId), data, { merge: true });
      if (currentId && currentId !== newId && !String(currentId).startsWith('name-only:')) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', currentId));
      }
    }, 'ไม่สามารถแก้ไขสมาชิกได้');
    setEditingMember(null);
  };

  const addMember = () => {
    setShowAddModal(true);
  };

  const submitAddMember = async (formData) => {
    setShowAddModal(false);
    const name = String(formData.name || '').trim();
    const phone = String(formData.phone || '').trim();
    const nameKey = getNameKey(name);

    if (!phone && !nameKey) {
      toast.warning('กรุณาระบุชื่อหรือเบอร์โทรศัพท์');
      return;
    }

    const memberId = phone || `name:${nameKey}`;
    const data = {
      name,
      phone,
      points: 0,
      createdAt: serverTimestamp(),
    };

    await runDbAction(async () => {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', memberId), data);
      toast.success('เพิ่มสมาชิกสำเร็จ');
    }, 'ไม่สามารถเพิ่มสมาชิกได้');
  };

  // Stats calculation
  const totalPoints = processedMembers.reduce((sum, m) => sum + Number(m.points || 0), 0);
  const totalSpentAll = processedMembers.reduce((sum, m) => sum + Number(m.totalSpent || 0), 0);
  const redeemableMembers = processedMembers.filter(m => Number(m.points || 0) >= REDEEM_POINTS_THRESHOLD).length;

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-gray-800">
      {/* Responsive Header */}
      <header className="bg-white border-b border-gray-100 px-3 md:px-6 lg:px-12 py-3 md:py-4 flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm z-10 text-gray-800 gap-3 md:gap-4">
        <div className="flex items-center gap-3 md:gap-4 text-emerald-600 uppercase font-black">
          <Users size={24} className="md:w-8 md:h-8 shrink-0" />
          <div>
            <h1 className="text-base md:text-xl lg:text-2xl font-black uppercase tracking-tight text-gray-800">จัดการสมาชิก</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
          <Button
            onClick={addMember}
            variant="primary"
            size="md"
            leftIcon={<User size={14} />}
          >
            <span className="hidden sm:inline">เพิ่ม</span>สมาชิก
          </Button>
          {processedMembers.some(m => m.pointsDiscrepancy) && (
            <Button
              onClick={fixAllPoints}
              variant="warning"
              size="md"
              leftIcon={<RefreshCcw size={14} />}
              className="animate-pulse"
            >
              <span className="hidden sm:inline">ปรับปรุง</span>แต้ม
            </Button>
          )}
          <div className="relative flex-1 md:flex-none md:w-64 lg:w-80 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4 md:w-5 md:h-5" />
              <input type="text" placeholder="ค้นหา..." value={memberSearchTerm} onChange={(e) => setMemberSearchTerm(e.target.value)} className="w-full bg-gray-50 border-none rounded-xl md:rounded-2xl py-2.5 md:py-3 pl-9 md:pl-12 pr-3 md:pr-4 text-xs md:text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 text-gray-800" />
            </div>
            <button
              onClick={handleRefresh}
              className={`p-2.5 md:p-3 rounded-xl md:rounded-2xl bg-gray-50 text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all active:scale-95 border border-transparent hover:border-emerald-100 ${isRefreshing ? 'animate-pulse' : ''}`}
              title="รีเฟรชข้อมูลสมาชิก"
            >
              <RefreshCcw size={18} className={`${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Stats Cards - Member Count */}
      <div className="px-3 md:px-6 lg:px-8 py-3 md:py-4 bg-white border-b border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        {/* Total Members */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl md:rounded-2xl p-3 md:p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider opacity-80">สมาชิกทั้งหมด</span>
            <Users size={16} className="md:w-5 md:h-5 opacity-60" />
          </div>
          <p className="text-2xl md:text-4xl font-black">{processedMembers.length}</p>
          <p className="text-[9px] md:text-[10px] opacity-70 mt-0.5">คน</p>
        </div>

        {/* Filtered Results */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl md:rounded-2xl p-3 md:p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider opacity-80">ผลการค้นหา</span>
            <Search size={16} className="md:w-5 md:h-5 opacity-60" />
          </div>
          <p className="text-2xl md:text-4xl font-black">{filteredMembers.length}</p>
          <p className="text-[9px] md:text-[10px] opacity-70 mt-0.5">คน</p>
        </div>

        {/* Redeemable Members */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl md:rounded-2xl p-3 md:p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider opacity-80">แลกแต้มได้</span>
            <span className="text-[8px] md:text-[9px] bg-white/20 px-1.5 py-0.5 rounded-lg">≥{REDEEM_POINTS_THRESHOLD}</span>
          </div>
          <p className="text-2xl md:text-4xl font-black">{redeemableMembers}</p>
          <p className="text-[9px] md:text-[10px] opacity-70 mt-0.5">คน</p>
        </div>

        {/* Total Spent */}
        <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl md:rounded-2xl p-3 md:p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider opacity-80">ยอดใช้จ่ายรวม</span>
          </div>
          <p className="text-xl md:text-3xl font-black">฿{totalSpentAll.toLocaleString()}</p>
          <p className="text-[9px] md:text-[10px] opacity-70 mt-0.5">แต้มรวม: {totalPoints.toLocaleString()}</p>
        </div>
      </div>
      <div className="flex-1 p-3 md:p-6 lg:p-8 overflow-hidden">
        <div className="h-full bg-white rounded-2xl md:rounded-[2.5rem] lg:rounded-[3.5rem] shadow-xl border border-gray-100 overflow-hidden flex flex-col shadow-emerald-500/5">
          {/* Desktop Table Header */}
          <div className="hidden md:grid p-6 lg:p-10 border-b border-gray-50 grid-cols-4 font-black text-[10px] lg:text-[11px] text-gray-400 uppercase tracking-wider lg:tracking-[0.2em] px-6 lg:px-12 leading-none">
            <span>ข้อมูลสมาชิก</span>
            <span className="text-center">รายการสำเร็จ</span>
            <span className="text-center">ยอดรวม</span>
            <span className="text-right">คะแนน</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-hide text-gray-800">
            {isSyncing && (
              <div className="py-6 px-4">
                <Skeleton.Table rows={8} cols={5} />
              </div>
            )}
            {!isSyncing && filteredMembers.length === 0 && (
              <EmptyState
                icon={Users}
                title="ไม่มีข้อมูลสมาชิก"
                description={memberSearchTerm ? "ไม่พบสมาชิกที่ตรงกับคำค้นหา" : "เริ่มเพิ่มสมาชิกใหม่เพื่อสะสมแต้ม"}
                action={!memberSearchTerm ? { label: "เพิ่มสมาชิก", onClick: addMember } : undefined}
              />
            )}
            {filteredMembers.map(m => (
              <div key={m.phone || m.id} className="p-4 md:p-6 lg:p-10 hover:bg-gray-50 transition-all group px-4 md:px-6 lg:px-12">
                {/* Mobile Layout */}
                <div className="md:hidden space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500 shadow-inner shrink-0">
                        <User size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-gray-800 text-sm truncate">{String(m.name || 'ไม่ระบุชื่อ')}</p>
                        <p className="text-[10px] font-bold text-gray-400 tracking-wide">{m.phone ? String(m.phone) : 'ไม่ระบุเบอร์'}</p>
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-xl font-black text-xs shadow ${Number(m.points || 0) >= REDEEM_POINTS_THRESHOLD ? 'bg-orange-500 text-white animate-pulse' : 'bg-emerald-500 text-white'}`}>
                      {Number(m.points || 0)} แต้ม
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex gap-4">
                      <span className="text-gray-400">ซื้อ: <span className="text-gray-800 font-black">{Number(m.totalPurchases)} ชิ้น</span></span>
                      <span className="text-gray-400">ยอด: <span className="text-emerald-600 font-black">฿{Number(m.totalSpent).toLocaleString()}</span></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelectedMemberForFavorites(m)} className="p-2 bg-pink-50 text-pink-500 rounded-lg active:scale-90" title="ดูเมนูโปรด">
                        <Heart size={14} />
                      </button>
                      {m.pointsDiscrepancy && (
                        <button onClick={() => syncMemberPoints(m)} className="p-2 bg-red-50 text-red-500 rounded-lg active:scale-90">
                          <RefreshCcw size={14} />
                        </button>
                      )}
                      {m.id && (
                        <button onClick={() => editMember(m)} className="p-2 bg-blue-50 text-blue-500 rounded-lg active:scale-90">
                          <Edit size={14} />
                        </button>
                      )}
                      {m.id && !String(m.id).startsWith('name-only:') && (
                        <button onClick={() => deleteMember(m)} className="p-2 bg-red-50 text-red-500 rounded-lg active:scale-90">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Desktop Layout */}
                <div className="hidden md:grid grid-cols-4 items-center">
                  <div className="flex items-center gap-4 lg:gap-6">
                    <div className="w-12 h-12 lg:w-16 lg:h-16 bg-emerald-50 rounded-xl lg:rounded-2xl flex items-center justify-center text-emerald-500 shadow-inner font-black shrink-0">
                      <User size={24} className="lg:w-8 lg:h-8" />
                    </div>
                    <div className="text-gray-800 min-w-0">
                      <p className="font-black text-gray-800 text-base lg:text-xl mb-1 lg:mb-1.5 leading-tight truncate">{String(m.name || 'ไม่ระบุชื่อ')}</p>
                      <p className="text-xs lg:text-sm font-bold text-gray-400 tracking-wider lg:tracking-widest">{m.phone ? String(m.phone) : 'ไม่ระบุเบอร์'}</p>
                    </div>
                  </div>
                  <div className="text-center text-gray-800">
                    <p className="text-xl lg:text-3xl font-black text-gray-800 mb-1 lg:mb-1.5 leading-none">{Number(m.totalPurchases)}</p>
                    <p className="text-[9px] lg:text-[10px] font-black text-emerald-500 uppercase tracking-wider lg:tracking-widest mt-1 lg:mt-2 leading-none">รายการ</p>
                  </div>
                  <div className="text-center text-gray-800 font-black text-sm lg:text-lg">฿{Number(m.totalSpent).toLocaleString()}</div>
                  <div className="text-right text-gray-800 font-black leading-none">
                    <div className="flex items-center justify-end gap-2 lg:gap-3">
                      <div className={`px-3 lg:px-6 py-2 lg:py-3 rounded-xl lg:rounded-2xl inline-block font-black shadow-lg text-xs lg:text-base border-b-2 lg:border-b-4 ${Number(m.points || 0) >= REDEEM_POINTS_THRESHOLD ? 'bg-orange-500 text-white border-orange-700 animate-pulse' : 'bg-emerald-500 text-white border-emerald-700'}`}>
                        {Number(m.points || 0).toLocaleString()} แต้ม
                      </div>
                      <button
                        onClick={() => setSelectedMemberForFavorites(m)}
                        title="ดูเมนูโปรดของลูกค้า"
                        className="p-2 lg:p-3 bg-pink-50 text-pink-500 rounded-xl lg:rounded-2xl shadow-sm border border-pink-100 hover:bg-pink-100 transition-all active:scale-90"
                      >
                        <Heart size={16} className="lg:w-[18px] lg:h-[18px]" />
                      </button>
                      {m.pointsDiscrepancy && (
                        <button
                          onClick={() => syncMemberPoints(m)}
                          title={`คลิกเพื่อปรับปรุงแต้มเป็น ${m.expectedPoints} ตามประวัติการสั่งซื้อ`}
                          className="p-2 lg:p-3 bg-red-50 text-red-500 rounded-xl lg:rounded-2xl shadow-sm border border-red-100 hover:bg-red-100 transition-all active:scale-90"
                        >
                          <RefreshCcw size={16} className="lg:w-[18px] lg:h-[18px]" />
                        </button>
                      )}
                      {m.id && (
                        <button onClick={() => editMember(m)} className="p-2 lg:p-3 bg-blue-50 text-blue-500 rounded-xl lg:rounded-2xl shadow-sm border border-blue-100 hover:bg-blue-100 transition-all active:scale-90">
                          <Edit size={16} className="lg:w-[18px] lg:h-[18px]" />
                        </button>
                      )}
                      {m.id && !String(m.id).startsWith('name-only:') && (
                        <button onClick={() => deleteMember(m)} className="p-2 lg:p-3 bg-red-50 text-red-500 rounded-xl lg:rounded-2xl shadow-sm border border-red-100 hover:bg-red-100 transition-all active:scale-90">
                          <Trash2 size={16} className="lg:w-[18px] lg:h-[18px]" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Member Favorites Modal */}
      <Modal
        isOpen={!!selectedMemberForFavorites}
        onClose={() => setSelectedMemberForFavorites(null)}
        size="lg"
        title={
          <div className="flex items-center gap-4 md:gap-6">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-pink-500/30">
              <Heart size={28} />
            </div>
            <div>
              <span className="text-xl md:text-2xl font-black text-gray-800">{selectedMemberForFavorites?.name || 'ลูกค้า'}</span>
              <p className="text-xs md:text-sm font-bold text-gray-400 mt-1">{selectedMemberForFavorites?.phone || 'ไม่ระบุเบอร์'}</p>
            </div>
          </div>
        }
      >
        {selectedMemberForFavorites && (() => {
          const memberData = getMemberFavorites(selectedMemberForFavorites);
          return (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
                <div className="bg-pink-50 rounded-xl md:rounded-2xl p-3 md:p-4 text-center border border-pink-100">
                  <p className="text-lg md:text-2xl font-black text-pink-600">{memberData.totalOrders}</p>
                  <p className="text-[9px] md:text-[10px] font-bold text-pink-400 uppercase tracking-wider">ออเดอร์ทั้งหมด</p>
                </div>
                <div className="bg-violet-50 rounded-xl md:rounded-2xl p-3 md:p-4 text-center border border-violet-100">
                  <p className="text-lg md:text-2xl font-black text-violet-600">{memberData.uniqueItems}</p>
                  <p className="text-[9px] md:text-[10px] font-bold text-violet-400 uppercase tracking-wider">เมนูที่เคยสั่ง</p>
                </div>
                <div className="bg-emerald-50 rounded-xl md:rounded-2xl p-3 md:p-4 text-center border border-emerald-100">
                  <p className="text-lg md:text-2xl font-black text-emerald-600">฿{Number(selectedMemberForFavorites.totalSpent || 0).toLocaleString()}</p>
                  <p className="text-[9px] md:text-[10px] font-bold text-emerald-400 uppercase tracking-wider">ยอดใช้จ่ายรวม</p>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-6 md:space-y-8">
                {/* Favorite Items */}
                <div>
                  <h3 className="text-sm md:text-base font-black text-gray-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Star size={16} className="md:w-5 md:h-5 text-yellow-500" /> เมนูโปรด (สั่งบ่อยที่สุด)
                  </h3>
                  {memberData.favorites.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 font-bold text-sm">
                      ยังไม่มีประวัติการสั่งซื้อ
                    </div>
                  ) : (
                    <div className="space-y-2 md:space-y-3">
                      {memberData.favorites.slice(0, 10).map((item, idx) => (
                        <div key={item.name} className={`flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-2xl border transition-all ${idx === 0 ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200 shadow-lg shadow-yellow-500/10' : idx < 3 ? 'bg-pink-50/50 border-pink-100' : 'bg-gray-50 border-gray-100'}`}>
                          {/* Rank Badge */}
                          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-black text-sm md:text-base shrink-0 ${idx === 0 ? 'bg-yellow-500 text-white shadow-lg' : idx === 1 ? 'bg-gray-400 text-white' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                            {idx + 1}
                          </div>

                          {/* Image */}
                          <div className="w-12 h-12 md:w-14 md:h-14 bg-white rounded-xl md:rounded-2xl overflow-hidden border border-gray-100 shadow-sm shrink-0">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <ShoppingBag size={20} />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-gray-800 text-sm md:text-base truncate">{item.name}</p>
                            <p className="text-[10px] md:text-xs text-gray-400 font-bold">{item.category || 'ไม่ระบุหมวดหมู่'}</p>
                          </div>

                          {/* Count */}
                          <div className="text-right shrink-0">
                            <p className="font-black text-pink-600 text-lg md:text-xl">{item.count}</p>
                            <p className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase">ครั้ง</p>
                          </div>

                          {/* Total Spent */}
                          <div className="text-right shrink-0 hidden sm:block">
                            <p className="font-black text-emerald-600 text-sm md:text-base">฿{item.totalSpent.toLocaleString()}</p>
                            <p className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase">รวม</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Orders */}
                {memberData.recentOrders.length > 0 && (
                  <div>
                    <h3 className="text-sm md:text-base font-black text-gray-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <TrendingUp size={16} className="md:w-5 md:h-5 text-blue-500" /> ออเดอร์ล่าสุด
                    </h3>
                    <div className="space-y-2 md:space-y-3">
                      {memberData.recentOrders.map((order, idx) => {
                        const orderDate = order.timestamp || order.createdAt;
                        const dateStr = orderDate ? new Date(orderDate.seconds ? orderDate.seconds * 1000 : orderDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'ไม่ทราบวันที่';
                        return (
                          <div key={order.id || idx} className="bg-gray-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] md:text-xs font-bold text-gray-400">{dateStr}</span>
                              <span className="text-sm md:text-base font-black text-emerald-600">฿{Number(order.total || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex flex-wrap gap-1 md:gap-2">
                              {(order.items || []).map((item, i) => (
                                <span key={i} className="text-[10px] md:text-xs bg-white px-2 py-1 rounded-lg border border-gray-100 font-bold text-gray-600">
                                  {item.name} x{item.quantity}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="pt-6 mt-6 border-t border-gray-100">
                <Button
                  onClick={() => setSelectedMemberForFavorites(null)}
                  variant="secondary"
                  size="lg"
                  fullWidth
                >
                  ปิด
                </Button>
              </div>
            </>
          );
        })()}
      </Modal>

      {/* Add Member Modal */}
      <InputModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={submitAddMember}
        title="เพิ่มสมาชิกใหม่"
        description="กรอกข้อมูลสมาชิกใหม่"
        variant="primary"
        icon={User}
        fields={[
          { name: 'name', label: 'ชื่อสมาชิก', placeholder: 'กรอกชื่อ...', required: true },
          { name: 'phone', label: 'เบอร์โทรศัพท์', placeholder: 'กรอกเบอร์โทร (ถ้ามี)', type: 'tel' }
        ]}
        submitText="เพิ่มสมาชิก"
      />

      {/* Edit Member Modal */}
      <InputModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingMember(null); }}
        onSubmit={submitEditMember}
        title="แก้ไขข้อมูลสมาชิก"
        description={editingMember?.name || ''}
        variant="primary"
        icon={Edit}
        fields={[
          { name: 'name', label: 'ชื่อสมาชิก', placeholder: 'กรอกชื่อ...', defaultValue: editingMember?.name || '' },
          { name: 'phone', label: 'เบอร์โทรศัพท์', placeholder: 'กรอกเบอร์โทร (ถ้ามี)', type: 'tel', defaultValue: editingMember?.phone || '' }
        ]}
        submitText="บันทึก"
      />

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeletingMember(null); }}
        onConfirm={confirmDeleteMember}
        title="ลบสมาชิก"
        message={`ต้องการลบ "${deletingMember?.name || 'สมาชิก'}" ออกจากระบบใช่หรือไม่?`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />

      {/* Fix All Points Confirm Modal */}
      <ConfirmModal
        isOpen={showFixAllConfirm}
        onClose={() => { setShowFixAllConfirm(false); setFixAllTargets([]); }}
        onConfirm={confirmFixAllPoints}
        title="ปรับปรุงแต้มสมาชิก"
        message={`ต้องการปรับปรุงแต้มสมาชิก ${fixAllTargets.length} รายการ ที่มีข้อมูลไม่ตรงกับประวัติ ใช่หรือไม่?`}
        confirmText="ปรับปรุง"
        cancelText="ยกเลิก"
        variant="warning"
      />
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { Users, Search, User, RefreshCcw, Edit, Trash2 } from 'lucide-react';
import { doc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getNameKey } from '../../utils/calculations';
import useDebounce from '../../hooks/useDebounce';

export default function MembersView() {
  const {
    members,
    orders,
    isSyncing,
    redeemPointsThreshold,
    redeemDiscountValue,
    ownGlassDiscount,
    runDbAction,
    setErrorMessage
  } = useAppContext();

  const REDEEM_POINTS_THRESHOLD = Number(redeemPointsThreshold) || 100;
  const REDEEM_DISCOUNT_VALUE = Number(redeemDiscountValue) || 50;
  const OWN_GLASS_DISCOUNT = Number(ownGlassDiscount) || 5;

  // Local states
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const debouncedMemberSearchTerm = useDebounce(memberSearchTerm, 200);

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

  const fixAllPoints = async () => {
    const targets = processedMembers.filter(m => m.pointsDiscrepancy);
    if (targets.length === 0) {
      alert('ข้อมูลสมาชิกทุกคนถูกต้องตรงตามประวัติแล้วครับ');
      return;
    }
    if (!window.confirm(`ต้องการปรับปรุงแต้มสมาชิก ${targets.length} รายการ ที่มีข้อมูลไม่ตรงกับประวัติ ใช่หรือไม่?`)) return;

    setErrorMessage('กำลังปรับปรุงแต้ม... กรุณารอสักครู่');
    let count = 0;
    for (const m of targets) {
      try {
        await syncMemberPoints(m);
        count++;
      } catch (e) {
        console.error(e);
      }
    }
    setErrorMessage('');
    alert(`ปรับปรุงข้อมูลสมาชิกสำเร็จ ${count} รายการ`);
  };

  const deleteMember = async (member) => {
    const memberId = member?.id || member?.phone;
    if (!memberId || String(memberId).startsWith('name-only:')) return;
    if (!window.confirm('ลบข้อมูลสมาชิกคนนี้ใช่ไหม?')) return;
    await runDbAction(async () => {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', memberId));
    }, 'ไม่สามารถลบสมาชิกได้');
  };

  const editMember = async (member) => {
    const currentName = String(member?.name || '');
    const currentPhone = String(member?.phone || '');
    const nextNameInput = window.prompt('แก้ไขชื่อสมาชิก', currentName);
    if (nextNameInput === null) return;
    const nextPhoneInput = window.prompt('แก้ไขเบอร์โทร (เว้นว่างได้)', currentPhone);
    if (nextPhoneInput === null) return;
    const nextName = String(nextNameInput || '').trim();
    const nextPhone = String(nextPhoneInput || '').trim();
    const nameKey = getNameKey(nextName || currentName);

    if (!nextPhone && !nameKey) return;

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
  };

  return (
    <div className="h-full bg-[#f8faf9] flex flex-col animate-in fade-in duration-500 overflow-hidden text-gray-800">
      <header className="h-24 bg-white border-b border-gray-100 px-12 flex items-center justify-between shadow-sm z-10 text-gray-800">
        <div className="flex items-center gap-4 text-emerald-600 uppercase font-black">
          <Users size={32} />
          <h1 className="text-2xl font-black uppercase tracking-tight text-gray-800">จัดการข้อมูลสมาชิก</h1>
          {processedMembers.some(m => m.pointsDiscrepancy) && (
            <button
              onClick={fixAllPoints}
              className="ml-6 px-4 py-2 bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg animate-pulse hover:bg-orange-600 transition-all"
            >
              <RefreshCcw size={12} className="inline mr-2" /> ปรับปรุงแต้มทั้งหมด
            </button>
          )}
        </div>
        <div className="relative flex-1 max-w-lg ml-12">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" size={22} />
          <input type="text" placeholder="ค้นหาเบอร์โทรศัพท์..." value={memberSearchTerm} onChange={(e) => setMemberSearchTerm(e.target.value)} className="w-full bg-gray-50 border-none rounded-2xl py-4.5 pl-16 pr-6 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 text-gray-800" />
        </div>
      </header>
      <div className="flex-1 p-8 overflow-hidden">
        <div className="h-full bg-white rounded-[3.5rem] shadow-xl border border-gray-100 overflow-hidden flex flex-col shadow-emerald-500/5">
          <div className="p-10 border-b border-gray-50 grid grid-cols-4 font-black text-[11px] text-gray-400 uppercase tracking-[0.2em] px-12 leading-none">
            <span>ข้อมูลสมาชิก</span>
            <span className="text-center">รายการที่สำเร็จ</span>
            <span className="text-center">ยอดการจ่ายรวม</span>
            <span className="text-right">คะแนนคงเหลือ</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-hide text-gray-800">
            {isSyncing && (
              <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-gray-400">
                กำลังโหลดสมาชิก...
              </div>
            )}
            {!isSyncing && filteredMembers.length === 0 && (
              <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-gray-400">
                ไม่มีข้อมูลสมาชิก
              </div>
            )}
            {filteredMembers.map(m => (
              <div key={m.phone || m.id} className="p-10 grid grid-cols-4 items-center hover:bg-gray-50 transition-all group px-12">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 shadow-inner font-black">
                    <User size={32} />
                  </div>
                  <div className="text-gray-800">
                    <p className="font-black text-gray-800 text-xl mb-1.5 leading-tight">{String(m.name || 'ไม่ระบุชื่อ')}</p>
                    <p className="text-sm font-bold text-gray-400 font-bold tracking-widest">{m.phone ? String(m.phone) : 'ไม่ระบุเบอร์'}</p>
                  </div>
                </div>
                <div className="text-center text-gray-800">
                  <p className="text-3xl font-black text-gray-800 mb-1.5 leading-none">{Number(m.totalPurchases)}</p>
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-2 leading-none">รายการชิ้น</p>
                </div>
                <div className="text-center text-gray-800 font-black text-lg">฿{Number(m.totalSpent).toLocaleString()}</div>
                <div className="text-right text-gray-800 font-black leading-none">
                  <div className="flex items-center justify-end gap-3">
                    <div className={`px-6 py-3 rounded-2xl inline-block font-black shadow-lg text-base border-b-4 ${Number(m.points || 0) >= REDEEM_POINTS_THRESHOLD ? 'bg-orange-500 text-white border-orange-700 animate-pulse' : 'bg-emerald-500 text-white border-emerald-700'}`}>
                      {Number(m.points || 0).toLocaleString()} แต้ม
                    </div>
                    {m.pointsDiscrepancy && (
                      <button
                        onClick={() => syncMemberPoints(m)}
                        title={`คลิกเพื่อปรับปรุงแต้มเป็น ${m.expectedPoints} ตามประวัติการสั่งซื้อ`}
                        className="p-3 bg-red-50 text-red-500 rounded-2xl shadow-sm border border-red-100 hover:bg-red-100 transition-all active:scale-90"
                      >
                        <RefreshCcw size={18} />
                      </button>
                    )}
                    {m.id && (
                      <button onClick={() => editMember(m)} className="p-3 bg-blue-50 text-blue-500 rounded-2xl shadow-sm border border-blue-100 hover:bg-blue-100 transition-all active:scale-90">
                        <Edit size={18} />
                      </button>
                    )}
                    {m.id && !String(m.id).startsWith('name-only:') && (
                      <button onClick={() => deleteMember(m)} className="p-3 bg-red-50 text-red-500 rounded-2xl shadow-sm border border-red-100 hover:bg-red-100 transition-all active:scale-90">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { Users, Search, User, UserMinus, RefreshCcw, Edit, Trash2, Heart, ShoppingBag, TrendingUp, Star, History, Check, X, Calculator, GitMerge, AlertTriangle, ChevronDown } from 'lucide-react';
import { doc, setDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp, increment, arrayUnion } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useAppContext } from '../../context/AppContext';
import { getNameKey } from '../../utils/calculations';
import useDebounce from '../../hooks/useDebounce';
import { Button, Modal, EmptyState, useToast, ConfirmModal, InputModal, Skeleton } from '../ui';
import { DEFAULT_REDEEM_POINTS_THRESHOLD } from '../../config/constants';

// Milliseconds for an order, handling Firestore Timestamp ({seconds}), ISO
// strings, or the plain `date` field — used to sort orders newest-first.
const getOrderMs = (o) => {
  const t = o?.timestamp ?? o?.createdAt;
  if (t && typeof t === 'object' && t.seconds != null) return t.seconds * 1000;
  const ms = new Date(t || o?.date || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export default function MembersView() {
  const {
    members,
    orders,
    isSyncing,
    redeemPointsThreshold,
    runDbAction,
    setOrderToCancel
  } = useAppContext();

  const toast = useToast();

  const REDEEM_POINTS_THRESHOLD = Number(redeemPointsThreshold) || DEFAULT_REDEEM_POINTS_THRESHOLD;

  // Local states
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const debouncedMemberSearchTerm = useDebounce(memberSearchTerm, 200);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMemberForFavorites, setSelectedMemberForFavorites] = useState(null);
  const [historyMember, setHistoryMember] = useState(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingMember, setDeletingMember] = useState(null);

  // Reconciliation + merge tools
  const [showReconcile, setShowReconcile] = useState(false);
  const [creditTarget, setCreditTarget] = useState(null); // member awaiting credit confirm
  const [mergeGroup, setMergeGroup] = useState(null);      // { key, members } awaiting merge confirm
  const [mergePrimaryId, setMergePrimaryId] = useState(null);
  const [reconcileDays, setReconcileDays] = useState(14);  // only reconcile the last N days

  // An order counts toward a member's purchase history as soon as it is placed
  // (pending) — not only once completed — so today's orders show immediately.
  // Points are NOT derived from this history; they are mutated in real time at
  // checkout (earn → pendingPoints awaiting approval, redeem → points).
  const orderCounts = (o) => o.status !== 'cancelled';

  // Points earned by a single bill = ฿10 spent → 1 point (same rule the POS and
  // QR checkout use: Math.floor(total / 10)).
  const orderEarn = (o) => Math.floor(Number(o.total || 0) / 10);

  // History reasons that represent a POSITIVE earn credit (order/review approval,
  // a previous reconciliation, or a manual top-up). Redeem entries are NOT here,
  // so redemptions never count as earn on either side of the audit.
  const EARN_REASONS = new Set(['order', 'review', 'recalc', 'manual']);
  const parseAt = (at) => {
    const ms = at ? Date.parse(at) : NaN;
    return Number.isFinite(ms) ? ms : NaN;
  };

  // Earn audit for a single member, scoped to a time window [cutoff, now]:
  //   expected = Σ orderEarn over the member's orders placed inside the window
  //   credited = current pendingPoints + positive earn credits logged inside the
  //              window (pendingPoints has no timestamp, so it always counts —
  //              it offsets recent expected earn that hasn't been approved yet)
  // Because both sides look only at EARN (never redeem), a member who spent their
  // points is not flagged as "short", and confirming a credit can never refund a
  // redemption — it only fills purchases that produced no points at all.
  const auditMemberEarn = (m, memberOrders, cutoff) => {
    const expected = memberOrders.reduce((s, o) => s + (getOrderMs(o) >= cutoff ? orderEarn(o) : 0), 0);
    const history = Array.isArray(m.pointsHistory) ? m.pointsHistory : [];
    const creditedInWindow = history.reduce((s, e) => {
      const d = Number(e?.delta || 0);
      const at = parseAt(e?.at);
      const inWindow = Number.isNaN(at) ? true : at >= cutoff; // undated entries count (conservative)
      return s + (d > 0 && inWindow && EARN_REASONS.has(e?.reason) ? d : 0);
    }, 0);
    const credited = Number(m.pendingPoints || 0) + creditedInWindow;
    // Points redeemed inside the window — shown to the owner for a sanity check,
    // not used in the gap maths.
    const redeemedNet = history.reduce((s, e) => {
      const at = parseAt(e?.at);
      const inWindow = Number.isNaN(at) ? false : at >= cutoff;
      return s + ((e?.reason === 'redeem' || e?.reason === 'redeem-refund') && inWindow ? Number(e?.delta || 0) : 0);
    }, 0);
    return { expectedEarn: expected, earnGap: expected - credited, redeemed: Math.max(0, -redeemedNet) };
  };

  // Memos
  const processedMembers = useMemo(() => {
    // The earn audit only looks back this far (default 14 days) — recent
    // "bought but points didn't show" cases, not the whole bill history.
    const cutoff = Date.now() - reconcileDays * 24 * 60 * 60 * 1000;

    // 1. Calculate stats for members in the collection
    const memberStats = members.map(m => {
      const nameKey = getNameKey(m.name);
      const phone = String(m.phone || '').trim();
      const memberOrders = orders.filter(o => {
        if (!orderCounts(o)) return false;
        if (phone && o.memberPhone === phone) return true;
        if (!nameKey) return false;
        return !o.memberPhone && getNameKey(o.memberNickname) === nameKey;
      });
      // Purchase totals stay all-time (display); the earn audit is windowed.
      const totalPurchases = memberOrders.reduce((sum, o) => sum + (o.items?.reduce((s, i) => s + Number(i.quantity), 0) || 0), 0);
      const totalSpent = memberOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const audit = auditMemberEarn(m, memberOrders, cutoff);

      return { ...m, totalPurchases, totalSpent, ...audit };
    });

    // 2. Identify orders that don't belong to any member in the collection
    const nameOnlyMap = new Map();
    orders
      .filter(o => orderCounts(o) && !o.memberPhone && o.memberNickname)
      .forEach((o) => {
        const key = getNameKey(o.memberNickname);
        if (!key) return;

        // Skip if this name already belongs to a registered member to avoid duplication
        const alreadyRegistered = members.some(m => getNameKey(m.name) === key);
        if (alreadyRegistered) return;

        const current = nameOnlyMap.get(key) || { id: `name-only:${key}`, name: key, phone: '', points: 0, totalPurchases: 0, totalSpent: 0, expectedEarn: 0, earnGap: 0, redeemed: 0 };
        const orderPurchases = o.items?.reduce((s, i) => s + Number(i.quantity), 0) || 0;
        current.totalPurchases += orderPurchases;
        current.totalSpent += Number(o.total) || 0;
        // Name-only customers have no member doc → nothing was ever recorded, so
        // the whole expected earn (within the window) is the gap.
        if (getOrderMs(o) >= cutoff) {
          current.expectedEarn += orderEarn(o);
          current.earnGap = current.expectedEarn;
        }
        nameOnlyMap.set(key, current);
      });

    return [...memberStats, ...nameOnlyMap.values()].sort((a, b) => b.totalPurchases - a.totalPurchases);
  }, [members, orders, reconcileDays]);

  // Members whose purchases earned fewer points than they should have — the
  // "bought but points didn't show" cases. Sorted biggest-gap first. The owner
  // reviews and confirms each credit (points go to pendingPoints for the normal
  // approval flow, never straight into the balance).
  const reconcileList = useMemo(
    () => processedMembers
      .filter(m => Number(m.earnGap || 0) >= 1)
      .sort((a, b) => Number(b.earnGap) - Number(a.earnGap)),
    [processedMembers]
  );

  // Duplicate identities: the same person split across a phone doc and a
  // name doc (or several name variants). Grouped by normalised name; only
  // groups with more than one distinct identity are surfaced for merging.
  const duplicateGroups = useMemo(() => {
    const byName = new Map();
    processedMembers.forEach(m => {
      const key = getNameKey(m.name);
      if (!key) return;
      const arr = byName.get(key) || [];
      arr.push(m);
      byName.set(key, arr);
    });
    return [...byName.entries()]
      .filter(([, arr]) => arr.length > 1)
      .map(([key, arr]) => ({ key, members: arr }));
  }, [processedMembers]);

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

      // Get all orders for this member (pending orders included so today's
      // purchases appear immediately).
      const memberOrders = orders.filter(o => {
        if (!orderCounts(o)) return false;
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

      // Get recent orders (newest first). createdAt is a Firestore Timestamp
      // ({seconds}), not a date string — new Date() on it yields Invalid Date,
      // which made the previous sort a no-op (hence the random order).
      const recentOrders = [...memberOrders]
        .sort((a, b) => getOrderMs(b) - getOrderMs(a))
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
  // Resolve the member's ACTUAL Firestore doc id (registered members keep their id;
  // name-only rows have no doc yet → name:key).
  const resolveMemberId = (member) => {
    const nameKey = getNameKey(member.name);
    const isNameOnly = String(member.id || '').startsWith('name-only:');
    return isNameOnly
      ? (nameKey ? `name:${nameKey}` : null)
      : (member.id || member.phone || (nameKey ? `name:${nameKey}` : null));
  };
  const historyEntry = (delta, reason) => ({ delta: Number(delta), reason, at: new Date().toISOString() });

  const approvePending = (member) => {
    const pending = Number(member.pendingPoints || 0);
    if (pending <= 0) return;
    runDbAction(async () => {
      const id = resolveMemberId(member);
      if (!id) return;
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', id), {
        points: increment(pending),
        pendingPoints: 0,
        pointsHistory: arrayUnion(historyEntry(pending, member.pendingReason || 'review'))
      }, { merge: true });
    }, 'อนุมัติแต้มไม่สำเร็จ');
    toast.success(`อนุมัติ +${pending} แต้มให้ ${member.name} แล้ว`);
  };

  const rejectPending = (member) => {
    runDbAction(async () => {
      const id = resolveMemberId(member);
      if (!id) return;
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', id), {
        pendingPoints: 0
      }, { merge: true });
    }, 'ปฏิเสธไม่สำเร็จ');
    toast.info('ปฏิเสธคำขอแต้มแล้ว');
  };

  // Reconciliation: credit a member's missing earn into pendingPoints so it goes
  // through the normal approval gate. Never writes straight to the balance. The
  // owner confirms per person (this runs from a ConfirmModal). For name-only
  // customers with no doc yet, setDoc(merge) creates the doc keyed by name.
  const creditGap = (member) => {
    const gap = Number(member?.earnGap || 0);
    if (gap < 1) return;
    runDbAction(async () => {
      const id = resolveMemberId(member);
      if (!id) return;
      const payload = {
        name: member.name || 'ลูกค้าทั่วไป',
        pendingPoints: increment(gap),
        pendingReason: 'recalc',
      };
      const phone = String(member.phone || '').trim();
      if (phone) payload.phone = phone;
      if (String(member.id || '').startsWith('name-only:')) payload.createdAt = serverTimestamp();
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', id), payload, { merge: true });
    }, 'เติมแต้มย้อนหลังไม่สำเร็จ');
    toast.success(`เติม +${gap} แต้ม (รออนุมัติ) ให้ ${member.name} แล้ว`);
    setCreditTarget(null);
  };

  // Merge duplicate identities into one primary member: sum points + pending,
  // concat history, re-point the losers' orders to the primary, then delete the
  // loser docs. Bounded to a single batch (well under Firestore's 500-op cap for
  // realistic customer histories). The owner picks the primary and confirms.
  const mergeMembers = async (group, primaryId) => {
    const base = ['artifacts', appId, 'public', 'data'];
    const primary = group.members.find(m => (m.id || m.phone) === primaryId) || group.members[0];
    const losers = group.members.filter(m => m !== primary);
    const primaryDocId = resolveMemberId(primary);
    if (!primaryDocId) { toast.warning('เลือกสมาชิกหลักไม่ได้'); return; }
    const primaryPhone = String(primary.phone || '').trim();
    const primaryName = primary.name || 'ลูกค้าทั่วไป';

    await runDbAction(async () => {
      const batch = writeBatch(db);
      let addPoints = 0;
      let addPending = 0;
      const historyAdd = [];

      losers.forEach(loser => {
        addPoints += Number(loser.points || 0);
        addPending += Number(loser.pendingPoints || 0);
        (Array.isArray(loser.pointsHistory) ? loser.pointsHistory : []).forEach(e => historyAdd.push(e));

        // Re-point this loser's orders onto the primary identity so purchase
        // history follows the merge.
        const loserPhone = String(loser.phone || '').trim();
        const loserNameKey = getNameKey(loser.name);
        orders.forEach(o => {
          const matchByPhone = loserPhone && o.memberPhone === loserPhone;
          const matchByName = !o.memberPhone && loserNameKey && getNameKey(o.memberNickname) === loserNameKey;
          if (matchByPhone || matchByName) {
            batch.update(doc(db, ...base, 'orders', o.id), {
              memberPhone: primaryPhone,
              memberNickname: primaryName,
            });
          }
        });

        // Remove the loser's own doc (name-only rows have no doc to delete).
        if (!String(loser.id || '').startsWith('name-only:') && (loser.id || loser.phone)) {
          batch.delete(doc(db, ...base, 'members', loser.id || loser.phone));
        }
      });

      const primaryPayload = {
        name: primaryName,
        createdAt: primary.createdAt || serverTimestamp(),
      };
      if (primaryPhone) primaryPayload.phone = primaryPhone;
      if (addPoints !== 0) primaryPayload.points = increment(addPoints);
      if (addPending !== 0) primaryPayload.pendingPoints = increment(addPending);
      const mergeMarker = historyEntry(0, 'recalc');
      primaryPayload.pointsHistory = arrayUnion(...historyAdd, mergeMarker);
      batch.set(doc(db, ...base, 'members', primaryDocId), primaryPayload, { merge: true });

      await batch.commit();
    }, 'รวมสมาชิกไม่สำเร็จ');
    toast.success(`รวม ${losers.length + 1} รายการเข้าเป็น "${primaryName}" แล้ว`);
    setMergeGroup(null);
    setMergePrimaryId(null);
  };

  // Wrong member entered on a bill → detach it from this member (revenue is
  // kept; the order just stops counting under this customer). The points this
  // bill earned were credited to the wrong member, so claw them back too —
  // from pendingPoints first (not yet approved), then from points, never below
  // zero. Redemptions aren't reversed (orders don't record a redeem flag).
  const unlinkOrderFromMember = (order) => {
    const member = selectedMemberForFavorites;
    runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id), {
        memberPhone: '', memberNickname: ''
      });

      const earned = Math.floor(Number(order.total || 0) / 10);
      const memberId = member && resolveMemberId(member);
      const isNameOnly = String(member?.id || '').startsWith('name-only:');
      if (earned > 0 && memberId && !isNameOnly) {
        let remain = earned;
        const fromPending = Math.min(remain, Number(member.pendingPoints || 0)); remain -= fromPending;
        const fromPoints = Math.min(remain, Number(member.points || 0));
        const payload = {};
        if (fromPending > 0) payload.pendingPoints = increment(-fromPending);
        if (fromPoints > 0) {
          payload.points = increment(-fromPoints);
          payload.pointsHistory = arrayUnion(historyEntry(-fromPoints, 'manual'));
        }
        if (Object.keys(payload).length > 0) {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', memberId), payload, { merge: true });
        }
      }
    }, 'ถอดออเดอร์ออกจากสมาชิกไม่สำเร็จ');
    const earned = Math.floor(Number(order.total || 0) / 10);
    toast.success(earned > 0 ? `ถอดออเดอร์ออกแล้ว และหักแต้มที่ได้จากบิลนี้ ${earned} แต้ม` : 'ถอดออเดอร์ออกจากสมาชิกแล้ว');
  };

  // Delete a whole bill (reuses the app-level confirm + stock restore flow).
  const deleteOrder = (order) => {
    setSelectedMemberForFavorites(null);
    setOrderToCancel(order.id);
  };

  const deleteMember = (member) => {
    if (!member?.id) return;
    setDeletingMember(member);
    setShowDeleteConfirm(true);
  };

  // Delete handles every row type:
  //  - phone member: delete the doc (orders keyed by phone won't re-appear)
  //  - name member (name:key doc) / name-only projection (no doc): delete the
  //    doc if any AND unlink the name from its orders, otherwise the row would
  //    just re-materialise from those orders.
  const confirmDeleteMember = async () => {
    setShowDeleteConfirm(false);
    const member = deletingMember;
    const nameKey = getNameKey(member?.name);
    const hasPhone = !!String(member?.phone || '').trim();
    const isNameOnly = String(member?.id || '').startsWith('name-only:');
    const base = ['artifacts', appId, 'public', 'data'];
    await runDbAction(async () => {
      const batch = writeBatch(db);
      let ops = 0;
      if (!isNameOnly && (member?.id || member?.phone)) {
        batch.delete(doc(db, ...base, 'members', member.id || member.phone));
        ops++;
      }
      if (!hasPhone && nameKey) {
        orders
          .filter(o => !o.memberPhone && getNameKey(o.memberNickname) === nameKey)
          .forEach(o => { batch.update(doc(db, ...base, 'orders', o.id), { memberNickname: '' }); ops++; });
      }
      if (ops > 0) await batch.commit();
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
    const newPoints = formData.points != null && formData.points !== '' ? Number(formData.points) || 0 : Number(member?.points || 0);
    const oldPoints = Number(editingMember?.points || 0);
    const data = {
      name: nextName || currentName || 'ลูกค้าทั่วไป',
      phone: nextPhone || '',
      points: newPoints,
      createdAt: member?.createdAt || serverTimestamp(),
    };
    if (newPoints - oldPoints !== 0) {
      data.pointsHistory = arrayUnion(historyEntry(newPoints - oldPoints, 'manual'));
    }

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
            onClick={() => setShowReconcile(v => !v)}
            variant={showReconcile ? 'primary' : 'outline'}
            size="md"
            leftIcon={<Calculator size={14} />}
            title="ตรวจแต้มที่ซื้อแล้วไม่ขึ้น และรวมสมาชิกซ้ำ"
          >
            <span className="hidden sm:inline">กระทบยอด</span>แต้ม
            {(reconcileList.length > 0 || duplicateGroups.length > 0) && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black">
                {reconcileList.length + duplicateGroups.length}
              </span>
            )}
          </Button>
          <Button
            onClick={addMember}
            variant="primary"
            size="md"
            leftIcon={<User size={14} />}
          >
            <span className="hidden sm:inline">เพิ่ม</span>สมาชิก
          </Button>
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
            <span className="text-xs md:text-xs font-black uppercase tracking-wider opacity-80">สมาชิกทั้งหมด</span>
            <Users size={16} className="md:w-5 md:h-5 opacity-60" />
          </div>
          <p className="text-2xl md:text-4xl font-black">{processedMembers.length}</p>
          <p className="text-xs md:text-xs opacity-70 mt-0.5">คน</p>
        </div>

        {/* Filtered Results */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl md:rounded-2xl p-3 md:p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-xs md:text-xs font-black uppercase tracking-wider opacity-80">ผลการค้นหา</span>
            <Search size={16} className="md:w-5 md:h-5 opacity-60" />
          </div>
          <p className="text-2xl md:text-4xl font-black">{filteredMembers.length}</p>
          <p className="text-xs md:text-xs opacity-70 mt-0.5">คน</p>
        </div>

        {/* Redeemable Members */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl md:rounded-2xl p-3 md:p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-xs md:text-xs font-black uppercase tracking-wider opacity-80">แลกแต้มได้</span>
            <span className="text-[8px] md:text-xs bg-white/20 px-1.5 py-0.5 rounded-lg">≥{REDEEM_POINTS_THRESHOLD}</span>
          </div>
          <p className="text-2xl md:text-4xl font-black">{redeemableMembers}</p>
          <p className="text-xs md:text-xs opacity-70 mt-0.5">คน</p>
        </div>

        {/* Total Spent */}
        <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl md:rounded-2xl p-3 md:p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-1 md:mb-2">
            <span className="text-xs md:text-xs font-black uppercase tracking-wider opacity-80">ยอดใช้จ่ายรวม</span>
          </div>
          <p className="text-xl md:text-3xl font-black">฿{totalSpentAll.toLocaleString()}</p>
          <p className="text-xs md:text-xs opacity-70 mt-0.5">แต้มรวม: {totalPoints.toLocaleString()}</p>
        </div>
      </div>
      {/* Reconciliation + Merge Tools */}
      {showReconcile && (
        <div className="px-3 md:px-6 lg:px-8 pt-3 md:pt-4 shrink-0 space-y-3">
          {/* Missing points (bought but points didn't show) */}
          <div className="bg-white border border-emerald-200 rounded-2xl p-3 md:p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 text-emerald-700 font-black text-sm md:text-base uppercase tracking-wider">
                <Calculator size={18} />
                <span>แต้มที่ซื้อแล้วไม่ขึ้น</span>
              </div>
              {/* Time window — only reconcile recent orders */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                {[7, 14].map(d => (
                  <button
                    key={d}
                    onClick={() => setReconcileDays(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${reconcileDays === d ? 'bg-emerald-500 text-white shadow' : 'text-gray-500 hover:text-emerald-600'}`}
                  >
                    {d} วัน
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-400 font-bold mb-3">
              เทียบยอดซื้อกับแต้มที่ได้ เฉพาะ {reconcileDays} วันล่าสุด — เติมส่วนที่ขาดเข้า “รออนุมัติ” แล้วค่อยกดอนุมัติอีกที (฿10 = 1 แต้ม · การแลกแต้มไม่ถูกนับซ้ำ)
            </p>
            {reconcileList.length === 0 ? (
              <div className="text-center py-6 text-gray-400 font-bold text-sm flex items-center justify-center gap-2">
                <Check size={16} className="text-emerald-500" /> แต้มตรงกับยอดซื้อทุกคนแล้ว
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 max-h-64 overflow-y-auto scrollbar-hide">
                {reconcileList.map(m => (
                  <div key={`gap-${m.phone || m.id}`} className="bg-emerald-50/60 rounded-2xl border border-emerald-100 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-gray-800 text-sm truncate">{String(m.name || 'ไม่ระบุชื่อ')}</p>
                      <p className="text-xs font-bold text-gray-400">
                        {m.phone ? String(m.phone) : 'ไม่มีเบอร์'} · ควรได้ {Number(m.expectedEarn || 0)} · ขาด
                        <span className="text-emerald-600"> {Number(m.earnGap)}</span> แต้ม
                        {Number(m.redeemed || 0) > 0 && (
                          <span className="text-orange-500"> · แลกไปแล้ว {Number(m.redeemed)}</span>
                        )}
                      </p>
                    </div>
                    <Button onClick={() => setCreditTarget(m)} variant="primary" size="sm" leftIcon={<Check size={14} />}>
                      เติม +{Number(m.earnGap)}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Duplicate identities to merge */}
          {duplicateGroups.length > 0 && (
            <div className="bg-white border border-violet-200 rounded-2xl p-3 md:p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1 text-violet-700 font-black text-sm md:text-base uppercase tracking-wider">
                <GitMerge size={18} />
                <span>สมาชิกซ้ำ (ชื่อเดียวกัน)</span>
              </div>
              <p className="text-xs text-gray-400 font-bold mb-3">
                คนเดียวกันแต่แยกเป็นหลายรายการ (เบอร์/ชื่อ) — เลือกตัวหลักแล้วกดรวม แต้มและประวัติจะยุบรวมกัน
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
                {duplicateGroups.map(group => (
                  <div key={`dup-${group.key}`} className="bg-violet-50/60 rounded-2xl border border-violet-100 p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="font-black text-gray-800 text-sm truncate flex items-center gap-2">
                        <AlertTriangle size={14} className="text-violet-500 shrink-0" /> {group.key}
                        <span className="text-xs font-bold text-gray-400">({group.members.length} รายการ)</span>
                      </p>
                      <Button
                        onClick={() => {
                          const primary = group.members.find(m => String(m.phone || '').trim()) || group.members[0];
                          setMergeGroup(group);
                          setMergePrimaryId(primary.id || primary.phone);
                        }}
                        variant="primary"
                        size="sm"
                        leftIcon={<GitMerge size={14} />}
                      >
                        รวม
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.members.map(m => (
                        <span key={`dupm-${m.id || m.phone}`} className="text-xs bg-white px-2 py-1 rounded-lg border border-violet-100 font-bold text-gray-600">
                          {m.phone ? String(m.phone) : 'ไม่มีเบอร์'} · {Number(m.points || 0)}
                          {Number(m.pendingPoints || 0) > 0 ? `(+${Number(m.pendingPoints)})` : ''} แต้ม
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending Approval Section */}
      {processedMembers.some(m => Number(m.pendingPoints) > 0) && (
        <div className="px-3 md:px-6 lg:px-8 pt-3 md:pt-4 shrink-0">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 md:p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-amber-700 font-black text-sm md:text-base uppercase tracking-wider">
              <History size={18} />
              <span>รออนุมัติแต้ม</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
              {processedMembers.filter(m => Number(m.pendingPoints) > 0).map(m => (
                <div key={`pending-${m.phone || m.id}`} className="bg-white rounded-2xl border border-amber-100 p-3 flex items-center justify-between gap-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="font-black text-gray-800 text-sm truncate">{String(m.name || 'ไม่ระบุชื่อ')}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 font-black text-xs">
                      รออนุมัติ +{Number(m.pendingPoints)} · {m.pendingReason === 'order' ? 'จากการซื้อ' : m.pendingReason === 'recalc' ? 'กระทบยอดย้อนหลัง' : 'รีวิว'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button onClick={() => approvePending(m)} variant="primary" size="sm" leftIcon={<Check size={14} />}>
                      อนุมัติ
                    </Button>
                    <Button onClick={() => rejectPending(m)} variant="outline-danger" size="sm" leftIcon={<X size={14} />}>
                      ปฏิเสธ
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 p-3 md:p-6 lg:p-8 overflow-hidden">
        <div className="h-full bg-white rounded-2xl md:rounded-[2.5rem] lg:rounded-[3.5rem] shadow-xl border border-gray-100 overflow-hidden flex flex-col shadow-emerald-500/5">
          {/* Desktop Table Header */}
          <div className="hidden md:grid p-6 lg:p-10 border-b border-gray-50 grid-cols-4 font-black text-xs lg:text-xs text-gray-400 uppercase tracking-wider lg:tracking-[0.2em] px-6 lg:px-12 leading-none">
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
                        <p className="text-xs font-bold text-gray-400 tracking-wide">{m.phone ? String(m.phone) : 'ไม่ระบุเบอร์'}</p>
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-xl font-black text-xs shadow ${Number(m.points || 0) >= REDEEM_POINTS_THRESHOLD ? 'bg-orange-500 text-white animate-pulse' : 'bg-emerald-500 text-white'}`}>
                      {Number(m.points || 0)} แต้ม
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex gap-4">
                      <span className="text-gray-400">ซื้อ: <span className="text-gray-800 font-black">{Number(m.totalPurchases)} ชิ้น</span></span>
                      <span className="text-gray-400">ยอด: <span className="text-emerald-600 font-black">฿{Number(m.totalSpent).toLocaleString()}</span></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelectedMemberForFavorites(m)} className="p-2 bg-pink-50 text-pink-500 rounded-lg active:scale-90" title="ดูเมนูโปรด">
                        <Heart size={14} />
                      </button>
                      <button onClick={() => setHistoryMember(m)} className="p-2 bg-violet-50 text-violet-500 rounded-lg active:scale-90" title="ประวัติแต้ม">
                        <History size={14} />
                      </button>
                      {m.id && (
                        <button onClick={() => editMember(m)} className="p-2 bg-blue-50 text-blue-500 rounded-lg active:scale-90">
                          <Edit size={14} />
                        </button>
                      )}
                      {m.id && (
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
                    <p className="text-xs lg:text-xs font-black text-emerald-500 uppercase tracking-wider lg:tracking-widest mt-1 lg:mt-2 leading-none">รายการ</p>
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
                      <button
                        onClick={() => setHistoryMember(m)}
                        title="ประวัติแต้ม"
                        className="p-2 lg:p-3 bg-violet-50 text-violet-500 rounded-xl lg:rounded-2xl shadow-sm border border-violet-100 hover:bg-violet-100 transition-all active:scale-90"
                      >
                        <History size={16} className="lg:w-[18px] lg:h-[18px]" />
                      </button>
                      {m.id && (
                        <button onClick={() => editMember(m)} className="p-2 lg:p-3 bg-blue-50 text-blue-500 rounded-xl lg:rounded-2xl shadow-sm border border-blue-100 hover:bg-blue-100 transition-all active:scale-90">
                          <Edit size={16} className="lg:w-[18px] lg:h-[18px]" />
                        </button>
                      )}
                      {m.id && (
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
                  <p className="text-xs md:text-xs font-bold text-pink-400 uppercase tracking-wider">ออเดอร์ทั้งหมด</p>
                </div>
                <div className="bg-violet-50 rounded-xl md:rounded-2xl p-3 md:p-4 text-center border border-violet-100">
                  <p className="text-lg md:text-2xl font-black text-violet-600">{memberData.uniqueItems}</p>
                  <p className="text-xs md:text-xs font-bold text-violet-400 uppercase tracking-wider">เมนูที่เคยสั่ง</p>
                </div>
                <div className="bg-emerald-50 rounded-xl md:rounded-2xl p-3 md:p-4 text-center border border-emerald-100">
                  <p className="text-lg md:text-2xl font-black text-emerald-600">฿{Number(selectedMemberForFavorites.totalSpent || 0).toLocaleString()}</p>
                  <p className="text-xs md:text-xs font-bold text-emerald-400 uppercase tracking-wider">ยอดใช้จ่ายรวม</p>
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
                            <p className="text-xs md:text-xs text-gray-400 font-bold">{item.category || 'ไม่ระบุหมวดหมู่'}</p>
                          </div>

                          {/* Count */}
                          <div className="text-right shrink-0">
                            <p className="font-black text-pink-600 text-lg md:text-xl">{item.count}</p>
                            <p className="text-xs md:text-xs text-gray-400 font-bold uppercase">ครั้ง</p>
                          </div>

                          {/* Total Spent */}
                          <div className="text-right shrink-0 hidden sm:block">
                            <p className="font-black text-emerald-600 text-sm md:text-base">฿{item.totalSpent.toLocaleString()}</p>
                            <p className="text-xs md:text-xs text-gray-400 font-bold uppercase">รวม</p>
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
                              <span className="text-xs md:text-xs font-bold text-gray-400">{dateStr}</span>
                              <span className="text-sm md:text-base font-black text-emerald-600">฿{Number(order.total || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex flex-wrap gap-1 md:gap-2">
                              {(order.items || []).map((item, i) => (
                                <span key={i} className="text-xs md:text-xs bg-white px-2 py-1 rounded-lg border border-gray-100 font-bold text-gray-600">
                                  {item.name} x{item.quantity}
                                </span>
                              ))}
                            </div>
                            {/* Fix mis-entered bills: detach from this member, or delete the bill */}
                            <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
                              <button
                                onClick={() => unlinkOrderFromMember(order)}
                                title="กรอกสมาชิกผิด — ถอดออเดอร์นี้ออกจากสมาชิก (ยอดขายไม่หาย)"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100 transition-all active:scale-95 font-bold text-xs"
                              >
                                <UserMinus size={14} /> ถอดออกจากสมาชิก
                              </button>
                              <button
                                onClick={() => deleteOrder(order)}
                                title="ลบบิลนี้ทิ้ง"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition-all active:scale-95 font-bold text-xs"
                              >
                                <Trash2 size={14} /> ลบบิล
                              </button>
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

      {/* Points History Modal */}
      <Modal
        isOpen={!!historyMember}
        onClose={() => setHistoryMember(null)}
        title="ประวัติแต้ม"
      >
        {(() => {
          const reasonLabels = { order: 'ออเดอร์', review: 'รีวิว', redeem: 'แลกแต้ม', manual: 'ปรับด้วยมือ', recalc: 'ปรับปรุง' };
          const entries = [...(historyMember?.pointsHistory || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
          if (entries.length === 0) {
            return (
              <div className="text-center py-10 text-gray-400 font-bold text-sm">
                ยังไม่มีประวัติ
              </div>
            );
          }
          return (
            <div className="space-y-2 md:space-y-3">
              {entries.map((e, idx) => {
                const delta = Number(e.delta || 0);
                const dateStr = e.at ? new Date(e.at).toLocaleString('th-TH') : 'ไม่ทราบวันที่';
                return (
                  <div key={idx} className="flex items-center justify-between gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl bg-gray-50 border border-gray-100">
                    <div className="min-w-0">
                      <p className="font-black text-gray-800 text-sm">{reasonLabels[e.reason] || e.reason || 'ไม่ระบุ'}</p>
                      <p className="text-xs font-bold text-gray-400">{dateStr}</p>
                    </div>
                    <div className={`font-black text-base md:text-lg shrink-0 ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {delta >= 0 ? `+${delta}` : `${delta}`}
                    </div>
                  </div>
                );
              })}
            </div>
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
          { name: 'phone', label: 'เบอร์โทรศัพท์', placeholder: 'กรอกเบอร์โทร (ถ้ามี)', type: 'tel', defaultValue: editingMember?.phone || '' },
          { name: 'points', label: 'แต้มสะสม', placeholder: '0', type: 'number', defaultValue: String(editingMember?.points ?? 0) }
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

      {/* Credit missing points confirm */}
      <ConfirmModal
        isOpen={!!creditTarget}
        onClose={() => setCreditTarget(null)}
        onConfirm={() => creditGap(creditTarget)}
        title="เติมแต้มย้อนหลัง"
        message={creditTarget
          ? `${creditTarget.name || 'ลูกค้า'} ซื้อใน ${reconcileDays} วันล่าสุดควรได้ ${Number(creditTarget.expectedEarn || 0)} แต้ม แต่ได้ไม่ครบ${Number(creditTarget.redeemed || 0) > 0 ? ` (แลกไปแล้ว ${Number(creditTarget.redeemed)} แต้ม — ไม่นับรวมในนี้)` : ''} — เติมส่วนที่ขาด +${Number(creditTarget.earnGap || 0)} แต้มเข้า "รออนุมัติ" ใช่หรือไม่? (ยังต้องกดอนุมัติอีกครั้ง)`
          : ''}
        confirmText={`เติม +${Number(creditTarget?.earnGap || 0)}`}
        cancelText="ยกเลิก"
        variant="primary"
      />

      {/* Merge duplicates — pick the primary identity */}
      <Modal
        isOpen={!!mergeGroup}
        onClose={() => { setMergeGroup(null); setMergePrimaryId(null); }}
        size="md"
        title="รวมสมาชิกซ้ำ"
      >
        {mergeGroup && (
          <div className="space-y-4">
            <p className="text-sm font-bold text-gray-500">
              เลือกรายการหลัก (แต้ม + ประวัติของรายการอื่นจะถูกยุบรวมเข้ารายการนี้ และออเดอร์จะย้ายมาผูกกับรายการหลัก)
            </p>
            <div className="space-y-2">
              {mergeGroup.members.map(m => {
                const rid = m.id || m.phone;
                const selected = rid === mergePrimaryId;
                return (
                  <button
                    key={`merge-${rid}`}
                    onClick={() => setMergePrimaryId(rid)}
                    className={`w-full text-left p-3 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 ${selected ? 'border-violet-500 bg-violet-50' : 'border-gray-100 bg-white hover:border-violet-200'}`}
                  >
                    <div className="min-w-0">
                      <p className="font-black text-gray-800 text-sm truncate">{String(m.name || 'ไม่ระบุชื่อ')}</p>
                      <p className="text-xs font-bold text-gray-400">
                        {m.phone ? String(m.phone) : 'ไม่มีเบอร์'} · {Number(m.points || 0)} แต้ม
                        {Number(m.pendingPoints || 0) > 0 ? ` (+${Number(m.pendingPoints)} รอ)` : ''}
                        {String(m.id || '').startsWith('name-only:') ? ' · ยังไม่มีบัญชี' : ''}
                      </p>
                    </div>
                    {selected && <Check size={18} className="text-violet-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => { setMergeGroup(null); setMergePrimaryId(null); }} variant="secondary" size="lg" fullWidth>
                ยกเลิก
              </Button>
              <Button onClick={() => mergeMembers(mergeGroup, mergePrimaryId)} variant="primary" size="lg" fullWidth leftIcon={<GitMerge size={16} />}>
                รวมเป็นหนึ่งเดียว
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

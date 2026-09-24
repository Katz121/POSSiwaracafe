import { useCallback, useMemo, useRef, useState } from 'react';
import { Coins, Edit, GitMerge, Gift, RefreshCcw, User, UserPlus, Users, Wallet, Wrench } from 'lucide-react';
import { doc, setDoc, updateDoc, writeBatch, serverTimestamp, increment, arrayUnion, runTransaction } from 'firebase/firestore';
import { db, appId, auth } from '../../services/firebase';
import { useConfigContext, useDataContext, useUIContext } from '../../context/AppContext';
import { getNameKey } from '../../utils/calculations';
import { settlePendingPoints, withInFlightGuard, planEarnClawback } from '../../utils/pointsActions';
import useDebounce from '../../hooks/useDebounce';
import {
  Button, ConfirmModal, CountBadge, IconButton, InputModal, Modal, Money, PageHeader, StatCard, Toolbar, useToast,
} from '../ui';
import { formatNumber, formatThaiDate, formatTime, toDate } from '../../utils/format';
import { DEFAULT_REDEEM_POINTS_THRESHOLD } from '../../config/constants';
import {
  auditMemberEarn, buildMemberDetail, buildMemberOrderIndex, buildMenuImageLookup, filterMembers, findDuplicateGroups,
  getOrderMs, isNameOnlyId, nameOnlyOrders, ordersForMember, processMembers,
} from './members/memberData';
import MemberTable from './members/MemberTable';
import MemberSheet from './members/MemberSheet';
import MemberToolsSheet from './members/MemberToolsSheet';
import PendingApprovals from './members/PendingApprovals';
import Layer from './members/Layer';

// Name groups the owner has confirmed are DIFFERENT people (same nickname,
// different customers) — kept out of the duplicate list for good.
const IGNORED_DUP_STORAGE_KEY = 'pos.ignoredDuplicateNameKeys';
const memberKey = (m) => m?.phone || m?.id;

export default function MembersView() {
  const { members, orders, menu, isSyncing } = useDataContext();
  const { redeemPointsThreshold } = useConfigContext();
  const { runDbAction, setOrderToCancel } = useUIContext();

  const toast = useToast();
  const pointsInFlight = useRef(new Set());
  const [busyMembers, setBusyMembers] = useState(new Set());
  const withMembers = (targets, action) => withInFlightGuard(
    pointsInFlight.current, targets.filter(Boolean).map(resolveMemberId), action, setBusyMembers
  );
  const memberBusy = (member) => !!member && busyMembers.has(resolveMemberId(member));

  const REDEEM_POINTS_THRESHOLD = Number(redeemPointsThreshold) || DEFAULT_REDEEM_POINTS_THRESHOLD;

  // Local states
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const debouncedMemberSearchTerm = useDebounce(memberSearchTerm, 200);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSnapshot, setSheetSnapshot] = useState(null); // row as it was when opened
  const [sheetSession, setSheetSession] = useState(0);      // resets the sheet's inner tab
  const [pendingOrdersMember, setPendingOrdersMember] = useState(null);
  const [showTools, setShowTools] = useState(false);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingMember, setDeletingMember] = useState(null);

  const [ignoredDupKeys, setIgnoredDupKeys] = useState(() => {
    try {
      const raw = localStorage.getItem(IGNORED_DUP_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const ignoreDupGroup = (key) => {
    setIgnoredDupKeys(prev => {
      const next = prev.includes(key) ? prev : [...prev, key];
      try { localStorage.setItem(IGNORED_DUP_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    toast.info(`ซ่อน "${key}" ออกจากรายการซ้ำแล้ว (คนละคนกัน)`);
  };
  const resetIgnoredDupKeys = () => {
    setIgnoredDupKeys([]);
    try { localStorage.removeItem(IGNORED_DUP_STORAGE_KEY); } catch { /* ignore */ }
  };

  // Reconciliation + merge tools
  const [creditTarget, setCreditTarget] = useState(null); // member awaiting credit confirm
  const [mergeGroup, setMergeGroup] = useState(null);      // { key, members } awaiting merge confirm
  const [mergePrimaryId, setMergePrimaryId] = useState(null);
  const [reconcileDays, setReconcileDays] = useState(14);  // only reconcile the last N days

  // ── Data · one pass over orders, then Map lookups per member ──────────────
  const orderIndex = useMemo(() => buildMemberOrderIndex(orders), [orders]);
  const imageFor = useMemo(() => buildMenuImageLookup(menu), [menu]);

  const processedMembers = useMemo(() => {
    // The earn audit only looks back this far (default 14 days) — recent
    // "bought but points didn't show" cases, not the whole bill history.
    const cutoff = Date.now() - reconcileDays * 24 * 60 * 60 * 1000;
    return processMembers({ members, orders, index: orderIndex, cutoff });
  }, [members, orders, orderIndex, reconcileDays]);

  // A member IS a phone number. Everything else — a legacy `name:xxx` doc, a
  // bill that only carries a nickname — is a guest: real revenue, real name on
  // the bill, but not an identity we can trust (nicknames collide constantly).
  // Guests are kept out of the member list, the stats and the points machinery,
  // and are surfaced in their own cleanup panel instead.
  const memberRows = useMemo(() => processedMembers.filter(m => String(m.phone || '').trim()), [processedMembers]);
  const guestRows = useMemo(() => processedMembers.filter(m => !String(m.phone || '').trim()), [processedMembers]);
  const guestPoints = useMemo(
    () => guestRows.reduce((s, m) => s + Number(m.points || 0) + Number(m.pendingPoints || 0), 0),
    [guestRows]
  );

  // Members whose purchases earned fewer points than they should have — the
  // "bought but points didn't show" cases. Sorted biggest-gap first. The owner
  // reviews and confirms each credit (points go to pendingPoints for the normal
  // approval flow, never straight into the balance). Guests can't earn, so they
  // are never offered a credit.
  const reconcileList = useMemo(
    () => memberRows
      .filter(m => Number(m.earnGap || 0) >= 1)
      .sort((a, b) => Number(b.earnGap) - Number(a.earnGap)),
    [memberRows]
  );

  // Duplicate identities: the same person split across a phone doc and a name
  // doc (or several name variants). Groups the owner marked "ไม่ใช่คนเดียวกัน"
  // stay hidden — that choice lives in localStorage, per device.
  const duplicateGroups = useMemo(() => findDuplicateGroups(processedMembers, ignoredDupKeys), [processedMembers, ignoredDupKeys]);

  const filteredMembers = useMemo(() => filterMembers(memberRows, debouncedMemberSearchTerm), [memberRows, debouncedMemberSearchTerm]);
  const pendingRows = useMemo(() => memberRows.filter(m => Number(m.pendingPoints) > 0), [memberRows]);

  // The sheet follows live data (points change while it is open); falls back to
  // the snapshot if the row moved (e.g. its phone was edited).
  const selectedMember = useMemo(() => {
    if (!sheetSnapshot) return null;
    const key = memberKey(sheetSnapshot);
    return processedMembers.find(m => memberKey(m) === key) || sheetSnapshot;
  }, [sheetSnapshot, processedMembers]);
  const selectedDetail = useMemo(
    () => (sheetOpen && selectedMember ? buildMemberDetail(ordersForMember(orderIndex, selectedMember), imageFor) : null),
    [sheetOpen, selectedMember, orderIndex, imageFor]
  );

  const openMember = useCallback((m) => {
    setSheetSnapshot(m);
    setSheetSession(s => s + 1);
    setSheetOpen(true);
  }, []);
  const closeMember = () => setSheetOpen(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  // Handlers
  // Resolve the member's ACTUAL Firestore doc id (registered members keep their id;
  // name-only rows have no doc yet → name:key).
  const resolveMemberId = (member) => {
    const nameKey = getNameKey(member.name);
    const isNameOnly = isNameOnlyId(member.id);
    return isNameOnly
      ? (nameKey ? `name:${nameKey}` : null)
      : (member.id || member.phone || (nameKey ? `name:${nameKey}` : null));
  };
  const historyEntry = (delta, reason) => {
    const entry = { delta: Number(delta), reason, at: new Date().toISOString() };
    if (auth.currentUser?.email) entry.by = auth.currentUser.email;
    return entry;
  };

  const settlePending = (member, approve) => withMembers([member], async () => {
    let pending = 0;
    const ok = await runDbAction(async () => {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'members', resolveMemberId(member));
      pending = await settlePendingPoints(db, ref, approve, auth.currentUser?.email);
    }, approve ? 'อนุมัติแต้มไม่สำเร็จ' : 'ปฏิเสธไม่สำเร็จ');
    if (!ok) toast.error(approve ? 'อนุมัติแต้มไม่สำเร็จ' : 'ปฏิเสธไม่สำเร็จ');
    else if (!pending) toast.info(approve ? 'อนุมัติไปแล้ว' : 'ดำเนินการคำขอแต้มไปแล้ว');
    else if (approve) toast.success(`อนุมัติ +${pending} แต้มให้ ${member.name} แล้ว`);
    else toast.info('ปฏิเสธคำขอแต้มแล้ว');
  });
  const approvePending = member => settlePending(member, true);
  const rejectPending = member => settlePending(member, false);

  // Reconciliation: credit a member's missing earn into pendingPoints so it goes
  // through the normal approval gate. Never writes straight to the balance. The
  // owner confirms per person (this runs from a ConfirmModal). For name-only
  // customers with no doc yet, setDoc(merge) creates the doc keyed by name.
  const creditGap = (member) => withMembers([member], async () => {
    let gap = Number(member?.earnGap || 0);
    if (gap < 1) return;
    const ok = await runDbAction(async () => {
      const id = resolveMemberId(member);
      if (!id) return;
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'members', id);
      const cutoff = Date.now() - reconcileDays * 24 * 60 * 60 * 1000;
      // Re-check the gap against the latest doc so a double tap can't credit twice:
      // expected earn (from orders on screen) minus what the fresh doc already credits.
      gap = await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const latest = snapshot.exists() ? snapshot.data() : {};
        const freshGap = Number(member.expectedEarn || 0) + auditMemberEarn(latest, [], cutoff).earnGap;
        if (freshGap < 1) return 0;
        const payload = {
          name: member.name || 'ลูกค้าทั่วไป',
          pendingPoints: increment(freshGap),
          pendingReason: 'recalc',
        };
        const phone = String(member.phone || '').trim();
        if (phone) payload.phone = phone;
        if (isNameOnlyId(member.id)) payload.createdAt = serverTimestamp();
        transaction.set(ref, payload, { merge: true });
        return freshGap;
      });
    }, 'เติมแต้มย้อนหลังไม่สำเร็จ');
    if (!ok) toast.error('เติมแต้มย้อนหลังไม่สำเร็จ');
    else if (gap < 1) toast.info('เติมแต้มไปแล้ว ไม่มีส่วนที่ขาด');
    else toast.success(`เติม +${gap} แต้ม (รออนุมัติ) ให้ ${member.name} แล้ว`);
    setCreditTarget(null);
  });

  // Merge duplicate identities into one primary member: sum points + pending,
  // concat history, re-point the losers' orders to the primary, then delete the
  // loser docs. Bounded to a single batch (well under Firestore's 500-op cap for
  // realistic customer histories). The owner picks the primary and confirms.
  const mergeMembers = (group, primaryId) => withMembers(group.members, async () => {
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

        // Re-point this loser's orders (by phone, or by nickname on phone-less
        // bills — cancelled ones too, as before) onto the primary identity.
        ordersForMember(orderIndex, loser, { includeCancelled: true }).forEach(o => {
          batch.update(doc(db, ...base, 'orders', o.id), {
            memberPhone: primaryPhone,
            memberNickname: primaryName,
          });
        });

        // Remove the loser's own doc (name-only rows have no doc to delete).
        if (!isNameOnlyId(loser.id) && (loser.id || loser.phone)) {
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
  });

  // Wrong member entered on a bill → detach it from this member (revenue is
  // kept; the order just stops counting under this customer). The points this
  // bill earned were credited to the wrong member, so claw them back too —
  // from pendingPoints first (not yet approved), then from points, never below
  // zero. Redemptions aren't reversed (orders don't record a redeem flag).
  const unlinkOrderFromMember = (order) => withMembers([selectedMember], async () => {
    const member = selectedMember;
    const earned = Math.floor(Number(order.total || 0) / 10);
    const memberId = member && resolveMemberId(member);
    const isNameOnly = isNameOnlyId(member?.id);
    let clawbackPoints = 0;

    const ok = await runDbAction(async () => {
      const orderRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id);

      if (earned > 0 && memberId && !isNameOnly) {
        const memberRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', memberId);
        await runTransaction(db, async transaction => {
          const memberSnap = await transaction.get(memberRef);

          transaction.update(orderRef, { memberPhone: '', memberNickname: '' });

          if (memberSnap.exists()) {
            const mData = memberSnap.data();
            const { fromPending, fromPoints } = planEarnClawback(mData, earned);
            clawbackPoints = fromPending + fromPoints;
            if (clawbackPoints > 0) {
              const payload = {};
              if (fromPending > 0) payload.pendingPoints = increment(-fromPending);
              if (fromPoints > 0) {
                payload.points = increment(-fromPoints);
                payload.pointsHistory = arrayUnion(historyEntry(-fromPoints, 'manual'));
              }
              transaction.update(memberRef, payload);
            }
          }
        });
      } else {
        await updateDoc(orderRef, { memberPhone: '', memberNickname: '' });
      }
    }, 'ถอดออเดอร์ออกจากสมาชิกไม่สำเร็จ');
    if (ok) toast.success(clawbackPoints > 0 ? `ถอดออเดอร์ออกแล้ว และหักแต้มที่ได้จากบิลนี้ ${clawbackPoints} แต้ม` : 'ถอดออเดอร์ออกจากสมาชิกแล้ว');
    else toast.error('ถอดออเดอร์ออกจากสมาชิกไม่สำเร็จ');
  });

  // Delete a whole bill (reuses the app-level confirm + stock restore flow).
  const deleteOrder = (order) => {
    setSheetOpen(false);
    setOrderToCancel(order.id);
  };

  // Used from the member sheet, the duplicate panel and the guest panel —
  // every row type is deletable, so a wrong/duplicate entry never has to be
  // merged just to make it disappear.
  const deleteMember = (member) => {
    if (!member?.id) return;
    setDeletingMember(member);
    setShowDeleteConfirm(true);
  };

  const deleteConfirmMessage = (m) => {
    if (!m) return '';
    const pts = Number(m.points || 0) + Number(m.pendingPoints || 0);
    const who = `${m.name || 'ไม่ระบุชื่อ'}${m.phone ? ` (${m.phone})` : ' (ไม่มีเบอร์)'}`;
    const lines = [`ลบ "${who}" ออกจากระบบสมาชิก?`];
    if (pts > 0) lines.push(`· แต้ม ${pts} แต้มจะหายไปด้วย`);
    if (!String(m.phone || '').trim()) lines.push('· ชื่อนี้จะถูกถอดออกจากบิลที่ผูกไว้ (ยอดขาย/บิลไม่หาย)');
    else lines.push('· บิลเก่ายังอยู่ครบ แค่ไม่ผูกกับสมาชิกคนนี้อีก');
    return lines.join('\n');
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
    const isNameOnly = isNameOnlyId(member?.id);
    const base = ['artifacts', appId, 'public', 'data'];
    await runDbAction(async () => {
      const batch = writeBatch(db);
      let ops = 0;
      if (!isNameOnly && (member?.id || member?.phone)) {
        batch.delete(doc(db, ...base, 'members', member.id || member.phone));
        ops++;
      }
      if (!hasPhone && nameKey) {
        nameOnlyOrders(orderIndex, nameKey)
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

  const submitEditMember = (formData) => withMembers([editingMember, { phone: String(formData.phone || "").trim(), name: formData.name || editingMember?.name }], async () => {
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
    const idChanged = currentId && currentId !== newId && !String(currentId).startsWith('name-only:');
    const newPoints = formData.points != null && formData.points !== '' ? Number(formData.points) || 0 : Number(member?.points || 0);
    const oldPoints = Number(editingMember?.points || 0);
    const pointDiff = newPoints - oldPoints;

    await runDbAction(async () => {
      if (idChanged) {
        await runTransaction(db, async transaction => {
          const oldRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', currentId);
          const newRef = doc(db, 'artifacts', appId, 'public', 'data', 'members', newId);
          const oldSnap = await transaction.get(oldRef);

          const oldData = oldSnap.exists() ? oldSnap.data() : {};
          const basePoints = Number(oldData.points || 0);

          const data = {
            name: nextName || currentName || 'ลูกค้าทั่วไป',
            phone: nextPhone || '',
            points: basePoints + pointDiff,
            createdAt: oldData.createdAt || member?.createdAt || serverTimestamp(),
            pendingPoints: Number(oldData.pendingPoints || 0),
            pendingReason: oldData.pendingReason || '',
          };

          const history = Array.isArray(oldData.pointsHistory) ? [...oldData.pointsHistory] : [];
          if (pointDiff !== 0) history.push(historyEntry(pointDiff, 'manual'));
          data.pointsHistory = history;

          transaction.set(newRef, data, { merge: true });
          transaction.delete(oldRef);
        });
      } else {
        const data = {
          name: nextName || currentName || 'ลูกค้าทั่วไป',
          phone: nextPhone || '',
          createdAt: member?.createdAt || serverTimestamp(),
        };
        if (pointDiff !== 0) {
          data.points = increment(pointDiff);
          data.pointsHistory = arrayUnion(historyEntry(pointDiff, 'manual'));
        }
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', newId), data, { merge: true });
      }
    }, 'ไม่สามารถแก้ไขสมาชิกได้');
    setEditingMember(null);
  });

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

    // Never overwrite an existing member — setDoc without merge would wipe
    // their points/pendingPoints/pointsHistory.
    if (members.some(m => (m.id || m.phone) === memberId)) {
      toast.error('เบอร์นี้มีสมาชิกอยู่แล้ว');
      return;
    }

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
  const { totalPoints, totalSpentAll, redeemableMembers } = useMemo(() => ({
    totalPoints: memberRows.reduce((sum, m) => sum + Number(m.points || 0), 0),
    totalSpentAll: memberRows.reduce((sum, m) => sum + Number(m.totalSpent || 0), 0),
    redeemableMembers: memberRows.filter(m => Number(m.points || 0) >= REDEEM_POINTS_THRESHOLD).length,
  }), [memberRows, REDEEM_POINTS_THRESHOLD]);

  const toolsCount = reconcileList.length + duplicateGroups.length;
  const searching = String(debouncedMemberSearchTerm || '').trim() !== '';

  const pendingOrders = useMemo(() => (pendingOrdersMember?.pendingOrderIds || [])
    .map(id => orderIndex.byId.get(id))
    .filter(Boolean)
    .sort((a, b) => getOrderMs(b) - getOrderMs(a)), [pendingOrdersMember, orderIndex]);

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      <PageHeader
        title="สมาชิก"
        subtitle={`${formatNumber(memberRows.length)} คน${guestRows.length > 0 ? ` · ไม่มีเบอร์อีก ${formatNumber(guestRows.length)}` : ''}`}
        icon={Users}
        sticky={false}
        actions={(
          <>
            <Button
              variant="secondary"
              leftIcon={<Wrench size={18} />}
              onClick={() => setShowTools(true)}
              title="ตรวจแต้มที่ซื้อแล้วไม่ขึ้น รวมสมาชิกซ้ำ และลูกค้าไม่มีเบอร์"
            >
              เครื่องมือ
              {toolsCount > 0 && <CountBadge count={toolsCount} className="ml-1" />}
            </Button>
            <Button leftIcon={<UserPlus size={18} />} onClick={addMember}>เพิ่มสมาชิก</Button>
          </>
        )}
      />

      <div className="flex-1 overflow-y-auto px-[var(--page-pad)] py-5 md:py-6 pb-24 md:pb-10">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-5">
          <PendingApprovals
            rows={pendingRows}
            isBusy={memberBusy}
            onApprove={approvePending}
            onReject={rejectPending}
            onShowOrders={setPendingOrdersMember}
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="สมาชิกทั้งหมด"
              value={formatNumber(memberRows.length)}
              unit="คน"
              icon={Users}
              hint={guestRows.length > 0 ? `ไม่มีเบอร์อีก ${formatNumber(guestRows.length)} คน` : undefined}
              loading={isSyncing}
            />
            <StatCard
              label="แลกแต้มได้"
              value={formatNumber(redeemableMembers)}
              unit="คน"
              icon={Gift}
              tone="ok"
              hint={`แต้มถึง ${formatNumber(REDEEM_POINTS_THRESHOLD)} แล้ว`}
              loading={isSyncing}
            />
            <StatCard label="ยอดใช้จ่ายรวม" value={<Money value={totalSpentAll} />} icon={Wallet} loading={isSyncing} />
            <StatCard label="แต้มสะสมรวม" value={formatNumber(totalPoints)} unit="แต้ม" icon={Coins} loading={isSyncing} />
          </div>

          <Toolbar
            className="px-0! py-0!"
            search={{ value: memberSearchTerm, onChange: setMemberSearchTerm, placeholder: 'ค้นหาชื่อหรือเบอร์โทร' }}
            actions={(
              <>
                <span className="text-sm text-[var(--text-muted)] whitespace-nowrap num" aria-live="polite">
                  {searching ? `พบ ${formatNumber(filteredMembers.length)} คน` : `${formatNumber(filteredMembers.length)} คน`}
                </span>
                <IconButton
                  icon={<RefreshCcw size={18} className={isRefreshing ? 'animate-spin' : ''} />}
                  size="lg"
                  rounded="lg"
                  variant="outline"
                  aria-label="รีเฟรชข้อมูลสมาชิก"
                  title="รีเฟรชข้อมูลสมาชิก"
                  onClick={handleRefresh}
                />
              </>
            )}
          />

          <MemberTable
            rows={filteredMembers}
            loading={isSyncing}
            threshold={REDEEM_POINTS_THRESHOLD}
            onOpen={openMember}
            emptyState={{
              title: 'ไม่มีข้อมูลสมาชิก',
              icon: Users,
              description: memberSearchTerm ? 'ไม่พบสมาชิกที่ตรงกับคำค้นหา' : 'เริ่มเพิ่มสมาชิกใหม่เพื่อสะสมแต้ม',
              action: !memberSearchTerm ? { label: 'เพิ่มสมาชิก', onClick: addMember } : undefined,
            }}
          />
        </div>
      </div>

      <MemberSheet
        key={sheetSession}
        open={sheetOpen}
        member={selectedMember}
        detail={selectedDetail}
        threshold={REDEEM_POINTS_THRESHOLD}
        busy={memberBusy(selectedMember)}
        onClose={closeMember}
        onEdit={(m) => { setSheetOpen(false); editMember(m); }}
        onDelete={(m) => { setSheetOpen(false); deleteMember(m); }}
        onUnlinkOrder={unlinkOrderFromMember}
        onDeleteOrder={deleteOrder}
      />

      <MemberToolsSheet
        open={showTools}
        onClose={() => setShowTools(false)}
        reconcileList={reconcileList}
        reconcileDays={reconcileDays}
        onReconcileDays={setReconcileDays}
        onCredit={setCreditTarget}
        duplicateGroups={duplicateGroups}
        ignoredCount={ignoredDupKeys.length}
        onResetIgnored={resetIgnoredDupKeys}
        onIgnoreGroup={ignoreDupGroup}
        onMerge={(group) => {
          const primary = group.members.find(m => String(m.phone || '').trim()) || group.members[0];
          setMergeGroup(group);
          setMergePrimaryId(primary.id || primary.phone);
        }}
        guestRows={guestRows}
        guestPoints={guestPoints}
        onPromoteGuest={editMember}
        onDelete={deleteMember}
        isBusy={memberBusy}
      />

      {/* Modals live in their own portal so they stack above an open sheet. */}
      <Layer>
        {/* Pending Orders Modal */}
        <Modal
          isOpen={!!pendingOrdersMember}
          onClose={() => setPendingOrdersMember(null)}
          title="รายการบิลรออนุมัติแต้ม"
        >
          {pendingOrders.length === 0 ? (
            <p className="text-center py-10 text-[var(--text-muted)] text-sm">ไม่พบข้อมูลบิล</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pendingOrders.map((o, idx) => {
                const d = toDate(o.createdAt || o.date);
                return (
                  <li key={o.id || idx} className="flex items-center justify-between gap-3 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)]">
                    <span className="min-w-0">
                      <span className="block font-semibold text-[var(--text-primary)] text-sm">บิล {o.id.slice(-4)}</span>
                      <span className="block text-sm text-[var(--text-muted)] num">{d ? `${formatThaiDate(d)} ${formatTime(d)}` : 'ไม่ทราบวันที่'}</span>
                    </span>
                    <Money value={o.total || 0} className="font-semibold" />
                  </li>
                );
              })}
            </ul>
          )}
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
          loading={memberBusy(editingMember)}
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
          message={<span className="whitespace-pre-line">{deleteConfirmMessage(deletingMember)}</span>}
          confirmText="ลบ"
          cancelText="ยกเลิก"
          variant="danger"
        />

        {/* Credit missing points confirm */}
        <ConfirmModal
          isOpen={!!creditTarget}
          onClose={() => setCreditTarget(null)}
          onConfirm={() => creditGap(creditTarget)}
          loading={memberBusy(creditTarget)}
          title="เติมแต้มย้อนหลัง"
          message={creditTarget
            ? `${creditTarget.name || 'ลูกค้า'} ซื้อใน ${reconcileDays} วันล่าสุดควรได้ ${Number(creditTarget.expectedEarn || 0)} แต้ม แต่ได้ไม่ครบ${Number(creditTarget.redeemed || 0) > 0 ? ` (แลกไปแล้ว ${Number(creditTarget.redeemed)} แต้ม ไม่นับรวมในนี้)` : ''} · เติมส่วนที่ขาด +${Number(creditTarget.earnGap || 0)} แต้มเข้า "รออนุมัติ" ใช่หรือไม่? (ยังต้องกดอนุมัติอีกครั้ง)`
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
            <div className="flex flex-col gap-4">
              <p className="text-sm text-[var(--text-secondary)] leading-[var(--lh-sm)]">
                เลือกรายการหลัก (แต้มและประวัติของรายการอื่นจะถูกยุบรวมเข้ารายการนี้ และออเดอร์จะย้ายมาผูกกับรายการหลัก)
              </p>
              <div role="radiogroup" aria-label="รายการหลัก" className="flex flex-col gap-2">
                {mergeGroup.members.map(m => {
                  const rid = m.id || m.phone;
                  const selected = rid === mergePrimaryId;
                  return (
                    <button
                      key={`merge-${rid}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setMergePrimaryId(rid)}
                      className={`w-full min-h-14 text-left p-3 rounded-[var(--radius-sm)] border-2 flex items-center justify-between gap-3 outline-none focus-visible:shadow-[var(--focus-ring)] ${selected ? 'border-[var(--accent)] bg-[var(--bg-selected)]' : 'border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'}`}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-[var(--text-primary)] text-sm truncate">{String(m.name || 'ไม่ระบุชื่อ')}</span>
                        <span className="block text-sm text-[var(--text-muted)] num">
                          {m.phone ? String(m.phone) : 'ไม่มีเบอร์'} · {Number(m.points || 0)} แต้ม
                          {Number(m.pendingPoints || 0) > 0 ? ` (+${Number(m.pendingPoints)} รอ)` : ''}
                          {isNameOnlyId(m.id) ? ' · ยังไม่มีบัญชี' : ''}
                        </span>
                      </span>
                      <span aria-hidden="true" className={`w-5 h-5 shrink-0 rounded-full border-2 ${selected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-strong)]'}`} />
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => { setMergeGroup(null); setMergePrimaryId(null); }} variant="secondary" size="lg" fullWidth>
                  ยกเลิก
                </Button>
                <Button disabled={mergeGroup.members.some(memberBusy)} onClick={() => mergeMembers(mergeGroup, mergePrimaryId)} variant="primary" size="lg" fullWidth leftIcon={<GitMerge size={16} />}>
                  รวมเป็นหนึ่งเดียว
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </Layer>
    </div>
  );
}

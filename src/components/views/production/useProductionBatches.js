import { useEffect, useState } from 'react';
import { onSnapshot, query, where } from 'firebase/firestore';
import { useDataContext } from '../../../context/AppContext';
import { batchesCol } from './productionActions';

/**
 * Live production batches with `date >= since` (a single-field range, so no
 * composite index is needed). Enough for the day list, the date stepper's
 * recent history and "ใช้เหมือนครั้งที่แล้ว".
 * Waits for the staff user: views mount under the login screen, and a denied
 * listener never recovers on its own.
 */
export default function useProductionBatches(since) {
  const { user } = useDataContext();
  const uid = user?.uid || null;
  const [state, setState] = useState({ key: null, batches: [], error: '' });
  useEffect(() => {
    if (!since || !uid) return undefined;
    const unsub = onSnapshot(
      query(batchesCol(), where('date', '>=', since)),
      (snap) => setState({ key: since, batches: snap.docs.map((d) => ({ id: d.id, ...d.data() })), error: '' }),
      (err) => {
        console.error(err);
        setState({ key: since, batches: [], error: 'โหลดรายการผลิตไม่สำเร็จ' });
      },
    );
    return unsub;
  }, [since, uid]);
  return { batches: state.batches, loading: state.key !== since, error: state.error };
}

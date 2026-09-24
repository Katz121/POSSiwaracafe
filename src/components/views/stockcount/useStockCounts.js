import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, appId } from '../../../services/firebase';

/**
 * Live `stockCounts` for one day (YYYY-MM-DD). Single-field equality query,
 * so no composite index is needed. Returns { counts, loading, error }.
 */
export default function useStockCounts(date) {
  const [state, setState] = useState({ date: null, counts: [], error: null });
  useEffect(() => {
    if (!date) return undefined;
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'stockCounts'), where('date', '==', date));
    return onSnapshot(
      q,
      (snap) => setState({ date, counts: snap.docs.map((d) => ({ id: d.id, ...d.data() })), error: null }),
      (error) => setState({ date, counts: [], error }),
    );
  }, [date]);
  const current = state.date === date;
  return { counts: current ? state.counts : [], loading: !current, error: current ? state.error : null };
}

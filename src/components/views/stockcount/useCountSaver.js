import { useState } from 'react';
import { useUIContext } from '../../../context/AppContext';
import { useToast } from '../../ui';
import { formatNumber } from '../../../utils/format';
import { varianceWords } from '../../../utils/stockCount';
import { saveStockCount } from './stockCountSave';

const qty = (n) => formatNumber(n, { maxDecimals: 3 });

/**
 * Save a count through the app's runDbAction (error banner + slow-write
 * warning) and toast the result. `busyId` = the stock id being saved.
 * save(item, { mode: 'match' | 'set', countedQty?, note? }) → Promise<record|null>
 */
export default function useCountSaver() {
  const { runDbAction } = useUIContext();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  const save = async (item, input) => {
    if (!item || busyId) return null;
    setBusyId(item.id);
    let record = null;
    try {
      const ok = await runDbAction(async () => {
        record = await saveStockCount({ item, ...input });
      }, `บันทึกการตรวจนับ ${item.name || ''} ไม่สำเร็จ`);
      if (!ok || !record) return null;
      if (record.variance === 0) toast.success(`${record.stockName} ตรงกับของจริง บันทึกแล้ว`);
      else toast.success(`ปรับยอด ${record.stockName} เป็น ${qty(record.countedQty)} ${record.unit} (${varianceWords(record.variance, record.unit)})`);
      return record;
    } finally {
      setBusyId(null);
    }
  };

  return { save, busyId };
}

import { CreditCard, FileText, Pencil, Printer, Trash2, Wallet } from 'lucide-react';
import { Button } from '../../ui';
import RowMenu from '../inventory/RowMenu';

/**
 * Action bar for one bill (spec WP2): รับเงินแล้ว (primary, unpaid only) ·
 * พิมพ์ · แก้ไข (secondary) · overflow: PDF, ยกเลิกชำระ, ลบบิล (danger).
 * Handlers are the pre-v2 ones, passed in unchanged.
 */
export default function BillActions({
  bill,
  onTogglePaid,
  onPrint,
  onPdf,
  onEdit,
  onDelete,
  pdfBusy = false,
  payBusy = false,
  className = '',
}) {
  const menuItems = [
    { key: 'pdf', label: pdfBusy ? 'กำลังสร้าง PDF…' : 'ใบเสร็จ PDF', icon: FileText, onSelect: () => { if (!pdfBusy) onPdf(); } },
    ...(bill.isPaid ? [{ key: 'unpay', label: 'ยกเลิกการชำระ', icon: Wallet, onSelect: onTogglePaid }] : []),
    { key: 'delete', label: 'ลบบิลนี้', icon: Trash2, danger: true, onSelect: onDelete },
  ];

  return (
    <div className={`flex w-full items-center gap-2 ${className}`}>
      {!bill.isPaid && (
        <Button className="flex-1 min-w-0" leftIcon={<CreditCard size={18} />} onClick={onTogglePaid} loading={payBusy}>
          รับเงินแล้ว
        </Button>
      )}
      <Button variant="secondary" className={bill.isPaid ? 'flex-1 min-w-0' : 'shrink-0'} leftIcon={<Printer size={18} />} onClick={onPrint}>
        พิมพ์
      </Button>
      <Button variant="secondary" className={bill.isPaid ? 'flex-1 min-w-0' : 'shrink-0'} leftIcon={<Pencil size={18} />} onClick={onEdit}>
        แก้ไข
      </Button>
      <RowMenu items={menuItems} label="ตัวเลือกเพิ่มเติมของบิล" />
    </div>
  );
}

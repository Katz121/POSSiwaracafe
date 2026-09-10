export function buildReceiptModel(order = {}, { menu = [], settings = {}, vatPercentage = 7 } = {}) {
  const number = (value) => Number(value) || 0;
  // ลูกค้าอาจทิ้งใบเสร็จไว้ในร้าน จึงส่งเฉพาะเบอร์ที่ปิดแล้วไปยังส่วนพิมพ์
  const customerPhone = String(order.memberPhone || '');
  const maskedCustomerPhone = customerPhone.length < 4 ? customerPhone : `xxx-xxx-${customerPhone.slice(-4)}`;
  const createdAt = order.createdAt?.toDate?.() ?? (order.createdAt?.seconds != null
    ? new Date(number(order.createdAt.seconds) * 1000)
    : order.createdAt != null ? new Date(order.createdAt) : null);
  // แยกวันเดือนปีเพื่อรักษาวันที่บนบิล ไม่ให้การแปลงเขตเวลาเลื่อนวัน
  const parts = /^\d{4}-\d{2}-\d{2}$/.test(order.date || '') ? order.date.split('-').map(number) : null;
  const date = parts ? new Date(parts[0], parts[1] - 1, parts[2]) : createdAt;
  const validDate = date instanceof Date && !Number.isNaN(date.getTime());
  const validTime = createdAt instanceof Date && !Number.isNaN(createdAt.getTime());
  const lines = (Array.isArray(order.items) ? order.items : []).map((item) => {
    const quantity = number(item.quantity);
    const unitPrice = number(item.price);
    return {
      name: String(item.name || menu.find((entry) => entry.id === item.id)?.name || ''),
      note: String(item.note || ''), quantity, unitPrice, lineTotal: number(unitPrice * quantity),
    };
  });
  return {
    shop: {
      name: String(settings.shopName || 'ศิวรา คาเฟ่'),
      address: String(settings.shopAddress || ''), phone: String(settings.shopPhone || ''),
      taxId: String(settings.taxId || ''), paperWidth: number(settings.receiptPaperWidth) === 58 ? 58 : 80,
    },
    meta: {
      billNo: String(order.id || '').slice(-8).toUpperCase(), queueNumber: number(order.queueNumber),
      dateText: validDate ? date.toLocaleDateString('th-TH', { dateStyle: 'long', ...(parts ? {} : { timeZone: 'Asia/Bangkok' }) }) : '',
      timeText: String(order.time || (validTime ? createdAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : '')),
      table: String(order.table || ''), sourceLabel: order.source === 'qr' ? 'สั่งผ่าน QR' : 'หน้าร้าน',
      isPaid: Boolean(order.isPaid), paidLabel: order.isPaid ? 'ชำระแล้ว' : 'ค้างชำระ',
    },
    customer: order.memberPhone || order.memberNickname
      ? { name: String(order.memberNickname || ''), phone: maskedCustomerPhone } : null,
    lines,
    // ยอดที่บันทึกคือยอดชำระจริง จึงไม่ใช้ราคาปัจจุบันหรือสูตรภาษีคำนวณแทน
    totals: {
      subtotal: number(order.subtotal), discount: number(order.discount),
      promotionTitle: String(order.promotionTitle || ''), promotionPercent: number(order.promotionDiscountPercent ?? order.promotionPercent),
      bringOwnGlass: Boolean(order.bringOwnGlass), vat: number(order.vat), vatIncluded: Boolean(order.vatIncluded),
      vatPercentage: number(vatPercentage), total: number(order.total),
      itemCount: lines.reduce((sum, line) => number(sum + line.quantity), 0),
    },
    footer: { message: String(settings.receiptFooter || 'ขอบคุณที่อุดหนุนค่ะ'), reviewUrl: String(settings.reviewUrl || '') },
  };
}

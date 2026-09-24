// Excel report + JSON backup (moved verbatim from AdminView; xlsx is loaded on demand).

export async function exportToExcel({ orders, expenses, members, stock, menu, toast }) {
  try {
    if (!orders.length) {
      toast.warning('ไม่พบข้อมูลการขายในระบบ กรุณาลองขายสินค้าที่หน้า POS ก่อน');
      return;
    }

    toast.info('กำลังเตรียมไฟล์ Excel...');
    const XLSX = await import('xlsx');

    // Export ALL data (No filtering by month)
    const allOrders = orders.filter(o => o.status === 'completed');
    const allExpenses = expenses;

    if (allOrders.length === 0 && allExpenses.length === 0) {
      toast.warning('ไม่พบข้อมูลการขายหรือรายจ่ายในระบบ');
      return;
    }

    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Overview (All Time) ---
    const totalRevenue = allOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const totalCost = allExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const overviewData = [{
      'ช่วงเวลา': 'ALL TIME (ทั้งหมด)',
      'รายรับรวม (บาท)': totalRevenue,
      'รายจ่ายรวม (บาท)': totalCost,
      'กำไรสุทธิ (บาท)': totalRevenue - totalCost,
      'จำนวนบิลทั้งหมด': allOrders.length,
      'วันที่ออกรายงาน': new Date().toLocaleString('th-TH')
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewData), 'ภาพรวม (Overview)');

    // --- Sheet 2: All Sales ---
    const salesData = allOrders.map(o => {
      const dateObj = o.createdAt?.seconds ? new Date(o.createdAt.seconds * 1000) : new Date(o.createdAt);
      return {
        'วันที่': dateObj.toLocaleDateString('th-TH'),
        'เวลา': dateObj.toLocaleTimeString('th-TH'),
        'เลขที่บิล': o.id.substring(0, 8),
        'รายการสินค้า': o.items?.map(i => `${i.name} x${i.quantity}`).join(', '),
        'ราคารวม': o.total,
        'วิธีชำระ': o.paymentMethod === 'transfer' ? 'โอนเงิน' : 'เงินสด',
        'สมาชิก': o.memberPhone || '-'
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), 'รายการขาย (Sales)');

    // --- Sheet 3: Product Performance ---
    const productStats = {};
    allOrders.forEach(o => {
      o.items?.forEach(i => {
        if (!productStats[i.name]) productStats[i.name] = { qty: 0, revenue: 0, category: i.category || '-' };
        productStats[i.name].qty += i.quantity;
        productStats[i.name].revenue += (i.price * i.quantity);
      });
    });
    const productData = Object.entries(productStats)
      .map(([name, stat]) => ({
        'ชื่อเมนู': name,
        'หมวดหมู่': stat.category,
        'จำนวนที่ขายได้ (แก้ว/ชิ้น)': stat.qty,
        'ยอดขายรวม (บาท)': stat.revenue,
        'สัดส่วนยอดขาย (%)': ((stat.revenue / totalRevenue) * 100).toFixed(2) + '%'
      }))
      .sort((a, b) => b['จำนวนที่ขายได้ (แก้ว/ชิ้น)'] - a['จำนวนที่ขายได้ (แก้ว/ชิ้น)']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productData), 'ยอดขายรายเมนู (Products)');

    // --- Sheet 4: Expenses ---
    const expenseData = allExpenses.map(e => ({
      'วันที่': e.date,
      'รายการ': e.title,
      'หมวดหมู่': e.category,
      'จำนวนเงิน (บาท)': e.amount,
      'หน่วย': e.unit || '-'
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseData), 'รายจ่าย (Expenses)');

    // --- Sheet 5: Members ---
    const memberData = members.map(m => ({
      'ชื่อลูกค้า': m.name || '-',
      'เบอร์โทร': m.phone || '-',
      'คะแนนสะสม': m.points || 0,
      'วันที่สมัคร': m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleDateString('th-TH') : '-'
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(memberData), 'สมาชิก (Members)');

    // --- Sheet 6: Stock ---
    const stockData = stock.map(s => ({
      'ชื่อวัตถุดิบ': s.name,
      'คงเหลือ': s.quantity,
      'หน่วย': s.unit,
      'สถานะ': s.quantity < s.minQuantity ? '⚠️ ใกล้หมด' : 'ปกติ'
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockData), 'สต็อก (Stock)');

    // --- Sheet 7: Menu ---
    const menuData = menu.map(m => ({
      'ชื่อเมนู': m.name,
      'หมวดหมู่': m.category,
      'ราคา (บาท)': m.price,
      'ขายดี?': m.isBestSeller ? 'Yes' : 'No'
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(menuData), 'เมนู (Menu)');

    XLSX.writeFile(wb, `POS_Export_ALL_DATA_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (error) {
    toast.error('เกิดข้อผิดพลาดในการส่งออก Excel: ' + error.message);
  }
}

export function downloadBackupJson({ appId, data }) {
  const backupData = {
    timestamp: new Date().toISOString(),
    appId,
    data,
  };
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `POS_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

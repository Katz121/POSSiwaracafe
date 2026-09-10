import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import ReceiptSheet from '../components/ReceiptSheet';
import { buildReceiptModel } from '../utils/receipt';

export default function usePrintReceipt({ menu, settings }) {
  const [order, setOrder] = useState(null);
  const busy = useRef(false);
  const cleanupRef = useRef(null);
  // ยังยืนยันไม่ได้ว่า iOS รุ่นใหม่พิมพ์ใน standalone ไม่ได้ จึงใช้สถานะนี้แนะนำ Safari เท่านั้น
  const printUnavailable = typeof window !== 'undefined' && (
    window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  );
  const printBill = useCallback((bill) => {
    if (!bill || busy.current) return;
    busy.current = true;
    cleanupRef.current?.();
    let finished = false;
    const cleanup = () => {
      finished = true;
      window.removeEventListener('afterprint', clear);
      document.getElementById('receipt-page-size')?.remove();
      cleanupRef.current = null;
    };
    const clear = () => {
      if (finished) return;
      cleanup();
      setOrder(null);
    };
    cleanupRef.current = cleanup;
    window.addEventListener('afterprint', clear, { once: true });
    try {
      flushSync(() => setOrder(bill));
      const sheet = document.getElementById('receipt-sheet');
      if (sheet) {
        // ใบเสร็จแต่ละบิลยาวไม่เท่ากัน ถ้าไม่กำหนดความยาวให้พอดี
        // เครื่องพิมพ์จะใช้กระดาษ A4/Letter หรือตัดใบเสร็จเป็นหลายหน้า
        // Safari บน iOS อาจไม่สนใจ @page size แล้วใช้ขนาดกระดาษของเครื่องพิมพ์ ซึ่งก็ยังพิมพ์ได้ถูกต้อง
        const w = sheet.classList.contains('receipt-58') ? 58 : 80;
        const h = Math.ceil(sheet.getBoundingClientRect().height * 25.4 / 96) + 2;
        document.getElementById('receipt-page-size')?.remove();
        const style = document.createElement('style');
        style.id = 'receipt-page-size';
        style.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;
        document.head.appendChild(style);
      }
      // iOS Safari ต้องใช้ user activation จากการแตะ จึงเรียก print แบบ synchronous ใน printBill
      // ห้ามย้ายไป effect หรือคั่นด้วย await, rAF, setTimeout เพราะสิทธิ์เปิดหน้าต่างพิมพ์อาจหลุด
      window.print();
    } finally {
      // iOS Safari เรียก print() แล้วคืนค่าทันที แม้แผ่นพิมพ์ยังเปิดและเรนเดอร์ตัวอย่างใหม่ได้
      // ห้ามใช้ตัวจับเวลาลบใบเสร็จหรือสไตล์ เพราะอาจทำให้ตัวอย่างกลายเป็นหน้าเปล่า
      // ถ้าไม่มี afterprint ให้เก็บใบเสร็จไว้นอกจอจนพิมพ์บิลถัดไปหรือ unmount
      busy.current = false;
    }
  }, []);

  useEffect(() => () => {
    cleanupRef.current?.();
  }, []);

  const receiptPortal = order && typeof document !== 'undefined'
    ? createPortal(createElement(ReceiptSheet, { model: buildReceiptModel(order, { menu, settings }) }), document.body)
    : null;
  return { printBill, receiptPortal, printUnavailable };
}

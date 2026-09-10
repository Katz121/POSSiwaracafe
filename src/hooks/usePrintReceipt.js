import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReceiptSheet from '../components/ReceiptSheet';
import { buildReceiptModel } from '../utils/receipt';

export default function usePrintReceipt({ menu, settings }) {
  const [order, setOrder] = useState(null);
  const busy = useRef(false);
  // ยังยืนยันไม่ได้ว่า iOS รุ่นใหม่พิมพ์ใน standalone ไม่ได้ จึงใช้สถานะนี้แนะนำ Safari เท่านั้น
  const printUnavailable = typeof window !== 'undefined' && (
    window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  );
  const printBill = useCallback((bill) => {
    if (!bill || busy.current) return;
    busy.current = true;
    setOrder(bill);
  }, []);

  useEffect(() => {
    if (!order) return;
    let secondFrame;
    let timeout;
    let finished = false;
    const clear = () => {
      finished = true;
      clearTimeout(timeout);
      document.getElementById('receipt-page-size')?.remove();
      busy.current = false;
      setOrder(null);
    };
    window.addEventListener('afterprint', clear);
    // รอหลัง portal ถูกวางใน DOM เพื่อให้ Safari คำนวณหน้ากระดาษก่อนพิมพ์
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        try {
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
          window.print();
        } finally {
          // บางเครื่องไม่ส่ง afterprint จึงต้องคืนสถานะให้พิมพ์บิลถัดไปได้
          if (!finished) timeout = setTimeout(clear, 1500);
        }
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      clearTimeout(timeout);
      window.removeEventListener('afterprint', clear);
      document.getElementById('receipt-page-size')?.remove();
      busy.current = false;
    };
  }, [order]);

  const receiptPortal = order && typeof document !== 'undefined'
    ? createPortal(createElement(ReceiptSheet, { model: buildReceiptModel(order, { menu, settings }) }), document.body)
    : null;
  return { printBill, receiptPortal, printUnavailable };
}

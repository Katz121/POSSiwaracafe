import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import ReceiptSheet from '../components/ReceiptSheet';
import { buildReceiptModel, getReceiptPdfSize } from '../utils/receipt';

export default function useReceiptPdf({ menu, settings }) {
  const [order, setOrder] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState(null);
  const busy = useRef(false);
  const blobUrl = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // โหลดล่วงหน้าโดยไม่รวมไลบรารีไว้ใน bundle หลัก และลองใหม่ตอนกดได้หากโหลดไม่สำเร็จ
    void import('jspdf').catch(() => {});
    void import('html2canvas-pro').catch(() => {});
    return () => {
      mounted.current = false;
      // เก็บ URL ให้แท็บใหม่โหลดเสร็จ ไม่ revoke ทันทีหลังเปลี่ยนหน้า
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
    };
  }, []);

  const clearFallback = useCallback(() => setFallbackUrl(null), []);
  const openReceiptPdf = useCallback(async (bill) => {
    if (!bill || busy.current) return;
    busy.current = true;
    let win;
    try {
      // iOS ต้องเปิดแท็บในจังหวะแตะ ก่อน await เพื่อไม่ให้ถูกบล็อก popup
      win = window.open('', '_blank');
      if (win) {
        win.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>กำลังสร้างใบเสร็จ...</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font:28px system-ui,sans-serif">กำลังสร้างใบเสร็จ...</body></html>');
        win.document.close();
      }
      flushSync(() => setOrder(bill));
      setGenerating(true);
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'), import('html2canvas-pro'),
      ]);
      await document.fonts?.ready;
      if (!mounted.current) {
        if (win && !win.closed) win.close();
        return;
      }
      const sheet = document.getElementById('receipt-sheet-pdf');
      if (!sheet) throw new Error('Receipt sheet is missing');
      const canvas = await html2canvas(sheet, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true,
        onclone: (doc) => {
          // ใบเสร็จจริงอยู่นอกจอ ต้องย้ายเฉพาะสำเนาเข้าจอก่อนจับภาพเพื่อไม่ให้ภาพว่าง
          const el = doc.getElementById('receipt-sheet-pdf');
          el.style.position = 'absolute';
          el.style.left = '0';
          el.style.top = '0';
        },
      });
      if (!mounted.current) {
        if (win && !win.closed) win.close();
        return;
      }
      const { width: w, height: h } = getReceiptPdfSize(canvas.width, canvas.height, sheet.classList.contains('receipt-58') ? 58 : 80);
      const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait', compress: false });
      // ใช้ภาพที่เบราว์เซอร์จัดสระและวรรณยุกต์ไทยแล้ว แทนการวาดข้อความด้วย jsPDF
      // jsPDF compresses PNG using JavaScript, which is very slow on tablets.
      // JPEG uses the browser encoder and jsPDF embeds it directly without recompression.
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
      pdf.setProperties({ title: `ใบเสร็จ-บิล-${String(bill.id || '').slice(-8).toUpperCase()}` });
      const url = URL.createObjectURL(pdf.output('blob'));
      // ปล่อย URL เก่าเมื่อมีใบใหม่เท่านั้น เพื่อให้ตัวดู PDF มีเวลาโหลดไฟล์
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = url;
      setFallbackUrl(null);
      if (win && !win.closed) win.location.href = url;
      // ถ้า popup ถูกบล็อกหรือปิดไป ให้แตะลิงก์เองเพื่อสร้าง user gesture ใหม่
      else setFallbackUrl(url);
    } catch (error) {
      if (win && !win.closed) win.close();
      throw error;
    } finally {
      if (mounted.current) {
        setOrder(null);
        setGenerating(false);
      }
      busy.current = false;
    }
  }, []);

  const receiptPortal = order && typeof document !== 'undefined'
    ? createPortal(createElement(ReceiptSheet, { id: 'receipt-sheet-pdf', model: buildReceiptModel(order, { menu, settings }) }), document.body)
    : null;
  return { openReceiptPdf, receiptPortal, generating, fallbackUrl, clearFallback };
}

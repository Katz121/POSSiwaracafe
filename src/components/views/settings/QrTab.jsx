import { useState } from 'react';
import { Check, Copy, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button, ErrorBoundary, useToast } from '../../ui';
import QrFunnelCard from '../../QrFunnelCard';
import { Section } from './controls';

/** "QR สั่งเอง" · the self-order QR (print / copy) and the QR funnel stats. */
export default function QrTab() {
  const toast = useToast();
  const [linkCopied, setLinkCopied] = useState(false);
  const orderUrl = `${window.location.origin}/order`;

  const handlePrintQR = () => {
    const win = window.open('', '_blank', 'width=480,height=600');
    if (!win) return;
    const doc = win.document;

    const style = doc.createElement('style');
    style.textContent = 'body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#fff;padding:32px;box-sizing:border-box;}h1{font-size:22px;font-weight:900;margin-bottom:8px;letter-spacing:0.05em;}p{font-size:13px;color:#555;margin-top:12px;word-break:break-all;text-align:center;}';
    doc.head.appendChild(style);

    const heading = doc.createElement('h1');
    heading.textContent = 'Siwara Coffee';
    doc.body.appendChild(heading);

    const svgEl = document.getElementById('qr-self-order-svg');
    if (svgEl) doc.body.appendChild(svgEl.cloneNode(true));

    const caption = doc.createElement('p');
    caption.textContent = 'สแกนเพื่อสั่งอาหาร';
    doc.body.appendChild(caption);

    const urlText = doc.createElement('p');
    urlText.style.cssText = 'font-size:11px;color:#aaa;';
    urlText.textContent = orderUrl;
    doc.body.appendChild(urlText);

    win.onload = () => win.print();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(orderUrl);
      setLinkCopied(true);
      toast.success('คัดลอกลิงก์แล้ว!');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error('ไม่สามารถคัดลอกได้ กรุณาคัดลอกด้วยตนเอง');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-5 items-start">
      <Section title="QR สั่งอาหารหน้าร้าน" description="ลูกค้าสแกนเพื่อสั่งเองผ่านมือถือ ออเดอร์เข้าคิวอัตโนมัติ และชำระเงินที่เคาน์เตอร์">
        <div className="flex flex-col items-center gap-4">
          {/* QR stays black-on-white in both themes so it always scans */}
          <div className="rounded-[var(--radius)] bg-white p-3 border border-[var(--border-color)]">
            <QRCodeSVG id="qr-self-order-svg" value={orderUrl} size={220} level="M" includeMargin />
          </div>
          <p className="w-full text-sm font-mono text-[var(--text-secondary)] bg-[var(--bg-sunken)] rounded-[var(--radius-sm)] px-4 py-3 select-all text-center break-all">{orderUrl}</p>
          <div className="w-full grid grid-cols-2 gap-2">
            <Button variant="secondary" leftIcon={<Printer size={18} />} onClick={handlePrintQR}>พิมพ์ QR</Button>
            <Button variant={linkCopied ? 'primary' : 'secondary'} leftIcon={linkCopied ? <Check size={18} /> : <Copy size={18} />} onClick={handleCopyLink}>
              {linkCopied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
            </Button>
          </div>
        </div>
      </Section>
      {/* isolated: a problem in the stats card must not take down the settings page */}
      <ErrorBoundary><QrFunnelCard /></ErrorBoundary>
    </div>
  );
}

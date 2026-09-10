const money = (value) => `฿${(Number(value) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

export default function ReceiptSheet({ model }) {
  const { shop, meta, customer, lines, totals, footer } = model;
  return (
    <div id="receipt-sheet" className={`receipt-sheet receipt-${model.shop.paperWidth}`}>
      <div className="receipt-center">
        <h1 className="receipt-shop-name">{shop.name}</h1>
        {shop.address && <p>{shop.address}</p>}
        {shop.phone && <p>โทร {shop.phone}</p>}
        {shop.taxId && <p>เลขผู้เสียภาษี {shop.taxId}</p>}
      </div>
      <div className="receipt-divider" />
      <p>บิล #{meta.billNo}</p>
      <p>คิว {meta.queueNumber}</p>
      <p>{meta.dateText} {meta.timeText}</p>
      {meta.table && meta.table !== 'QR' && <p>โต๊ะ {meta.table}</p>}
      <p>{meta.sourceLabel}</p>
      {/* ลูกค้า QR ใส่ชื่อได้แม้ไม่เป็นสมาชิก จึงใช้คำเรียกรวมว่าลูกค้า */}
      {customer && <div className="receipt-customer"><p>ลูกค้า {customer.name}</p>{customer.phone && <p>โทร {customer.phone}</p>}</div>}
      <div className="receipt-divider" />
      {lines.map((line, index) => <div className="receipt-item" key={index}>
        <p>{line.name}</p>
        <div className="receipt-row"><span>x{line.quantity} @ {money(line.unitPrice)}</span><span className="receipt-number">{money(line.lineTotal)}</span></div>
        {line.note && <p className="receipt-note">{line.note}</p>}
      </div>)}
      <div className="receipt-divider" />
      <div className="receipt-row"><span>ยอดก่อนส่วนลด</span><span className="receipt-number">{money(totals.subtotal)}</span></div>
      {totals.discount !== 0 && <div className="receipt-row"><span>ส่วนลด{totals.promotionTitle && ` (${totals.promotionTitle})`}</span><span className="receipt-number">-{money(totals.discount)}</span></div>}
      {(totals.vatIncluded || totals.vat !== 0) && <div className="receipt-row"><span>VAT {totals.vatPercentage}%</span><span className="receipt-number">{money(totals.vat)}</span></div>}
      <div className="receipt-row receipt-total"><span>ยอดสุทธิ</span><span className="receipt-number">{money(totals.total)}</span></div>
      <p className="receipt-center receipt-paid">{meta.paidLabel}</p>
      <div className="receipt-center receipt-footer"><p>{footer.message}</p>{footer.reviewUrl && <p>{footer.reviewUrl}</p>}</div>
    </div>
  );
}

// Tiny download helpers shared by the records views.

export function downloadText(body, filename, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Rows → quoted CSV with a UTF-8 BOM so Excel opens Thai text correctly. */
export const toCsv = (rows) =>
  `\uFEFF${rows.map((r) => r.map((x) => `"${String(x ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')}`;

export const downloadCsv = (rows, filename) => downloadText(toCsv(rows), filename);

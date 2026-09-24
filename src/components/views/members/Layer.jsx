import { createPortal } from 'react-dom';

/**
 * Renders children at the end of <body>. ui/Modal is not portalled while
 * ui/Sheet is, so a confirm opened from inside a sheet would sit under it.
 * Mounting the modal in its own portal (opened after the sheet) keeps it on top.
 */
export default function Layer({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

import { createPortal } from 'react-dom';
import { ConfirmModal } from '../../ui';

/**
 * ConfirmModal that also works while a Sheet is open. Sheets are portalled to
 * <body>; the in-tree Modal would render underneath, so this portals the
 * confirm after them in its own stacking layer (above sheets, below toasts).
 */
export default function TopConfirm(props) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div style={{ position: 'relative', zIndex: 350 }}>
      <ConfirmModal {...props} />
    </div>,
    document.body,
  );
}

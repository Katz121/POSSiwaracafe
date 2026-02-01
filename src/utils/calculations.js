// --- Date & Time Utilities ---

export const getISODate = (date = new Date()) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};

export const getOrderDate = (order) => {
  if (order.date) return String(order.date);
  if (order.createdAt?.seconds) {
    return getISODate(new Date(order.createdAt.seconds * 1000));
  }
  return '';
};

export const isDateInRange = (isoDate, startDate, endDate) => {
  if (!isoDate) return false;
  if (!startDate && !endDate) return true;
  if (startDate && isoDate < startDate) return false;
  if (endDate && isoDate > endDate) return false;
  return true;
};

// --- String Utilities ---

export const getNameKey = (name) => String(name || '').trim();

// --- Data Processing Utilities ---

// Helper function to group items by category
export const groupItemsByCategory = (items, menu = []) => {
  const groups = {};
  (items || []).forEach(item => {
    const fallbackCategory = menu.find(m => m.id === item.id)?.category;
    const category = String(item.category || fallbackCategory || 'ไม่ระบุหมวดหมู่');
    if (!groups[category]) groups[category] = { items: [], total: 0, quantity: 0 };
    groups[category].items.push(item);
    groups[category].total += (Number(item.price) || 0) * (Number(item.quantity) || 0);
    groups[category].quantity += Number(item.quantity) || 0;
  });
  return groups;
};

// --- Image Processing Utilities ---

export const compressImage = (base64Str, maxWidth = 500, maxHeight = 500) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onerror = () => resolve(base64Str); // Fallback to original on error
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
      } else {
        if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
  });
};

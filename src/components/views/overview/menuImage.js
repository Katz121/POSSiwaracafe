// Order line items no longer carry `image` (it is stripped at cart time to keep
// order docs small). Screens that show a sold item's picture look it up from
// the live menu: by id first, then by name, then whatever the old order stored.

export function buildMenuImageLookup(menu = []) {
  const byId = new Map();
  const byName = new Map();
  for (const m of menu) {
    if (!m?.image) continue;
    if (m.id != null && !byId.has(m.id)) byId.set(m.id, m.image);
    if (m.name && !byName.has(m.name)) byName.set(m.name, m.image);
  }
  return (item) => {
    if (!item) return '';
    return (item.id != null && byId.get(item.id))
      || (item.name && byName.get(item.name))
      || item.image
      || '';
  };
}

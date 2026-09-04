const WEEKDAY_KEYS = [
  'อาทิตย์',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์',
];

const formatMoney = value =>
  `฿${Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

const monthName = key => {
  const months = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];
  const [year, month] = key.split('-').map(Number);
  return `${months[month - 1]} ${year}`;
};

// หมวดที่ขายเป็นชิ้น ไม่ใช่แก้ว · ที่เหลือทั้งหมดถือเป็นเครื่องดื่ม
// เขียนแบบ "ยกเว้น" เพื่อให้หมวดเครื่องดื่มใหม่ที่ร้านเพิ่มทีหลังถูกนับเป็นแก้วอัตโนมัติ
const PIECE_CATEGORY_HINTS = ['cake', 'bakery', 'เค้ก', 'เบเกอรี่', 'ขนม'];

export const isPieceCategory = category => {
  const name = String(category || '').trim().toLowerCase();
  return PIECE_CATEGORY_HINTS.some(hint => name.includes(hint));
};

// นับหน่วยที่ขายในบิลหนึ่งใบ แยกแก้ว (เครื่องดื่ม) กับชิ้น (ขนม)
export const countUnits = order => {
  let cups = 0;
  let pieces = 0;

  (order.items || []).forEach(item => {
    const quantity = Number(item.quantity) || 0;
    if (isPieceCategory(item.category)) {
      pieces += quantity;
    } else {
      cups += quantity;
    }
  });

  return { cups, pieces };
};

export const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return false;
  }

  // เทียบด้วยส่วนประกอบวันที่แบบเวลาท้องถิ่น ห้ามใช้ toISOString เพราะมันแปลงเป็น UTC
  // ไทยอยู่ UTC+7 เที่ยงคืนท้องถิ่นจึงกลายเป็นวันก่อนหน้าใน UTC ทำให้ทุกวันถูกตัดทิ้ง
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
};

export function startOf(range, now = new Date()) {
  if (range === 'all') {
    return null;
  }

  if (range === 'month') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const months = range === 'year' ? 12 : range === 'three' ? 3 : 6;
  const date = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const shift = (key, amount) => {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const ratio = (numerator, denominator) =>
  denominator ? `${Math.round((numerator / denominator) * 100)}%` : '0%';

export function buildSalesHistory(orders, expenses, range, now = new Date()) {
  const start = startOf(range, now);
  const length = range === 'month'
    ? 1
    : range === 'year'
      ? 12
      : range === 'three'
        ? 3
        : range === 'six'
          ? 6
          : null;

  // หาช่วงก่อนหน้าเพื่อใช้เปรียบเทียบกับช่วงที่เลือก
  const previousStart = start && length ? shift(start, -length) : null;
  const months = new Map();
  const categories = new Map();
  const previousCategories = new Map();
  const titleMap = new Map();
  const unknown = {
    key: 'unknown',
    bills: [],
    revenue: 0,
    expense: 0,
    cups: 0,
    pieces: 0,
    days: new Map(),
  };

  const bucket = date => {
    if (!validDate(date)) {
      return unknown;
    }

    const key = date.slice(0, 7);
    if (start && key < start) {
      return null;
    }

    if (!months.has(key)) {
      months.set(key, {
        key,
        bills: [],
        revenue: 0,
        expense: 0,
        cups: 0,
        pieces: 0,
        days: new Map(),
      });
    }

    return months.get(key);
  };

  const day = (bucketData, date) => {
    if (!bucketData.days.has(date)) {
      bucketData.days.set(date, {
        key: date,
        bills: [],
        revenue: 0,
        expense: 0,
        cups: 0,
        pieces: 0,
        expenses: [],
      });
    }

    return bucketData.days.get(date);
  };

  const addCategory = (map, expense) => {
    const name = String(expense.category || 'อื่น ๆ').trim() || 'อื่น ๆ';
    if (!map.has(name)) {
      map.set(name, {
        name,
        count: 0,
        amount: 0,
        titles: new Set(),
        records: new Map(),
      });
    }

    const category = map.get(name);
    category.count += 1;
    category.amount += Number(expense.amount) || 0;
    // trim ก่อนเสมอ ไม่งั้น 'ส้ม' กับ 'ส้ม ' ถูกนับเป็นคนละหัวข้อ ยอดจะกระจายจนดูไม่ออก
    const title = String(expense.title || 'ไม่ระบุหัวข้อ').trim() || 'ไม่ระบุหัวข้อ';
    category.titles.add(title);
    if (!category.records.has(title)) {
      category.records.set(title, []);
    }
    category.records.get(title).push(expense);
  };

  orders.forEach(order => {
    if (order.status && order.status !== 'completed') {
      return;
    }

    const date = String(order.date || '');
    const bucketData = bucket(date);
    if (!bucketData) {
      return;
    }

    const { cups, pieces } = countUnits(order);
    bucketData.bills.push(order);
    bucketData.revenue += Number(order.total) || 0;
    bucketData.cups += cups;
    bucketData.pieces += pieces;
    if (bucketData !== unknown) {
      const dayData = day(bucketData, date);
      dayData.bills.push(order);
      dayData.revenue += Number(order.total) || 0;
      dayData.cups += cups;
      dayData.pieces += pieces;
    }
  });

  expenses.forEach(expense => {
    const date = String(expense.date || '');
    const bucketData = bucket(date);
    const amount = Number(expense.amount) || 0;
    if (!bucketData) {
      if (
        previousStart
        && validDate(date)
        && date.slice(0, 7) >= previousStart
        && date.slice(0, 7) < start
      ) {
        addCategory(previousCategories, expense);
      }
      return;
    }

    bucketData.expense += amount;
    if (bucketData !== unknown) {
      const dayData = day(bucketData, date);
      dayData.expense += amount;
      dayData.expenses.push(expense);
    }
    addCategory(categories, expense);
    // trim ก่อนเสมอ ไม่งั้น 'ส้ม' กับ 'ส้ม ' ถูกนับเป็นคนละหัวข้อ ยอดจะกระจายจนดูไม่ออก
    const title = String(expense.title || 'ไม่ระบุหัวข้อ').trim() || 'ไม่ระบุหัวข้อ';
    if (!titleMap.has(title)) {
      titleMap.set(title, []);
    }
    titleMap.get(title).push(expense);
  });

  const ordered = [...months.values()].sort((a, b) => b.key.localeCompare(a.key));
  const visibleUnknown =
    range === 'all' && (unknown.bills.length || unknown.expense > 0) ? unknown : null;
  const allMonths = visibleUnknown ? [...ordered, unknown] : ordered;
  const totals = allMonths.reduce(
    (result, bucketData) => ({
      bills: result.bills + bucketData.bills.length,
      revenue: result.revenue + bucketData.revenue,
      expense: result.expense + bucketData.expense,
      cups: result.cups + bucketData.cups,
      pieces: result.pieces + bucketData.pieces,
    }),
    { bills: 0, revenue: 0, expense: 0, cups: 0, pieces: 0 },
  );
  const catRows = [...categories.values()].sort((a, b) => b.amount - a.amount);
  // คำนวณ trend โดยเทียบยอดรวมครึ่งแรกกับครึ่งหลังของรายการที่เรียงตามวันที่
  const titleRows = [...titleMap].map(([name, records]) => {
    const sorted = [...records].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const middle = Math.ceil(sorted.length / 2);
    const first = sorted
      .slice(0, middle)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const second = sorted
      .slice(middle)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const amount = sorted.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    return {
      name,
      records: sorted,
      count: sorted.length,
      amount,
      average: sorted.length ? amount / sorted.length : 0,
      latest: sorted.at(-1)?.date || '',
      trend: first ? ((second - first) / first) * 100 : null,
    };
  });
  const health = ordered.map(bucketData => ({
    ...bucketData,
    percent: bucketData.revenue ? (bucketData.expense / bucketData.revenue) * 100 : 0,
    profit: bucketData.revenue - bucketData.expense,
  }));
  const avgPercent = health.length
    ? health.reduce((sum, bucketData) => sum + bucketData.percent, 0) / health.length
    : 0;
  const days = allMonths
    .flatMap(bucketData => [...bucketData.days.values()])
    .filter(dayData => dayData.bills.length || dayData.expense);
  const losses = days
    .filter(dayData => dayData.revenue < dayData.expense)
    .sort((a, b) => a.revenue - a.expense - (b.revenue - b.expense));
  // นับเฉพาะวันที่มียอดขายจริง · วันปิดร้านที่ไปซื้อของ (ขาย 0 แต่มีรายจ่าย)
  // ถ้านับรวมด้วยจะทำให้ค่าเฉลี่ยของวันนั้นต่ำผิดความจริง
  const sellingDays = days.filter(dayData => dayData.revenue > 0);
  const weekdays = WEEKDAY_KEYS.map((name, index) => {
    const matchingDays = sellingDays.filter(
      dayData => new Date(`${dayData.key}T00:00:00`).getDay() === index,
    );
    const revenue = matchingDays.reduce((sum, dayData) => sum + dayData.revenue, 0);
    return {
      name,
      days: matchingDays.length,
      revenue,
      average: matchingDays.length ? revenue / matchingDays.length : 0,
    };
  });
  const revenues = days.map(dayData => dayData.revenue).sort((a, b) => a - b);
  const median = revenues.length
    ? revenues.length % 2
      ? revenues[(revenues.length - 1) / 2]
      : (revenues[revenues.length / 2 - 1] + revenues[revenues.length / 2]) / 2
    : 0;
  const lowDays = days
    .filter(dayData => dayData.revenue < median * 0.6)
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, 10);

  // เกณฑ์ต้นทุนคงที่: รายการที่เกิดขึ้นอย่างน้อยครึ่งหนึ่งของวันที่มีข้อมูล
  // days.length === 0 แปลว่าไม่มีข้อมูลในช่วง ห้ามให้ทุกหัวข้อผ่านเกณฑ์
  const fixedTitles = days.length === 0 ? [] : titleRows.filter(
    title => new Set(title.records.map(expense => expense.date).filter(validDate)).size
      >= days.length * 0.5,
  );
  const fixed = fixedTitles.reduce((sum, title) => sum + title.amount, 0);

  // จับหมวดที่น่าจะซ้ำกันด้วยชื่อที่ตัดคำเว้นวรรคและคำทั่วไปออก
  const canon = name => name
    .replaceAll(' ', '')
    .replaceAll('/', '')
    .replaceAll('ๆ', '')
    .replace('และของใช้', '')
    .replace('น้ำ', '');
  const groups = new Map();
  catRows.forEach(category => {
    const key = canon(category.name);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(category);
  });
  const observations = [];
  groups.forEach(group => {
    if (group.length > 1) {
      const amount = group.reduce((sum, category) => sum + category.amount, 0);
      observations.push({
        amount,
        text: [
          `หมวด ${group.map(category => category.name).join(' กับ ')} น่าจะเป็นเรื่องเดียวกัน `,
          `รวมกัน ${formatMoney(amount)} — ถ้ารวมหมวดจะดูแนวโน้มง่ายขึ้น`,
        ].join(''),
      });
    }
  });
  catRows
    .filter(category => category.amount / (totals.expense || 1) > 0.5)
    .forEach(category => {
      observations.push({
        amount: category.amount,
        text: [
          `หมวด ${category.name} กิน ${ratio(category.amount, totals.expense)} ของรายจ่าย `,
          'แต่รวมของหลายอย่างไว้ด้วยกัน ดูรายหัวข้อในตารางด้านบนแทน',
        ].join(''),
      });
    });
  titleRows
    .filter(title => title.count >= 4 && title.trend > 15)
    .forEach(title => {
      observations.push({
        amount: title.amount,
        text: `หัวข้อ ${title.name} มีราคาต่อครั้งครึ่งหลังสูงขึ้น ${Math.round(title.trend)}% เมื่อเทียบกับครึ่งแรก`,
      });
    });
  health
    .filter(bucketData => bucketData.percent > avgPercent + 5)
    .forEach(bucketData => {
      observations.push({
        amount: bucketData.expense,
        text: [
          `${monthName(bucketData.key)} มีสัดส่วนรายจ่ายต่อยอดขาย ${Math.round(bucketData.percent)}% `,
          `สูงกว่าค่าเฉลี่ยของช่วง ${Math.round(avgPercent)} จุด`,
        ].join(''),
      });
    });
  if (days.length && losses.length / days.length > 0.15) {
    observations.push({
      amount: losses.reduce((sum, dayData) => sum + dayData.expense - dayData.revenue, 0),
      text: `มีวันที่ขาดทุน ${losses.length} วัน จาก ${days.length} วัน (${ratio(losses.length, days.length)})`,
    });
  }

  return {
    months: allMonths,
    ordered,
    totals,
    chartMax: Math.max(...ordered.map(bucketData => bucketData.revenue), 1),
    catRows,
    prevCats: previousCategories,
    titleRows,
    health,
    avgPercent,
    days,
    losses,
    weekdays,
    median,
    lowDays,
    fixedTitles,
    fixed,
    observations: observations.sort((a, b) => b.amount - a.amount),
    length,
  };
}

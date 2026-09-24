/**
 * AI Service - Rate-Limited, Cached AI calls through Meta Muse (Firestore job queue)
 *
 * Features:
 * 1. Queue to the shop PC's muse-bridge (no API key in the app)
 * 2. Rate limiting (cooldown between requests)
 * 3. Response caching (reduce API costs)
 * 4. Chat history storage
 * 5. Historical context injection
 */

import { comparisonRanges } from '../components/views/overview/monthCompare';
import { getISODate } from '../utils/calculations';
import {
  AI_RATE_LIMIT_DELAY,
  AI_CACHE_TTL,
  AI_CACHE_MAX_SIZE,
  AI_CHAT_HISTORY_MAX
} from '../config/constants';
import { enqueueAiJob } from './aiQueue';
import { extractJson } from '../utils/museJobs';

// --- Configuration ---
const RATE_LIMIT_COOLDOWN_MS = AI_RATE_LIMIT_DELAY;
const CACHE_TTL_MS = AI_CACHE_TTL;
const MAX_CHAT_HISTORY = AI_CHAT_HISTORY_MAX;

// --- State ---
let lastRequestTime = 0;
let requestCount = 0;
const responseCache = new Map();
const chatHistory = [];

// --- Cache Management ---
// djb2 string hash — hashes the FULL prompt so two prompts that share the same
// length + first 50 chars can no longer collide into one cache entry.
const hashString = (str) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // hash * 33 + c
  }
  return (hash >>> 0).toString(36);
};

const getCacheKey = (prompt, parseAsJson) => {
  const normalized = prompt.trim().toLowerCase();
  return `${normalized.length}_${parseAsJson}_${hashString(normalized)}`;
};

const getFromCache = (key) => {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log('[AI Service] Cache hit');
    return cached.data;
  }
  if (cached) {
    responseCache.delete(key); // Remove expired
  }
  return null;
};

const setCache = (key, data) => {
  // Limit cache size
  if (responseCache.size > AI_CACHE_MAX_SIZE) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
  responseCache.set(key, { data, timestamp: Date.now() });
};

export const clearCache = () => {
  responseCache.clear();
  console.log('[AI Service] Cache cleared');
};

// --- Rate Limiting ---
const checkRateLimit = () => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_COOLDOWN_MS) {
    const waitTime = RATE_LIMIT_COOLDOWN_MS - timeSinceLastRequest;
    return { allowed: false, waitTime };
  }

  return { allowed: true, waitTime: 0 };
};

const updateRateLimit = () => {
  lastRequestTime = Date.now();
  requestCount++;
};

export const getApiStats = () => ({
  requestCount,
  cacheSize: responseCache.size,
  lastRequestTime: lastRequestTime ? new Date(lastRequestTime).toLocaleTimeString() : 'Never',
  chatHistoryCount: chatHistory.length
});

// --- Chat History Management ---
export const addToChatHistory = (role, content, context = {}) => {
  const entry = {
    id: Date.now(),
    role, // 'user' | 'assistant' | 'system'
    content,
    timestamp: new Date().toISOString(),
    context
  };

  chatHistory.push(entry);

  // Trim history if too long
  while (chatHistory.length > MAX_CHAT_HISTORY) {
    chatHistory.shift();
  }

  // Save to localStorage
  try {
    localStorage.setItem('ai_chat_history', JSON.stringify(chatHistory));
  } catch (e) {
    console.warn('[AI Service] Failed to save chat history:', e);
  }

  return entry;
};

export const getChatHistory = () => [...chatHistory];

export const clearChatHistory = () => {
  chatHistory.length = 0;
  try {
    localStorage.removeItem('ai_chat_history');
  } catch (e) {
    console.warn('[AI Service] Failed to clear chat history:', e);
  }
};

export const loadChatHistory = () => {
  try {
    const saved = localStorage.getItem('ai_chat_history');
    if (saved) {
      const parsed = JSON.parse(saved);
      chatHistory.length = 0;
      chatHistory.push(...parsed);
      console.log(`[AI Service] Loaded ${chatHistory.length} chat messages`);
    }
  } catch (e) {
    console.warn('[AI Service] Failed to load chat history:', e);
  }
};

export const exportChatHistory = () => {
  const data = {
    exportedAt: new Date().toISOString(),
    messages: chatHistory
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-chat-history-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// --- Historical Context Builder ---
export const buildHistoricalContext = (orders, expenses, selectedMonth) => {
  if (!orders || !expenses) return '';

  // Get previous month
  const [year, month] = selectedMonth.split('-').map(Number);
  const prevMonth = month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;

  // Calculate current month stats
  const currentMonthOrders = orders.filter(o =>
    o.status === 'completed' && (o.date || '').startsWith(selectedMonth)
  );
  const currentRevenue = currentMonthOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const currentExpenses = expenses.filter(e => (e.date || '').startsWith(selectedMonth));
  const currentExpenseTotal = currentExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Previous month · เดือนปัจจุบันยังไม่จบ ต้องเทียบช่วงวันเดียวกัน (1-24 vs 1-24)
  // ไม่งั้น AI บอกว่ายอดตก ~38% ทุกกลางเดือน ขัดกับแดชบอร์ด (ดู overview/monthCompare.js)
  const ranges = comparisonRanges(selectedMonth, getISODate());
  const inPrev = (d) => Boolean(d) && d >= ranges.previous.start && d <= ranges.previous.end;
  const prevMonthOrders = orders.filter(o =>
    o.status === 'completed' && inPrev(o.date || '')
  );
  const prevRevenue = prevMonthOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const prevExpenses = expenses.filter(e => inPrev(e.date || ''));
  const prevExpenseTotal = prevExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Calculate trends
  const revenueChange = prevRevenue > 0
    ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100)
    : 0;
  const expenseChange = prevExpenseTotal > 0
    ? Math.round(((currentExpenseTotal - prevExpenseTotal) / prevExpenseTotal) * 100)
    : 0;

  // Get 3-month trend
  const months = [];
  for (let i = 2; i >= 0; i--) {
    const m = month - i;
    const y = m <= 0 ? year - 1 : year;
    const adjustedM = m <= 0 ? 12 + m : m;
    months.push(`${y}-${String(adjustedM).padStart(2, '0')}`);
  }

  const monthlyRevenues = months.map(m => {
    const monthOrders = orders.filter(o =>
      o.status === 'completed' && (o.date || '').startsWith(m)
    );
    return monthOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  });

  const trend = monthlyRevenues[2] > monthlyRevenues[0] ? 'ขาขึ้น'
    : monthlyRevenues[2] < monthlyRevenues[0] ? 'ขาลง' : 'คงที่';

  // Day of week analysis
  const dayStats = {};
  currentMonthOrders.forEach(o => {
    const ts = o.date || (o.createdAt?.seconds ? o.createdAt.seconds * 1000 : null);
    if (!ts) return; // no resolvable date → skip instead of polluting a NaN bucket
    const parsed = new Date(ts);
    if (isNaN(parsed.getTime())) return;
    const day = parsed.getDay();
    dayStats[day] = (dayStats[day] || 0) + (Number(o.total) || 0);
  });

  const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
  const bestDays = Object.entries(dayStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([day]) => dayNames[day])
    .join(', ');

  return `
📈 **Historical Context:**
- เทรนด์ 3 เดือนล่าสุด: ${trend} (${monthlyRevenues.map(r => r.toLocaleString()).join(' → ')} บาท)
- เปลี่ยนแปลงจากเดือนก่อน${ranges.partial ? ` (ช่วงวันที่ 1-${ranges.days} เท่ากัน)` : ''}: รายได้ ${revenueChange >= 0 ? '+' : ''}${revenueChange}%, รายจ่าย ${expenseChange >= 0 ? '+' : ''}${expenseChange}%
- วันที่ขายดีที่สุด: ${bestDays || 'ยังไม่มีข้อมูล'}
- ข้อมูลเดือนก่อน (${prevMonth}${ranges.partial ? ` วันที่ 1-${ranges.days} เทียบช่วงเดียวกัน` : ''}): รายได้ ${prevRevenue.toLocaleString()} บาท, ${prevMonthOrders.length} ออเดอร์
`;
};

// --- Main API Call Function ---
// คำขอ AI ทุกตัววิ่งผ่านคิว Firestore ไปที่ Muse บนคอมที่ร้าน (ดู services/aiQueue.js)
// jobType: 'stockSuggest' (Muse คิดนานขึ้น) · อื่นๆ ใช้ 'json' / 'text' ตาม parseAsJson
export const callAiSecure = async (prompt, options = {}) => {
  const {
    parseAsJson = false,
    useCache = true,
    skipRateLimit = false,
    saveToChatHistory = false,
    historyContext = null,
    jobType = null,
  } = options;

  if (!String(prompt || '').trim()) {
    return { success: false, data: null, error: 'ไม่มีคำถามส่งให้ AI' };
  }

  if (!skipRateLimit) {
    const rateCheck = checkRateLimit();
    if (!rateCheck.allowed) {
      return {
        success: false,
        data: null,
        error: `กรุณารอ ${Math.ceil(rateCheck.waitTime / 1000)} วินาที`,
        rateLimited: true,
        waitTime: rateCheck.waitTime
      };
    }
  }

  const enhancedPrompt = historyContext ? `${historyContext}

${prompt}` : prompt;
  const cacheKey = getCacheKey(enhancedPrompt, parseAsJson);
  if (useCache) {
    const cached = getFromCache(cacheKey);
    if (cached) return { success: true, data: cached, fromCache: true };
  }

  if (saveToChatHistory) addToChatHistory('user', prompt);
  updateRateLimit();

  const type = jobType || (parseAsJson ? 'json' : 'text');
  const res = await enqueueAiJob({ type, prompt: enhancedPrompt });
  if (!res.ok) {
    return { success: false, data: null, error: `AI ไม่สามารถตอบได้ในขณะนี้: ${res.error}` };
  }

  let result = res.result;
  if (parseAsJson && typeof result === 'string') {
    try { result = extractJson(result); } catch (e) {
      return { success: false, data: null, error: `AI ตอบผิดรูปแบบ: ${e.message}` };
    }
  }
  if (!parseAsJson && typeof result !== 'string') result = JSON.stringify(result);

  if (useCache) setCache(cacheKey, result);
  if (saveToChatHistory) {
    addToChatHistory('assistant', typeof result === 'string' ? result : JSON.stringify(result));
  }
  return { success: true, data: result, raw: res.raw, fromCache: false, durationMs: res.durationMs };
};

// Initialize - load chat history on module load
loadChatHistory();

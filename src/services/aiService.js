/**
 * AI Service - Secure, Rate-Limited, and Cached Gemini API Integration
 *
 * Features:
 * 1. Secure API proxy (ready for backend migration)
 * 2. Rate limiting (cooldown between requests)
 * 3. Response caching (reduce API costs)
 * 4. Chat history storage
 * 5. Historical context injection
 */

import {
  AI_RATE_LIMIT_DELAY,
  AI_CACHE_TTL,
  AI_CACHE_MAX_SIZE,
  AI_MAX_RETRIES,
  AI_CHAT_HISTORY_MAX
} from '../config/constants';

// --- Configuration ---
const AI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const RATE_LIMIT_COOLDOWN_MS = AI_RATE_LIMIT_DELAY;
const CACHE_TTL_MS = AI_CACHE_TTL;
const MAX_CHAT_HISTORY = AI_CHAT_HISTORY_MAX;
const MAX_RETRIES = AI_MAX_RETRIES;

// --- State ---
let lastRequestTime = 0;
let requestCount = 0;
const responseCache = new Map();
const chatHistory = [];

// --- Cache Management ---
const getCacheKey = (prompt, parseAsJson) => {
  // Create a hash-like key from the prompt
  const normalized = prompt.trim().toLowerCase().substring(0, 500);
  return `${normalized.length}_${parseAsJson}_${normalized.substring(0, 50)}`;
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

  // Calculate previous month stats
  const prevMonthOrders = orders.filter(o =>
    o.status === 'completed' && (o.date || '').startsWith(prevMonth)
  );
  const prevRevenue = prevMonthOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const prevExpenses = expenses.filter(e => (e.date || '').startsWith(prevMonth));
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
    const day = new Date(o.date || o.createdAt?.seconds * 1000).getDay();
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
- เปลี่ยนแปลงจากเดือนก่อน: รายได้ ${revenueChange >= 0 ? '+' : ''}${revenueChange}%, รายจ่าย ${expenseChange >= 0 ? '+' : ''}${expenseChange}%
- วันที่ขายดีที่สุด: ${bestDays || 'ยังไม่มีข้อมูล'}
- ข้อมูลเดือนก่อน (${prevMonth}): รายได้ ${prevRevenue.toLocaleString()} บาท, ${prevMonthOrders.length} ออเดอร์
`;
};

// --- Main API Call Function ---
export const callGeminiAPISecure = async (apiKey, prompt, options = {}) => {
  const {
    parseAsJson = false,
    useCache = true,
    skipRateLimit = false,
    saveToChatHistory = false,
    historyContext = null
  } = options;

  // Validate API key
  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      data: null,
      error: 'API Key ไม่ถูกต้อง กรุณาตั้งค่าใน Admin'
    };
  }

  // Check rate limit
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

  // Check cache
  const cacheKey = getCacheKey(prompt, parseAsJson);
  if (useCache) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      return { success: true, data: cached, fromCache: true };
    }
  }

  // Build enhanced prompt with history context
  let enhancedPrompt = prompt;
  if (historyContext) {
    enhancedPrompt = historyContext + '\n\n' + prompt;
  }

  // Save user query to history
  if (saveToChatHistory) {
    addToChatHistory('user', prompt);
  }

  // Update rate limit
  updateRateLimit();

  // Try API call with retries
  let lastError = null;
  const key = apiKey.trim();
  const proxyUrl = import.meta.env.VITE_GEMINI_PROXY_URL;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    try {
      let text;

      if (proxyUrl) {
        // Use Cloudflare Worker proxy (production - API key hidden server-side)
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: enhancedPrompt, parseAsJson })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        text = data.text;
      } else {
        // Direct call fallback (development only)
        let fetchedText = null;
        for (const model of AI_MODELS) {
          try {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: enhancedPrompt }] }],
                  generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
                })
              }
            );
            const data = await response.json();
            if (data.error) {
              if (data.error.message?.includes('quota') || data.error.message?.includes('rate')) continue;
              throw new Error(data.error.message);
            }
            fetchedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (fetchedText) break;
          } catch (modelErr) {
            lastError = modelErr.message;
            continue;
          }
        }
        text = fetchedText;
      }

      if (text) {
        let result;

        if (parseAsJson) {
          const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
          result = JSON.parse(cleanText);
        } else {
          result = text;
        }

        // Cache the result
        if (useCache) {
          setCache(cacheKey, result);
        }

        // Save assistant response to history
        if (saveToChatHistory) {
          addToChatHistory('assistant', typeof result === 'string' ? result : JSON.stringify(result));
        }

        return {
          success: true,
          data: result,
          raw: text,
          fromCache: false
        };
      }
    } catch (e) {
      console.warn(`[AI Service] Error (retry ${retry}):`, e.message);
      lastError = e.message;

      // For errors, try retry
      if (retry < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
      }
    }
  }

  return {
    success: false,
    data: null,
    error: `AI ไม่สามารถตอบได้ในขณะนี้: ${lastError}`
  };
};

// --- Gemini Image Generation (Nano Banana Pro) ---
const IMAGE_MODELS = ['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview', 'gemini-2.0-flash-exp'];

export const generateMenuImage = async (apiKey, menuName, category = '') => {
  if (!apiKey || !apiKey.trim()) {
    return { success: false, imageBase64: null, error: 'API Key ไม่ถูกต้อง' };
  }

  const key = apiKey.trim();
  let lastError = null;
  const prompt = `Professional food photography of "${menuName}" (${category || 'Thai cafe menu item'}).
Top-down view on a clean wooden table, soft natural lighting, appetizing presentation,
Thai cafe style, high quality, no text or watermarks.`;

  for (const model of IMAGE_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE']
            }
          })
        }
      );

      const data = await response.json();
      console.log(`[AI Image] ${model} response:`, JSON.stringify(data).substring(0, 300));

      if (data.error) {
        lastError = data.error.message;
        console.warn(`[AI Image] ${model} error:`, data.error.message);
        continue;
      }

      const parts = data?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

      if (imagePart) {
        const base64 = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        return { success: true, imageBase64: base64, error: null };
      }

      // Model responded but no image in parts
      lastError = `${model}: ไม่มีรูปภาพใน response (${parts.length} parts)`;
      console.warn(`[AI Image] ${lastError}`);
    } catch (e) {
      lastError = e.message;
      console.warn(`[AI Image] ${model} failed:`, e.message);
      continue;
    }
  }

  return { success: false, imageBase64: null, error: lastError || 'ไม่สามารถสร้างรูปภาพได้ ลองอีกครั้ง' };
};

// --- Wrapper for existing code compatibility ---
export const createGeminiCaller = (apiKey) => {
  return async (prompt, parseAsJson = false) => {
    return callGeminiAPISecure(apiKey, prompt, { parseAsJson });
  };
};

// Initialize - load chat history on module load
loadChatHistory();

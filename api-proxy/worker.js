/**
 * Cloudflare Worker - Gemini API Proxy
 * ซ่อน API key ฝั่ง server ไม่เปิดเผยให้ client
 *
 * Deploy: wrangler deploy
 * Secret: wrangler secret put GEMINI_API_KEY
 */

const ALLOWED_ORIGINS = [
  'https://possiwaracafe.pages.dev',
  'http://localhost:5173',
  'http://192.168.1.152:5173'
];

const AI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405, headers }
      );
    }

    // Validate API key exists in env
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'API key not configured on server' },
        { status: 500, headers }
      );
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers }
      );
    }

    const { prompt, parseAsJson, temperature = 0.7, maxOutputTokens = 2048 } = body;

    if (!prompt) {
      return Response.json(
        { error: 'Missing prompt' },
        { status: 400, headers }
      );
    }

    // Try each model until one succeeds
    let lastError = null;

    for (const model of AI_MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature, maxOutputTokens }
            })
          }
        );

        const data = await response.json();

        if (data.error) {
          lastError = data.error.message;
          if (data.error.message.includes('quota') || data.error.message.includes('rate')) {
            continue; // Try next model
          }
          throw new Error(data.error.message);
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
          return Response.json(
            { success: true, text, model },
            { status: 200, headers }
          );
        }
      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    return Response.json(
      { error: lastError || 'All models failed' },
      { status: 502, headers }
    );
  }
};

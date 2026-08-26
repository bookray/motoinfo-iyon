/**
 * Cloudflare Worker Proxy for Telegram Bot (TeleGuard) & Google Gemini AI
 * 
 * Instructions:
 * 1. Create a new Cloudflare Worker in your Cloudflare Dashboard (Workers & Pages -> Create Application).
 * 2. Copy the entire contents of this file and paste them into the Worker editor.
 * 3. Deploy the Worker.
 * 4. Copy the Worker URL (e.g., https://your-worker-name.workers.dev) and paste it into the Web Admin Settings:
 *    - In "Cloudflare Worker URL" for Telegram Webhook routing
 *    - In "Telegram API Proxy (Reverse Proxy)" or "Кастомный Base URL для Gemini" for Gemini AI proxying
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Setup standard CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key, X-Title, HTTP-Referer',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. WEBHOOK PROXY (Incoming updates from Telegram to TeleGuard Admin Panel)
      // Path: /webhook?target=https://ais-dev-.../telegram
      if (url.pathname === '/webhook' || url.pathname === '/telegram') {
        const target = url.searchParams.get('target');
        if (!target) {
          return new Response(JSON.stringify({ error: 'Missing target parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const body = await request.text();
        
        // Forward the update to our target App URL
        const forwardHeaders = new Headers();
        forwardHeaders.set('Content-Type', 'application/json');
        
        const response = await fetch(target, {
          method: 'POST',
          headers: forwardHeaders,
          body: body
        });

        const resText = await response.text();
        return new Response(resText, {
          status: response.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // 2. GOOGLE GEMINI API PROXY (Bypass regional "User location is not supported" restrictions)
      // Path: /v1beta/* or /gemini/* or /v1/*
      if (url.pathname.startsWith('/v1beta') || url.pathname.startsWith('/gemini') || url.pathname.startsWith('/v1/')) {
        const cleanPath = url.pathname.startsWith('/gemini') 
          ? url.pathname.replace(/^\/gemini/, '') 
          : url.pathname;
        const geminiUrl = `https://generativelanguage.googleapis.com${cleanPath}${url.search}`;

        // Clean headers for Google APIs
        const cleanHeaders = new Headers();
        for (const [key, value] of request.headers.entries()) {
          const lowerKey = key.toLowerCase();
          if (
            lowerKey !== 'host' &&
            lowerKey !== 'content-length' &&
            !lowerKey.startsWith('cf-') &&
            !lowerKey.startsWith('x-real-')
          ) {
            cleanHeaders.set(key, value);
          }
        }
        if (!cleanHeaders.has('Content-Type') && request.method !== 'GET') {
          cleanHeaders.set('Content-Type', 'application/json');
        }

        let bodyPayload = null;
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          bodyPayload = await request.arrayBuffer();
        }

        const response = await fetch(geminiUrl, {
          method: request.method,
          headers: cleanHeaders,
          body: bodyPayload
        });

        const resHeaders = new Headers(response.headers);
        for (const [key, val] of Object.entries(corsHeaders)) {
          resHeaders.set(key, val);
        }

        return new Response(response.body, {
          status: response.status,
          headers: resHeaders
        });
      }

      // 3. TELEGRAM API PROXY (Outgoing requests from Telegraf inside container to Telegram)
      // Path: /bot<token>/<method>
      if (url.pathname.startsWith('/bot')) {
        const telegramUrl = `https://api.telegram.org${url.pathname}${url.search}`;
        
        // Clean and prepare headers for Telegram API
        const cleanHeaders = new Headers();
        for (const [key, value] of request.headers.entries()) {
          const lowerKey = key.toLowerCase();
          // IMPORTANT: Remove host and CF-specific headers to prevent API rejection/TLS errors
          if (
            lowerKey !== 'host' &&
            lowerKey !== 'content-length' &&
            !lowerKey.startsWith('cf-') &&
            !lowerKey.startsWith('x-real-')
          ) {
            cleanHeaders.set(key, value);
          }
        }

        // Forward body safely
        let bodyPayload = null;
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          bodyPayload = await request.arrayBuffer();
        }

        // Fetch from Telegram API
        const response = await fetch(telegramUrl, {
          method: request.method,
          headers: cleanHeaders,
          body: bodyPayload
        });

        // Return the response back to the app
        const resHeaders = new Headers(response.headers);
        // Inject CORS headers
        for (const [key, val] of Object.entries(corsHeaders)) {
          resHeaders.set(key, val);
        }

        return new Response(response.body, {
          status: response.status,
          headers: resHeaders
        });
      }

      // 4. Status/Ping Route
      return new Response(JSON.stringify({
        status: 'online',
        message: 'TeleGuard Multi-Proxy (Telegram API + Google Gemini AI) is running successfully!',
        capabilities: ['telegram_bot_proxy', 'google_gemini_proxy', 'webhook_proxy'],
        endpoints: {
          telegramProxy: '/bot<token>/getMe',
          geminiProxy: '/v1beta/models/gemini-2.0-flash:generateContent?key=<API_KEY>',
          webhookProxy: '/webhook?target=https://your-app-url/telegram'
        }
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};

import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Telegraf } from 'telegraf';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { GoogleGenAI } from '@google/genai';
import { db } from './database';
import { FilterSettings, Chat, BotSettings, ActiveMuteEntry, CompanionBotSettings } from './types';
import { CHATS_CATALOG, findChatInCatalog, getChatSummaries, addChatSummary, ChatDailySummary, loadRealDigestsFromDatabase, CHAT_TO_DB_MAPPING } from './chatsCatalog';
import { buildExportXml, saveXmlExportToFile, getLatestExportXml, getExportMetadata } from './xmlExport';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'teleguard-secret-key-2026';

const DEPRECATED_GEMINI_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro'
]);

function sanitizeGeminiModel(model?: string): string {
  const trimmed = (model || '').trim();
  if (!trimmed || DEPRECATED_GEMINI_MODELS.has(trimmed)) {
    return 'gemini-3.1-flash-lite';
  }
  return trimmed;
}

let geminiClient: GoogleGenAI | null = null;
let lastGeminiKey: string | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Ключ GEMINI_API_KEY не настроен. Укажите ключ в панели управления (ИИ-Суммаризация -> Настройки ИИ).');
  }
  if (!geminiClient || lastGeminiKey !== apiKey) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
    lastGeminiKey = apiKey;
  }
  return geminiClient;
}

function getProjectDate(dateInput: Date | number | string = new Date()): { dateObj: Date, dateStr: string, hour: number, minute: number, dayIndex: number, formatted: string } {
  const date = typeof dateInput === 'object' && dateInput instanceof Date ? dateInput : new Date(dateInput);
  const tzOffset = typeof (settings as any)?.timezoneOffset === 'number' ? (settings as any).timezoneOffset : 3;
  const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
  const adjustedDate = new Date(utcMs + (tzOffset * 3600000));
  const hour = adjustedDate.getHours();
  const minute = adjustedDate.getMinutes();
  const jsDay = adjustedDate.getDay();
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon, 6=Sun
  const y = adjustedDate.getFullYear();
  const m = String(adjustedDate.getMonth() + 1).padStart(2, '0');
  const d = String(adjustedDate.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;
  const formatted = `${d}.${m}.${y}`;
  return { dateObj: adjustedDate, dateStr, hour, minute, dayIndex, formatted };
}

function getProjectDateFormatted(dateInput: Date | number | string = new Date()): string {
  const { dateObj } = getProjectDate(dateInput);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj);
}

function shiftHourlyStats(hourly: Record<string, any>, offset: number): Record<string, any> {
  if (!hourly || typeof hourly !== 'object') return {};
  const shifted: Record<string, any> = {};
  for (const [hStr, val] of Object.entries(hourly)) {
    const h = parseInt(hStr, 10);
    if (!isNaN(h) && val) {
      const newH = (h + offset + 24) % 24;
      shifted[newH] = val;
    }
  }
  return shifted;
}

function getEffectiveWebAppUrl(reqOrigin?: string): string {
  if (settings?.webAppUrl && settings.webAppUrl.trim()) {
    return settings.webAppUrl.trim();
  }
  if (process.env.APP_URL && process.env.APP_URL.trim()) {
    return process.env.APP_URL.trim().replace('ais-dev-', 'ais-pre-');
  }
  if (reqOrigin && reqOrigin.startsWith('http')) {
    return reqOrigin.replace('ais-dev-', 'ais-pre-');
  }
  return 'https://ais-pre-2yzww6kqlfl4r7wmyqj4ri-313227547728.europe-west2.run.app';
}

function verifyTelegramWebAppData(initData: string, botToken: string): { isValid: boolean; user?: any } {
  if (!initData || !botToken) return { isValid: false };
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { isValid: false };

    params.delete('hash');
    const sortedKeys = Array.from(params.keys()).sort();
    const dataCheckString = sortedKeys.map(key => `${key}=${params.get(key)}`).join('\n');

    // HMAC-SHA256("WebAppData", botToken)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return { isValid: false };
    }

    const userStr = params.get('user');
    const user = userStr ? JSON.parse(userStr) : null;
    return { isValid: true, user };
  } catch (err) {
    console.error('Failed to verify Telegram WebApp data:', err);
    return { isValid: false };
  }
}

function getGeminiEffectiveBaseUrl(options?: { customBaseUrl?: string; proxySource?: string }): string | null {
  if (options?.customBaseUrl !== undefined && options.customBaseUrl.trim() !== '') {
    return options.customBaseUrl.trim();
  }

  const source = options?.proxySource || settings?.geminiProxySource || 'auto';
  
  if (source === 'direct') {
    return null;
  }

  if (source === 'custom' && settings?.geminiBaseUrl) {
    return settings.geminiBaseUrl.trim();
  }

  if (source === 'cf_worker' && settings?.cfWorkerUrl && !settings.disableCloudflare) {
    return settings.cfWorkerUrl.trim();
  }

  // 'auto' mode or default:
  if (settings?.geminiBaseUrl && settings.geminiBaseUrl.trim()) {
    return settings.geminiBaseUrl.trim();
  }

  if (settings?.geminiUseProxy === false) {
    return null;
  }

  // Use Cloudflare Worker if available (it proxies /v1beta/* to Google)
  if (settings?.cfWorkerUrl && !settings.disableCloudflare) {
    return settings.cfWorkerUrl.trim();
  }

  // NOTE: We do NOT use telegramApiRoot as a Gemini proxy because Telegram API proxies return 404 for Google endpoints!
  return null;
}

async function generateAIResponse(promptText: string, options?: { model?: string }): Promise<string> {
  const provider = settings?.aiProvider || 'gemini';

  if (provider === 'openrouter') {
    const apiKey = settings?.openRouterApiKey;
    if (!apiKey) {
      throw new Error('API-ключ OpenRouter не указан. Введите ключ в настройках ИИ.');
    }
    let model = options?.model || settings?.openRouterModel || 'google/gemini-2.0-flash-001';
    if (model === 'google/gemini-2.5-flash') {
      model = 'google/gemini-2.0-flash-001';
    }
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://openrouter.ai',
        'X-Title': 'TeleGuard Bot Manager',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: promptText }]
      }),
      signal: AbortSignal.timeout(45000)
    });

    if (!response.ok) {
      const errBody = await response.text();
      if (errBody.includes('Access denied by security policy')) {
        throw new Error(`OpenRouter HTTP ${response.status}: Access denied by security policy.\n\n💡 Причина: В настройках API-ключа на openrouter.ai/keys включено ограничение по Allowed Origins или разрешенным моделям. Создайте новый API-ключ без ограничений (Default), либо проверьте баланс аккаунта.`);
      }
      throw new Error(`OpenRouter API error (HTTP ${response.status}): ${errBody}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Получен пустой ответ от OpenRouter.');
    return text;
  }

  if (provider === 'custom') {
    const endpoint = settings?.customAiEndpoint;
    const apiKey = settings?.customAiApiKey;
    const model = options?.model || settings?.customAiModel || 'gpt-4o-mini';
    if (!endpoint) {
      throw new Error('URL кастомного OpenAI-совместимого эндпоинта не указан.');
    }

    const cleanEndpoint = endpoint.replace(/\/$/, '');
    const url = cleanEndpoint.endsWith('/chat/completions') ? cleanEndpoint : `${cleanEndpoint}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: promptText }]
      }),
      signal: AbortSignal.timeout(45000)
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Custom AI error (HTTP ${response.status}): ${errBody}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Получен пустой ответ от кастомного ИИ.');
    return text;
  }

  // Default: Google Gemini API
  const geminiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error('Ключ Google Gemini API не задан. Введите ключ в панели управления в разделе «ИИ-Суммаризация» или «Настройки».');
  }

  const initialModel = sanitizeGeminiModel(options?.model || settings?.geminiModel || 'gemini-3.1-flash-lite');

  // Fallback to active, verified models in Google API (prioritize flash-lite for speed and stability)
  const candidateModels = Array.from(new Set([
    initialModel,
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ]));

  const effectiveBaseUrl = getGeminiEffectiveBaseUrl();

  const executeGeminiSingle = async (modelToUse: string, baseUrl: string | null): Promise<string> => {
    if (baseUrl) {
      const cleanBase = baseUrl.replace(/\/$/, '');
      const url = `${cleanBase}/v1beta/models/${modelToUse}:generateContent?key=${geminiKey.trim()}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        }),
        signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) {
        const errText = await response.text();
        const errObj: any = new Error(`Gemini Proxy (${cleanBase}) HTTP ${response.status}: ${errText}`);
        errObj.status = response.status;
        errObj.raw = errText;
        throw errObj;
      }
      const data: any = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini вернул пустой ответ через прокси');
      return text;
    } else {
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: modelToUse,
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }]
          }
        ]
      });
      const text = response.text;
      if (!text) throw new Error('Gemini вернул пустой ответ');
      return text;
    }
  };

  let lastErr: any = null;

  for (let i = 0; i < candidateModels.length; i++) {
    const currentModel = candidateModels[i];
    try {
      return await executeGeminiSingle(currentModel, effectiveBaseUrl);
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || String(err);
      const is404 = err?.status === 404 || msg.includes('404') || msg.includes('is no longer available') || msg.includes('not found');
      const is429 = err?.status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded');
      const is503 = err?.status === 503 || msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE') || msg.includes('Service Unavailable');
      const isTimeout = msg.includes('timeout') || msg.includes('aborted');
      const isFetchFailed = msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('socket hang up');
      const isRegionError = !effectiveBaseUrl && (msg.includes('User location is not supported') || msg.includes('FAILED_PRECONDITION'));

      // If region blocked and proxy available, try proxy for this model immediately
      if (isRegionError) {
        const fallbackProxy = (settings?.cfWorkerUrl && !settings.disableCloudflare ? settings.cfWorkerUrl : null) || (settings?.geminiBaseUrl ? settings.geminiBaseUrl : null);
        if (fallbackProxy) {
          console.log(`[Gemini] Direct connection blocked by region. Trying via proxy (${fallbackProxy}) for model ${currentModel}...`);
          try {
            return await executeGeminiSingle(currentModel, fallbackProxy);
          } catch (proxyErr: any) {
            lastErr = proxyErr;
          }
        }
      }

      // If transient error (503 high demand, 429 rate limit, 404, timeout, fetch failure) and we have fallback models left, try next model
      const isTransient = is404 || is429 || is503 || isTimeout || isFetchFailed;
      if (isTransient && i < candidateModels.length - 1) {
        const reasonLabel = is503 ? '503 (Высокая нагрузка Google / High Demand)' : is429 ? '429 (Лимит запросов)' : isTimeout ? 'Таймаут ответа' : isFetchFailed ? 'Сбой соединения' : '404';
        console.warn(`[Gemini] Модель ${currentModel} вернула ${reasonLabel}. Пробуем резервную активную модель ${candidateModels[i + 1]} через 1.5 сек...`);
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      // If last model or other error, break loop
      break;
    }
  }

  // Handle final error formatting
  const finalMsg = lastErr?.message || String(lastErr);
  if (finalMsg.includes('503') || finalMsg.includes('high demand') || finalMsg.includes('UNAVAILABLE')) {
    throw new Error(`❌ Сервис Google Gemini временно перегружен (HTTP 503 UNAVAILABLE / High Demand).\n\n💡 Модель испытывает пиковую нагрузку. Рекомендуем в «Настройках ИИ» выбрать стабильную модель gemini-3.1-flash-lite или gemini-flash-lite-latest, либо переключиться на OpenRouter.`);
  }
  if (finalMsg.includes('429') || finalMsg.includes('RESOURCE_EXHAUSTED') || finalMsg.includes('Quota exceeded')) {
    const retryMatch = finalMsg.match(/retry in\s+([0-9.]+\s*s(?:econds?)?)/i);
    const retryTime = retryMatch ? retryMatch[1] : '20-30 секунд';
    throw new Error(`❌ Превышен лимит запросов Google Gemini (HTTP 429 RESOURCE_EXHAUSTED).\n\n💡 Google API Free Tier временно ограничил запросы (квота 15-20 req/min). Пожалуйста, подождите ${retryTime} перед повторной генерацией, либо выберите модель gemini-3.1-flash-lite / OpenRouter в настройках ИИ.`);
  }

  if (finalMsg.includes('is no longer available') || (finalMsg.includes('404') && finalMsg.includes('models/'))) {
    throw new Error(`❌ Выбранная модель устарела или недоступна в Google API (HTTP 404).\n\n💡 Решение: В разделе «Настройки ИИ» выберите актуальную модель: gemini-3.1-flash-lite (рекомендуется), gemini-3.8-flash или gemini-flash-lite-latest.`);
  }

  if (finalMsg.includes('User location is not supported') || finalMsg.includes('FAILED_PRECONDITION')) {
    throw new Error('❌ Ошибка Google Gemini: Геолокация сервера ограничена Google (User location is not supported).\n\n💡 Решение:\n1. Переключитесь на OpenRouter (вкладка ИИ-Суммаризация -> Настройки ИИ) — работает без региональных ограничений.\n2. Или разверните Cloudflare Worker по инструкции и укажите его URL в Настройках.');
  }

  throw lastErr;
}

const callAiService = generateAIResponse;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

let detectedAppUrl: string | null = null;
let isPollingMode = true;

app.use((req: any, res: any, next: any) => {
  const xForwardedHost = req.headers['x-forwarded-host'];
  const xForwardedProto = req.headers['x-forwarded-proto'] || 'https';
  const useWebhooks = process.env.USE_WEBHOOKS === 'true';

  if ((xForwardedHost || process.env.APP_URL) && useWebhooks) {
    let currentUrl = '';
    if (process.env.APP_URL) {
      currentUrl = process.env.APP_URL;
    } else {
      const hostStr = Array.isArray(xForwardedHost) ? xForwardedHost[0] : xForwardedHost;
      currentUrl = `${xForwardedProto}://${hostStr}`;
    }
    
    if (detectedAppUrl !== currentUrl) {
      console.log(`Auto-detected public App URL: ${currentUrl}`);
      detectedAppUrl = currentUrl;
      
      const cfWorkerUrl = (typeof settings !== 'undefined' && settings.disableCloudflare) 
        ? null 
        : ((typeof settings !== 'undefined' && settings.cfWorkerUrl) || process.env.CF_WORKER_URL);

      if (bot && cfWorkerUrl) {
        // Run webhook registration asynchronously in the background so it doesn't block the HTTP request
        (async () => {
          try {
            const cleanWorkerUrl = cfWorkerUrl.replace(/\/$/, "");
            const targetWebhookUrl = `${cleanWorkerUrl}/webhook?target=${encodeURIComponent(currentUrl + "/telegram")}`;
            console.log(`Re-registering Telegram Webhook with target (background): ${targetWebhookUrl}`);
            await bot.telegram.setWebhook(targetWebhookUrl, {
              allowed_updates: ['message', 'edited_message', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request', 'message_reaction']
            });
            console.log(`Telegram bot webhook successfully configured via Cloudflare Worker at: ${cleanWorkerUrl}`);
          } catch (err: any) {
            console.error(`Failed to auto-update webhook with target URL:`, err.message || err);
          }
        })();
      }
    }
  }
  next();
});

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token || token === 'null') return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

// API Routes
app.get('/api/health', async (req, res) => {
  let cfStatus = 'offline';
  const isCfDisabled = typeof settings !== 'undefined' && settings.disableCloudflare;
  const cfWorkerUrl = isCfDisabled ? null : ((typeof settings !== 'undefined' && settings.cfWorkerUrl) || process.env.CF_WORKER_URL);
  
  if (isCfDisabled) {
    cfStatus = 'disabled';
  } else if (cfWorkerUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const cfRes = await fetch(cfWorkerUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (cfRes.ok) {
        cfStatus = 'online';
      }
    } catch (err) {
      // fail silently, status remains offline
    }
  } else {
    cfStatus = 'disabled';
  }

  let proxyStatus = 'disabled';
  const proxyUrl = settings?.telegramApiRoot || process.env.TELEGRAM_API_ROOT;
  if (proxyUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const cleanUrl = proxyUrl.replace(/\/$/, '');
      const testToken = settings?.botToken || process.env.TELEGRAM_BOT_TOKEN || '123456:dummy';
      const proxyRes = await fetch(`${cleanUrl}/bot${testToken}/getMe`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (proxyRes.status === 200 || proxyRes.status === 401 || proxyRes.status === 400 || proxyRes.status === 404) {
        proxyStatus = 'online';
      } else {
        proxyStatus = 'offline';
      }
    } catch (err) {
      proxyStatus = 'offline';
    }
  }

  res.json({ 
    status: 'ok', 
    botActive: !!bot,
    dbType: process.env.DB_TYPE || 'FIREBASE',
    cfStatus,
    proxyStatus
  });
});

app.post('/api/test-proxy', authenticateToken, async (req, res) => {
  try {
    const { proxyUrl: customProxyUrl, token: customToken } = req.body;
    const proxyUrl = customProxyUrl || settings.telegramApiRoot || process.env.TELEGRAM_API_ROOT;
    const token = customToken || settings.botToken || process.env.TELEGRAM_BOT_TOKEN;

    if (!proxyUrl) {
      return res.status(400).json({ success: false, error: 'URL прокси не указан' });
    }

    const cleanProxyUrl = proxyUrl.replace(/\/$/, '');
    const startTime = Date.now();
    
    let httpPingOk = false;
    let httpPingTime = 0;
    let httpError = '';

    // 1. HTTP ping via Telegram proxy
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const pingTestToken = token || '123456:dummy';
      const pingRes = await fetch(`${cleanProxyUrl}/bot${pingTestToken}/getMe`, { signal: controller.signal });
      clearTimeout(timeoutId);
      httpPingTime = Date.now() - startTime;
      if (pingRes.status === 200 || pingRes.status === 401 || pingRes.status === 400 || pingRes.status === 404) {
        httpPingOk = true;
      } else {
        httpError = `HTTP статус ${pingRes.status}`;
      }
    } catch (err: any) {
      httpError = err.message || 'Таймаут или ошибка сети';
    }

    // 2. Telegram API getMe check via proxy
    let apiOk = false;
    let botUsername = '';
    let apiError = '';
    let apiTime = 0;

    if (token) {
      const apiStartTime = Date.now();
      try {
        const getMeUrl = `${cleanProxyUrl}/bot${token}/getMe`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const apiRes = await fetch(getMeUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        apiTime = Date.now() - apiStartTime;

        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data.ok && data.result) {
            apiOk = true;
            botUsername = data.result.username;
          } else {
            apiError = data.description || 'Ошибка API Telegram';
          }
        } else {
          const errText = await apiRes.text().catch(() => '');
          apiError = `HTTP ${apiRes.status}: ${errText.slice(0, 100)}`;
        }
      } catch (err: any) {
        apiError = err.message || 'Ошибка подключения к API Telegram через прокси';
      }
    } else {
      apiError = 'Токен бота не задан';
    }

    // 3. Optional message delivery test if infoChatId is set
    let deliveryOk = false;
    let deliveryMessage = '';

    if (apiOk && token) {
      const targetChat = settings.infoChatId;
      if (targetChat) {
        try {
          const sendUrl = `${cleanProxyUrl}/bot${token}/sendMessage`;
          const testMsgRes = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: targetChat,
              text: `🧪 *Тест Telegram API Proxy*\n\nЗапрос успешно прошёл через Nginx Reverse Proxy!\n⏱️ Задержка: ${apiTime} мс\n📅 Время: ${new Date().toLocaleString('ru-RU')}`,
              parse_mode: 'Markdown'
            })
          });
          const sendData = await testMsgRes.json();
          if (sendData.ok) {
            deliveryOk = true;
            deliveryMessage = `Тестовое сообщение успешно отправлено в чат ${targetChat}`;
          } else {
            deliveryMessage = `Не удалось отправить тестовое сообщение в чат ${targetChat}: ${sendData.description}`;
          }
        } catch (err: any) {
          deliveryMessage = `Ошибка отправки тестового сообщения: ${err.message}`;
        }
      } else {
        deliveryMessage = 'Чат для уведомлений (Info Chat ID) не заполнен в настройках, доставка пропущена (getMe прошёл успешно)';
      }
    }

    res.json({
      success: apiOk,
      httpPingOk,
      httpPingTime,
      httpError,
      apiOk,
      apiTime,
      botUsername,
      apiError,
      deliveryOk,
      deliveryMessage
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Внутренняя ошибка сервера при проверке прокси' });
  }
});

app.post('/api/upload', authenticateToken, async (req: any, res: any) => {
  try {
    const { base64, filename } = req.body;
    if (!base64) {
      return res.status(400).json({ error: 'Данные изображения отсутствуют' });
    }

    const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Неверный формат изображения (Base64)' });
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    let ext = 'png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      ext = 'jpg';
    } else if (contentType.includes('png')) {
      ext = 'png';
    } else if (contentType.includes('gif')) {
      ext = 'gif';
    } else if (contentType.includes('webp')) {
      ext = 'webp';
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const randomName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
    const filePath = path.join(uploadDir, randomName);

    await fs.promises.writeFile(filePath, buffer);

    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const appUrl = (process.env.VITE_APP_URL || process.env.APP_URL || `${protocol}://${host}`).replace(/\/$/, '');
    const url = `${appUrl}/uploads/${randomName}`;

    res.json({ success: true, url });
  } catch (err: any) {
    console.error('Error handling upload:', err);
    res.status(500).json({ error: 'Ошибка сервера при загрузке файла' });
  }
});

app.get('/api/bot/verify', authenticateToken, async (req, res) => {
  if (!bot) return res.status(503).json({ error: 'Бот не инициализирован' });
  try {
    let botData;
    try {
      const me = await bot.telegram.getMe();
      botData = {
        id: me.id,
        username: me.username,
        firstName: me.first_name,
        canJoinGroups: me.can_join_groups,
        canReadAllGroupMessages: me.can_read_all_group_messages
      };
    } catch (err: any) {
      console.warn('Network timeout/error when calling Telegram getMe inside container, using fallback cache:', err.message);
      const botIdStr = settings.botToken ? settings.botToken.split(':')[0] : '7621526704';
      const botId = Number(botIdStr) || 7621526704;
      botData = {
        id: botId,
        username: botInfo?.username || 'TelegramBot',
        firstName: 'Telegram Bot (Fallback Mode)',
        canJoinGroups: true,
        canReadAllGroupMessages: true
      };
    }

    res.json({ 
      success: true, 
      bot: botData
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Ошибка проверки токена' });
  }
});

app.post('/telegram', express.json(), async (req, res) => {
  if (!bot) {
    return res.status(503).send('Bot not initialized');
  }
  try {
    const update = req.body;
    if (update && typeof update === 'object') {
      await bot.handleUpdate(update, res);
      if (!res.headersSent) {
        res.sendStatus(200);
      }
    } else {
      res.status(400).send('Invalid update object');
    }
  } catch (error) {
    console.error('Error in /telegram update handler:', error);
    if (!res.headersSent) {
      res.status(500).send('Error');
    }
  }
});

// Dynamic wildcard handler for direct Telegraf webhook callback paths
app.post('/telegraf-webhook/{*all}', (req, res, next) => {
  if (bot) {
    bot.webhookCallback(req.path)(req, res, next);
  } else {
    res.status(503).send('Bot not initialized');
  }
});

app.post('/api/bot/restart', authenticateToken, async (req, res) => {
  try {
    if (settings.botToken) {
      console.log('Manual bot restart requested...');
      const result = await initBot(settings.botToken);
      if (result) {
        res.json({ success: true, message: 'Бот перезапущен' });
      } else {
        res.status(500).json({ success: false, error: 'Ошибка инициализации бота. Проверьте токен.' });
      }
    } else {
      res.status(400).json({ error: 'Токен бота не настроен' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const rawUsername = (username || '').trim();
    if (!rawUsername || !password) {
      return res.status(400).json({ error: 'Пожалуйста, укажите логин и пароль' });
    }

    // Try exact match by username
    let userSnap = await db.collection('users').where('username', '==', rawUsername).get();
    
    // Try lowercased username
    if (userSnap.empty) {
      userSnap = await db.collection('users').where('username', '==', rawUsername.toLowerCase()).get();
    }
    
    // Try by email
    if (userSnap.empty) {
      userSnap = await db.collection('users').where('email', '==', rawUsername).get();
    }
    if (userSnap.empty) {
      userSnap = await db.collection('users').where('email', '==', rawUsername.toLowerCase()).get();
    }

    // Fallback: If username is 'bookray', check if default admin can authenticate
    if (userSnap.empty && (rawUsername.toLowerCase() === 'bookray' || rawUsername.toLowerCase().includes('bookray'))) {
      userSnap = await db.collection('users').where('username', '==', 'admin').get();
    }

    if (userSnap.empty) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = userSnap.docs[0].data();
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    
    // Don't send password back
    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err: any) {
    console.error('Error during /api/login:', err);
    res.status(500).json({ error: 'Ошибка сервера: ' + (err?.message || 'Не удалось выполнить вход') });
  }
});

// Telegram Mini App authentication endpoint
app.post('/api/telegram-webapp-auth', async (req, res) => {
  const { initData } = req.body;
  if (!initData) {
    return res.status(400).json({ error: 'Параметр initData отсутствует' });
  }

  const token = settings.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    return res.status(500).json({ error: 'Токен бота не настроен' });
  }

  const verification = verifyTelegramWebAppData(initData, token);
  if (!verification.isValid || !verification.user) {
    return res.status(401).json({ error: 'Недействительная подпись Telegram WebApp' });
  }

  const tgUser = verification.user;
  const tgUserId = String(tgUser.id);
  const tgUsername = (tgUser.username || '').toLowerCase();
  const adminUsername = (settings.adminTelegramUsername || 'bookray').toLowerCase().replace(/^@/, '');

  console.log(`[TMA Auth] Authentication request from Telegram User: ID=${tgUserId}, @${tgUsername || 'unknown'} (${tgUser.first_name || ''})`);

  let matchedUser: any = null;
  let userRole = 'ADMIN';

  try {
    // 1. Check in users collection by username
    if (tgUsername) {
      const userSnap = await db.collection('users').where('username', '==', tgUsername).get();
      if (!userSnap.empty) {
        matchedUser = userSnap.docs[0].data();
        userRole = matchedUser.role || 'ADMIN';
      }
    }

    // 2. Check by telegramId
    if (!matchedUser) {
      const tgIdSnap = await db.collection('users').where('telegramId', '==', tgUserId).get();
      if (!tgIdSnap.empty) {
        matchedUser = tgIdSnap.docs[0].data();
        userRole = matchedUser.role || 'ADMIN';
      }
    }

    // Strict Owner verification: TMA is strictly for owner bookray
    const isOwner = (tgUsername && tgUsername.toLowerCase() === adminUsername.toLowerCase()) || 
                    (tgUserId === process.env.BOOKRAY_CHAT_ID) ||
                    (tgUsername.toLowerCase() === 'bookray');

    if (!isOwner) {
      console.warn(`[TMA Auth] Access denied for user @${tgUsername || tgUserId} (ID: ${tgUserId})`);
      return res.status(403).json({ 
        accessDenied: true,
        error: `⛔ Доступ к мини-приложению ограничен. Панель управления доступна исключительно владельцу бота (@${adminUsername || 'bookray'}).`,
        telegramUser: { id: tgUserId, username: tgUsername, firstName: tgUser.first_name }
      });
    }

    userRole = 'SUPER_ADMIN';
    if (!matchedUser) {
      matchedUser = {
        id: `tg_${tgUserId}`,
        username: tgUsername || 'bookray',
        email: `${tgUsername || 'bookray'}@telegram.admin`,
        role: 'SUPER_ADMIN',
        assignedChatIds: [],
        createdAt: new Date().toISOString()
      };
    }

    const sessionPayload = {
      id: matchedUser.id || `tg_${tgUserId}`,
      username: matchedUser.username || tgUsername || `tg_${tgUserId}`,
      role: matchedUser.role || userRole,
      assignedChatIds: matchedUser.assignedChatIds || [],
      telegramId: tgUserId,
      firstName: tgUser.first_name,
      isTelegramWebApp: true
    };

    const jwtToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: '14d' });
    const { password: _, ...safeUser } = matchedUser;

    return res.json({
      token: jwtToken,
      user: { ...safeUser, role: sessionPayload.role, isTelegramWebApp: true, telegramUser: tgUser }
    });

  } catch (err: any) {
    console.error('Error during TMA auth:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка авторизации через Telegram' });
  }
});

// Configure or sync Telegram Chat Menu Button
app.post('/api/telegram-menu-button', authenticateToken, async (req, res) => {
  try {
    if (!bot) {
      return res.status(400).json({ error: 'Бот не инициализирован' });
    }
    const targetUrl = req.body.webAppUrl || getEffectiveWebAppUrl(req.headers.origin);
    
    const now = Date.now();
    if (now < menuButtonRetryAfterUntil) {
      const waitSec = Math.ceil((menuButtonRetryAfterUntil - now) / 1000);
      return res.status(429).json({ error: `Telegram временно ограничил запросы (429). Попробуйте снова через ${waitSec} сек.` });
    }

    await (bot.telegram as any).setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: '📱 Панель',
        web_app: { url: targetUrl }
      }
    });

    lastSetMenuButtonUrl = targetUrl;
    settings.lastSetMenuButtonUrl = targetUrl;
    db.collection('config').doc('settings').update({ lastSetMenuButtonUrl: targetUrl }).catch(() => {});

    console.log(`[Bot] Successfully set Chat Menu Button to: ${targetUrl}`);
    res.json({ success: true, message: 'Кнопка меню бота в Telegram успешно настроена!', webAppUrl: targetUrl });
  } catch (e: any) {
    const errMsg = String(e?.message || e);
    const is429 = e?.response?.error_code === 429 || errMsg.includes('429') || errMsg.includes('Too Many Requests');
    if (is429) {
      const retrySec = Number(e?.parameters?.retry_after) || 900;
      menuButtonRetryAfterUntil = Date.now() + (retrySec * 1000);
      settings.menuButtonRetryAfterUntil = menuButtonRetryAfterUntil;
      db.collection('config').doc('settings').update({ menuButtonRetryAfterUntil }).catch(() => {});
      console.log(`[Bot] Chat Menu Button rate-limited by Telegram (429). Backing off for ${retrySec}s.`);
      return res.status(429).json({ error: `Telegram временно ограничил настройку кнопки (429). Повторите через ${Math.ceil(retrySec / 60)} мин.` });
    }
    console.error('Failed to set chat menu button in Telegram:', e);
    res.status(500).json({ error: 'Ошибка установки кнопки меню: ' + (e.message || e) });
  }
});

// Get Telegram Mini App configuration & effective URLs
app.get('/api/telegram-webapp-config', authenticateToken, (req, res) => {
  const effectiveUrl = getEffectiveWebAppUrl(req.headers.origin);
  res.json({
    effectiveUrl,
    configuredUrl: settings.webAppUrl || '',
    botUsername: botInfo?.username || '',
    botId: botInfo?.id || null,
    adminUsername: settings.adminTelegramUsername || 'bookray'
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: (req as any).user });
});

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const usersList = snapshot.docs.map(doc => {
      const { password, ...u } = doc.data();
      return u;
    });
    res.json(usersList);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  if ((req as any).user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden' });
  const userData = req.body;
  try {
    const id = Math.random().toString(36).substr(2, 9);
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const newUser = {
      ...userData,
      id,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      messagesSent: 0
    };
    await db.collection('users').doc(id).set(newUser);
    const { password, ...u } = newUser;
    res.json(u);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  if ((req as any).user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  const updateData = req.body;
  try {
    const userDoc = await db.collection('users').doc(id).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Пользователь не найден' });

    const currentData = userDoc.data();
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else {
      delete updateData.password;
    }

    const updatedUser = { ...currentData, ...updateData };
    await db.collection('users').doc(id).set(updatedUser);
    const { password, ...u } = updatedUser;
    res.json(u);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  if ((req as any).user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  try {
    await db.collection('users').doc(id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/chats', authenticateToken, (req, res) => res.json(chats));
app.get('/api/bans', authenticateToken, (req, res) => res.json(bans));
app.get('/api/filters', authenticateToken, (req, res) => res.json(filters));
app.get('/api/logs', authenticateToken, (req, res) => res.json(logs));
app.get('/api/settings', authenticateToken, (req, res) => res.json(settings));
app.get('/api/tasks', authenticateToken, (req, res) => res.json(tasks));
app.get('/api/whitelist', authenticateToken, (req, res) => res.json(whitelist));

// Live Server & Project Time info endpoint
app.get('/api/time', (req, res) => {
  const now = new Date();
  const proj = getProjectDate(now);
  const tzOffset = typeof settings.timezoneOffset === 'number' ? settings.timezoneOffset : 3;
  const timeFormatted = `${String(proj.hour).padStart(2, '0')}:${String(proj.minute).padStart(2, '0')}:${String(proj.dateObj.getSeconds()).padStart(2, '0')}`;

  res.json({
    serverUtcIso: now.toISOString(),
    serverTimestamp: now.getTime(),
    timezoneOffset: tzOffset,
    projectIso: proj.dateObj.toISOString(),
    projectTimeFormatted: timeFormatted,
    projectDateFormatted: proj.dateStr,
    dayIndex: proj.dayIndex,
    hour: proj.hour,
    minute: proj.minute
  });
});

app.post('/api/bans/chat', async (req, res) => {
  const { userId, chatId, reason, duration, unit, type } = req.body;
  try {
    if (!bot) return res.status(500).json({ error: 'Бот не инициализирован' });

    let targetId = userId;
    if (userId.startsWith('@')) {
      const m = memberships.find(m => m.username?.toLowerCase() === userId.toLowerCase());
      if (m) targetId = m.userId;
      else return res.status(404).json({ error: 'Пользователь не найден в базе данных' });
    }

    const untilDate = Math.floor(Date.now() / 1000) + (
      unit === 'days' ? duration * 24 * 60 * 60 :
      unit === 'hours' ? duration * 60 * 60 :
      duration * 60
    );

    if (type === 'MUTE') {
      await bot.telegram.restrictChatMember(chatId, targetId, {
        permissions: { can_send_messages: false },
        until_date: untilDate
      });
    } else {
      await bot.telegram.banChatMember(chatId, targetId, untilDate);
    }
    
    const chat = chats.find(c => String(c.id) === String(chatId));
    const member = memberships.find(m => String(m.userId) === String(targetId) && String(m.chatId) === String(chatId));
    const name = member ? (member.firstName || member.username || targetId) : targetId;

    const actionText = type === 'MUTE' ? 'Замучен' : 'Забанен';
    const emoji = type === 'MUTE' ? '🔇' : '🚫';
    await bot.telegram.sendMessage(chatId, `${emoji} Пользователь: ${name}\n📝 Причина: ${reason}\n⏳ Время: ${duration} ${unit}\n⚡️ Действие: ${actionText}`);

    const chatBan = {
      id: Math.random().toString(36).substr(2, 9),
      userId: targetId,
      chatId,
      chatTitle: chat?.title || chatId,
      reason,
      type: type || 'BAN',
      untilDate: new Date(untilDate * 1000).toISOString(),
      addedAt: new Date().toISOString()
    };

    await db.collection('chat_bans').doc(chatBan.id).set(cleanData(chatBan));
    chatBans.push(chatBan);

    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: type === 'MUTE' ? 'MUTE' : 'BAN',
      user: name,
      chat: chat?.title || chatId,
      details: `${actionText} в чате: ${reason} (${duration} ${unit})`
    });

    res.json({ success: true });
  } catch (e: any) {
    console.error('Chat ban/mute failed:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bans/chat', (req, res) => {
  res.json(chatBans);
});

app.delete('/api/bans/chat/:id', async (req, res) => {
  try {
    console.log(`DELETE /api/bans/chat/${req.params.id} called`);
    const ban = chatBans.find(b => b.id === req.params.id);
    if (ban) {
      if (bot) {
        try {
          console.log(`Attempting to unban/unmute user ${ban.userId} in chat ${ban.chatId} (Type: ${ban.type})`);
          if (ban.type === 'MUTE') {
            await bot.telegram.restrictChatMember(ban.chatId, Number(ban.userId), {
              permissions: {
                can_send_messages: true,
                can_send_audios: true,
                can_send_documents: true,
                can_send_photos: true,
                can_send_videos: true,
                can_send_video_notes: true,
                can_send_voice_notes: true,
                can_send_polls: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true,
                can_change_info: true,
                can_invite_users: true,
                can_pin_messages: true
              }
            });
          } else {
            await bot.telegram.unbanChatMember(ban.chatId, Number(ban.userId));
          }
          console.log(`Successfully unbanned/unmuted user ${ban.userId} via bot`);
        } catch (e) {
          console.error('Failed to unban/unmute via bot:', e);
        }
      }
      await db.collection('chat_bans').doc(req.params.id).delete();
      const oldLength = chatBans.length;
      chatBans = chatBans.filter(b => b.id !== req.params.id);
      console.log(`Deleted chat ban record ${req.params.id} from Firestore and local state. Old length: ${oldLength}, New length: ${chatBans.length}`);
    } else {
      console.warn(`Chat ban record ${req.params.id} not found in local state`);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(`Failed to delete chat ban ${req.params.id}:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});
app.get('/api/memberships/multi-chat', (req, res) => {
  const userMap = new Map<string, any>();
  
  console.log(`Calculating multi-chat users. Memberships: ${memberships.length}, Chats: ${chats.length}, ChatMessages: ${chatMessages.length}`);
  
  // Sort memberships by lastSeen or joinedAt to get the freshest info first
  const sortedMemberships = [...memberships].sort((a, b) => {
    const timeA = new Date(a.lastSeen || a.joinedAt || 0).getTime();
    const timeB = new Date(b.lastSeen || b.joinedAt || 0).getTime();
    return timeB - timeA;
  });

  sortedMemberships.forEach(m => {
    const isBot = (botInfo && (
      String(m.userId) === botInfo.id.toString() || 
      (m.username && m.username.toLowerCase().replace(/^@/, '') === botInfo.username.toLowerCase())
    )) || (m.username && m.username.toLowerCase().replace(/^@/, '') === 'motoinformbot');
    if (isBot) return;
    
    const userId = String(m.userId);
    if (!userMap.has(userId)) {
      userMap.set(userId, {
        userId: userId,
        username: m.username,
        firstName: m.firstName,
        lastName: m.lastName,
        chats: [],
        messageCount: 0,
        lastSeen: m.lastSeen || m.joinedAt,
        hasRecentSpam: false,
        hasForwards: false
      });
    }
    const user = userMap.get(userId);
    if (m.msgCount) user.messageCount = (user.messageCount || 0) + m.msgCount;
    
    const chatIdStr = String(m.chatId);
    const chat = chats.find(c => String(c.id) === chatIdStr);
    const chatTitle = chat ? chat.title : ((m as any).chatTitle || `Чат ${chatIdStr}`);
    
    if (!user.chats.some((c: any) => String(c.id) === chatIdStr)) {
      user.chats.push({ id: chatIdStr, title: chatTitle });
    }
  });

  // Also merge users and chats from recorded chat messages
  for (const cm of chatMessages) {
    const userId = String(cm.userId);
    if (!userId || userId === 'undefined') continue;
    if (botInfo && userId === botInfo.id.toString()) continue;
    if (cm.username && cm.username.toLowerCase().replace(/^@/, '') === 'motoinformbot') continue;

    if (!userMap.has(userId)) {
      userMap.set(userId, {
        userId,
        username: cm.username ? (cm.username.startsWith('@') ? cm.username : `@${cm.username}`) : undefined,
        firstName: cm.firstName,
        lastName: cm.lastName,
        chats: [],
        messageCount: 0,
        lastSeen: cm.timestamp,
        hasRecentSpam: false,
        hasForwards: false
      });
    }

    const user = userMap.get(userId);
    const chatIdStr = String(cm.chatId);
    const chat = chats.find(c => String(c.id) === chatIdStr);
    const chatTitle = chat ? chat.title : `Чат ${chatIdStr}`;

    if (!user.chats.some((c: any) => String(c.id) === chatIdStr)) {
      user.chats.push({ id: chatIdStr, title: chatTitle });
    }
    user.messageCount = (user.messageCount || 0) + 1;
    if (cm.isForward) user.hasForwards = true;
    if (!user.lastMessageTime || cm.timestamp > user.lastMessageTime) {
      user.lastMessageTime = cm.timestamp;
    }
  }

  // Mark users who have active cross-chat spam activity in sliding window
  for (const [uId, recentList] of userRecentCrossChatMessages.entries()) {
    const uniqueRecentChats = new Set(recentList.map(r => r.chatId));
    if (uniqueRecentChats.size >= 2) {
      let u = userMap.get(uId);
      if (!u && recentList.length > 0) {
        // Create user entry if not already present
        const sample = recentList[0];
        u = {
          userId: uId,
          chats: [],
          messageCount: recentList.length,
          lastSeen: new Date(sample.timestamp).toISOString(),
          hasRecentSpam: true,
          hasForwards: recentList.some(r => r.isForward)
        };
        userMap.set(uId, u);
      }
      if (u) {
        u.hasRecentSpam = true;
        if (recentList.some(r => r.isForward)) u.hasForwards = true;
        for (const r of recentList) {
          if (!u.chats.some((c: any) => String(c.id) === r.chatId)) {
            const chat = chats.find(c => String(c.id) === r.chatId);
            u.chats.push({ id: r.chatId, title: chat ? chat.title : `Чат ${r.chatId}` });
          }
        }
      }
    }
  }

  const multiChatUsersResult = Array.from(userMap.values())
    .filter(u => u.chats.length > 1)
    .map(u => ({
      ...u,
      isWhitelisted: whitelist.some(w => String(w.userId) === String(u.userId) || String(w.id) === String(u.userId)),
      isBanned: bans.some(b => String(b.userId) === String(u.userId) || String(b.id) === String(u.userId))
    }));

  console.log(`Found ${multiChatUsersResult.length} users in multiple chats (including active message senders)`);
  res.json(multiChatUsersResult);
});

// Anti-Scam Keywords & Alert Endpoints
app.get('/api/antiscam/keywords', authenticateToken, (req, res) => {
  const detectedAdminChatId = antiScamKeywordsConfig.notifyChatId || process.env.BOOKRAY_CHAT_ID || settings.infoChatId || '';
  res.json({
    config: antiScamKeywordsConfig,
    logs: scamAlertLogs,
    detectedAdminChatId,
    adminTelegramUsername: settings.adminTelegramUsername || 'bookray',
    infoChatId: settings.infoChatId || ''
  });
});

app.post('/api/antiscam/keywords', authenticateToken, async (req, res) => {
  try {
    const { enabled, keywords, notifyChatId, deleteMessage, notifyInGroup, cooldownSeconds } = req.body;
    
    let cleanedKeywords: string[] = [];
    if (Array.isArray(keywords)) {
      cleanedKeywords = Array.from(new Set(
        keywords.map((k: any) => String(k || '').trim()).filter(k => k.length > 0)
      ));
    } else {
      cleanedKeywords = antiScamKeywordsConfig.keywords;
    }

    antiScamKeywordsConfig = {
      enabled: enabled !== undefined ? Boolean(enabled) : antiScamKeywordsConfig.enabled,
      keywords: cleanedKeywords,
      notifyChatId: notifyChatId !== undefined ? String(notifyChatId).trim() : (antiScamKeywordsConfig.notifyChatId || ''),
      deleteMessage: deleteMessage !== undefined ? Boolean(deleteMessage) : antiScamKeywordsConfig.deleteMessage,
      notifyInGroup: notifyInGroup !== undefined ? Boolean(notifyInGroup) : antiScamKeywordsConfig.notifyInGroup,
      cooldownSeconds: typeof cooldownSeconds === 'number' && cooldownSeconds >= 0 ? cooldownSeconds : (antiScamKeywordsConfig.cooldownSeconds || 60)
    };

    await db.collection('config').doc('antiscam_keywords').set(cleanData(antiScamKeywordsConfig));
    console.log(`[AntiScam] Updated keywords: ${antiScamKeywordsConfig.keywords.length} words, enabled=${antiScamKeywordsConfig.enabled}`);

    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'SETTINGS',
      user: (req as any).user?.username || 'Admin',
      chat: 'Система',
      details: `Обновлены ключевые слова анти-мошенник: ${antiScamKeywordsConfig.keywords.length} слов, статус: ${antiScamKeywordsConfig.enabled ? 'ВКЛ' : 'ВЫКЛ'}`
    });

    res.json({ success: true, config: antiScamKeywordsConfig });
  } catch (err: any) {
    console.error('Failed to update anti-scam keywords config:', err);
    res.status(500).json({ error: err.message || 'Ошибка сохранения настроек' });
  }
});

app.post('/api/antiscam/test-alert', authenticateToken, async (req, res) => {
  try {
    if (!bot) {
      return res.status(503).json({ error: 'Telegram бот не запущен' });
    }

    const customTarget = req.body.chatId ? String(req.body.chatId).trim() : '';
    const targetChatId = customTarget || antiScamKeywordsConfig.notifyChatId || process.env.BOOKRAY_CHAT_ID || settings.infoChatId;

    if (!targetChatId) {
      return res.status(400).json({ 
        error: 'Не указан получатель оповещений. Укажите Telegram ID в поле «Telegram ID для оповещений» или напишите боту в личные сообщения.' 
      });
    }

    const testText = 
      `🧪 <b>ТЕСТОВОЕ ОПОВЕЩЕНИЕ: АНТИ-МОШЕННИК</b>\n\n` +
      `✅ Система мониторинга ключевых слов успешно подключена к вашему Telegram!\n\n` +
      `🔍 <b>Активных ключевых слов:</b> ${antiScamKeywordsConfig.keywords.length}\n` +
      `🛡 <b>Статус мониторинга:</b> ${antiScamKeywordsConfig.enabled ? '🟢 Включен' : '🔴 Отключен'}\n` +
      `🗑 <b>Авто-удаление сообщений:</b> ${antiScamKeywordsConfig.deleteMessage ? 'Да' : 'Нет'}\n` +
      `💬 <b>Предупреждение в чате:</b> ${antiScamKeywordsConfig.notifyInGroup ? 'Да' : 'Нет'}\n\n` +
      `<i>При обнаружении любого из ключевых слов вам мгновенно поступит такое же оповещение с кнопками быстрой блокировки.</i>`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🛡 Проверено, работает отлично!', callback_data: 'test_alert_ack' }
        ]
      ]
    };

    await bot.telegram.sendMessage(targetChatId, testText, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    res.json({ success: true, sentTo: targetChatId });
  } catch (err: any) {
    console.error('Failed to send test alert:', err);
    res.status(500).json({ error: `Не удалось отправить сообщение: ${err.message || err}` });
  }
});

app.delete('/api/antiscam/logs', authenticateToken, async (req, res) => {
  try {
    scamAlertLogs = [];
    const snap = await db.collection('scam_alert_logs').limit(200).get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit().catch(() => {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', authenticateToken, (req, res) => {
  const user = (req as any).user;
  const queryChatIds = req.query.chatIds ? (req.query.chatIds as string).split(',') : null;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  
  // If not super admin, restrict to assigned chats
  let allowedChatIds = queryChatIds;
  if (user.role !== 'SUPER_ADMIN') {
    const assigned = user.assignedChatIds || [];
    if (queryChatIds) {
      allowedChatIds = queryChatIds.filter(id => assigned.includes(id));
    } else {
      allowedChatIds = assigned;
    }
    
    if (allowedChatIds.length === 0 && assigned.length > 0) {
      return res.json({
        totalMembers: 0,
        totalMessages24h: 0,
        modActions: 0,
        activeChats: 0,
        chartData: [],
        topActiveMembers: [],
        topActiveAdmins: [],
        topChatsByMembers: [],
        topChatsByMessages24h: [],
        topChatsByTotalMessages: [],
        topChatsByActiveUsers: [],
        topChatsByOnlineUsers: []
      });
    }
  }

  const filteredChats = allowedChatIds 
    ? chats.filter(c => allowedChatIds.includes(String(c.id)))
    : chats.filter(c => c.active);

  const totalMembers = filteredChats.reduce((acc, chat) => acc + (chat.members || 0), 0);
  const activeChatsCount = filteredChats.length;
  
  const projNow = getProjectDate();
  const todayDate = projNow.dateStr;
  const yesterdayProj = getProjectDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const yesterdayDate = yesterdayProj.dateStr;
  
  const today = statsHistory.find(s => s.date === todayDate) || { msgs: 0, chatStats: {}, joins: 0, leaves: 0, totalMembers: totalMembers };
  const yesterday = statsHistory.find(s => s.date === yesterdayDate);
  
  let totalMessages24h = 0;
  let prevMessages24h = 0;
  
  if (allowedChatIds) {
    totalMessages24h = allowedChatIds.reduce((acc, id) => {
      const chatStat = today.chatStats?.[id];
      return acc + (chatStat?.msgs || 0);
    }, 0);
    
    if (yesterday) {
      prevMessages24h = allowedChatIds.reduce((acc, id) => {
        const chatStat = yesterday.chatStats?.[id];
        return acc + (chatStat?.msgs || 0);
      }, 0);
    }
  } else {
    totalMessages24h = today.msgs || 0;
    prevMessages24h = yesterday?.msgs || 0;
  }

  const calculateTrend = (current: number, previous: number) => {
    if (!previous || previous === 0) return current > 0 ? "+100%" : "+0.0%";
    const diff = ((current - previous) / previous) * 100;
    return (diff >= 0 ? "+" : "") + diff.toFixed(1) + "%";
  };

  const totalMembersTrend = yesterday ? calculateTrend(totalMembers, yesterday.totalMembers || totalMembers) : "+0.0%";
  const messagesTrend = calculateTrend(totalMessages24h, prevMessages24h);
  
  const modActions = logs.filter(l => {
    const isModAction = ['BAN', 'KICK', 'WARN', 'MUTE'].includes(l.type);
    if (!isModAction) return false;
    
    if (startDate && l.timestamp.split('T')[0] < startDate) return false;
    if (endDate && l.timestamp.split('T')[0] > endDate) return false;

    if (allowedChatIds) {
      const chat = chats.find(c => c.title === l.chat);
      return chat && allowedChatIds.includes(String(chat.id));
    }
    return true;
  }).length;

  // For mod actions trend, we compare current period with previous period of same length
  let modActionsTrend = "+0.0%";
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const prevStart = new Date(start.getTime() - diffTime - (24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    const prevEnd = new Date(start.getTime() - (24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    
    const prevModActions = logs.filter(l => {
      const isModAction = ['BAN', 'KICK', 'WARN', 'MUTE'].includes(l.type);
      if (!isModAction) return false;
      if (l.timestamp.split('T')[0] < prevStart || l.timestamp.split('T')[0] > prevEnd) return false;
      if (allowedChatIds) {
        const chat = chats.find(c => c.title === l.chat);
        return chat && allowedChatIds.includes(String(chat.id));
      }
      return true;
    }).length;
    modActionsTrend = calculateTrend(modActions, prevModActions);
  } else {
    // Default: compare last 24h with previous 24h
    const prev24hStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const prev24hEnd = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const prevModActions = logs.filter(l => {
      const isModAction = ['BAN', 'KICK', 'WARN', 'MUTE'].includes(l.type);
      if (!isModAction) return false;
      if (l.timestamp < prev24hStart || l.timestamp > prev24hEnd) return false;
      if (allowedChatIds) {
        const chat = chats.find(c => c.title === l.chat);
        return chat && allowedChatIds.includes(String(chat.id));
      }
      return true;
    }).length;
    const current24hStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const currentModActions = logs.filter(l => {
      const isModAction = ['BAN', 'KICK', 'WARN', 'MUTE'].includes(l.type);
      if (!isModAction) return false;
      if (l.timestamp < current24hStart) return false;
      if (allowedChatIds) {
        const chat = chats.find(c => c.title === l.chat);
        return chat && allowedChatIds.includes(String(chat.id));
      }
      return true;
    }).length;
    modActionsTrend = calculateTrend(currentModActions, prevModActions);
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const onlineMembers = memberships.filter(m => {
    if (allowedChatIds && !allowedChatIds.includes(String(m.chatId))) return false;
    const chat = chats.find(c => c.id === m.chatId);
    if (!chat || !chat.active) return false;
    return m.lastSeen && m.lastSeen > twentyFourHoursAgo;
  }).length;

  let filteredStatsHistory: any[] = [];
  if (startDate && endDate) {
    filteredStatsHistory = statsHistory.filter(s => s.date >= startDate && s.date <= endDate);
  } else if (startDate) {
    filteredStatsHistory = statsHistory.filter(s => s.date >= startDate);
  } else if (endDate) {
    filteredStatsHistory = statsHistory.filter(s => s.date <= endDate);
  } else {
    // Continuous 7 calendar days ending today in project timezone
    const days: any[] = [];
    const projTimeMs = projNow.dateObj.getTime();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(projTimeMs - i * 24 * 60 * 60 * 1000);
      const projD = getProjectDate(d);
      const isoDate = projD.dateStr;
      const displayName = projD.formatted;
      const found = statsHistory.find(s => s.date === isoDate);
      if (found) {
        days.push(found);
      } else {
        days.push({
          date: isoDate,
          name: displayName,
          joins: 0,
          leaves: 0,
          msgs: 0,
          chatStats: {},
          activeUsers: [],
          onlineUsers: [],
          totalMembers: totalMembers
        });
      }
    }
    filteredStatsHistory = days;
  }

  const chartData = filteredStatsHistory.map(point => {
    let filteredJoins = 0;
    let filteredLeaves = 0;
    let filteredMsgs = 0;
    let filteredActiveMembers = 0;
    let filteredOnlineMembers = 0;
    let filteredTotalMembers = 0;
    
    // If we have chat-specific stats, use them. Otherwise fallback to global stats.
    if (allowedChatIds && point.chatStats) {
      const activeUsersSet = new Set<string>();
      const onlineUsersSet = new Set<string>();
      allowedChatIds.forEach(id => {
        const chatStat = point.chatStats?.[id];
        if (chatStat) {
          filteredJoins += (chatStat.joins || 0);
          filteredLeaves += (chatStat.leaves || 0);
          filteredMsgs += (chatStat.msgs || 0);
          if (chatStat.activeUsers) {
            chatStat.activeUsers.forEach((uid: string) => activeUsersSet.add(uid));
          }
          if (chatStat.onlineUsers) {
            chatStat.onlineUsers.forEach((uid: string) => onlineUsersSet.add(uid));
          }
          filteredTotalMembers += (chatStat.totalMembers || 0);
        }
      });
      filteredActiveMembers = activeUsersSet.size;
      filteredOnlineMembers = onlineUsersSet.size;
    } else {
      // Fallback: if no chatStats or no allowedChatIds, use global point stats
      filteredJoins = point.joins || 0;
      filteredLeaves = point.leaves || 0;
      filteredMsgs = point.msgs || 0;
      filteredActiveMembers = point.activeUsers?.length || 0;
      filteredOnlineMembers = point.onlineUsers?.length || 0;
      filteredTotalMembers = point.totalMembers || 0;
    }
    
    return {
      date: point.date,
      name: point.name,
      joins: filteredJoins,
      leaves: filteredLeaves,
      msgs: filteredMsgs,
      activeMembers: filteredActiveMembers,
      onlineMembers: filteredOnlineMembers,
      totalMembers: filteredTotalMembers
    };
  });

  const topActiveMembersMap = new Map<string, any>();
  memberships.forEach(m => {
    // Exclude the bot itself
    const isBot = (botInfo && (
      String(m.userId) === botInfo.id.toString() || 
      (m.username && m.username.toLowerCase().replace(/^@/, '') === botInfo.username.toLowerCase())
    )) || (m.username && m.username.toLowerCase().replace(/^@/, '') === 'motoinformbot');
    if (isBot) return;
    
    if (allowedChatIds && !allowedChatIds.includes(String(m.chatId))) return;
    const chat = chats.find(c => c.id === m.chatId);
    if (!chat || !chat.active) return;
    
    if (!topActiveMembersMap.has(m.userId)) {
      topActiveMembersMap.set(m.userId, {
        userId: m.userId,
        username: m.username,
        firstName: m.firstName,
        msgCount: 0,
        chats: []
      });
    }
    const user = topActiveMembersMap.get(m.userId);
    user.msgCount += (m.msgCount || 0);
    user.chats.push({ id: chat.id, title: chat.title });
  });

  const topActiveMembers = Array.from(topActiveMembersMap.values())
    .sort((a, b) => b.msgCount - a.msgCount)
    .slice(0, 10);

  const topActiveAdminsMap = new Map<string, any>();
  memberships.forEach(m => {
    if (!m.isAdmin) return;
    // Exclude the bot itself
    const isBot = (botInfo && (
      String(m.userId) === botInfo.id.toString() || 
      (m.username && m.username.toLowerCase().replace(/^@/, '') === botInfo.username.toLowerCase())
    )) || (m.username && m.username.toLowerCase().replace(/^@/, '') === 'motoinformbot');
    if (isBot) return;
    
    if (allowedChatIds && !allowedChatIds.includes(String(m.chatId))) return;
    const chat = chats.find(c => c.id === m.chatId);
    if (!chat || !chat.active) return;
    
    if (!topActiveAdminsMap.has(m.userId)) {
      topActiveAdminsMap.set(m.userId, {
        userId: m.userId,
        username: m.username,
        firstName: m.firstName,
        msgCount: 0,
        chats: []
      });
    }
    const admin = topActiveAdminsMap.get(m.userId);
    admin.msgCount += (m.msgCount || 0);
    admin.chats.push({ id: chat.id, title: chat.title });
  });

  const topActiveAdmins = Array.from(topActiveAdminsMap.values())
    .sort((a, b) => b.msgCount - a.msgCount)
    .slice(0, 10);

  // Top 10 Chats by Members
  const topChatsByMembers = [...filteredChats]
    .sort((a, b) => (b.members || 0) - (a.members || 0))
    .slice(0, 10)
    .map(c => ({ id: c.id, title: c.title, count: c.members || 0 }));

  // Top 10 Chats by Messages 24h
  const topChatsByMessages24h = [...filteredChats]
    .map(c => ({
      id: c.id,
      title: c.title,
      count: today.chatStats?.[c.id]?.msgs || 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top 10 Chats by Total Messages
  const topChatsByTotalMessages = [...filteredChats]
    .sort((a, b) => (b.msgCount || 0) - (a.msgCount || 0))
    .slice(0, 10)
    .map(c => ({ id: c.id, title: c.title, count: c.msgCount || 0 }));

  // Top 10 Chats by Active Users (today)
  const topChatsByActiveUsers = [...filteredChats]
    .map(c => ({
      id: c.id,
      title: c.title,
      count: today.chatStats?.[c.id]?.activeUsers?.length || 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top 10 Chats by Online Users (today)
  const topChatsByOnlineUsers = [...filteredChats]
    .map(c => {
      // For "Online", we use the same 24h window as the main stat for consistency
      const chatOnlineCount = memberships.filter(m => 
        String(m.chatId) === String(c.id) && 
        m.lastSeen && m.lastSeen > twentyFourHoursAgo
      ).length;
      
      return {
        id: c.id,
        title: c.title,
        count: chatOnlineCount
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Calculate 24-hour and 7x24 Heatmap distribution of user activity
  const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DAY_FULL_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  const hourlyUsersSets: Set<string>[] = Array.from({ length: 24 }, () => new Set<string>());
  const hourlyMsgsCount: number[] = Array.from({ length: 24 }, () => 0);
  const hourlyJoinsCount: number[] = Array.from({ length: 24 }, () => 0);

  // Initialize 7x24 grid (7 days x 24 hours)
  const heatmapUsersSets: Set<string>[][] = Array.from({ length: 7 }, () => 
    Array.from({ length: 24 }, () => new Set<string>())
  );
  const heatmapMsgsCount: number[][] = Array.from({ length: 7 }, () => 
    Array.from({ length: 24 }, () => 0)
  );
  const heatmapJoinsCount: number[][] = Array.from({ length: 7 }, () => 
    Array.from({ length: 24 }, () => 0)
  );

  // 1. Extract from filteredStatsHistory (aggregated stats records)
  filteredStatsHistory.forEach(point => {
    const parsedDate = new Date(`${point.date}T12:00:00Z`);
    const jsDay = parsedDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const dayIndex = (jsDay + 6) % 7; // 0=Пн .. 6=Вс

    if (allowedChatIds) {
      // Aggregate ONLY for the allowed chats
      if (point.chatStats) {
        allowedChatIds.forEach(chatId => {
          const cStat = point.chatStats[chatId];
          if (cStat && cStat.hourly) {
            for (let h = 0; h < 24; h++) {
              const hData = cStat.hourly[h] || cStat.hourly[String(h)];
              if (hData) {
                hourlyMsgsCount[h] += (hData.msgs || 0);
                hourlyJoinsCount[h] += (hData.joins || 0);
                heatmapMsgsCount[dayIndex][h] += (hData.msgs || 0);
                heatmapJoinsCount[dayIndex][h] += (hData.joins || 0);
                if (Array.isArray(hData.activeUsers)) {
                  hData.activeUsers.forEach((u: string) => {
                    hourlyUsersSets[h].add(u);
                    heatmapUsersSets[dayIndex][h].add(u);
                  });
                }
              }
            }
          }
        });
      }
    } else {
      // All chats: use global point.hourly or fallback to chatStats sum
      let hasGlobalHourly = false;
      if (point.hourly) {
        for (let h = 0; h < 24; h++) {
          const hData = point.hourly[h] || point.hourly[String(h)];
          if (hData && (hData.msgs > 0 || hData.joins > 0 || (Array.isArray(hData.activeUsers) && hData.activeUsers.length > 0))) {
            hasGlobalHourly = true;
            hourlyMsgsCount[h] += (hData.msgs || 0);
            hourlyJoinsCount[h] += (hData.joins || 0);
            heatmapMsgsCount[dayIndex][h] += (hData.msgs || 0);
            heatmapJoinsCount[dayIndex][h] += (hData.joins || 0);
            if (Array.isArray(hData.activeUsers)) {
              hData.activeUsers.forEach((u: string) => {
                hourlyUsersSets[h].add(u);
                heatmapUsersSets[dayIndex][h].add(u);
              });
            }
          }
        }
      }

      if (!hasGlobalHourly && point.chatStats) {
        Object.keys(point.chatStats).forEach(cId => {
          const cStat = point.chatStats[cId];
          if (cStat && cStat.hourly) {
            for (let h = 0; h < 24; h++) {
              const hData = cStat.hourly[h] || cStat.hourly[String(h)];
              if (hData) {
                hourlyMsgsCount[h] += (hData.msgs || 0);
                hourlyJoinsCount[h] += (hData.joins || 0);
                heatmapMsgsCount[dayIndex][h] += (hData.msgs || 0);
                heatmapJoinsCount[dayIndex][h] += (hData.joins || 0);
                if (Array.isArray(hData.activeUsers)) {
                  hData.activeUsers.forEach((u: string) => {
                    hourlyUsersSets[h].add(u);
                    heatmapUsersSets[dayIndex][h].add(u);
                  });
                }
              }
            }
          }
        });
      }
    }
  });

  // 2. Extract from recorded chatMessages for precision
  chatMessages.forEach(msg => {
    if (allowedChatIds && !allowedChatIds.includes(String(msg.chatId))) return;
    if (startDate && msg.timestamp.split('T')[0] < startDate) return;
    if (endDate && msg.timestamp.split('T')[0] > endDate) return;
    
    if (!startDate && !endDate) {
      const msgDate = msg.timestamp.split('T')[0];
      const earliestAllowedDate = filteredStatsHistory[0]?.date;
      if (earliestAllowedDate && msgDate < earliestAllowedDate) return;
    }

    try {
      const proj = getProjectDate(msg.timestamp);
      const dayIndex = proj.dayIndex;
      const msgHour = proj.hour;
      if (msgHour >= 0 && msgHour < 24) {
        if (hourlyMsgsCount[msgHour] === 0) {
          hourlyMsgsCount[msgHour]++;
        }
        if (heatmapMsgsCount[dayIndex][msgHour] === 0) {
          heatmapMsgsCount[dayIndex][msgHour]++;
        }
        if (msg.userId) {
          hourlyUsersSets[msgHour].add(String(msg.userId));
          heatmapUsersSets[dayIndex][msgHour].add(String(msg.userId));
        }
      }
    } catch (e) {
      // ignore
    }
  });

  // 3. Extract joins from logs
  logs.forEach(l => {
    if (l.type !== 'JOIN') return;
    if (startDate && l.timestamp.split('T')[0] < startDate) return;
    if (endDate && l.timestamp.split('T')[0] > endDate) return;
    if (allowedChatIds) {
      const chat = chats.find(c => c.title === l.chat);
      if (!chat || !allowedChatIds.includes(String(chat.id))) return;
    }
    try {
      const proj = getProjectDate(l.timestamp);
      const dayIndex = proj.dayIndex;
      const logHour = proj.hour;
      if (logHour >= 0 && logHour < 24) {
        if (hourlyJoinsCount[logHour] === 0) {
          hourlyJoinsCount[logHour]++;
        }
        if (heatmapJoinsCount[dayIndex][logHour] === 0) {
          heatmapJoinsCount[dayIndex][logHour]++;
        }
      }
    } catch (e) {}
  });

  // Calculate max values for heatmap intensities
  let maxHeatmapMsgs = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (heatmapMsgsCount[d][h] > maxHeatmapMsgs) maxHeatmapMsgs = heatmapMsgsCount[d][h];
    }
  }

  const heatmapData: any[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const msgs = heatmapMsgsCount[d][h];
      const activeUsers = heatmapUsersSets[d][h].size;
      const joins = heatmapJoinsCount[d][h];
      const intensity = maxHeatmapMsgs > 0 ? Math.round((msgs / maxHeatmapMsgs) * 100) : 0;

      heatmapData.push({
        day: d,
        dayName: DAY_NAMES[d],
        dayFullName: DAY_FULL_NAMES[d],
        hour: h,
        time: `${h.toString().padStart(2, '0')}:00`,
        msgs,
        activeUsers,
        joins,
        intensity
      });
    }
  }

  const hourlyActivity = Array.from({ length: 24 }, (_, hour) => {
    const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
    return {
      hour,
      time: timeLabel,
      msgs: hourlyMsgsCount[hour],
      activeUsers: hourlyUsersSets[hour].size,
      joins: hourlyJoinsCount[hour]
    };
  });

  res.json({
    totalMembers,
    totalMembersTrend,
    totalMessages24h,
    messagesTrend,
    modActions,
    modActionsTrend,
    activeChats: activeChatsCount,
    chartData,
    hourlyActivity,
    heatmapData,
    topActiveMembers,
    topActiveAdmins,
    topChatsByMembers,
    topChatsByMessages24h,
    topChatsByTotalMessages,
    topChatsByActiveUsers,
    topChatsByOnlineUsers
  });
});

app.get('/api/memberships/latest', (req, res) => {
  const latestMembers = memberships
    .filter(m => {
      const isBot = (botInfo && (
        String(m.userId) === botInfo.id.toString() || 
        (m.username && m.username.toLowerCase().replace(/^@/, '') === botInfo.username.toLowerCase())
      )) || (m.username && m.username.toLowerCase().replace(/^@/, '') === 'motoinformbot');
      if (isBot) return false;
      return true;
    })
    .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
    .slice(0, 20)
    .map(m => {
      const chat = chats.find(c => c.id === m.chatId);
      return {
        ...m,
        chatTitle: chat ? chat.title : 'Unknown'
      };
    });
  res.json(latestMembers);
});

app.put('/api/settings', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Access denied' });
    
    const oldToken = settings.botToken;
    const oldApiRoot = settings.telegramApiRoot;
    const newSettings = req.body;
    console.log('Updating settings:', newSettings);
    await db.collection('config').doc('settings').set(cleanData(newSettings));
    settings = { ...settings, ...newSettings };

    if (newSettings.botToken && (newSettings.botToken !== oldToken || newSettings.telegramApiRoot !== oldApiRoot)) {
      console.log('Bot token or Telegram API Root updated, auto-reinitializing bot instance...');
      await initBot(newSettings.botToken);
    }

    if (newSettings.companionBot !== undefined) {
      console.log('Companion bot settings updated, re-evaluating companion bot instance...');
      await initCompanionBot(newSettings.companionBot);
    }
    
    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'SETTINGS',
      user: user.username,
      chat: 'System',
      details: `Обновлены настройки системы.`
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update settings:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put('/api/filters', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') return res.status(403).json({ error: 'Access denied' });
    
    const newFilters = req.body;
    console.log('Updating filters:', newFilters);
    await db.collection('config').doc('moderation').set(cleanData(newFilters));
    filters = { ...filters, ...newFilters };
    
    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'SETTINGS',
      user: user.username,
      chat: 'System',
      details: `Обновлены глобальные правила модерации.`
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update filters:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const update = req.body;
    console.log(`Updating task ${req.params.id}:`, update);
    const taskIndex = tasks.findIndex(t => t.id === req.params.id);
    if (taskIndex !== -1) {
      tasks[taskIndex] = { ...tasks[taskIndex], ...update };
      await db.collection('tasks').doc(req.params.id).set(cleanData(tasks[taskIndex]));
    }
    res.json({ success: true });
  } catch (err) {
    console.error(`Failed to update task ${req.params.id}:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const task = req.body;
    console.log('Creating task:', task);
    await db.collection('tasks').doc(task.id).set(cleanData(task));
    tasks.push(task);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to create task:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await db.collection('tasks').doc(req.params.id).delete();
    tasks = tasks.filter(t => t.id !== req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/broadcast/delete-last', async (req, res) => {
  try {
    if (!bot) throw new Error('Bot not initialized');
    
    const results = [];
    for (const msg of lastBroadcastMessages) {
      try {
        await bot.telegram.deleteMessage(msg.chatId, msg.messageId);
        results.push({ ...msg, success: true });
      } catch (e) {
        results.push({ ...msg, success: false, error: (e as Error).message });
      }
    }
    
    lastBroadcastMessages = [];
    await db.collection('config').doc('broadcast').set({ messages: [] });
    
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/bans', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const ban = req.body;
    if (!ban.id) ban.id = Math.random().toString(36).substr(2, 9);
    if (!ban.date) ban.date = new Date().toISOString();
    
    await db.collection('bans').doc(ban.userId.toString()).set(cleanData(ban));
    
    // Update local state
    const index = bans.findIndex(b => String(b.userId) === String(ban.userId));
    if (index !== -1) {
      bans[index] = ban;
    } else {
      bans.push(ban);
    }
    
    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'BAN',
      user: user.username,
      chat: 'Global',
      details: `Глобальный бан пользователя ${ban.userId}. Причина: ${ban.reason}`
    });

    // Apply ban in all managed chats
    if (bot) {
      for (const chat of chats.filter(c => c.active)) {
        try {
          // Telegram API expects a number for userId; pass revoke_messages: true to delete recent messages on Telegram server
          await bot.telegram.banChatMember(chat.id, Number(ban.userId), { revoke_messages: true } as any);
          console.log(`Global ban applied for ${ban.userId} in chat ${chat.id} (${chat.title})`);
        } catch (e) {
          const errorMessage = (e as Error).message;
          
          // If chat is not found, deactivate it
          if (errorMessage.includes('chat not found')) {
            console.log(`Deactivating chat ${chat.id} because it was not found.`);
            chat.active = false;
            await updateChat(chat, true);
          } else {
            console.error(`Failed to apply global ban for ${ban.userId} in chat ${chat.id}:`, errorMessage);
          }
        }
      }
    }

    // If requested to clean messages, run comprehensive message purge
    let cleanResult = null;
    if (ban.cleanMessages) {
      try {
        cleanResult = await cleanUserMessages(ban.userId, false);
      } catch (cleanErr) {
        console.error('Failed to purge messages during ban:', cleanErr);
      }
    }
    
    res.json({ ...ban, cleanResult });
  } catch (err) {
    console.error('Failed to create global ban:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Message Cleaner Endpoints
app.post('/api/moderation/clean-user-messages', authenticateToken, async (req, res) => {
  try {
    const { userId, alsoBan, banReason } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Параметр userId обязателен' });
    }

    const result = await cleanUserMessages(
      String(userId),
      Boolean(alsoBan),
      banReason || 'Массовый спам в нескольких чатах'
    );
    res.json(result);
  } catch (err: any) {
    console.error('Error in /api/moderation/clean-user-messages:', err);
    res.status(500).json({ error: err?.message || 'Не удалось очистить сообщения' });
  }
});

app.get('/api/moderation/user-messages-stats/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'Параметр userId обязателен' });
    }

    const stats = await getUserMessagesStats(userId);
    res.json(stats);
  } catch (err: any) {
    console.error('Error in /api/moderation/user-messages-stats:', err);
    res.status(500).json({ error: err?.message || 'Не удалось получить статистику' });
  }
});

app.delete('/api/bans/:userId', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    await db.collection('bans').doc(req.params.userId).delete();
    // Update local state
    bans = bans.filter(b => String(b.userId) !== String(req.params.userId));
    
    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'BAN',
      user: user.username,
      chat: 'Global',
      details: `Снят глобальный бан с пользователя ${req.params.userId}`
    });

    // Unban in all managed chats
    if (bot) {
      for (const chat of chats.filter(c => c.active)) {
        try {
          // Telegram API expects a number for userId
          await bot.telegram.unbanChatMember(chat.id, Number(req.params.userId));
          console.log(`Global unban applied for ${req.params.userId} in chat ${chat.id} (${chat.title})`);
        } catch (e) {
          const errorMessage = (e as Error).message;
          
          // If chat is not found, deactivate it
          if (errorMessage.includes('chat not found')) {
            console.log(`Deactivating chat ${chat.id} because it was not found.`);
            chat.active = false;
            await updateChat(chat, true);
          } else {
            console.error(`Failed to apply global unban for ${req.params.userId} in chat ${chat.id}:`, errorMessage);
          }
        }
      }
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(`Failed to delete global ban for ${req.params.userId}:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/whitelist', async (req, res) => {
  try {
    const entry = req.body;
    console.log('Adding to whitelist:', entry);
    if (!entry.id) entry.id = Math.random().toString(36).substr(2, 9);
    if (!entry.addedAt) entry.addedAt = new Date().toISOString();
    
    await db.collection('whitelist').doc(entry.userId.toString()).set(cleanData(entry));
    
    // Update local state
    const index = whitelist.findIndex(w => String(w.userId) === String(entry.userId) || String(w.id) === String(entry.userId));
    if (index !== -1) {
      whitelist[index] = entry;
    } else {
      whitelist.push(entry);
    }
    
    console.log(`Whitelist updated. Total entries: ${whitelist.length}`);
    res.json(entry);
  } catch (err) {
    console.error('Failed to add to whitelist:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/whitelist/:userId', async (req, res) => {
  try {
    console.log(`Removing from whitelist: ${req.params.userId}`);
    await db.collection('whitelist').doc(req.params.userId).delete();
    // Update local state
    whitelist = whitelist.filter(w => String(w.userId) !== String(req.params.userId) && String(w.id) !== String(req.params.userId));
    console.log(`Whitelist updated after removal. Total entries: ${whitelist.length}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to remove from whitelist:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/chats', authenticateToken, async (req, res) => {
  try {
    const input = req.body;
    if (!input || !input.id) {
      return res.status(400).json({ error: 'Chat ID is required' });
    }
    const chatId = String(input.id).trim();
    let title = input.title || `Chat ${chatId}`;
    let members = Number(input.members) || 0;
    let avatarUrl = input.avatarUrl || `https://picsum.photos/seed/${chatId}/200`;

    if (bot) {
      try {
        const tgChat = await bot.telegram.getChat(chatId);
        if ('title' in tgChat && tgChat.title) {
          title = tgChat.title;
        } else if ('first_name' in tgChat) {
          title = `${tgChat.first_name || ''} ${tgChat.last_name || ''}`.trim() || title;
        }
        try {
          members = await bot.telegram.getChatMembersCount(chatId);
        } catch (e) {}
        if (tgChat.photo) {
          try {
            const fileLink = await bot.telegram.getFileLink(tgChat.photo.small_file_id);
            avatarUrl = fileLink.toString();
          } catch (e) {}
        }
      } catch (err: any) {
        console.warn(`Could not fetch chat info from Telegram for ${chatId}:`, err?.message);
      }
    }

    const existingChat = chats.find(c => String(c.id) === chatId);
    const newChat = {
      id: chatId,
      title,
      members: members || existingChat?.members || 0,
      muteNewcomers: input.muteNewcomers ?? existingChat?.muteNewcomers ?? false,
      muteDurationMinutes: input.muteDurationMinutes ?? existingChat?.muteDurationMinutes ?? 30,
      autoApprove: input.autoApprove ?? existingChat?.autoApprove ?? true,
      msgCount: input.msgCount ?? existingChat?.msgCount ?? 0,
      avatarUrl: avatarUrl || existingChat?.avatarUrl,
      active: input.active !== undefined ? !!input.active : (existingChat ? existingChat.active : true)
    };

    console.log('Adding/updating chat via API:', newChat);
    await updateChat(newChat, true);
    res.json(newChat);
  } catch (err) {
    console.error('Failed to add chat:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/chats/scan', authenticateToken, async (req, res) => {
  try {
    if (!bot) {
      return res.status(400).json({ error: 'Бот не инициализирован. Проверьте Bot Token в настройках.' });
    }
    console.log('Manually syncing chats with Telegram...');
    let updatedCount = 0;
    for (const chat of chats) {
      try {
        const tgChat = await bot.telegram.getChat(chat.id);
        let memberCount = chat.members;
        try {
          memberCount = await bot.telegram.getChatMembersCount(chat.id);
        } catch (e) {}
        let avatarUrl = chat.avatarUrl;
        if (tgChat.photo) {
          try {
            const fileLink = await bot.telegram.getFileLink(tgChat.photo.small_file_id);
            avatarUrl = fileLink.toString();
          } catch (e) {}
        }
        const updatedChat = {
          ...chat,
          title: 'title' in tgChat ? tgChat.title : chat.title,
          members: memberCount,
          avatarUrl
        };
        await updateChat(updatedChat, true);
        updatedCount++;
      } catch (e: any) {
        console.warn(`Scan error for chat ${chat.id}:`, e?.message);
      }
    }
    res.json({ success: true, updatedCount, totalChats: chats.length, chats });
  } catch (err: any) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/chats/:id', authenticateToken, async (req, res) => {
  try {
    const chatId = String(req.params.id);
    console.log('Removing chat:', chatId);
    await db.collection('chats').doc(chatId).delete();
    chats = chats.filter(c => String(c.id) !== chatId);
    res.json({ success: true });
  } catch (err) {
    console.error(`Failed to remove chat ${req.params.id}:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put('/api/chats/:id', authenticateToken, async (req, res) => {
  try {
    const updatedChat = { ...req.body, id: String(req.params.id) };
    console.log(`Updating chat ${req.params.id} (immediate):`, updatedChat);
    await updateChat(updatedChat, true);
    res.json({ success: true, chat: updatedChat });
  } catch (err) {
    console.error(`Failed to update chat ${req.params.id}:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/chats/:id/settings', authenticateToken, async (req, res) => {
  try {
    const chatSettings = req.body;
    const chatId = String(req.params.id);
    const existing = chats.find(c => String(c.id) === chatId);
    if (existing) {
      existing.settings = { ...existing.settings, ...chatSettings };
      await updateChat(existing, true);
    } else {
      await db.collection('chats').doc(chatId).update({ settings: cleanData(chatSettings) });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Bulk apply global filters to all or selected chats
app.post('/api/chats/bulk-apply-filters', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') return res.status(403).json({ error: 'Access denied' });

    const { fields, targetChatIds } = req.body || {};
    const targetChats = Array.isArray(targetChatIds) && targetChatIds.length > 0
      ? chats.filter(c => targetChatIds.includes(String(c.id)))
      : chats;

    for (const chat of targetChats) {
      if (fields === 'all' || !fields) {
        chat.blockLinks = filters.blockLinks;
        chat.blockTelegramLinks = filters.blockTelegramLinks;
        chat.blockMedia = filters.blockMedia;
        chat.blockForwards = filters.blockForwards;
        chat.deleteSystemMessages = filters.deleteSystemMessages;
        chat.deleteCommands = filters.deleteCommands;
        chat.autoApprove = filters.autoApprove;
        chat.captchaEnabled = filters.captchaEnabled;
        chat.captchaQuestion = filters.captchaQuestion;
        chat.captchaAnswer = filters.captchaAnswer;
        chat.muteNewcomers = filters.muteNewcomers;
        chat.muteDurationHours = filters.muteDurationHours;
        chat.requireChannelSubscription = filters.requireChannelSubscription;
        chat.channelSubscriptionTarget = filters.channelSubscriptionTarget;
        chat.channelSubscriptionMessage = filters.channelSubscriptionMessage;
        chat.tagAdminsEnabled = filters.tagAdminsEnabled;
        chat.tagAdminsMessage = filters.tagAdminsMessage;
      } else if (Array.isArray(fields)) {
        for (const field of fields) {
          (chat as any)[field] = (filters as any)[field];
        }
      }
      await updateChat(chat, true);
    }

    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'SETTINGS',
      user: user.username,
      chat: 'System',
      details: `Массовое применение правил модерации к ${targetChats.length} чатам.`
    });

    res.json({ success: true, updatedCount: targetChats.length, chats });
  } catch (err: any) {
    console.error('Failed to bulk apply filters:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk reset per-chat overrides so chats inherit global defaults dynamically
app.post('/api/chats/bulk-reset-overrides', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') return res.status(403).json({ error: 'Access denied' });

    const { fields, targetChatIds } = req.body || {};
    const targetChats = Array.isArray(targetChatIds) && targetChatIds.length > 0
      ? chats.filter(c => targetChatIds.includes(String(c.id)))
      : chats;

    for (const chat of targetChats) {
      if (fields === 'all' || !fields) {
        delete chat.blockLinks;
        delete chat.blockTelegramLinks;
        delete chat.blockMedia;
        delete chat.blockForwards;
        delete chat.deleteSystemMessages;
        delete chat.deleteCommands;
        delete chat.autoApprove;
        delete chat.captchaEnabled;
        delete chat.captchaQuestion;
        delete chat.captchaAnswer;
        delete chat.muteNewcomers;
        delete chat.muteDurationHours;
        delete chat.requireChannelSubscription;
        delete chat.channelSubscriptionTarget;
        delete chat.channelSubscriptionMessage;
        delete chat.tagAdminsEnabled;
        delete chat.tagAdminsMessage;
      } else if (Array.isArray(fields)) {
        for (const field of fields) {
          delete (chat as any)[field];
        }
      }
      await updateChat(chat, true);
    }

    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'SETTINGS',
      user: user.username,
      chat: 'System',
      details: `Сброс индивидуальных настроек на глобальные по умолчанию для ${targetChats.length} чатов.`
    });

    res.json({ success: true, updatedCount: targetChats.length, chats });
  } catch (err: any) {
    console.error('Failed to bulk reset overrides:', err);
    res.status(500).json({ error: err.message });
  }
});

// Pinned messages management per chat with cumulative history
app.get('/api/chats/:id/pinned', authenticateToken, async (req, res) => {
  const chatId = req.params.id;
  if (!bot) return res.status(500).json({ error: 'Бот не инициализирован' });

  try {
    let currentPinned: any = null;
    try {
      const chat = await bot.telegram.getChat(chatId);
      const pinned = (chat as any).pinned_message;
      if (pinned) {
        currentPinned = await recordPinnedMessage(chatId, pinned, false);
      }
    } catch (e: any) {
      console.warn(`[GetPinned] Could not fetch real-time getChat for ${chatId}:`, e.message || e);
    }

    // Get all accumulated pinned messages for this chat from database history
    const history = pinnedMessages
      .filter(p => String(p.chatId) === String(chatId))
      .sort((a, b) => (b.date || 0) - (a.date || 0));

    res.json({
      pinned: currentPinned || (history.length > 0 && !history[0].unpinned ? history[0] : null),
      history,
      totalCount: history.length
    });
  } catch (err: any) {
    console.error(`Failed to get pinned messages for chat ${chatId}:`, err);
    res.status(500).json({ error: err.message || 'Не удалось получить закрепленные сообщения' });
  }
});

app.post('/api/chats/:id/unpin', authenticateToken, async (req, res) => {
  const chatId = req.params.id;
  const { messageId } = req.body;
  const user = (req as any).user;

  if (!bot) return res.status(500).json({ error: 'Бот не инициализирован' });

  try {
    if (messageId) {
      await bot.telegram.unpinChatMessage(chatId, Number(messageId));
      console.log(`[Unpin] Successfully unpinned message ${messageId} in chat ${chatId} by ${user?.username || 'admin'}`);
      
      const recordId = `${chatId}_${messageId}`;
      const record = pinnedMessages.find(p => p.id === recordId);
      if (record) {
        record.unpinned = true;
        record.unpinnedAt = new Date().toISOString();
        queueWrite('pinned_messages', recordId, cleanData(record));
      }
    } else {
      await bot.telegram.unpinChatMessage(chatId);
      console.log(`[Unpin] Successfully unpinned latest pinned message in chat ${chatId} by ${user?.username || 'admin'}`);
      
      const latest = pinnedMessages.find(p => String(p.chatId) === String(chatId) && !p.unpinned);
      if (latest) {
        latest.unpinned = true;
        latest.unpinnedAt = new Date().toISOString();
        queueWrite('pinned_messages', latest.id, cleanData(latest));
      }
    }

    const chat = chats.find(c => String(c.id) === String(chatId));
    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'CHAT_UPDATE',
      user: user?.username || 'admin',
      chat: chat?.title || chatId,
      details: messageId ? `Откреплено сообщение #${messageId} через панель управления.` : `Откреплено последнее закрепленное сообщение.`
    });

    const updatedHistory = pinnedMessages
      .filter(p => String(p.chatId) === String(chatId))
      .sort((a, b) => (b.date || 0) - (a.date || 0));

    res.json({ success: true, message: 'Сообщение успешно откреплено', history: updatedHistory });
  } catch (err: any) {
    console.error(`Failed to unpin message in chat ${chatId}:`, err);
    res.status(500).json({ error: err.message || 'Не удалось открепить сообщение. Убедитесь, что у бота есть права администратора на управление закрепами.' });
  }
});

app.post('/api/chats/:id/unpin-all', authenticateToken, async (req, res) => {
  const chatId = req.params.id;
  const user = (req as any).user;

  if (!bot) return res.status(500).json({ error: 'Бот не инициализирован' });

  try {
    await bot.telegram.unpinAllChatMessages(chatId);
    console.log(`[UnpinAll] Successfully unpinned all messages in chat ${chatId} by ${user?.username || 'admin'}`);

    const nowIso = new Date().toISOString();
    pinnedMessages.forEach(p => {
      if (String(p.chatId) === String(chatId)) {
        p.unpinned = true;
        p.unpinnedAt = nowIso;
        queueWrite('pinned_messages', p.id, cleanData(p));
      }
    });

    const chat = chats.find(c => String(c.id) === String(chatId));
    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'CHAT_UPDATE',
      user: user?.username || 'admin',
      chat: chat?.title || chatId,
      details: `Откреплены ВСЕ закрепленные сообщения в чате через панель управления.`
    });

    const updatedHistory = pinnedMessages
      .filter(p => String(p.chatId) === String(chatId))
      .sort((a, b) => (b.date || 0) - (a.date || 0));

    res.json({ success: true, message: 'Все закрепленные сообщения в чате откреплены', history: updatedHistory });
  } catch (err: any) {
    console.error(`Failed to unpin all messages in chat ${chatId}:`, err);
    res.status(500).json({ error: err.message || 'Не удалось открепить все сообщения. Убедитесь, что у бота есть права администратора на управление закрепами.' });
  }
});

app.delete('/api/chats/:id/pinned/:messageId', authenticateToken, async (req, res) => {
  const { id: chatId, messageId } = req.params;
  try {
    const recordId = `${chatId}_${messageId}`;
    pinnedMessages = pinnedMessages.filter(p => p.id !== recordId);
    queueDelete('pinned_messages', recordId);
    res.json({ success: true, message: 'Запись удалена из истории закрепов' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка удаления из базы данных' });
  }
});

// Reputation API Endpoints
app.get('/api/reputation', authenticateToken, async (req, res) => {
  try {
    const { chatId, sort, search } = req.query as { chatId?: string; sort?: string; search?: string };
    let list = reputations.map(r => ({ ...r }));

    // Filter by chat if specified
    if (chatId && chatId !== 'all') {
      list = list.filter(r => r.chatScores && r.chatScores[chatId] !== undefined);
      list = list.map(r => ({
        ...r,
        score: r.chatScores[chatId] || 0
      }));
    }

    // Filter by search query
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => 
        (r.username && r.username.toLowerCase().includes(q)) ||
        (r.firstName && r.firstName.toLowerCase().includes(q)) ||
        (r.lastName && r.lastName.toLowerCase().includes(q)) ||
        String(r.userId).includes(q)
      );
    }

    if (sort === 'anti') {
      list.sort((a, b) => (a.score || 0) - (b.score || 0));
    } else {
      // Default top
      list.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post(['/api/reputation', '/api/reputation/:userId/adjust'], authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId || req.body.userId;
    if (!targetUserId) {
      return res.status(400).json({ error: 'Не указан ID пользователя' });
    }
    const { delta, reason, chatId } = req.body;
    const user = (req as any).user;
    
    const rep = await adjustUserReputation(
      String(targetUserId),
      Number(delta) || 1,
      reason || 'Корректировка администратором',
      `admin_${user?.id || 'panel'}`,
      user?.username || 'Admin',
      chatId || 'global',
      chatId ? (chats.find(c => String(c.id) === String(chatId))?.title || `Чат ${chatId}`) : 'Глобально'
    );

    res.json(rep);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete(['/api/reputation/:userId', '/api/reputation/:userId/reset'], authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    await db.collection('reputations').doc(targetUserId).delete();
    reputations = reputations.filter(r => String(r.userId) !== String(targetUserId));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Test Reputation Notification to Telegram Info Chat
app.post('/api/reputation/test-notify', authenticateToken, async (req, res) => {
  try {
    if (!bot) {
      return res.status(503).json({ error: 'Основной Telegram бот не запущен. Проверьте токен бота в настройках.' });
    }

    const customTarget = req.body.chatId ? String(req.body.chatId).trim() : '';
    const targetChatId = customTarget || (settings as any).reputationNotifyChatId || (filters as any).reputationNotifyChatId || settings.infoChatId || antiScamKeywordsConfig.notifyChatId || process.env.BOOKRAY_CHAT_ID;

    if (!targetChatId) {
      return res.status(400).json({ 
        error: 'Не указан ID чата для оповещений. Укажите ID в поле «Чат для уведомлений о репутации» или установите infoChatId.' 
      });
    }

    const testMsg = 
      `⭐️ <b>Тестовое уведомление репутации (+1)</b>\n\n` +
      `👤 <b>Кому:</b> <a href="tg://user?id=12345678">Тестовый Байкер</a> (@test_rider)\n` +
      `✍️ <b>От кого:</b> Администратор (${escapeHtml((req as any).user?.username || 'Admin')})\n` +
      `📍 <b>Чат:</b> <i>Тестовый чат</i>\n` +
      `💬 <b>Причина:</b> Проверка доставки уведомлений из панели управления\n` +
      `📈 <b>Текущий рейтинг:</b> <code>+10</code>\n` +
      `⏰ <i>${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)</i>`;

    const sent = await bot.telegram.sendMessage(targetChatId, testMsg, { parse_mode: 'HTML' });
    res.json({ success: true, messageId: sent.message_id, targetChatId });
  } catch (err: any) {
    console.error('Failed to send test reputation notification:', err);
    res.status(500).json({ error: err.message || 'Ошибка отправки тестового уведомления' });
  }
});

// Companion Bot (Second Bot) API Endpoints
app.post('/api/companion-bot/verify', authenticateToken, async (req, res) => {
  try {
    const { botToken } = req.body;
    if (!botToken || !String(botToken).trim()) {
      return res.status(400).json({ error: 'Токен бота не указан' });
    }

    const token = String(botToken).trim();
    const apiRoot = settings.telegramApiRoot || process.env.TELEGRAM_API_ROOT;
    const telegrafOptions: any = { handlerTimeout: 15000 };
    if (apiRoot) {
      telegrafOptions.telegram = { apiRoot: apiRoot.replace(/\/$/, '') };
    }

    const tempBot = new Telegraf(token, telegrafOptions);
    const me = await tempBot.telegram.getMe();
    
    res.json({
      success: true,
      bot: {
        id: me.id,
        username: me.username,
        firstName: me.first_name,
        canJoinGroups: me.can_join_groups,
        canReadAllGroupMessages: me.can_read_all_group_messages
      }
    });
  } catch (err: any) {
    console.error('Failed to verify companion bot token:', err);
    res.status(400).json({ error: err.message || 'Не удалось проверить токен Telegram бота. Проверьте правильность токена.' });
  }
});

app.post('/api/companion-bot/test', authenticateToken, async (req, res) => {
  try {
    const { prompt, settings: customSettings, chatTitle } = req.body;
    const targetSettings = customSettings || (settings as any).companionBot || {};

    const dummyMessage = {
      sender: 'УчастникЧАТА',
      text: prompt || 'Привет всем! Подскажите, какое масло лучше лить в вилку Honda CBR?'
    };
    const dummyHistory = [
      { sender: 'Михаил', text: 'Здорово мужики, сезон скоро закрывать' },
      { sender: 'Алексей', text: 'Да еще катаем во всю, погода отличная!' }
    ];

    const reply = await generateCompanionBotResponse(
      chatTitle || 'Yamaha & Honda Моточат',
      dummyMessage,
      dummyHistory,
      targetSettings
    );

    res.json({ success: true, reply, prompt: dummyMessage.text });
  } catch (err: any) {
    console.error('Failed to generate companion test response:', err);
    res.status(500).json({ error: err.message || 'Ошибка генерации ответа через Gemini' });
  }
});

app.get('/api/companion-bot/status', authenticateToken, (req, res) => {
  const cfg = (settings as any).companionBot;
  res.json({
    enabled: Boolean(cfg?.enabled),
    isRunning: Boolean(companionBot && isCompanionBotPollingActive),
    botInfo: companionBotInfo,
    repliesCount: companionBotRepliesCount
  });
});

// Warnings API Endpoints
app.get('/api/warnings', authenticateToken, async (req, res) => {
  try {
    const { chatId, userId, activeOnly } = req.query as { chatId?: string; userId?: string; activeOnly?: string };
    let list = [...warnings];

    if (chatId && chatId !== 'all') {
      list = list.filter(w => String(w.chatId) === String(chatId));
    }
    if (userId) {
      list = list.filter(w => String(w.userId) === String(userId));
    }
    if (activeOnly === 'true') {
      list = list.filter(w => w.active);
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/warnings', authenticateToken, async (req, res) => {
  try {
    const { userId, chatId, reason } = req.body;
    const adminUser = (req as any).user;
    if (!userId || !chatId) {
      return res.status(400).json({ error: 'userId and chatId are required' });
    }

    const chat = chats.find(c => c.id === chatId);
    const chatTitle = chat ? chat.title : chatId;
    
    // Find user details from memberships
    const member = memberships.find(m => String(m.userId) === String(userId) && String(m.chatId) === String(chatId));
    const target = {
      id: Number(userId),
      username: member?.username ? member.username.replace('@', '') : undefined,
      first_name: member?.firstName || `User ${userId}`,
      last_name: member?.lastName
    };

    const newWarn = await applyWarning(
      target,
      adminUser.username || 'Admin',
      String(adminUser.id),
      chatId,
      chatTitle,
      reason || 'Предупреждение от администратора'
    );

    res.json(newWarn);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/warnings/:id', authenticateToken, async (req, res) => {
  try {
    const warningId = req.params.id;
    const warn = warnings.find(w => w.id === warningId);
    if (warn) {
      warn.active = false;
      await db.collection('warnings').doc(warningId).set(cleanData(warn));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Active Mutes API Endpoints
app.get('/api/active-mutes', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.query as { chatId?: string };
    let list = [...activeMutes];
    if (chatId && chatId !== 'all') {
      list = list.filter(m => String(m.chatId) === String(chatId));
    }
    const enriched = list.map(m => {
      const chat = chats.find(c => String(c.id) === String(m.chatId));
      return {
        ...m,
        chatTitle: chat?.title || m.chatId
      };
    });
    enriched.sort((a, b) => (b.unmuteAt || 0) - (a.unmuteAt || 0));
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/active-mutes/unmute', authenticateToken, async (req, res) => {
  try {
    const { chatId, userId } = req.body;
    const user = (req as any).user;
    if (!chatId || !userId) {
      return res.status(400).json({ error: 'chatId and userId are required' });
    }
    await unmuteUser(String(chatId), String(userId), user?.username || 'Администратор (панель)');
    res.json({ success: true, message: 'Ограничения успешно сняты' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/active-mutes', authenticateToken, async (req, res) => {
  try {
    const { chatId, userId, durationHours, reason, userName } = req.body;
    if (!chatId || !userId) {
      return res.status(400).json({ error: 'chatId and userId are required' });
    }
    const hours = Number(durationHours) || 1;
    const newMute = await applyMuteToUser(
      String(chatId),
      String(userId),
      hours,
      reason || 'command',
      userName
    );
    res.json(newMute);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Periodic background auto-unmute check (runs every 30 seconds)
setInterval(async () => {
  if (!activeMutes || activeMutes.length === 0) return;
  const now = Date.now();
  const expiredMutes = activeMutes.filter(m => m.unmuteAt && m.unmuteAt <= now);
  
  for (const mute of expiredMutes) {
    try {
      console.log(`[AutoUnmute] Expired mute for user ${mute.userId} in chat ${mute.chatId}. Unmuting...`);
      await unmuteUser(mute.chatId, mute.userId, 'Автоматически (истек срок)');
    } catch (e: any) {
      console.error(`[AutoUnmute] Failed to unmute user ${mute.userId}:`, e?.message || e);
    }
  }
}, 30000);

// Gemini & AI Status API
app.get(['/api/gemini/status', '/api/ai/status'], authenticateToken, (req, res) => {
  const provider = settings?.aiProvider || 'gemini';
  const hasGemini = !!(settings?.geminiApiKey || process.env.GEMINI_API_KEY);
  const hasOpenRouter = !!settings?.openRouterApiKey;
  const hasCustom = !!settings?.customAiEndpoint;

  let configured = false;
  let activeKeyMasked = '';

  if (provider === 'openrouter') {
    configured = hasOpenRouter;
    if (settings?.openRouterApiKey) {
      activeKeyMasked = settings.openRouterApiKey.slice(0, 8) + '...' + settings.openRouterApiKey.slice(-4);
    }
  } else if (provider === 'custom') {
    configured = hasCustom;
    activeKeyMasked = settings?.customAiEndpoint || '';
  } else {
    configured = hasGemini;
    const key = settings?.geminiApiKey || process.env.GEMINI_API_KEY || '';
    if (key) {
      activeKeyMasked = key.slice(0, 6) + '...' + key.slice(-4);
    }
  }

  const model = provider === 'openrouter'
    ? (settings?.openRouterModel || 'google/gemini-2.0-flash-001')
    : (provider === 'custom' ? (settings?.customAiModel || 'gpt-4o-mini') : sanitizeGeminiModel(settings?.geminiModel || 'gemini-3.1-flash-lite'));

  const detectedTelegramProxy = settings?.telegramApiRoot || '';
  const detectedCfWorker = (settings?.cfWorkerUrl && !settings.disableCloudflare) ? settings.cfWorkerUrl : '';
  const effectiveGeminiProxy = getGeminiEffectiveBaseUrl();

  res.json({
    configured,
    provider,
    model,
    activeKeyMasked,
    hasGemini,
    hasOpenRouter,
    hasCustom,
    baseUrl: settings?.geminiBaseUrl || '',
    geminiUseProxy: settings?.geminiUseProxy !== false,
    geminiProxySource: settings?.geminiProxySource || 'auto',
    detectedTelegramProxy,
    detectedCfWorker,
    effectiveGeminiProxy,
    settings: {
      aiProvider: settings?.aiProvider || 'gemini',
      geminiApiKey: settings?.geminiApiKey ? (settings.geminiApiKey.slice(0, 6) + '...' + settings.geminiApiKey.slice(-4)) : (process.env.GEMINI_API_KEY ? 'Настроен в .env' : ''),
      geminiModel: sanitizeGeminiModel(settings?.geminiModel || 'gemini-3.1-flash-lite'),
      geminiBaseUrl: settings?.geminiBaseUrl || '',
      geminiUseProxy: settings?.geminiUseProxy !== false,
      geminiProxySource: settings?.geminiProxySource || 'auto',
      openRouterApiKey: settings?.openRouterApiKey ? (settings.openRouterApiKey.slice(0, 8) + '...' + settings.openRouterApiKey.slice(-4)) : '',
      openRouterModel: settings?.openRouterModel || 'google/gemini-2.0-flash-001',
      customAiEndpoint: settings?.customAiEndpoint || '',
      customAiApiKey: settings?.customAiApiKey ? '••••••••' : '',
      customAiModel: settings?.customAiModel || 'gpt-4o-mini'
    }
  });
});

// Update AI Settings
app.post('/api/ai/settings', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      aiProvider,
      geminiApiKey,
      geminiModel,
      geminiBaseUrl,
      geminiUseProxy,
      geminiProxySource,
      openRouterApiKey,
      openRouterModel,
      customAiEndpoint,
      customAiApiKey,
      customAiModel
    } = req.body;

    const updatedAiSettings: any = {};
    if (aiProvider !== undefined) updatedAiSettings.aiProvider = aiProvider;
    if (geminiApiKey !== undefined) {
      if (geminiApiKey === '' || (!geminiApiKey.includes('...') && geminiApiKey !== 'Настроен в .env')) {
        updatedAiSettings.geminiApiKey = geminiApiKey.trim();
      }
    }
    if (geminiModel !== undefined) updatedAiSettings.geminiModel = sanitizeGeminiModel(geminiModel);
    if (geminiBaseUrl !== undefined) updatedAiSettings.geminiBaseUrl = geminiBaseUrl.trim();
    if (geminiUseProxy !== undefined) updatedAiSettings.geminiUseProxy = geminiUseProxy;
    if (geminiProxySource !== undefined) updatedAiSettings.geminiProxySource = geminiProxySource;
    if (openRouterApiKey !== undefined) {
      if (openRouterApiKey === '' || !openRouterApiKey.includes('...')) {
        updatedAiSettings.openRouterApiKey = openRouterApiKey.trim();
      }
    }
    if (openRouterModel !== undefined) updatedAiSettings.openRouterModel = openRouterModel;
    if (customAiEndpoint !== undefined) updatedAiSettings.customAiEndpoint = customAiEndpoint.trim();
    if (customAiApiKey !== undefined && customAiApiKey !== '••••••••') {
      updatedAiSettings.customAiApiKey = customAiApiKey.trim();
    }
    if (customAiModel !== undefined) updatedAiSettings.customAiModel = customAiModel;

    settings = { ...settings, ...updatedAiSettings };
    await db.collection('config').doc('settings').set(cleanData(settings));

    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'SETTINGS',
      user: user.username || 'Admin',
      chat: 'System',
      details: `Обновлены настройки ИИ (Провайдер: ${settings.aiProvider}, Прокси для Gemini: ${settings.geminiUseProxy !== false ? 'Вкл' : 'Выкл'})`
    });

    res.json({ 
      success: true, 
      message: 'Настройки ИИ успешно сохранены',
      aiProvider: settings.aiProvider,
      configured: true,
      effectiveGeminiProxy: getGeminiEffectiveBaseUrl()
    });
  } catch (err: any) {
    console.error('Failed to update AI settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// Test AI Connection Endpoint
app.post('/api/ai/test', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { 
      provider: testProvider, 
      apiKey: testApiKey, 
      model: testModel, 
      baseUrl: testBaseUrl, 
      endpoint: testEndpoint,
      useProxy: testUseProxy,
      proxySource: testProxySource
    } = req.body || {};

    const activeProvider = testProvider || settings?.aiProvider || 'gemini';
    const testPrompt = 'Ответь на русском языке строго одним коротким предложением: «ИИ подключен и готов к работе!».';

    let resultText = '';
    let usedProxyUrl: string | null = null;

    if (activeProvider === 'openrouter') {
      const key = (testApiKey && !testApiKey.includes('...')) ? testApiKey : settings?.openRouterApiKey;
      if (!key) throw new Error('API-ключ OpenRouter не указан. Введите ключ для проверки.');
      const model = testModel || settings?.openRouterModel || 'google/gemini-2.5-flash';
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://openrouter.ai',
          'X-Title': 'TeleGuard Bot Manager',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: testPrompt }]
        })
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`OpenRouter HTTP ${r.status}: ${t}`);
      }
      const data: any = await r.json();
      resultText = data.choices?.[0]?.message?.content || '';
    } else if (activeProvider === 'custom') {
      const ep = testEndpoint || settings?.customAiEndpoint;
      if (!ep) throw new Error('Кастомный URL эндпоинта не указан.');
      const key = testApiKey && testApiKey !== '••••••••' ? testApiKey : settings?.customAiApiKey;
      const model = testModel || settings?.customAiModel || 'gpt-4o-mini';
      const cleanEp = ep.replace(/\/$/, '');
      const url = cleanEp.endsWith('/chat/completions') ? cleanEp : `${cleanEp}/chat/completions`;
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { 'Authorization': `Bearer ${key.trim()}` } : {})
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: testPrompt }]
        })
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Custom AI HTTP ${r.status}: ${t}`);
      }
      const data: any = await r.json();
      resultText = data.choices?.[0]?.message?.content || '';
    } else {
      // Google Gemini
      const key = (testApiKey && !testApiKey.includes('...') && testApiKey !== 'Настроен в .env') 
        ? testApiKey 
        : (settings?.geminiApiKey || process.env.GEMINI_API_KEY);

      if (!key) throw new Error('API-ключ Google Gemini не указан.');
      let model = sanitizeGeminiModel(testModel || settings?.geminiModel || 'gemini-3.1-flash-lite');
      if (testModel && !DEPRECATED_GEMINI_MODELS.has(testModel.trim())) {
        model = testModel.trim();
      }
      
      let effectiveBase = getGeminiEffectiveBaseUrl({
        customBaseUrl: testBaseUrl,
        proxySource: testProxySource
      });
      if (testUseProxy === false) {
        effectiveBase = null;
      }

      if (effectiveBase) {
        usedProxyUrl = effectiveBase;
        const cleanBase = effectiveBase.replace(/\/$/, '');
        const url = `${cleanBase}/v1beta/models/${model}:generateContent?key=${key.trim()}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: testPrompt }] }] })
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`Proxy (${cleanBase}) HTTP ${r.status}: ${t}`);
        }
        const data: any = await r.json();
        resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        try {
          const client = new GoogleGenAI({
            apiKey: key.trim(),
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build'
              }
            }
          });
          const resp = await client.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: testPrompt }] }]
          });
          resultText = resp.text || '';
        } catch (directErr: any) {
          const msg = directErr?.message || String(directErr);
          if (msg.includes('User location is not supported') || msg.includes('FAILED_PRECONDITION')) {
            const fallbackProxy = (settings?.cfWorkerUrl && !settings.disableCloudflare ? settings.cfWorkerUrl : null) || (settings?.geminiBaseUrl ? settings.geminiBaseUrl : null);
            if (fallbackProxy) {
              console.log(`[Gemini Test] Direct failed by region. Testing detected proxy fallback: ${fallbackProxy}`);
              const cleanBase = fallbackProxy.replace(/\/$/, '');
              const url = `${cleanBase}/v1beta/models/${model}:generateContent?key=${key.trim()}`;
              const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: testPrompt }] }] })
              });
              if (r.ok) {
                const data: any = await r.json();
                resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                usedProxyUrl = fallbackProxy;
              } else {
                throw directErr;
              }
            } else {
              throw directErr;
            }
          } else {
            throw directErr;
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    const proxyNotice = usedProxyUrl ? ` (через Proxy: ${usedProxyUrl})` : '';

    res.json({
      success: true,
      message: `Подключение успешно! Ответ получен за ${duration} мс${proxyNotice}.`,
      sample: resultText.trim(),
      provider: activeProvider,
      usedProxy: !!usedProxyUrl,
      proxyUrl: usedProxyUrl
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const msg = err?.message || String(err);
    let hint = '';
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded')) {
      const retryMatch = msg.match(/retry in\s+([0-9.]+\s*s(?:econds?)?)/i);
      const retryTime = retryMatch ? retryMatch[1] : '20-30 секунд';
      hint = `Превышен лимит запросов Google Gemini Free Tier (HTTP 429). Подождите ${retryTime}, либо выберите сверхбыструю модель gemini-3.1-flash-lite / OpenRouter.`;
    } else if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
      hint = 'Сервис Google Gemini испытывает временную пиковую нагрузку (HTTP 503 High Demand). Рекомендуем выбрать сверхбыструю стабильную модель gemini-3.1-flash-lite или gemini-flash-lite-latest.';
    } else if (msg.includes('Access denied by security policy')) {
      hint = 'OpenRouter отклонил запрос политикой безопасности ключа. Решение: 1) В кабинете openrouter.ai/keys создайте ключ без ограничений (Default). 2) Если баланс $0, укажите бесплатную модель. 3) В настройках аккаунта openrouter.ai/settings/privacy проверьте правила доступа.';
    } else if (msg.includes('is no longer available') || (msg.includes('404') && msg.includes('models/'))) {
      hint = 'Выбранная модель устарела или недоступна в Google API (HTTP 404). В настройках ИИ выберите актуальную модель: gemini-3.1-flash-lite (рекомендуется), gemini-3.8-flash или gemini-flash-lite-latest.';
    } else if (msg.includes('524') || msg.includes('A timeout occurred') || msg.includes('timeout')) {
      hint = 'Cloudflare Worker вернул ошибку 524 (Timeout). Решение: в настройках ИИ выберите быструю модель gemini-3.1-flash-lite, либо обновите код Worker в Cloudflare Dashboard.';
    } else if (msg.includes('404') && (msg.includes('Proxy') || msg.includes('description":"Not Found"'))) {
      hint = 'Указанный прокси вернул 404 Not Found. Обратите внимание: Telegram API Proxy предназначен исключительно для Telegram и не умеет обрабатывать запросы к Google Gemini. Для Gemini используйте Cloudflare Worker или переключитесь на OpenRouter.';
    } else if (msg.includes('User location is not supported') || msg.includes('FAILED_PRECONDITION')) {
      hint = 'Геолокация сервера ограничена Google. Решение: разверните Cloudflare Worker по инструкции и укажите его в Настройках, либо переключитесь на OpenRouter.';
    } else if (msg.includes('API_KEY_INVALID') || msg.includes('invalid api key') || msg.includes('401')) {
      hint = 'Неверный API-ключ. Проверьте правильность скопированного ключа.';
    } else if (msg.includes('403')) {
      hint = 'Доступ запрещен (HTTP 403). Проверьте права API-ключа, баланс или ограничения безопасности провайдера.';
    }

    res.status(400).json({
      success: false,
      error: msg,
      hint,
      duration
    });
  }
});

function snapTo5MinuteSlot(timeStr: string): string {
  if (!timeStr || typeof timeStr !== 'string') return '21:00';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  let m = parseInt(mStr, 10);
  if (isNaN(h) || h < 0 || h > 23) h = 21;
  if (isNaN(m) || m < 0 || m > 59) m = 0;
  m = Math.round(m / 5) * 5;
  if (m >= 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function findNextAvailable5MinSlot(preferredTime: string, chatId: string, configs: any[]): string {
  let slot = snapTo5MinuteSlot(preferredTime);
  let attempts = 0;
  while (attempts < 288) {
    const isTaken = configs.some(c => String(c.chatId) !== String(chatId) && c.enabled && c.scheduleTime === slot);
    if (!isTaken) return slot;
    
    const [hStr, mStr] = slot.split(':');
    let h = parseInt(hStr, 10);
    let m = parseInt(mStr, 10) + 5;
    if (m >= 60) {
      m = 0;
      h = (h + 1) % 24;
    }
    slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    attempts++;
  }
  return slot;
}

// Digest Configurations API
app.get('/api/digests/configs', authenticateToken, (req, res) => {
  res.json(digestConfigs);
});

app.post('/api/digests/configs', authenticateToken, async (req, res) => {
  try {
    const configData = req.body;
    if (!configData.chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }

    const chatIdStr = String(configData.chatId).trim();
    const chat = chats.find(c => String(c.id) === chatIdStr);
    const configIndex = digestConfigs.findIndex(c => String(c.chatId) === chatIdStr);
    const existingConfig = configIndex >= 0 ? digestConfigs[configIndex] : null;

    let targetTime = snapTo5MinuteSlot(configData.scheduleTime || existingConfig?.scheduleTime || '21:00');
    const isEnabled = configData.enabled !== undefined ? !!configData.enabled : (existingConfig?.enabled || false);

    // Strict exclusive time slot validation for enabled chats:
    if (isEnabled) {
      const conflict = digestConfigs.find(c => String(c.chatId) !== chatIdStr && c.enabled && c.scheduleTime === targetTime);
      if (conflict) {
        if (req.query.autoSlot === 'true' || configData.autoAssignSlot) {
          targetTime = findNextAvailable5MinSlot(targetTime, chatIdStr, digestConfigs);
        } else {
          return res.status(409).json({
            error: `Время ${targetTime} уже занято чатом «${conflict.chatTitle || conflict.chatId}». Выберите другое свободное время с интервалом 5 минут.`,
            conflictingChat: conflict.chatTitle || conflict.chatId,
            suggestedTime: findNextAvailable5MinSlot(targetTime, chatIdStr, digestConfigs)
          });
        }
      }
    }

    const updatedConfig = {
      chatId: chatIdStr,
      chatTitle: chat?.title || configData.chatTitle || existingConfig?.chatTitle || `Чат ${chatIdStr}`,
      enabled: isEnabled,
      scheduleTime: targetTime,
      hoursBack: Number(configData.hoursBack) || existingConfig?.hoursBack || 24,
      targetChatId: configData.targetChatId || existingConfig?.targetChatId || chatIdStr,
      customPrompt: configData.customPrompt !== undefined ? configData.customPrompt : (existingConfig?.customPrompt || ''),
      toneStyle: configData.toneStyle || existingConfig?.toneStyle || 'default',
      autoSendTelegram: configData.autoSendTelegram !== undefined ? !!configData.autoSendTelegram : (existingConfig?.autoSendTelegram !== undefined ? existingConfig.autoSendTelegram : true),
      minMessageThreshold: Number(configData.minMessageThreshold) || existingConfig?.minMessageThreshold || 10,
      lastGeneratedAt: configData.lastGeneratedAt !== undefined ? configData.lastGeneratedAt : (existingConfig?.lastGeneratedAt || null),
      lastSentAt: configData.lastSentAt !== undefined ? configData.lastSentAt : (existingConfig?.lastSentAt || null),
      lastWaveSummarizedAt: configData.lastWaveSummarizedAt !== undefined ? configData.lastWaveSummarizedAt : (existingConfig?.lastWaveSummarizedAt || null),
      retryCount: configData.retryCount !== undefined ? Number(configData.retryCount) : (existingConfig?.retryCount || 0),
      nextRetryAt: configData.nextRetryAt !== undefined ? configData.nextRetryAt : (existingConfig?.nextRetryAt || null),
      status: configData.status !== undefined ? configData.status : (existingConfig?.status || 'idle'),
      lastError: configData.lastError !== undefined ? configData.lastError : (existingConfig?.lastError || null)
    };

    if (configIndex >= 0) {
      digestConfigs[configIndex] = { ...digestConfigs[configIndex], ...updatedConfig };
    } else {
      digestConfigs.push(updatedConfig);
    }

    const cleanedPayload = cleanData({ configs: digestConfigs });
    await db.collection('config').doc('digest_configs').set(cleanedPayload);
    console.log(`[DigestConfigs] Successfully persisted config for chat ${chatIdStr}. Enabled: ${updatedConfig.enabled}, Time: ${updatedConfig.scheduleTime}`);
    res.json(updatedConfig);
  } catch (err) {
    console.error('[DigestConfigs] Failed to save config:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/digests/configs/bulk', authenticateToken, async (req, res) => {
  try {
    const { configs: newConfigs } = req.body;
    if (Array.isArray(newConfigs)) {
      const assignedTimes = new Set<string>();

      for (const item of newConfigs) {
        if (!item.chatId) continue;
        const chatIdStr = String(item.chatId).trim();
        const chat = chats.find(c => String(c.id) === chatIdStr);
        const idx = digestConfigs.findIndex(c => String(c.chatId) === chatIdStr);
        const existing = idx >= 0 ? digestConfigs[idx] : null;

        let slot = snapTo5MinuteSlot(item.scheduleTime || existing?.scheduleTime || '21:00');
        const isEnabled = item.enabled !== undefined ? !!item.enabled : (existing?.enabled || false);

        if (isEnabled) {
          while (assignedTimes.has(slot)) {
            const [hStr, mStr] = slot.split(':');
            let h = parseInt(hStr, 10);
            let m = parseInt(mStr, 10) + 5;
            if (m >= 60) {
              m = 0;
              h = (h + 1) % 24;
            }
            slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          }
          assignedTimes.add(slot);
        }

        const updated = {
          chatId: chatIdStr,
          chatTitle: chat?.title || item.chatTitle || existing?.chatTitle || `Чат ${chatIdStr}`,
          enabled: isEnabled,
          scheduleTime: slot,
          hoursBack: Number(item.hoursBack) || existing?.hoursBack || 24,
          targetChatId: item.targetChatId || existing?.targetChatId || chatIdStr,
          customPrompt: item.customPrompt !== undefined ? item.customPrompt : (existing?.customPrompt || ''),
          toneStyle: item.toneStyle || existing?.toneStyle || 'default',
          autoSendTelegram: item.autoSendTelegram !== undefined ? !!item.autoSendTelegram : (existing?.autoSendTelegram !== undefined ? existing.autoSendTelegram : true),
          minMessageThreshold: Number(item.minMessageThreshold) || existing?.minMessageThreshold || 10,
          lastGeneratedAt: item.lastGeneratedAt !== undefined ? item.lastGeneratedAt : (existing?.lastGeneratedAt || null),
          lastSentAt: item.lastSentAt !== undefined ? item.lastSentAt : (existing?.lastSentAt || null),
          lastWaveSummarizedAt: item.lastWaveSummarizedAt !== undefined ? item.lastWaveSummarizedAt : (existing?.lastWaveSummarizedAt || null)
        };
        if (idx >= 0) {
          digestConfigs[idx] = { ...digestConfigs[idx], ...updated };
        } else {
          digestConfigs.push(updated);
        }
      }
      const cleanedPayload = cleanData({ configs: digestConfigs });
      await db.collection('config').doc('digest_configs').set(cleanedPayload);
      console.log(`[DigestConfigs] Bulk saved ${newConfigs.length} digest configurations with 5-minute spacing.`);
    }
    res.json({ success: true, configs: digestConfigs });
  } catch (err) {
    console.error('[DigestConfigs] Bulk save failed:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/digests/distribute-schedules', authenticateToken, async (req, res) => {
  try {
    const { startTime = '21:00', intervalMinutes = 5 } = req.body || {};
    let [startH, startM] = (startTime || '21:00').split(':').map(Number);
    if (isNaN(startH) || startH < 0 || startH > 23) startH = 21;
    if (isNaN(startM) || startM < 0 || startM > 59) startM = 0;
    startM = Math.round(startM / 5) * 5;

    let curH = startH;
    let curM = startM;
    const step = Number(intervalMinutes) || 5;

    const enabledConfigs = digestConfigs.filter(c => c.enabled);
    for (const cfg of enabledConfigs) {
      cfg.scheduleTime = `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`;
      curM += step;
      if (curM >= 60) {
        curH = (curH + Math.floor(curM / 60)) % 24;
        curM = curM % 60;
      }
    }

    const cleanedPayload = cleanData({ configs: digestConfigs });
    await db.collection('config').doc('digest_configs').set(cleanedPayload);
    console.log(`[DigestConfigs] Auto-distributed ${enabledConfigs.length} chat digest times starting from ${startTime} with ${step}min step.`);
    res.json({ success: true, configs: digestConfigs });
  } catch (err: any) {
    console.error('[DigestConfigs] Auto-distribute failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Digest History API
app.get('/api/digests/history', authenticateToken, (req, res) => {
  const { chatId } = req.query;
  let list = [...chatDigests];
  if (chatId) {
    list = list.filter(d => String(d.chatId) === String(chatId));
  }
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(list);
});

app.post('/api/digests/generate', authenticateToken, async (req, res) => {
  try {
    const { chatId, hoursBack, customPrompt, sendImmediately, targetChatId, toneStyle } = req.body;
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }

    // Process through sequential queue to prevent concurrent AI bursts
    const digest = await enqueueDigest({
      id: Math.random().toString(36).substr(2, 9),
      chatId,
      hoursBack: Number(hoursBack) || 24,
      customPrompt,
      sendImmediately: !!sendImmediately,
      targetChatId,
      toneStyle: toneStyle || 'default'
    });

    res.json(digest);
  } catch (err: any) {
    console.error('API generate digest failed:', err);
    res.status(500).json({ error: err.message || 'Ошибка генерации дайджеста' });
  }
});

app.post('/api/digests/send', authenticateToken, async (req, res) => {
  try {
    const { digestId, targetChatId } = req.body;
    if (!bot) {
      return res.status(500).json({ error: 'Бот не инициализирован' });
    }

    const digest = chatDigests.find(d => d.id === digestId);
    if (!digest) {
      return res.status(404).json({ error: 'Дайджест не найден' });
    }

    const destChatId = targetChatId || digest.targetChatId || digest.chatId;
    await sendTelegramHtmlMessage(destChatId, digest.summary);

    digest.sentToTelegram = true;
    digest.sentAt = new Date().toISOString();
    digest.targetChatId = destChatId;
    queueWrite('chat_digests', digest.id, cleanData(digest));

    res.json({ success: true, digest });
  } catch (err: any) {
    console.error('API send digest failed:', err);
    res.status(500).json({ error: err.message || 'Ошибка отправки в Telegram' });
  }
});

app.delete('/api/digests/history/:id', authenticateToken, async (req, res) => {
  try {
    const digestId = req.params.id;
    chatDigests = chatDigests.filter(d => d.id !== digestId);
    await db.collection('chat_digests').doc(digestId).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/digests/messages/:chatId', authenticateToken, (req, res) => {
  const { chatId } = req.params;
  const list = chatMessages.filter(m => String(m.chatId) === String(chatId));
  res.json(list.slice(0, 100));
});

// Firestore Error Handler
const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

type OperationType = typeof OperationType[keyof typeof OperationType];

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't throw here to avoid crashing the bot, but we log it
}

// Helper to remove undefined values for Firestore
function cleanData(data: any): any {
  if (data === null || typeof data !== 'object') {
    return data === undefined ? null : data;
  }

  if (Array.isArray(data)) {
    return data.map(item => cleanData(item));
  }

  const cleaned: any = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      if (value !== undefined) {
        cleaned[key] = cleanData(value);
      } else {
        cleaned[key] = null;
      }
    }
  }
  return cleaned;
}

// Throttled Write Queue
const pendingWrites = new Map<string, { collection: string, docId: string, data: any, type: 'set' | 'delete' }>();
const membershipLastWrite = new Map<string, number>();
const chatLastWrite = new Map<string, number>();
let isFlushing = false;

function queueWrite(collection: string, docId: string, data: any) {
  const key = `${collection}/${docId}`;
  pendingWrites.set(key, { collection, docId, data, type: 'set' });
}

function queueDelete(collection: string, docId: string) {
  const key = `${collection}/${docId}`;
  pendingWrites.set(key, { collection, docId, data: null, type: 'delete' });
  if (collection === 'memberships') membershipLastWrite.delete(docId);
  if (collection === 'chats') chatLastWrite.delete(docId);
}

async function flushWrites() {
  if (isFlushing || pendingWrites.size === 0) return;
  isFlushing = true;
  
  const updates = Array.from(pendingWrites.values());
  pendingWrites.clear();
  
  console.log(`[Firestore] Flushing ${updates.length} queued updates...`);
  
  // Process in small chunks to avoid RESOURCE_EXHAUSTED
  const chunkSize = 20;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (update) => {
      try {
        if (update.type === 'delete') {
          await db.collection(update.collection).doc(update.docId).delete();
        } else {
          await db.collection(update.collection).doc(update.docId).set(update.data);
        }
      } catch (err) {
        console.error(`[Firestore] Flush failed for ${update.collection}/${update.docId}:`, err);
      }
    }));
  }
  
  isFlushing = false;
}

setInterval(flushWrites, 30000); // Flush every 30 seconds to reduce write frequency

let lastBroadcastMessages: { chatId: string, messageId: number }[] = [];
let scheduledDeletions: { chatId: string, messageId: number, deleteAt: string }[] = [];

interface CaptchaSessionData {
  chatId: string;
  type: 'math' | 'emoji' | 'button' | 'custom';
  answer: string;
  question: string;
  options?: string[];
  userObj: any;
  timestamp: number;
}

interface SubscriptionChoiceSessionData {
  chatId: string;
  targetChannel: string;
  newcomerMuteHours: number;
  userObj: any;
  timestamp: number;
}

let captchaSessions = new Map<string, CaptchaSessionData>();
let subscriptionChoiceSessions = new Map<string, SubscriptionChoiceSessionData>();
let activeMutes: ActiveMuteEntry[] = [];

const EMOJI_CAPTCHA_POOL = [
  { emoji: '🏍️', name: 'Мотоцикл' },
  { emoji: '🚗', name: 'Автомобиль' },
  { emoji: '🚀', name: 'Ракета' },
  { emoji: '⚽', name: 'Футбольный мяч' },
  { emoji: '🍕', name: 'Пицца' },
  { emoji: '🍎', name: 'Яблоко' },
  { emoji: '🐱', name: 'Кот' },
  { emoji: '🎸', name: 'Гитара' },
  { emoji: '☕', name: 'Чашка кофе' },
  { emoji: '🍔', name: 'Бургер' },
  { emoji: '🚲', name: 'Велосипед' },
  { emoji: '✈️', name: 'Самолет' },
  { emoji: '🦁', name: 'Лев' },
  { emoji: '🏀', name: 'Баскетбольный мяч' },
  { emoji: '🚁', name: 'Вертолет' },
  { emoji: '🍦', name: 'Мороженое' },
  { emoji: '🍉', name: 'Арбуз' },
  { emoji: '🐶', name: 'Собака' },
  { emoji: '⚓', name: 'Якорь' },
  { emoji: '🎯', name: 'Мишень' }
];

interface CaptchaChallenge {
  question: string;
  type: 'math' | 'emoji' | 'button' | 'custom';
  answer: string;
  keyboard?: any;
}

function generateCaptchaChallenge(
  rawType?: string,
  customQuestion?: string,
  customAnswer?: string,
  userId?: string
): CaptchaChallenge {
  let type = rawType || 'math';
  if (type === 'random') {
    const types: ('math' | 'emoji' | 'button')[] = ['math', 'emoji', 'button'];
    type = types[Math.floor(Math.random() * types.length)];
  }

  if (type === 'custom') {
    const q = customQuestion && customQuestion.trim() ? customQuestion.trim() : 'Сколько будет 2 + 2?';
    const a = customAnswer && customAnswer.trim() ? customAnswer.trim() : '4';
    return {
      type: 'custom',
      question: `🛡️ <b>Вопрос для проверки:</b>\n\n${escapeHtml(q)}\n\n<i>Отправьте ответ текстовым сообщением в этот диалог.</i>`,
      answer: a.toLowerCase(),
      keyboard: {
        inline_keyboard: [
          [{ text: '🔄 Обновить вопрос', callback_data: `cap_refresh_${userId || 'user'}` }]
        ]
      }
    };
  }

  if (type === 'button') {
    return {
      type: 'button',
      question: `🛡️ <b>Проверка на человека</b>\n\nПодтвердите, что вы реальный пользователь, нажав соответствующую кнопку ниже:`,
      answer: 'human',
      keyboard: {
        inline_keyboard: [
          [
            { text: '🙋‍♂️ Я человек (Подтверждаю)', callback_data: `cap_ans_human_${userId || 'user'}` }
          ],
          [
            { text: '🤖 Я робот / бот', callback_data: `cap_ans_bot_${userId || 'user'}` },
            { text: '🚫 Отмена', callback_data: `cap_ans_cancel_${userId || 'user'}` }
          ],
          [
            { text: '🔄 Обновить проверку', callback_data: `cap_refresh_${userId || 'user'}` }
          ]
        ]
      }
    };
  }

  if (type === 'emoji') {
    const shuffled = [...EMOJI_CAPTCHA_POOL].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 6);
    const target = selected[Math.floor(Math.random() * selected.length)];

    const row1 = selected.slice(0, 3).map(item => ({
      text: item.emoji,
      callback_data: `cap_ans_${encodeURIComponent(item.emoji)}_${userId || 'user'}`
    }));
    const row2 = selected.slice(3, 6).map(item => ({
      text: item.emoji,
      callback_data: `cap_ans_${encodeURIComponent(item.emoji)}_${userId || 'user'}`
    }));

    return {
      type: 'emoji',
      question: `🧩 <b>Проверка на внимательность</b>\n\nНайдите и нажмите кнопку с предметом:\n👉 <b>${target.emoji} ${target.name}</b>`,
      answer: target.emoji,
      keyboard: {
        inline_keyboard: [
          row1,
          row2,
          [{ text: '🔄 Другие варианты', callback_data: `cap_refresh_${userId || 'user'}` }]
        ]
      }
    };
  }

  // Default: math
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let num1 = 0;
  let num2 = 0;
  let result = 0;

  if (op === '+') {
    num1 = Math.floor(Math.random() * 40) + 5;
    num2 = Math.floor(Math.random() * 40) + 5;
    result = num1 + num2;
  } else if (op === '-') {
    num1 = Math.floor(Math.random() * 50) + 20;
    num2 = Math.floor(Math.random() * (num1 - 5)) + 3;
    result = num1 - num2;
  } else {
    num1 = Math.floor(Math.random() * 8) + 2;
    num2 = Math.floor(Math.random() * 8) + 2;
    result = num1 * num2;
  }

  const wrongAnswers = new Set<number>();
  while (wrongAnswers.size < 3) {
    const delta = (Math.floor(Math.random() * 7) + 1) * (Math.random() > 0.5 ? 1 : -1);
    const wrong = result + delta;
    if (wrong !== result && wrong > 0) {
      wrongAnswers.add(wrong);
    }
  }

  const allOptions = [result, ...Array.from(wrongAnswers)].sort(() => 0.5 - Math.random());
  const buttonsRow1 = allOptions.slice(0, 2).map(opt => ({
    text: `${opt}`,
    callback_data: `cap_ans_${opt}_${userId || 'user'}`
  }));
  const buttonsRow2 = allOptions.slice(2, 4).map(opt => ({
    text: `${opt}`,
    callback_data: `cap_ans_${opt}_${userId || 'user'}`
  }));

  return {
    type: 'math',
    question: `🔢 <b>Математическая проверка</b>\n\nРешите пример для подтверждения:\n👉 <b>${num1} ${op} ${num2} = ?</b>\n\n<i>Выберите ответ кнопкой ниже или напишите число в чат:</i>`,
    answer: String(result),
    keyboard: {
      inline_keyboard: [
        buttonsRow1,
        buttonsRow2,
        [{ text: '🔄 Другой пример', callback_data: `cap_refresh_${userId || 'user'}` }]
      ]
    }
  };
}

async function applyMuteToUser(
  chatId: string, 
  userId: string, 
  durationHours: number, 
  reason: 'newcomer' | 'channel_subscription_refusal' | 'channel_subscription_required' | 'command' | 'voting', 
  userName?: string
): Promise<ActiveMuteEntry> {
  const untilDate = Math.floor(Date.now() / 1000) + Math.max(60, Math.floor(durationHours * 3600));
  const unmuteAt = Date.now() + Math.max(60000, Math.floor(durationHours * 3600 * 1000));
  const muteId = `${chatId}_${userId}`;

  try {
    if (bot) {
      await bot.telegram.restrictChatMember(chatId, Number(userId), {
        until_date: untilDate,
        permissions: {
          can_send_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false
        }
      });
      console.log(`[MuteManager] Successfully restricted user ${userId} in chat ${chatId} for ${durationHours}h (reason: ${reason}) until ${new Date(unmuteAt).toISOString()}`);
    }
  } catch (err: any) {
    console.error(`[MuteManager] Error applying restrictChatMember to user ${userId} in chat ${chatId}:`, err?.message || err);
  }

  const newMute: ActiveMuteEntry = {
    id: muteId,
    userId: String(userId),
    chatId: String(chatId),
    userName: userName || `ID ${userId}`,
    mutedAt: new Date().toISOString(),
    unmuteAt,
    durationHours,
    reason
  };

  const existingIdx = activeMutes.findIndex(m => m.id === muteId);
  if (existingIdx !== -1) {
    activeMutes[existingIdx] = newMute;
  } else {
    activeMutes.push(newMute);
  }
  queueWrite('active_mutes', muteId, cleanData(newMute));

  const chat = chats.find(c => String(c.id) === String(chatId));
  const reasonText = reason === 'channel_subscription_refusal' 
    ? 'Отказ от подписки на канал (24ч)' 
    : (reason === 'newcomer' ? `Мут новичков (${durationHours}ч)` : `Мут (${durationHours}ч)`);

  await addLog({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    type: 'MUTE',
    user: userName || String(userId),
    chat: chat?.title || chatId,
    details: `Наложен ${reasonText}. Окончание: ${new Date(unmuteAt).toLocaleTimeString()}`
  });

  return newMute;
}

async function unmuteUser(chatId: string, userId: string, adminName?: string) {
  const muteId = `${chatId}_${userId}`;
  try {
    if (bot) {
      await bot.telegram.restrictChatMember(chatId, Number(userId), {
        until_date: 0,
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: true,
          can_invite_users: true,
          can_pin_messages: true
        }
      });
      console.log(`[MuteManager] Lifted restrictions for user ${userId} in chat ${chatId}`);
    }
  } catch (err: any) {
    console.warn(`[MuteManager] Lift restriction note for user ${userId} in chat ${chatId}:`, err?.message || err);
  }

  activeMutes = activeMutes.filter(m => m.id !== muteId);
  queueDelete('active_mutes', muteId);

  const chat = chats.find(c => String(c.id) === String(chatId));
  await addLog({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    type: 'UNMUTE',
    user: adminName || 'Система (автоматически)',
    chat: chat?.title || chatId,
    details: `Сняты ограничения с пользователя ID ${userId}`
  });
}

async function handleCaptchaPassed(ctx: any, chatId: string, userId: string, userObj: any) {
  const chat = chats.find(c => String(c.id) === String(chatId));
  const chatTitle = chat?.title || 'Группа';

  // Check Channel Subscription requirement
  const effectiveRequireSub = (chat?.requireChannelSubscription !== undefined && chat.requireChannelSubscription !== null)
    ? chat.requireChannelSubscription
    : !!filters.requireChannelSubscription;

  const rawSubTarget = (chat?.channelSubscriptionTarget && chat.channelSubscriptionTarget.trim())
    ? chat.channelSubscriptionTarget.trim()
    : (filters.channelSubscriptionTarget && filters.channelSubscriptionTarget.trim()) ? filters.channelSubscriptionTarget.trim() : '';

  const effectiveMuteNewcomers = (chat?.muteNewcomers !== undefined && chat.muteNewcomers !== null)
    ? chat.muteNewcomers
    : !!filters.muteNewcomers;

  const effectiveMuteDurationHours = (chat?.muteDurationHours !== undefined && chat.muteDurationHours !== null)
    ? chat.muteDurationHours
    : (filters.muteDurationHours || 1);

  if (effectiveRequireSub && rawSubTarget) {
    let targetChannel = rawSubTarget;
    let channelLink = targetChannel;
    if (targetChannel.startsWith('@')) {
      channelLink = `https://t.me/${targetChannel.substring(1)}`;
    } else if (!targetChannel.startsWith('https://')) {
      channelLink = `https://t.me/${targetChannel}`;
      targetChannel = `@${targetChannel}`;
    }

    // Save session for subscription choice
    subscriptionChoiceSessions.set(userId, {
      chatId,
      targetChannel,
      newcomerMuteHours: effectiveMuteNewcomers ? effectiveMuteDurationHours : 0,
      userObj,
      timestamp: Date.now()
    });

    const newcomerMuteText = effectiveMuteNewcomers && effectiveMuteDurationHours > 0
      ? `мут новичка ${effectiveMuteDurationHours}ч`
      : `без мута (полный доступ)`;

    const subChoiceMessage = `🎉 <b>Проверка успешно пройдена!</b>\n\n` +
      `В чате «<b>${escapeHtml(chatTitle)}</b>» действует правило обязательной подписки на канал:\n` +
      `👉 <a href="${channelLink}">${escapeHtml(targetChannel)}</a>\n\n` +
      `<b>У вас есть два варианта вступления:</b>\n` +
      `1️⃣ <b>Подписаться на канал</b> — после подтверждения подписки вы будете приняты в чат со стандартными правилами (${newcomerMuteText}).\n` +
      `2️⃣ <b>Отказаться от подписки</b> — вы будете приняты в чат, но с <b>мутом на 24 часа</b>. Спустя 24ч мут снимется автоматически.\n\n` +
      `<i>Выберите вариант кнопкой ниже:</i>`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📢 Перейти в канал', url: channelLink }
        ],
        [
          { text: `✅ Я подписался (Вступить с ${effectiveMuteNewcomers ? `${effectiveMuteDurationHours}ч мутом` : 'полным доступом'})`, callback_data: `sub_confirm_${userId}` }
        ],
        [
          { text: '⛔ Отказаться от подписки (Вступить с мутом 24ч)', callback_data: `sub_refuse_${userId}` }
        ]
      ]
    };

    try {
      if (ctx.editMessageText) {
        await ctx.editMessageText(subChoiceMessage, { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: false } });
      } else {
        await ctx.telegram.sendMessage(userId, subChoiceMessage, { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: false } });
      }
    } catch (e) {
      await ctx.telegram.sendMessage(userId, subChoiceMessage, { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: false } }).catch(() => {});
    }
    return;
  }

  // No channel subscription required -> Approve immediately
  try {
    await ctx.telegram.approveChatJoinRequest(chatId, Number(userId));
    console.log(`[JoinFlow] Approved join request for user ${userId} in chat ${chatId}`);

    await trackMembership(chatId, {
      id: Number(userId),
      username: userObj?.username,
      first_name: userObj?.first_name || userObj?.firstName,
      last_name: userObj?.last_name || userObj?.lastName
    });

    if (effectiveMuteNewcomers && effectiveMuteDurationHours > 0) {
      await applyMuteToUser(chatId, userId, effectiveMuteDurationHours, 'newcomer', userObj?.first_name || userObj?.firstName);
      const approveText = `✅ <b>Ваша заявка в чат «${escapeHtml(chatTitle)}» одобрена!</b>\n\n` +
        `⏳ В чате установлен временный мут для новичков на <b>${effectiveMuteDurationHours} ч.</b> ` +
        `По истечении времени вы сможете свободно отправлять сообщения.`;

      if (ctx.editMessageText) {
        await ctx.editMessageText(approveText, { parse_mode: 'HTML' }).catch(() => {});
      } else {
        await ctx.telegram.sendMessage(userId, approveText, { parse_mode: 'HTML' }).catch(() => {});
      }
    } else {
      const approveText = `✅ <b>Ваша заявка в чат «${escapeHtml(chatTitle)}» одобрена!</b>\n\nДобро пожаловать в сообщество!`;
      if (ctx.editMessageText) {
        await ctx.editMessageText(approveText, { parse_mode: 'HTML' }).catch(() => {});
      } else {
        await ctx.telegram.sendMessage(userId, approveText, { parse_mode: 'HTML' }).catch(() => {});
      }
    }

    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'SYSTEM',
      user: userObj?.first_name || userObj?.firstName || String(userId),
      chat: chatTitle,
      details: 'Заявка на вступление одобрена после успешной проверки каптчи.'
    });
  } catch (err: any) {
    console.error(`[JoinFlow] Error approving join request for user ${userId}:`, err?.message || err);
    if (ctx.editMessageText) {
      await ctx.editMessageText('❌ Ошибка при одобрении заявки. Возможно, заявка устарела или была отменена.').catch(() => {});
    } else {
      await ctx.telegram.sendMessage(userId, '❌ Ошибка при одобрении заявки. Попробуйте подать заявку снова.').catch(() => {});
    }
  }
}
interface BroadcastSessionOptions {
  pin: boolean;
  unpinDays: number;
  delay: number;
  silent: boolean;
  selectedChats: string[];
  waitingForUnpinDaysInput?: boolean;
}

let broadcastSessions = new Map<string, { 
  message: any, 
  messages?: any[],
  options: BroadcastSessionOptions
}>();

let scheduledUnpins: {
  id?: string;
  chatId: string;
  messageId: number;
  unpinAt: string;
  broadcastId?: string;
  createdAt?: string;
}[] = [];

function getDaysPlural(days: number): string {
  const n = Math.abs(days) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return 'дней';
  if (n1 > 1 && n1 < 5) return 'дня';
  if (n1 === 1) return 'день';
  return 'дней';
}

function renderBroadcastOptionsText(options: BroadcastSessionOptions): string {
  const unpinStr = options.unpinDays > 0 
    ? `⏳ ${options.unpinDays} ${getDaysPlural(options.unpinDays)}` 
    : '♾️ Бессрочно (не откреплять)';

  return `⚙️ <b>Настройки рассылки:</b>\n\n` +
    `📌 <b>Закреп:</b> ${options.pin ? '✅ Включен' : '❌ Выключен'}\n` +
    `⏳ <b>Дней до открепления:</b> ${options.pin ? unpinStr : '— <i>(закреп выключен)</i>'}\n` +
    `⏱ <b>Задержка:</b> ${options.delay} сек.\n` +
    `🔕 <b>Без звука:</b> ${options.silent ? '✅ Включен' : '❌ Выключен'}`;
}

function renderBroadcastOptionsKeyboard(options: BroadcastSessionOptions): any[][] {
  const unpinBtnLabel = options.unpinDays > 0
    ? `⏳ Открепить через: ${options.unpinDays} дн.`
    : `⏳ Дней до открепления: Бессрочно`;

  return [
    [{ text: `📌 Закреп: ${options.pin ? 'Выкл' : 'Вкл'}`, callback_data: 'bc_opt_pin' }],
    [{ text: unpinBtnLabel, callback_data: 'bc_opt_unpin_menu' }],
    [{ text: `🔕 Без звука: ${options.silent ? 'Выкл' : 'Вкл'}`, callback_data: 'bc_opt_silent' }],
    [{ text: `⏱ Задержка: ${options.delay} сек.`, callback_data: 'bc_opt_delay' }],
    [{ text: '⬅️ Назад', callback_data: 'bc_back' }]
  ];
}

function renderBroadcastUnpinMenuText(options: BroadcastSessionOptions): string {
  const currentText = options.unpinDays > 0 
    ? `${options.unpinDays} ${getDaysPlural(options.unpinDays)}`
    : 'Бессрочно (не откреплять)';

  return `⏳ <b>Дней до открепления поста:</b>\n\n` +
    `Текущий выбор: <b>${currentText}</b>\n\n` +
    `Выберите, через сколько дней бот автоматически открепит разосланный пост во всех чатах, либо задайте своё значение:`;
}

function renderBroadcastUnpinMenuKeyboard(options: BroadcastSessionOptions): any[][] {
  const isSelected = (d: number) => options.unpinDays === d ? '🔘 ' : '';

  return [
    [{ text: `${isSelected(0)}♾️ Бессрочно (не откреплять)`, callback_data: 'bc_unpin_set_0' }],
    [
      { text: `${isSelected(1)}1 день`, callback_data: 'bc_unpin_set_1' },
      { text: `${isSelected(2)}2 дня`, callback_data: 'bc_unpin_set_2' },
      { text: `${isSelected(3)}3 дня`, callback_data: 'bc_unpin_set_3' }
    ],
    [
      { text: `${isSelected(5)}5 дней`, callback_data: 'bc_unpin_set_5' },
      { text: `${isSelected(7)}7 дней (нед.)`, callback_data: 'bc_unpin_set_7' },
      { text: `${isSelected(10)}10 дней`, callback_data: 'bc_unpin_set_10' }
    ],
    [
      { text: `${isSelected(14)}14 дней (2 нед.)`, callback_data: 'bc_unpin_set_14' },
      { text: `${isSelected(30)}30 дней (мес.)`, callback_data: 'bc_unpin_set_30' }
    ],
    [{ text: '✏️ Ввести своё количество дней', callback_data: 'bc_unpin_custom' }],
    [{ text: '⬅️ Назад в настройки', callback_data: 'bc_options' }]
  ];
}
let mediaGroupBuffers = new Map<string, {
  mediaGroupId: string,
  messages: any[],
  timer: NodeJS.Timeout
}>();
let activeVotes = new Map<string, {
  targetUserId: number,
  targetName: string,
  chatId: number,
  type: 'BAN' | 'MUTE',
  votes: Set<number>,
  requiredVotes: number,
  messageId: number,
  expiresAt: number
}>();

// Data state (synced with Firestore)
let broadcastHistory: any[] = [];
let chats: any[] = [];
let logs: any[] = [];
let statsHistory: any[] = [];
let bans: any[] = [];
let tasks: any[] = [];
let memberships: any[] = [];
let whitelist: any[] = [];
let chatBans: any[] = [];
let reputations: any[] = [];
let warnings: any[] = [];
let chatDigests: any[] = [];
let digestConfigs: any[] = [];
let chatMessages: any[] = [];
let pinnedMessages: any[] = [];
let antiScamKeywordsConfig: {
  enabled: boolean;
  keywords: string[];
  notifyChatId?: string;
  deleteMessage?: boolean;
  notifyInGroup?: boolean;
  cooldownSeconds?: number;
} = {
  enabled: true,
  keywords: [
    'предоплата',
    'скинь на карту',
    'переведи на карту',
    'номер карты',
    'гарант сделки',
    'быстрый заработок',
    'схема заработка',
    'инвестиции',
    'доход без вложений',
    'крипта',
    'сид фраза',
    'seed phrase',
    'писать в лс для заказа',
    'работа на дому высокий доход'
  ],
  notifyChatId: '',
  deleteMessage: false,
  notifyInGroup: false,
  cooldownSeconds: 60
};
let scamAlertLogs: any[] = [];
const lastScamAlertCache = new Map<string, number>();
let isBotPollingActive = false;
let lastTelegramUpdateAt = Date.now();
let botReconnectTimer: any = null;
const messageAuthorCache = new Map<string, { userId: string, username?: string, firstName?: string, lastName?: string }>();
const userRecentCrossChatMessages = new Map<string, Array<{ chatId: string; messageId: number; timestamp: number; isForward: boolean; forwardSource?: string; text: string }>>();
const lastCrossChatAlertTime = new Map<string, number>();
const reputationCooldownMap = new Map<string, number>();

function parsePinnedMessageData(chatId: string, pinned: any, chatUsername?: string) {
  let mediaType: 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'poll' | 'other' | undefined;
  let hasMedia = false;

  if (pinned.photo && pinned.photo.length > 0) {
    hasMedia = true;
    mediaType = 'photo';
  } else if (pinned.video) {
    hasMedia = true;
    mediaType = 'video';
  } else if (pinned.document) {
    hasMedia = true;
    mediaType = 'document';
  } else if (pinned.audio) {
    hasMedia = true;
    mediaType = 'audio';
  } else if (pinned.voice) {
    hasMedia = true;
    mediaType = 'voice';
  } else if (pinned.poll) {
    hasMedia = true;
    mediaType = 'poll';
  } else if (pinned.sticker || pinned.animation) {
    hasMedia = true;
    mediaType = 'other';
  }

  let forwardFrom: string | undefined;
  if (pinned.forward_from) {
    forwardFrom = pinned.forward_from.first_name + (pinned.forward_from.last_name ? ` ${pinned.forward_from.last_name}` : '');
    if (pinned.forward_from.username) forwardFrom += ` (@${pinned.forward_from.username})`;
  } else if (pinned.forward_from_chat) {
    forwardFrom = pinned.forward_from_chat.title || pinned.forward_from_chat.username;
  } else if (pinned.forward_sender_name) {
    forwardFrom = pinned.forward_sender_name;
  } else if (pinned.forwardFrom) {
    forwardFrom = pinned.forwardFrom;
  }

  const msgId = pinned.message_id || pinned.messageId;
  let link: string | undefined = pinned.link;
  if (!link && msgId) {
    if (chatUsername) {
      link = `https://t.me/${chatUsername}/${msgId}`;
    } else {
      const cleanChatId = chatId.toString().replace(/^-100/, '');
      link = `https://t.me/c/${cleanChatId}/${msgId}`;
    }
  }

  const recordId = `${chatId}_${msgId}`;
  return {
    id: recordId,
    messageId: Number(msgId),
    chatId: String(chatId),
    text: pinned.text || (pinned.caption ? pinned.caption : undefined),
    caption: pinned.caption,
    date: pinned.date || Math.floor(Date.now() / 1000),
    pinnedAt: pinned.pinnedAt || new Date().toISOString(),
    unpinned: Boolean(pinned.unpinned),
    unpinnedAt: pinned.unpinnedAt,
    from: pinned.from ? {
      id: pinned.from.id,
      firstName: pinned.from.first_name || pinned.from.firstName,
      lastName: pinned.from.last_name || pinned.from.lastName,
      username: pinned.from.username,
      isBot: pinned.from.is_bot !== undefined ? pinned.from.is_bot : pinned.from.isBot
    } : undefined,
    senderChat: (pinned.sender_chat || pinned.senderChat) ? {
      id: (pinned.sender_chat || pinned.senderChat).id,
      title: (pinned.sender_chat || pinned.senderChat).title,
      username: (pinned.sender_chat || pinned.senderChat).username
    } : undefined,
    hasMedia,
    mediaType,
    forwardFrom,
    link
  };
}

async function recordPinnedMessage(chatId: string, pinned: any, unpinned = false) {
  if (!pinned || !(pinned.message_id || pinned.messageId)) return null;
  const msgId = pinned.message_id || pinned.messageId;
  const recordId = `${chatId}_${msgId}`;

  const chat = chats.find(c => String(c.id) === String(chatId));
  const data = parsePinnedMessageData(chatId, pinned, chat?.username);
  if (unpinned) {
    data.unpinned = true;
    (data as any).unpinnedAt = new Date().toISOString();
  }

  const existingIdx = pinnedMessages.findIndex(p => p.id === recordId);
  if (existingIdx !== -1) {
    pinnedMessages[existingIdx] = { ...pinnedMessages[existingIdx], ...data };
  } else {
    pinnedMessages.unshift(data);
    if (pinnedMessages.length > 2000) pinnedMessages.pop();
  }

  queueWrite('pinned_messages', recordId, cleanData(data));
  console.log(`[PinnedStorage] Saved pinned message #${msgId} for chat ${chatId} (unpinned: ${data.unpinned})`);
  return data;
}

async function recordChatMessage(record: {
  id: string;
  messageId?: number;
  chatId: string;
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  text: string;
  timestamp: string;
  isForward?: boolean;
  forwardSource?: string;
}) {
  const normText = (record.text || '').trim();
  const fallbackText = record.isForward ? '[Пересланное сообщение/медиа]' : '[Медиа/Стикер/Файл]';
  const cleanRecord = {
    ...record,
    text: normText.length > 0 ? normText : fallbackText,
    messageId: record.messageId || Number(record.id.split('_')[1]) || 0
  };

  // Prevent duplicate insertion in memory
  const existingIdx = chatMessages.findIndex(m => m.id === cleanRecord.id);
  if (existingIdx !== -1) {
    chatMessages[existingIdx] = { ...chatMessages[existingIdx], ...cleanRecord };
    return;
  }

  // 48-hour retention in memory: prune messages older than 48 hours
  const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  chatMessages = chatMessages.filter(m => m.timestamp >= cutoff48h);

  chatMessages.unshift(cleanRecord);
  if (chatMessages.length > 5000) chatMessages.pop();
  queueWrite('chat_messages', cleanRecord.id, cleanData(cleanRecord));
}

async function checkCrossChatActivity(
  chatId: string,
  user: { id: number; username?: string; first_name?: string; last_name?: string },
  msgInfo: { messageId: number; text: string; isForward: boolean; forwardSource?: string }
) {
  const userId = String(user.id);
  // Exclude bot itself and admin
  if (botInfo && user.id === botInfo.id) return;
  if (user.username && user.username.toLowerCase() === 'motoinformbot') return;
  const adminUsername = (settings.adminTelegramUsername || 'bookray').toLowerCase();
  if (user.username && user.username.toLowerCase() === adminUsername) return;
  if (whitelist.some(w => String(w.userId) === userId || (user.username && w.username && w.username.toLowerCase() === `@${user.username.toLowerCase()}`))) return;

  const now = Date.now();
  // 2-hour window for cross-chat activity tracking
  const windowMs = 2 * 3600 * 1000;

  let userMsgs = userRecentCrossChatMessages.get(userId) || [];
  userMsgs = userMsgs.filter(m => now - m.timestamp < windowMs);
  userMsgs.push({
    chatId: String(chatId),
    messageId: msgInfo.messageId,
    timestamp: now,
    isForward: Boolean(msgInfo.isForward),
    forwardSource: msgInfo.forwardSource,
    text: msgInfo.text
  });
  userRecentCrossChatMessages.set(userId, userMsgs);

  // Distinct chats where user sent/forwarded messages recently
  const uniqueChatIds = Array.from(new Set(userMsgs.map(m => m.chatId)));
  const hasForwards = userMsgs.some(m => m.isForward);

  // Alert threshold: notify if user posted into >= 2 chats in recent window
  if (uniqueChatIds.length >= 2) {
    const lastAlert = lastCrossChatAlertTime.get(userId) || 0;
    // 5-minute cooldown between alerts for same user
    if (now - lastAlert >= 5 * 60 * 1000) {
      lastCrossChatAlertTime.set(userId, now);

      const targetChatId = settings.infoChatId || process.env.BOOKRAY_CHAT_ID;
      if (targetChatId && bot) {
        const chatNames = uniqueChatIds.map(cId => {
          const c = chats.find(ch => String(ch.id) === String(cId));
          return c ? c.title : cId;
        }).join(', ');

        const userFullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || `Пользователь ${userId}`;
        const userHandle = user.username ? `@${user.username}` : `ID: ${userId}`;
        const snippet = msgInfo.text 
          ? (msgInfo.text.length > 250 ? msgInfo.text.substring(0, 250) + '...' : msgInfo.text) 
          : (msgInfo.isForward ? '[Пересланное сообщение/медиа]' : '[Медиа]');

        const forwardNotice = hasForwards 
          ? `\n↪️ <b>Тип:</b> Пересылка сообщений (Forward)` + (msgInfo.forwardSource ? ` (Откуда: <code>${escapeHtml(msgInfo.forwardSource)}</code>)` : '')
          : '';

        const alertMsg = 
          `🚨 <b>ОБНАРУЖЕН СПАМ / РАССЫЛКА В НЕСКОЛЬКИХ ЧАТАХ!</b>\n\n` +
          `👤 <b>Пользователь:</b> <a href="tg://user?id=${userId}">${escapeHtml(userFullName)}</a> (${userHandle})\n` +
          `🆔 <b>ID:</b> <code>${userId}</code>\n` +
          `📊 <b>Разослано в ${uniqueChatIds.length} чат(-ов):</b>\n` +
          `📍 <i>${escapeHtml(chatNames)}</i>${forwardNotice}\n\n` +
          `💬 <b>Последнее сообщение:</b>\n<blockquote>${escapeHtml(snippet)}</blockquote>\n\n` +
          `⏰ <i>${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)</i>`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: '🚫 Забанить и удалить всё', callback_data: `mc_ban_clean_${userId}` }
            ],
            [
              { text: '🗑 Удалить все сообщения', callback_data: `mc_clean_${userId}` },
              { text: '⛔ Только забанить', callback_data: `mc_ban_${userId}` }
            ],
            [
              { text: '✅ В белый список', callback_data: `mc_wl_${userId}` },
              { text: '👤 Профиль', url: `tg://user?id=${userId}` }
            ]
          ]
        };

        bot.telegram.sendMessage(targetChatId, alertMsg, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        }).catch(e => console.error('[CrossChatAlert] Failed to send telegram alert:', e));

        await addLog({
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          type: 'WARN',
          user: userFullName,
          chat: `${uniqueChatIds.length} чатов`,
          details: `🚨 Рассылка по чатам: пользователь ${userHandle} отправил сообщения в ${uniqueChatIds.length} чатов.${hasForwards ? ' [пересылка]' : ''}`
        });
      }
    }
  }
}

async function getUserMessagesStats(targetUserId: string): Promise<{
  userId: string;
  username?: string;
  firstName?: string;
  totalMessages: number;
  chats: Array<{ chatId: string; chatTitle: string; count: number; lastMessageDate?: string; lastText?: string }>;
}> {
  const normUserId = String(targetUserId).trim().replace(/^@/, '');
  const chatStatsMap = new Map<string, { count: number; lastMessageDate?: string; lastText?: string }>();
  let username: string | undefined;
  let firstName: string | undefined;

  // Search memory
  for (const m of chatMessages) {
    const isMatch = String(m.userId) === normUserId || 
      (m.username && m.username.toLowerCase().replace(/^@/, '') === normUserId.toLowerCase());
    if (isMatch) {
      if (!username && m.username) username = m.username;
      if (!firstName && m.firstName) firstName = m.firstName;
      const cId = String(m.chatId);
      const curr = chatStatsMap.get(cId) || { count: 0 };
      curr.count++;
      if (!curr.lastMessageDate || m.timestamp > curr.lastMessageDate) {
        curr.lastMessageDate = m.timestamp;
        curr.lastText = m.text;
      }
      chatStatsMap.set(cId, curr);
    }
  }

  // Also query Firestore chat_messages
  try {
    const snap = await db.collection('chat_messages').where('userId', '==', normUserId).limit(300).get();
    snap.docs.forEach(doc => {
      const data = doc.data();
      if (!username && data.username) username = data.username;
      if (!firstName && data.firstName) firstName = data.firstName;
      const cId = String(data.chatId);
      const curr = chatStatsMap.get(cId) || { count: 0 };
      // avoid double counting if already counted in memory
      if (!chatMessages.some(cm => cm.id === doc.id)) {
        curr.count++;
        if (!curr.lastMessageDate || data.timestamp > curr.lastMessageDate) {
          curr.lastMessageDate = data.timestamp;
          curr.lastText = data.text;
        }
        chatStatsMap.set(cId, curr);
      }
    });
  } catch (e) {
    console.warn('[UserStats] Error reading Firestore chat_messages:', e);
  }

  // Also include memberships chats if user is recorded there
  const userMemberships = memberships.filter(m => String(m.userId) === normUserId);
  for (const m of userMemberships) {
    const cId = String(m.chatId);
    if (!chatStatsMap.has(cId)) {
      chatStatsMap.set(cId, { count: m.msgCount || 0, lastMessageDate: m.lastSeen || m.joinedAt });
    }
    if (!username && m.username) username = m.username.replace(/^@/, '');
    if (!firstName && m.firstName) firstName = m.firstName;
  }

  let total = 0;
  const chatList = Array.from(chatStatsMap.entries()).map(([cId, stat]) => {
    const chatObj = chats.find(c => String(c.id) === cId);
    total += stat.count;
    return {
      chatId: cId,
      chatTitle: chatObj ? chatObj.title : `Чат ${cId}`,
      count: stat.count,
      lastMessageDate: stat.lastMessageDate,
      lastText: stat.lastText
    };
  });

  return {
    userId: normUserId,
    username,
    firstName,
    totalMessages: total,
    chats: chatList
  };
}

async function cleanUserMessages(targetUserId: string, alsoBan = false, banReason = 'Массовый спам в нескольких чатах'): Promise<{
  success: boolean;
  userId: string;
  deletedCount: number;
  chatsCount: number;
  chatDetails: Array<{ chatId: string; chatTitle: string; deletedCount: number; error?: string }>;
  bannedGlobally?: boolean;
}> {
  const normUserId = String(targetUserId).trim().replace(/^@/, '');
  console.log(`[Cleaner] Purging messages for user ${normUserId} (alsoBan: ${alsoBan})...`);

  // 1. Gather all message IDs to delete
  const matchingMessages: Array<{ chatId: string; messageId: number; id: string }> = [];

  // Memory chatMessages
  for (const m of chatMessages) {
    const isMatch = String(m.userId) === normUserId || 
      (m.username && m.username.toLowerCase().replace(/^@/, '') === normUserId.toLowerCase());
    if (isMatch) {
      const msgId = (m as any).messageId || Number(m.id.split('_')[1]);
      if (msgId && m.chatId) {
        matchingMessages.push({ chatId: String(m.chatId), messageId: msgId, id: m.id });
      }
    }
  }

  // Firestore chat_messages
  try {
    const snap = await db.collection('chat_messages').where('userId', '==', normUserId).get();
    snap.docs.forEach(doc => {
      const data = doc.data();
      const msgId = data.messageId || Number(doc.id.split('_')[1]);
      if (msgId && data.chatId) {
        if (!matchingMessages.some(m => m.chatId === String(data.chatId) && m.messageId === msgId)) {
          matchingMessages.push({ chatId: String(data.chatId), messageId: msgId, id: doc.id });
        }
      }
    });
  } catch (e) {
    console.warn('[Cleaner] Error reading Firestore chat_messages:', e);
  }

  // Recent cross-chat messages
  const recentList = userRecentCrossChatMessages.get(normUserId) || [];
  for (const r of recentList) {
    if (!matchingMessages.some(m => m.chatId === String(r.chatId) && m.messageId === r.messageId)) {
      matchingMessages.push({ chatId: String(r.chatId), messageId: r.messageId, id: `${r.chatId}_${r.messageId}` });
    }
  }

  // Scam alert logs
  for (const s of scamAlertLogs) {
    if (String(s.userId) === normUserId && s.messageId && s.chatId) {
      if (!matchingMessages.some(m => m.chatId === String(s.chatId) && m.messageId === s.messageId)) {
        matchingMessages.push({ chatId: String(s.chatId), messageId: s.messageId, id: `${s.chatId}_${s.messageId}` });
      }
    }
  }

  // Group by chatId
  const byChat = new Map<string, number[]>();
  for (const item of matchingMessages) {
    if (!byChat.has(item.chatId)) byChat.set(item.chatId, []);
    if (!byChat.get(item.chatId)!.includes(item.messageId)) {
      byChat.get(item.chatId)!.push(item.messageId);
    }
  }

  // Also include any active chat where user has a membership
  const userMemberships = memberships.filter(m => String(m.userId) === normUserId);
  for (const m of userMemberships) {
    if (!byChat.has(String(m.chatId))) {
      byChat.set(String(m.chatId), []);
    }
  }

  let totalDeleted = 0;
  const chatDetails: Array<{ chatId: string; chatTitle: string; deletedCount: number; error?: string }> = [];

  for (const [chatId, messageIds] of byChat.entries()) {
    const chatObj = chats.find(c => String(c.id) === chatId);
    const chatTitle = chatObj ? chatObj.title : `Чат ${chatId}`;
    let chatDeleted = 0;
    let chatError: string | undefined;

    if (bot) {
      // 1. Delete individual known messages in this chat
      for (const msgId of messageIds) {
        try {
          await bot.telegram.deleteMessage(chatId, msgId);
          chatDeleted++;
        } catch (delErr: any) {
          const errMsg = delErr?.message || String(delErr);
          if (!errMsg.includes('message to delete not found')) {
            console.warn(`[Cleaner] Telegram deleteMessage error in ${chatId} (msg ${msgId}):`, errMsg);
          }
        }
      }

      // 2. If user is to be banned (or already banned), call banChatMember with revoke_messages: true
      // Telegram's server will natively purge ALL recent messages for this user in supergroups!
      if (alsoBan || bans.some(b => String(b.userId) === normUserId)) {
        try {
          await bot.telegram.banChatMember(chatId, Number(normUserId), { revoke_messages: true } as any);
        } catch (banErr: any) {
          // ignore already banned or not in chat
        }
      }
    }

    totalDeleted += chatDeleted;
    chatDetails.push({
      chatId,
      chatTitle,
      deletedCount: chatDeleted,
      error: chatError
    });
  }

  // 3. Remove deleted messages from in-memory cache
  chatMessages = chatMessages.filter(m => {
    const isMatch = String(m.userId) === normUserId || 
      (m.username && m.username.toLowerCase().replace(/^@/, '') === normUserId.toLowerCase());
    return !isMatch;
  });

  // Clear from recent cross-chat sliding window
  userRecentCrossChatMessages.delete(normUserId);

  // 4. Delete Firestore records
  for (const m of matchingMessages) {
    queueDelete('chat_messages', m.id);
  }

  // 5. Global ban if requested
  let bannedGlobally = false;
  if (alsoBan) {
    const existingBanIndex = bans.findIndex(b => String(b.userId) === normUserId);
    if (existingBanIndex === -1) {
      const newBan = {
        id: normUserId,
        userId: normUserId,
        reason: banReason,
        createdAt: new Date().toISOString()
      };
      bans.push(newBan);
      queueWrite('bans', normUserId, cleanData(newBan));
      bannedGlobally = true;
    }
    // Also ban across all other active chats
    if (bot) {
      for (const chat of chats.filter(c => c.active)) {
        if (!byChat.has(String(chat.id))) {
          try {
            await bot.telegram.banChatMember(chat.id, Number(normUserId), { revoke_messages: true } as any);
          } catch (e) {}
        }
      }
    }
  }

  await addLog({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    type: 'SYSTEM',
    user: `ID ${normUserId}`,
    chat: 'Cleaner',
    details: `🧹 Чистильщик: удалено ${totalDeleted} сообщ. в ${chatDetails.length} чатах.${alsoBan ? ' Пользователь заблокирован во всех чатах.' : ''}`
  });

  return {
    success: true,
    userId: normUserId,
    deletedCount: totalDeleted,
    chatsCount: chatDetails.length,
    chatDetails,
    bannedGlobally
  };
}

let lastCleanupTime = 0;
async function cleanupOldChatMessages(force = false) {
  const now = Date.now();
  // Only run at most once every 30 minutes unless forced
  if (!force && now - lastCleanupTime < 30 * 60 * 1000) {
    return;
  }
  lastCleanupTime = now;

  const cutoff48h = new Date(now - 48 * 3600 * 1000).toISOString();
  const initialMemCount = chatMessages.length;
  chatMessages = chatMessages.filter(m => m.timestamp >= cutoff48h);
  if (chatMessages.length !== initialMemCount) {
    console.log(`[Cleanup48h] Purged ${initialMemCount - chatMessages.length} expired chat messages from memory (kept ${chatMessages.length})`);
  }

  try {
    const snap = await db.collection('chat_messages').where('timestamp', '<', cutoff48h).limit(100).get();
    const count = snap.size ?? snap.docs?.length ?? 0;
    if (count > 0) {
      console.log(`[Cleanup48h] Purging ${count} chat messages older than 48 hours from database...`);
      for (const doc of snap.docs) {
        try {
          await db.collection('chat_messages').doc(doc.id).delete();
        } catch (delErr: any) {
          // ignore single delete errors
        }
      }
    }
  } catch (err: any) {
    console.warn('[Cleanup48h] Warning during database cleanup:', err?.message);
  }
}

interface BlackListPost {
  id: string;
  url: string;
  datetime: string;
  text: string;
}

async function getRecentMotoBlackListPosts(hours = 24): Promise<BlackListPost[]> {
  try {
    const res = await fetch('https://t.me/s/MotoBlackList', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const cutoff = Date.now() - hours * 3600 * 1000;
    
    const wrapRegex = /<div class="tgme_widget_message_wrap\b[^>]*>([\s\S]*?)(?=<div class="tgme_widget_message_wrap\b|<\/body|$)/g;
    const posts: BlackListPost[] = [];
    let match: RegExpExecArray | null;

    while ((match = wrapRegex.exec(html)) !== null) {
      const wrap = match[1];
      const postMatch = wrap.match(/data-post="MotoBlackList\/(\d+)"/);
      const dateMatch = wrap.match(/<time[^>]*datetime="([^"]+)"/);
      const textMatch = wrap.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);

      if (postMatch && dateMatch) {
        const id = postMatch[1];
        const dtStr = dateMatch[1];
        const postTime = new Date(dtStr).getTime();
        
        if (!isNaN(postTime) && postTime >= cutoff) {
          let text = textMatch ? textMatch[1] : '';
          text = text
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/&#33;/g, '!')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();

          if (!text) text = 'Новая публикация с материалами расследования / скриншотами.';
          
          posts.push({
            id,
            url: `https://t.me/MotoBlackList/${id}`,
            datetime: dtStr,
            text: text.length > 200 ? text.slice(0, 197) + '...' : text
          });
        }
      }
    }
    return posts;
  } catch (err) {
    console.warn('[MotoBlackList] Could not fetch channel posts:', err);
    return [];
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatSummaryForTelegramHtml(
  text: string, 
  blackListPosts?: BlackListPost[], 
  chatTitle?: string, 
  expectedDateStr?: string,
  reputationSummaryHtml?: string
): string {
  if (!text) return '';
  let out = text;

  const actualDateStr = expectedDateStr || getProjectDateFormatted();

  // Remove any remaining lines with message/user counts if model generated them
  out = out.replace(/^[^\n]*?(?:сообщений|сообщения|участников|участника|сообщение|участник)\s*:\s*\d+[^\n]*?\n?/gim, '');
  out = out.replace(/^[^\n]*?(?:💬|👥)\s*[^\n]*?(?:Сообщений|Участников|Обработано)[^\n]*?\n?/gim, '');

  // Strip @ from usernames to prevent accidental user tagging/notifications (except explicit MotoBlackList reference)
  out = out.replace(/(?<!https?:\/\/t\.me\/)@([a-zA-Z0-9_]{3,})/g, (match, username) => {
    if (username.toLowerCase() === 'motoblacklist') return match;
    return username;
  });

  // Convert markdown headers to bold
  out = out.replace(/^###?\s+(.+)$/gm, '<b>$1</b>');
  out = out.replace(/^#\s+(.+)$/gm, '<b>$1</b>');

  // Convert markdown bold (**text** or __text__)
  out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  out = out.replace(/__(.+?)__/g, '<b>$1</b>');

  // Convert markdown italics (*text* or _text_)
  out = out.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<i>$1</i>');
  out = out.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<i>$1</i>');

  // Convert markdown inline code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Convert markdown blockquotes (> text) if not already in html
  out = out.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  out = out.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  // Convert markdown bullet points
  out = out.replace(/^[\*\-]\s+/gm, '• ');

  // Normalize header and ensure guaranteed correct date
  const headerDate = `📅 <i>${actualDateStr}</i>`;

  if (chatTitle) {
    const canonicalHeader = `📊 <b>Суточный дайджест: ${chatTitle}</b>\n${headerDate}`;
    // Strip any hallucinated leading header lines generated by AI
    const leadingHeaderRegex = /^(?:(?:📊|📈)?\s*<b>?Суточный дайджест[^\n]*<\/b>?\s*\n+)?(?:(?:📅|🗓️)\s*(?:<i>)?[^\n]*(?:<\/i>)?\s*\n+)?/i;
    const bodyWithoutHeader = out.replace(leadingHeaderRegex, '').trim();
    out = `${canonicalHeader}\n\n${bodyWithoutHeader}`;
  } else {
    // If no chatTitle was passed, sanitize any existing date line to the correct date
    if (/(?:📅|🗓️)\s*(?:<i>)?[^\n]*(?:<\/i>)?/i.test(out)) {
      out = out.replace(/(?:📅|🗓️)\s*(?:<i>)?[^\n]*(?:<\/i>)?/i, headerDate);
    }
  }

  // Safety sweep: replace any residual hallucinated dates (e.g. 2024, 2023, 2025) in calendar lines anywhere in the text
  out = out.replace(/(?:📅|🗓️)\s*(?:<i>)?[^\n]*?(?:202[0-5]|201\d)[^\n]*?(?:<\/i>)?/gi, headerDate);

  // If daily reputation summary is enabled and available for this period
  if (reputationSummaryHtml && !out.includes('Итоги изменения репутации') && !out.includes('Итоги репутации')) {
    out += `\n\n${reputationSummaryHtml}`;
  }

  // If MotoBlackList has recent posts and not already mentioned in summary
  if (blackListPosts && blackListPosts.length > 0 && !out.includes('MotoBlackList')) {
    const latestPost = blackListPosts[blackListPosts.length - 1];
    const banner = `\n\n🚨 <b>Сводка MotoBlackList (Черный список мото-продавцов)</b>\nЗа последние сутки на канале <a href="https://t.me/MotoBlackList">@MotoBlackList</a> вышел новый пост:\n<blockquote expandable>⚠️ <a href="${latestPost.url}"><b>Публикация #${latestPost.id}</b></a>: «${escapeHtml(latestPost.text)}»\n👉 <a href="${latestPost.url}">Открыть и прочитать на канале MotoBlackList</a></blockquote>`;
    out += banner;
  }

  return out.trim();
}

function getDailyReputationSummaryHtml(chatIdStr: string, hoursBack = 24): string {
  const isEnabled = (settings as any).reputationDailyDigestEnabled !== false && (filters as any).reputationDailyDigestEnabled !== false;
  if (!isEnabled) return '';

  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  
  interface RepEvent {
    userId: string;
    username?: string;
    fullName: string;
    delta: number;
    reason: string;
    fromName: string;
    timestamp: string;
    currentScore: number;
  }

  const events: RepEvent[] = [];

  for (const rep of reputations) {
    if (!rep.history || !Array.isArray(rep.history)) continue;
    const targetFullName = [rep.firstName, rep.lastName].filter(Boolean).join(' ') || (rep.username ? `@${rep.username}` : `ID ${rep.userId}`);
    for (const h of rep.history) {
      if (h.timestamp >= cutoffTime) {
        const eventChatId = String(h.chatId || '');
        if (eventChatId === chatIdStr || eventChatId === 'global' || !eventChatId) {
          events.push({
            userId: String(rep.userId),
            username: rep.username,
            fullName: targetFullName,
            delta: Number(h.delta) || 0,
            reason: h.reason || '',
            fromName: h.fromName || 'Пользователь',
            timestamp: h.timestamp,
            currentScore: rep.score || 0
          });
        }
      }
    }
  }

  if (events.length === 0) {
    return '';
  }

  // Aggregate stats per user
  const userMap = new Map<string, {
    fullName: string;
    username?: string;
    netDelta: number;
    posCount: number;
    negCount: number;
    reasons: string[];
    currentScore: number;
  }>();

  for (const ev of events) {
    const existing = userMap.get(ev.userId) || {
      fullName: ev.fullName,
      username: ev.username,
      netDelta: 0,
      posCount: 0,
      negCount: 0,
      reasons: [],
      currentScore: ev.currentScore
    };
    existing.netDelta += ev.delta;
    if (ev.delta > 0) existing.posCount++;
    else if (ev.delta < 0) existing.negCount++;
    if (ev.reason && !existing.reasons.includes(ev.reason)) {
      existing.reasons.push(ev.reason);
    }
    userMap.set(ev.userId, existing);
  }

  const sortedUsers = Array.from(userMap.values()).sort((a, b) => b.netDelta - a.netDelta);
  const totalPositive = events.filter(e => e.delta > 0).length;
  const totalNegative = events.filter(e => e.delta < 0).length;

  let block = `⭐️ <b>Итоги изменения репутации за день</b>\n`;
  block += `<blockquote expandable>`;
  block += `За прошедшие ${hoursBack}ч зафиксировано изменений репутации: <b>${events.length}</b> ` +
           `(благодарностей: <b>+${totalPositive}</b>${totalNegative > 0 ? `, снижений: <b>-${totalNegative}</b>` : ''}).\n\n`;
  block += `🏆 <b>Активность и динамика участников:</b>\n`;

  for (const u of sortedUsers.slice(0, 10)) {
    const sign = u.netDelta > 0 ? `+${u.netDelta}` : `${u.netDelta}`;
    const handleStr = u.username ? ` (@${u.username})` : '';
    const scoreFormatted = u.currentScore > 0 ? `+${u.currentScore}` : `${u.currentScore}`;
    block += `• <b>${escapeHtml(u.fullName)}</b>${escapeHtml(handleStr)}: <b>${sign}</b> ⭐️ (рейтинг: <code>${scoreFormatted}</code>)\n`;
    if (u.reasons.length > 0) {
      const sampleReasons = u.reasons.slice(0, 2).map(r => escapeHtml(r)).join('; ');
      block += `  <i>Причина: ${sampleReasons}</i>\n`;
    }
  }

  block += `</blockquote>`;
  return block;
}

async function sendTelegramHtmlMessage(chatId: string | number, text: string) {
  if (!bot) throw new Error('Telegram bot is not initialized');
  const formatted = formatSummaryForTelegramHtml(text);
  const parts = splitTelegramMessage(formatted, 4000);

  for (const part of parts) {
    try {
      await bot.telegram.sendMessage(chatId, part, { 
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: false }
      });
    } catch (htmlErr: any) {
      console.warn(`[Telegram HTML Send] Error with HTML for chat ${chatId}:`, htmlErr?.message);
      try {
        // Fallback: strip unsupported tags and retry
        const stripped = part.replace(/<(?!\/?(b|i|u|s|a|code|pre|blockquote|tg-spoiler)\b)[^>]+>/gi, '');
        await bot.telegram.sendMessage(chatId, stripped, { parse_mode: 'HTML' });
      } catch (retryErr) {
        // Ultimate fallback: plain text without formatting
        const plainText = part.replace(/<[^>]+>/g, '');
        await bot.telegram.sendMessage(chatId, plainText);
      }
    }
  }
}

function splitTelegramMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let current = '';
  const lines = text.split('\n');
  for (const line of lines) {
    if ((current + '\n' + line).length > limit) {
      if (current) parts.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) parts.push(current);
  return parts;
}

const TONE_STYLE_PROMPTS: Record<string, string> = {
  default: `СТИЛЬ ПОВЕСТВОВАНИЯ: 🤖 По-умолчанию.
Придерживайся того же естественного стиля речи, который используют участники чата, структурированно и понятно излагая суть.`,
  motobat: `СТИЛЬ ПОВЕСТВОВАНИЯ: 👮‍♂️ МОТОБАТ (Доклад сотрудника ГИБДД начальнику).
Веди повествование от лица инспектора мотобатальона ГИБДД, который составляет официальный, но живой оперативный рапорт своему вышестоящему начальнику (товарищу майору / полковнику) о ситуации в поднадзорном чате байкеров/мотоциклистов.
Используй служебный, протокольно-оперативный тон с милицейско-полицейским и мотоциклетным сленгом («в ходе негласного мониторинга», «граждане байкеры», «фигуранты», «нарушители скоростного режима», «двухколёсные», «оперативная обстановка»). Инспектор иногда прямо и без стеснения докладывает начальнику, что байкеры — те ещё подонки, нарушители и возмутители спокойствия, но профессионально излагает все факты обсуждения!`,
  dushevny: `СТИЛЬ ПОВЕСТВОВАНИЯ: 🫂 ДУШЕВНЫЙ (Братское и отцовское тепло).
Веди повествование максимально тепло, по-доброму, по-семейному и с отеческой заботой. Относись ко всем участникам как к родным людям.
В речи активно и органично используй душевные и тёплые слова и обращения: «друзья», «братья», «родные», «дорогие мои», «ребятки». Излагай темы так, будто сидишь у костра или за большим семейным столом и искренне радуешься за успехи участников, поддерживаешь в трудностях и с доброй улыбкой подводишь итоги дня.`,
  debaucher: `СТИЛЬ ПОВЕСТВОВАНИЯ: 🤬 ДЕБОШИР.
Веди повествование так, будто ты после трёх бокалов — дерзкий, язвительный, саркастичный и без цензуры. Разрешается и приветствуется использовать крепкие выражения, стебать и подкалывать участников обсуждения, отпускать острые колкие шутки, иронизировать над их спорами и даже нарочито преувеличивать или комично искажать факты в стиле дружеской посиделки друзей, которые не обижаются на иронию и сарказм.`,
  troll: `СТИЛЬ ПОВЕСТВОВАНИЯ: 😈 ТРОЛЛЬ.
Язвительный, колкий стиль без перехода границ. По духу это всё тот же дебошир — с подколами, провокациями и стёбом участников обсуждения, но СТРОГО БЕЗ МАТА и ненормативной лексики. Иронизируй над спорами, наивностью и техническими теориями участников, тонко подкалывай их, создавая дерзкую и смешную атмосферу для ценителей колкого юмора.`,
  sycophant: `СТИЛЬ ПОВЕСТВОВАНИЯ: 😍 ПОДХАЛИМ.
Пиши в манере искусного льстеца и восторженного поклонника! Мастерски льсти участникам, подчеркивай ум, гениальность, мудрость и высокую значимость каждого участника чата, возводи их слова в ранг абсолютной истины, при этом добавляя тончайшую, забавную и лёгкую иронию. Для тех, кто любит лесть и похвалу!`,
  chaos: `СТИЛЬ ПОВЕСТВОВАНИЯ: ☀️ СОЛНЕЧНЫЙ ХАОС.
Добрый, весёлый и слегка безумный стиль, где обычный чат превращается в ситком, реалити-шоу и приключенческий сериал одновременно! Много тёплого юмора, лёгкого абсурда, неожиданных выводов, драматических преувеличений и театральных преувеличений с редкими вспышками очаровательного творческого безумия!`
};

class DigestSkippedError extends Error {
  isSkipped: boolean;
  constructor(message: string) {
    super(message);
    this.name = 'DigestSkippedError';
    this.isSkipped = true;
  }
}

interface DigestQueueTask {
  id: string;
  chatId: string;
  hoursBack: number;
  customPrompt?: string;
  sendImmediately: boolean;
  targetChatId?: string;
  toneStyle?: string;
  isScheduled?: boolean;
  resolve?: (digest: any) => void;
  reject?: (err: any) => void;
}

const digestQueue: DigestQueueTask[] = [];
let isProcessingDigestQueue = false;

function enqueueDigest(task: DigestQueueTask): Promise<any> {
  return new Promise((resolve, reject) => {
    task.resolve = resolve;
    task.reject = reject;
    digestQueue.push(task);
    console.log(`[DigestQueue] Enqueued task for chat ${task.chatId} (scheduled: ${!!task.isScheduled}). Queue size: ${digestQueue.length}`);
    processNextDigestInQueue();
  });
}

async function processNextDigestInQueue() {
  if (isProcessingDigestQueue || digestQueue.length === 0) return;
  isProcessingDigestQueue = true;

  const currentTask = digestQueue.shift()!;
  console.log(`[DigestQueue] ⏳ Processing sequential digest for chat ${currentTask.chatId} (Remaining in queue: ${digestQueue.length})`);

  try {
    const digest = await generateChatSummary(
      currentTask.chatId,
      currentTask.hoursBack,
      currentTask.customPrompt,
      currentTask.sendImmediately,
      currentTask.targetChatId,
      currentTask.toneStyle || 'default',
      currentTask.isScheduled || false
    );
    if (currentTask.resolve) currentTask.resolve(digest);
    console.log(`[DigestQueue] ✅ Finished digest for chat ${currentTask.chatId}`);
  } catch (err: any) {
    if (err?.isSkipped || err?.name === 'DigestSkippedError') {
      console.log(`[DigestQueue] ℹ️ Пропуск задачи для чата ${currentTask.chatId}: ${err?.message || err}`);
    } else {
      console.error(`[DigestQueue] ❌ Task failed for chat ${currentTask.chatId}:`, err?.message || err);
    }
    if (currentTask.reject) currentTask.reject(err);
  } finally {
    // 2.5s pacing delay between AI generation requests to avoid quota spikes and rate limits
    await new Promise(r => setTimeout(r, 2500));
    isProcessingDigestQueue = false;
    processNextDigestInQueue();
  }
}

async function generateChatSummary(
  chatId: string,
  hoursBack = 24,
  customPrompt?: string,
  sendImmediately = false,
  targetChatId?: string,
  toneStyle: string = 'default',
  isScheduled = false
) {
  const chatIdStr = String(chatId);
  const chat = chats.find(c => String(c.id) === chatIdStr);
  const chatTitle = chat ? chat.title : `Чат ${chatIdStr}`;
  const config = digestConfigs.find(c => String(c.chatId) === chatIdStr);
  const minThreshold = config?.minMessageThreshold || 10;
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  let msgs = chatMessages.filter(m => String(m.chatId) === chatIdStr && m.timestamp >= cutoffTime);

  if (msgs.length === 0) {
    try {
      const snap = await db.collection('chat_messages').get();
      const allDbMsgs = snap.docs.map(d => d.data());
      msgs = allDbMsgs.filter(m => String(m.chatId) === chatIdStr && m.timestamp >= cutoffTime);
    } catch (e) {
      console.warn('Could not load chat messages from db:', e);
    }
  }

  msgs = msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const uniqueUsers = new Set(msgs.map(m => m.userId || m.username || m.firstName));
  const userCount = uniqueUsers.size;
  const messageCount = msgs.length;

  // THRESHOLD CHECK:
  // For automated scheduled daily posting: skip if message count is below threshold (< 10)
  if (isScheduled && messageCount < minThreshold) {
    const skipReason = `В чате за последние ${hoursBack}ч зафиксировано только ${messageCount} сообщений (требуется минимум ${minThreshold}). Дайджест пропущен, чтобы не беспокоить участников чата.`;
    addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'DIGEST',
      user: 'AI Summarizer',
      chat: chatTitle,
      details: `ℹ️ [Пропуск по порогу активности] ${skipReason}`
    }).catch(() => {});
    throw new DigestSkippedError(skipReason);
  }

  // For manual requests from admin panel: allow generating if there is at least 1 message; if 0, notify
  if (!isScheduled && messageCount === 0) {
    throw new Error(`В чате «${chatTitle}» за последние ${hoursBack}ч нет новых сообщений от участников для составления дайджеста.`);
  }

  // WAVE CHECK FOR SCHEDULED POSTING:
  // Post only ONCE after a day with > 10 messages, then stop until next wave of >= 10 messages
  if (isScheduled && config?.lastWaveSummarizedAt) {
    const newMsgsSinceLastWave = msgs.filter(m => m.timestamp > config.lastWaveSummarizedAt!).length;
    if (newMsgsSinceLastWave < minThreshold) {
      const skipReason = `В чате нет новой волны сообщений с момента предыдущего дайджеста (${newMsgsSinceLastWave} новых сообщ. < ${minThreshold}). Пропуск генерации до следующей волны активности.`;
      addLog({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        type: 'DIGEST',
        user: 'AI Summarizer',
        chat: chatTitle,
        details: `ℹ️ [Пропуск волны активности] ${skipReason}`
      }).catch(() => {});
      throw new DigestSkippedError(skipReason);
    }
  }

  // RULE 3: Fetch recent MotoBlackList posts for the period
  const blackListPosts = await getRecentMotoBlackListPosts(hoursBack);
  let blackListContext = '';
  if (blackListPosts.length > 0) {
    const latest = blackListPosts[blackListPosts.length - 1];
    blackListContext = `
ВАЖНОЕ ПРЕДУПРЕЖДЕНИЕ: За последние ${hoursBack}ч на канале MotoBlackList (https://t.me/MotoBlackList) вышел новый пост #${latest.id}:
Текст поста: «${latest.text}»
Ссылка: ${latest.url}
ОБЯЗАТЕЛЬНО включи в конец дайджеста блок предупреждения со ссылкой на этот пост! Используй тег <blockquote expandable> для описания подробностей.
`;
  }

  // 100% ANONYMIZED CHAT LOG: Never pass user names, firstNames, or usernames to LLM!
  let formattedChatLog = '';
  if (msgs.length > 0) {
    formattedChatLog = msgs.map(m => {
      const timeStr = new Date(m.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return `[${timeStr}] Участник: ${m.text}`;
    }).join('\n');
  } else {
    formattedChatLog = 'За указанный период в чате новых сообщений от участников не зафиксировано.';
  }

  const todayStr = getProjectDateFormatted();
  const toneInstruction = TONE_STYLE_PROMPTS[toneStyle] || TONE_STYLE_PROMPTS.default;

  const promptText = `Ты — профессиональный ИИ-редактор и модератор Telegram-сообщества.
Твоя цель: составить информативный, стильный и структурированный суточный дайджест тем, обсуждавшихся в чате «${chatTitle}» за последние ${hoursBack} часов.

СТРОГОЕ ОБЯЗАТЕЛЬНОЕ ТРЕБОВАНИЕ К ДАТЕ:
Сегодняшняя точная реальная дата: «${todayStr}».
В шапке дайджеста ты ОБЯЗАН указать в точности:
📊 <b>Суточный дайджест: ${chatTitle}</b>
📅 <i>${todayStr}</i>
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО указывать 2024 год, 2023 год или любые другие устаревшие даты! Используй ТОЛЬКО текущую дату: «${todayStr}».

${toneInstruction}

${customPrompt ? `Специальные пожелания от администратора:\n«${customPrompt}»\n` : ''}
${blackListContext}

Сообщения из чата за последние ${hoursBack} ч. (дата: ${todayStr}, сообщений: ${messageCount}):
---
${formattedChatLog.slice(0, 30000)}
---

ПРАВИЛА И СТРУКТУРА ОФОРМЛЕНИЯ (СТРОГО TELEGRAM HTML):
1. СТРОЖАЙШИЙ ПРИНЦИП ПОЛНОЙ ОБЕЗЛИЧЕННОСТИ (АНОНИМНОСТЬ):
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО называть или упоминать какие-либо имена участников, фамилии, никнеймы, теги (@username) или обращения к конкретным людям (никаких «Иван», «Павел», «Алексей», «байкер Fox» и т.д.).
   - Текст дайджеста должен быть ПОЛНОСТЬЮ ОБЕЗЛИЧЕННЫМ. Описывай только суть: темы, события, технические вопросы, советы, мнения, споры, локации и решения от лица сообщества или в безличной форме (например: «Участники обсудили выбор масла...», «Было высказано мнение о...», «Поступило предложение организовать выезд...», «Один из мотоциклистов поделился опытом...», «В ходе дискуссии пришли к выводу...»).
   - Ни одного имени человека в тексте дайджеста быть НЕ ДОЛЖНО!
2. ЕДИНЫЙ ФОРМАТ: ЗАГОЛОВОК + ВЕСЬ ОСНОВНОЙ ТЕКСТ ПОД СВОРАЧИВАЮЩИЙСЯ ПОДКАТ (<blockquote expandable>):
   - В дайджесте в открытом виде (снаружи) выводятся только приветствие/шапка с датой и краткие однострочные заголовки тем/разделов.
   - ВСЁ основное содержимое каждой темы, все детали обсуждений, споры, советы, анонсы, цитаты и описание атмосферы дня ОБЯЗАТЕЛЬНО помещай под сворачивающийся блок:
     <blockquote expandable>Здесь развернутый текст темы, аргументы сторон, детали, советы и выводы</blockquote>
   - В Telegram блок <blockquote expandable> схлопывается в компактный интерактивный спойлер/подкат с кнопкой «Развернуть».
3. ЗАПРЕТ НА СЧЁТЧИКИ СООБЩЕНИЙ:
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать количество участников и сообщений за сутки (никаких «Сообщений: 45», «Участников: 12»). Переходи сразу к дате и сути тем!
4. ИСПОЛЬЗУЙ ТОЛЬКО ЧИСТЫЙ TELEGRAM HTML:
   - <b>Жирный текст для заголовков</b>
   - <i>Курсив для дат и ремарок</i>
   - <blockquote expandable>Весь подробный текст подката</blockquote>
   - <a href="URL">Ссылки</a>
   - Никаких Markdown-решеток (#, ##) или звездочек (**).

Примерная визуальная структура:

📊 <b>Суточный дайджест: ${chatTitle}</b>
📅 <i>${todayStr}</i>

🔥 <b>[Тема 1: Краткий однострочный заголовок]</b>
<blockquote expandable>Развернутое обезличенное описание темы 1: что обсуждалось, какие варианты предлагались, аргументы и подробности без имен.</blockquote>

🔥 <b>[Тема 2: Краткий однострочный заголовок]</b>
<blockquote expandable>Развернутое описание темы 2: подробности, ключевые мысли и выводы.</blockquote>

💡 <b>Полезные советы, ремонт и экипировка</b>
<blockquote expandable>Подробные рекомендации, ссылки на проверенные сервисы, артикулы и технические решения, обсуждавшиеся участниками.</blockquote>

📣 <b>Анонсы, покатушки и встречи</b>
<blockquote expandable>Информация о запланированных сборах, маршрутах и важных объявлениях.</blockquote>

👥 <b>Атмосфера и итоги дня</b>
<blockquote expandable>Краткая характеристика настроения в чате и общие выводы дня в выбранном стиле без упоминания конкретных персоналий.</blockquote>
${blackListPosts.length > 0 ? `
🚨 <b>Сводка MotoBlackList</b>
<blockquote expandable>⚠️ На канале <a href="${blackListPosts[blackListPosts.length - 1].url}">@MotoBlackList вышел новый пост</a>: «${blackListPosts[blackListPosts.length - 1].text}». Будьте бдительны при сделках!</blockquote>` : ''}

Сформируй дайджест на русском языке, согласно выбранному стилю повествования, строго соблюдая правило "заголовок + весь текст под <blockquote expandable>", ПОЛНУЮ ОБЕЗЛИЧЕННОСТЬ без каких-либо имён и без тегов @username.`;

  let rawSummaryText = '';
  try {
    rawSummaryText = await generateAIResponse(promptText);
  } catch (aiErr: any) {
    console.error('Failed to generate AI response:', aiErr);
    addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'ERROR',
      user: 'Gemini AI',
      chat: chatTitle,
      details: `❌ [Ошибка ИИ при суммаризации] ${aiErr?.message || aiErr}`
    }).catch(() => {});
    throw aiErr;
  }

  // Format and enhance with HTML tags, strict canonical header and date, daily reputation summary and MotoBlackList if needed
  const repSummaryHtml = getDailyReputationSummaryHtml(chatIdStr, hoursBack);
  const summaryText = formatSummaryForTelegramHtml(rawSummaryText, blackListPosts, chatTitle, todayStr, repSummaryHtml);

  const digestEntry = {
    id: Math.random().toString(36).substr(2, 9),
    chatId: String(chatId),
    chatTitle,
    summary: summaryText,
    messageCount,
    userCount,
    hoursBack,
    toneStyle,
    createdAt: new Date().toISOString(),
    sentToTelegram: false,
    targetChatId: targetChatId || chatId
  };

  if (sendImmediately && bot) {
    const destinationChatId = targetChatId || chatId;
    try {
      await sendTelegramHtmlMessage(destinationChatId, summaryText);
      digestEntry.sentToTelegram = true;
      (digestEntry as any).sentAt = new Date().toISOString();
      console.log(`Digest ${digestEntry.id} successfully sent to Telegram chat ${destinationChatId}`);
      addLog({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        type: 'DIGEST',
        user: 'Telegram Bot',
        chat: chatTitle,
        details: `✅ [Дайджест опубликован] Суточный дайджест успешно отправлен в Telegram-чат (${messageCount} сообщ., ${userCount} участников)`
      }).catch(() => {});
    } catch (sendErr: any) {
      console.error(`Failed to send digest to Telegram chat ${destinationChatId}:`, sendErr);
      addLog({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        type: 'ERROR',
        user: 'Telegram Bot',
        chat: chatTitle,
        details: `❌ [Ошибка отправки дайджеста] Не удалось отправить сообщение в чат ${destinationChatId}: ${sendErr?.message || sendErr}`
      }).catch(() => {});
    }
  }

  // Update last wave timestamp on config so we don't repeat until next wave of >= 10 messages
  if (config) {
    config.lastWaveSummarizedAt = msgs[msgs.length - 1]?.timestamp || new Date().toISOString();
    config.lastGeneratedAt = new Date().toISOString();
    if (digestEntry.sentToTelegram) {
      config.lastSentAt = new Date().toISOString();
    }
    db.collection('config').doc('digest_configs').set(cleanData({ configs: digestConfigs })).catch(e => console.warn('Failed to update config wave timestamp:', e));
  }

  chatDigests.unshift(digestEntry);
  if (chatDigests.length > 200) chatDigests.pop();
  queueWrite('chat_digests', digestEntry.id, cleanData(digestEntry));

  // Sync to 30-day website catalog summaries archive
  try {
    const catalogMatch = findChatInCatalog(chatTitle) || findChatInCatalog(chatIdStr) || findChatInCatalog(chat?.username || '');
    const targetSlug = catalogMatch ? catalogMatch.slug : chatIdStr;
    const todayDateStr = new Date().toISOString().split('T')[0];
    const dayLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

    const catalogDailySummary: ChatDailySummary = {
      id: `sum_${targetSlug}_${todayDateStr}_${digestEntry.id}`,
      chatSlug: targetSlug,
      date: todayDateStr,
      dayLabel: dayLabel,
      title: `Дайджест за ${dayLabel}`,
      messageCount: messageCount,
      activeUsersCount: userCount,
      topics: [
        { emoji: '🔥', title: 'Обсуждения дня и ключевые вопросы', description: 'Основные темы, разобранные участниками в ходе дискуссий.' },
        { emoji: '💡', title: 'Советы, ремонт и рекомендации', description: 'Полезные технические решения и ссылки, упомянутые в чате.' }
      ],
      rawSummaryHtml: summaryText,
      createdAt: new Date().toISOString()
    };

    addChatSummary(targetSlug, catalogDailySummary);
    // Regenerate XML export file to reflect latest summary
    saveXmlExportToFile({ chats, chatMessages, statsHistory });
  } catch (syncErr) {
    console.warn('[ChatCatalog] Не удалось синхронизировать дайджест с каталогом / обновить XML экспорт:', syncErr);
  }

  await addLog({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    type: 'SYSTEM',
    user: 'Gemini AI',
    chat: chatTitle,
    details: `Сформирован суточный дайджест (${messageCount} сообщ., стиль: ${toneStyle})${digestEntry.sentToTelegram ? ' и отправлен в чат' : ''}`
  });

  return digestEntry;
}

let filters: FilterSettings = {
  blockLinks: true,
  blockTelegramLinks: false,
  blockMedia: false,
  blockForwards: true,
  forbiddenWords: ['scam', 'crypto', 'free money'],
  autoApprove: true,
  captchaEnabled: false,
  captchaQuestion: 'Сколько будет 2 + 2?',
  captchaAnswer: '4',
  muteNewcomers: false,
  muteDurationHours: 24,
  muteMessage: 'Добро пожаловать! Вы временно в муте на {hours}ч. Пожалуйста, ознакомьтесь с правилами.',
  deleteSystemMessages: false,
  deleteCommands: false,
  userVoteEnabled: false,
  userVotePercentage: 10,
  userVoteMin: 5,
  userVoteMax: 50,
  userVoteDuration: 1440,
  notifyMultiChat: false,
  multiChatThreshold: 5,
  warnLimit: 3,
  warnAction: 'BAN' as 'BAN' | 'MUTE',
  reputationEnabled: true,
  muteReputationChangeMessages: false,
  reputationDailyDigestEnabled: true,
  requireChannelSubscription: false,
  channelSubscriptionTarget: '',
  channelSubscriptionMessage: '',
  tagAdminsEnabled: false,
  tagAdminsMessage: ''
};
let settings = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  adminPassword: '',
  dbHost: 'localhost',
  dbUser: 'root',
  dbPass: '',
  dbName: 'teleguard',
  maintenanceMode: false,
  infoChatId: '',
  cfWorkerUrl: process.env.CF_WORKER_URL || '',
  disableCloudflare: false,
  adminTelegramUsername: 'bookray',
  telegramApiRoot: process.env.TELEGRAM_API_ROOT || '',
  webAppUrl: '',
  aiProvider: 'gemini' as 'gemini' | 'openrouter' | 'custom',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: 'gemini-3.1-flash-lite',
  geminiBaseUrl: '',
  geminiUseProxy: true,
  geminiProxySource: 'auto' as 'auto' | 'tg_proxy' | 'cf_worker' | 'custom' | 'direct',
  openRouterApiKey: '',
  openRouterModel: 'google/gemini-2.0-flash-001',
  customAiEndpoint: '',
  customAiApiKey: '',
  customAiModel: 'gpt-4o-mini',
  timezoneOffset: 3,
  lastSetMenuButtonUrl: '' as string,
  menuButtonRetryAfterUntil: 0 as number,
  reputationNotifyChatId: '',
  reputationNotifyInGroup: true,
  reputationNotifyInAdminChat: true,
  reputationNotifyInDm: true,
  muteReputationChangeMessages: false,
  reputationDailyDigestEnabled: true,
  companionBot: {
    enabled: false,
    botToken: '',
    botUsername: '',
    botName: '',
    replyProbability: 15,
    replyToDirectMentions: true,
    replyToQuestions: true,
    minDelayBetweenRepliesSeconds: 180,
    humorLevel: 'high' as 'none' | 'light' | 'high' | 'sarcastic',
    banterLevel: 'friendly' as 'none' | 'friendly' | 'sharp',
    personaPreset: 'biker_veteran' as 'biker_veteran' | 'friendly_mate' | 'witty_expert' | 'provocateur' | 'custom',
    customSystemPrompt: '',
    model: 'gemini-3.1-flash-lite',
    enabledChatIds: [] as string[],
    useContextCount: 10
  }
};

// Sync functions
async function syncData() {
  try {
    const dbType = process.env.DB_TYPE || 'database';
    console.log(`Starting data sync from ${dbType}...`);

    const safeLoad = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (err: any) {
        console.warn(`[Sync] Warning loading collection '${name}':`, err?.message || err);
      }
    };

    // Load core collections with independent error tolerance
    await safeLoad('chats', async () => {
      const snap = await db.collection('chats').get();
      chats = snap.docs.map(d => ({ id: String(d.id), ...d.data() } as any));
      console.log(`Loaded ${chats.length} chats`);
    });

    await safeLoad('tasks', async () => {
      const snap = await db.collection('tasks').get();
      tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${tasks.length} tasks`);
    });

    await safeLoad('bans', async () => {
      const snap = await db.collection('bans').get();
      bans = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${bans.length} bans`);
    });

    await safeLoad('memberships', async () => {
      const snap = await db.collection('memberships').get();
      memberships = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${memberships.length} memberships`);
    });

    await safeLoad('whitelist', async () => {
      const snap = await db.collection('whitelist').get();
      whitelist = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${whitelist.length} whitelisted users`);
    });

    await safeLoad('chat_bans', async () => {
      const snap = await db.collection('chat_bans').get();
      chatBans = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${chatBans.length} chat-specific bans`);
    });

    await safeLoad('reputations', async () => {
      const snap = await db.collection('reputations').get();
      reputations = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${reputations.length} reputation entries`);
    });

    await safeLoad('warnings', async () => {
      const snap = await db.collection('warnings').get();
      warnings = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${warnings.length} warning entries`);
    });

    await safeLoad('logs', async () => {
      const snap = await db.collection('logs').orderBy('timestamp', 'desc').limit(100).get();
      logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${logs.length} logs`);
    });

    await safeLoad('config/moderation', async () => {
      const filtersDoc = await db.collection('config').doc('moderation').get();
      if (filtersDoc.exists) {
        filters = { ...filters, ...filtersDoc.data() as any };
        console.log('Loaded moderation filters');
      }
    });

    await safeLoad('config/settings', async () => {
      const settingsDoc = await db.collection('config').doc('settings').get();
      if (settingsDoc.exists) {
        settings = { ...settings, ...settingsDoc.data() as any };
        if (settings.lastSetMenuButtonUrl) {
          lastSetMenuButtonUrl = settings.lastSetMenuButtonUrl;
        }
        if (typeof settings.menuButtonRetryAfterUntil === 'number') {
          menuButtonRetryAfterUntil = settings.menuButtonRetryAfterUntil;
        }
        if (settings.geminiModel) {
          settings.geminiModel = sanitizeGeminiModel(settings.geminiModel);
        }
        console.log('Loaded settings (geminiModel:', settings.geminiModel, ')');
      }
    });

    await safeLoad('stats', async () => {
      const snap = await db.collection('stats').orderBy('date', 'asc').get();
      const tzOffset = typeof settings?.timezoneOffset === 'number' ? settings.timezoneOffset : 3;
      statsHistory = snap.docs.map(d => {
        const item = { id: d.id, ...d.data() } as any;
        if (!item.tzAdjusted) {
          if (item.hourly) {
            item.hourly = shiftHourlyStats(item.hourly, tzOffset);
          }
          if (item.chatStats) {
            Object.keys(item.chatStats).forEach(cId => {
              if (item.chatStats[cId]?.hourly) {
                item.chatStats[cId].hourly = shiftHourlyStats(item.chatStats[cId].hourly, tzOffset);
              }
            });
          }
          item.tzAdjusted = true;
          queueWrite('stats', item.date, cleanData(item));
        }
        return item;
      });
      console.log(`Loaded ${statsHistory.length} stats history entries (timezone adjusted: ${tzOffset >= 0 ? '+' : ''}${tzOffset}h)`);
    });

    await safeLoad('active_mutes', async () => {
      const snap = await db.collection('active_mutes').get();
      activeMutes = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${activeMutes.length} active mutes`);
    });

    await safeLoad('config/broadcast', async () => {
      const broadcastDoc = await db.collection('config').doc('broadcast').get();
      if (broadcastDoc.exists) {
        lastBroadcastMessages = (broadcastDoc.data() as any).messages || [];
      }
    });

    await safeLoad('broadcast_history', async () => {
      const snap = await db.collection('broadcast_history').orderBy('timestamp', 'desc').limit(100).get();
      broadcastHistory = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${broadcastHistory.length} broadcast history entries`);
    });

    await safeLoad('config/deletions', async () => {
      const deletionsDoc = await db.collection('config').doc('deletions').get();
      if (deletionsDoc.exists) {
        scheduledDeletions = (deletionsDoc.data() as any).items || [];
      }
    });

    await safeLoad('config/unpins', async () => {
      const unpinsDoc = await db.collection('config').doc('unpins').get();
      if (unpinsDoc.exists) {
        scheduledUnpins = (unpinsDoc.data() as any).items || [];
        console.log(`Loaded ${scheduledUnpins.length} scheduled unpins`);
      }
    });

    await safeLoad('config/antiscam_keywords', async () => {
      const doc = await db.collection('config').doc('antiscam_keywords').get();
      if (doc.exists) {
        const data = doc.data() as any;
        antiScamKeywordsConfig = {
          ...antiScamKeywordsConfig,
          ...data,
          keywords: Array.isArray(data.keywords) ? data.keywords : antiScamKeywordsConfig.keywords
        };
        console.log(`Loaded anti-scam keywords config with ${antiScamKeywordsConfig.keywords.length} keywords`);
      } else {
        await db.collection('config').doc('antiscam_keywords').set(cleanData(antiScamKeywordsConfig));
      }
    });

    await safeLoad('scam_alert_logs', async () => {
      const snap = await db.collection('scam_alert_logs').orderBy('timestamp', 'desc').limit(100).get();
      scamAlertLogs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${scamAlertLogs.length} scam alert logs`);
    });

    await safeLoad('chat_digests', async () => {
      const snap = await db.collection('chat_digests').orderBy('createdAt', 'desc').limit(200).get();
      chatDigests = snap.docs.map(d => {
        const item = { id: d.id, ...d.data() } as any;
        if (item.summary) {
          const createdDate = item.createdAt ? new Date(item.createdAt) : new Date();
          const realDayLabel = getProjectDateFormatted(createdDate);
          if (/(?:📅|🗓️)/i.test(item.summary)) {
            item.summary = item.summary.replace(/(?:📅|🗓️)\s*(?:<i>)?[^\n]*(?:<\/i>)?/i, `📅 <i>${realDayLabel}</i>`);
          }
        }
        return item;
      });
      console.log(`Loaded ${chatDigests.length} chat digests`);

      // One-time self-healing background update for stored digests with wrong dates
      (async () => {
        try {
          let updatedCount = 0;
          for (const d of snap.docs) {
            const data = d.data();
            const summary = data.summary || '';
            if (summary.includes('2024') || summary.includes('2023') || summary.includes('24 мая')) {
              const createdDate = data.createdAt ? new Date(data.createdAt) : new Date();
              const realDayLabel = getProjectDateFormatted(createdDate);
              const fixedSummary = summary.replace(/(?:📅|🗓️)\s*(?:<i>)?[^\n]*(?:<\/i>)?/i, `📅 <i>${realDayLabel}</i>`);
              if (fixedSummary !== summary) {
                queueWrite('chat_digests', d.id, { ...cleanData(data), summary: fixedSummary });
                updatedCount++;
              }
            }
          }
          if (updatedCount > 0) {
            console.log(`[SelfHealing] Fixed ${updatedCount} chat digests with outdated/hallucinated dates in database.`);
            await loadRealDigestsFromDatabase();
            saveXmlExportToFile({ chats, chatMessages, statsHistory });
          }
        } catch (healErr) {
          console.warn('[SelfHealing] Digest dates healing warning:', healErr);
        }
      })();
    });

    await safeLoad('config/digest_configs', async () => {
      const digestConfigsDoc = await db.collection('config').doc('digest_configs').get();
      if (digestConfigsDoc.exists) {
        digestConfigs = (digestConfigsDoc.data() as any).configs || [];
        console.log(`Loaded ${digestConfigs.length} digest configs`);
      }
    });

    await safeLoad('chat_messages', async () => {
      const snap = await db.collection('chat_messages').orderBy('timestamp', 'desc').limit(500).get();
      chatMessages = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${chatMessages.length} cached chat messages for AI digests`);
    });

    await safeLoad('pinned_messages', async () => {
      const snap = await db.collection('pinned_messages').orderBy('date', 'desc').limit(500).get();
      pinnedMessages = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      console.log(`Loaded ${pinnedMessages.length} pinned messages history`);
    });

    // Create default super admin if no users exist
    await safeLoad('users', async () => {
      const usersSnap = await db.collection('users').get();
      if (usersSnap.empty) {
        console.log('No users found. Creating default super admin...');
        const adminId = 'admin';
        const hashedPassword = await bcrypt.hash('admin123', 10);
        const defaultAdmin = {
          id: adminId,
          username: 'admin',
          email: 'admin@teleguard.local',
          password: hashedPassword,
          role: 'SUPER_ADMIN',
          assignedChatIds: [],
          createdAt: new Date().toISOString()
        };
        await db.collection('users').doc(adminId).set(defaultAdmin);
        console.log('Default super admin created: admin / admin123');
      }
    });

    // Polling for config updates instead of unstable onSnapshot
    const syncConfig = async () => {
      try {
        const [modDoc, setDoc, digestDoc] = await Promise.all([
          db.collection('config').doc('moderation').get(),
          db.collection('config').doc('settings').get(),
          db.collection('config').doc('digest_configs').get()
        ]);

        if (modDoc.exists) {
          filters = { ...filters, ...modDoc.data() as any };
        }

        if (digestDoc.exists) {
          const loadedDigests = (digestDoc.data() as any).configs;
          if (Array.isArray(loadedDigests)) {
            digestConfigs = loadedDigests;
          }
        }

        if (setDoc.exists) {
          const newSettings = setDoc.data() as any;
          const tokenChanged = newSettings.botToken !== settings.botToken;
          const apiRootChanged = newSettings.telegramApiRoot !== settings.telegramApiRoot;
          settings = { ...settings, ...newSettings };
          if (tokenChanged || apiRootChanged) {
            console.log('Bot token or Telegram API Root updated from database (via polling), restarting...');
            initBot(settings.botToken);
          }
        }
      } catch (err) {
        console.error('Periodic config sync error:', err);
      }
    };

    // Initial sync and set interval
    await syncConfig();
    setInterval(syncConfig, 60000); // Check every minute

    console.log('Data synced successfully with database and polling enabled');
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'initial_sync');
  }
}

// Duration parser supporting s, m, h, d, w, M, y/у (seconds, minutes, hours, days, weeks, months, years)
function parseDuration(input: string): { seconds: number; formatted: string } | null {
  if (!input) return null;
  const str = input.trim();
  const regex = /(\d+)\s*([a-zA-Zа-яА-Я]+)?/g;
  let totalSeconds = 0;
  let matches = 0;
  let match;

  while ((match = regex.exec(str)) !== null) {
    if (!match[1]) continue;
    matches++;
    const val = parseInt(match[1], 10);
    const rawUnit = match[2] || '';
    const unit = rawUnit.toLowerCase();

    if (rawUnit === 'M' || unit === 'мес' || unit === 'month' || unit === 'mon') {
      totalSeconds += val * 30 * 86400;
    } else if (unit === 's' || unit === 'с' || unit === 'сек' || unit === 'sec') {
      totalSeconds += val;
    } else if (unit === 'm' || unit === 'м' || unit === 'мин' || unit === 'min') {
      totalSeconds += val * 60;
    } else if (unit === 'h' || unit === 'ч' || unit === 'час' || unit === 'hr') {
      totalSeconds += val * 3600;
    } else if (unit === 'd' || unit === 'д' || unit === 'дн' || unit === 'день' || unit === 'дней' || unit === 'day') {
      totalSeconds += val * 86400;
    } else if (unit === 'w' || unit === 'н' || unit === 'нед' || unit === 'week') {
      totalSeconds += val * 7 * 86400;
    } else if (unit === 'y' || unit === 'у' || unit === 'г' || unit === 'год' || unit === 'лет' || unit === 'year') {
      totalSeconds += val * 365 * 86400;
    } else {
      totalSeconds += val * 60;
    }
  }

  if (matches === 0 || totalSeconds <= 0) return null;

  // Limits: Minimum 30 seconds, Maximum 356 days (or 365 days)
  const minSeconds = 30;
  const maxSeconds = 365 * 86400;
  if (totalSeconds < minSeconds) totalSeconds = minSeconds;
  if (totalSeconds > maxSeconds) totalSeconds = maxSeconds;

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) {
    if (days >= 365) {
      const years = Math.floor(days / 365);
      parts.push(`${years} г.`);
    } else if (days >= 30 && days % 30 === 0) {
      const months = Math.floor(days / 30);
      parts.push(`${months} мес.`);
    } else {
      parts.push(`${days} д.`);
    }
  }
  if (hours > 0) parts.push(`${hours} ч.`);
  if (minutes > 0) parts.push(`${minutes} мин.`);
  if (seconds > 0 && days === 0 && hours === 0) parts.push(`${seconds} сек.`);

  return {
    seconds: totalSeconds,
    formatted: parts.join(' ') || `${totalSeconds} сек.`
  };
}

async function isModeratorOrAdmin(ctx: any, chatId: string, userId: number): Promise<boolean> {
  if (settings.adminTelegramUsername) {
    const adminUser = settings.adminTelegramUsername.replace('@', '').toLowerCase();
    if (ctx.from?.username && ctx.from.username.toLowerCase() === adminUser) return true;
  }
  try {
    const member = await ctx.telegram.getChatMember(chatId, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (e) {
    return false;
  }
}

async function adjustUserReputation(
  targetUserId: string,
  delta: number,
  reason: string,
  fromUserId: string,
  fromName: string,
  chatId: string,
  chatTitle: string
) {
  let rep = reputations.find(r => String(r.userId) === String(targetUserId));
  const member = memberships.find(m => String(m.userId) === String(targetUserId));
  
  if (!rep) {
    rep = {
      id: targetUserId,
      userId: targetUserId,
      username: member?.username ? member.username.replace('@', '') : undefined,
      firstName: member?.firstName || `User ${targetUserId}`,
      lastName: member?.lastName,
      score: 0,
      positiveCount: 0,
      negativeCount: 0,
      chatScores: {},
      history: [],
      updatedAt: new Date().toISOString()
    };
    reputations.push(rep);
  }

  rep.score = (rep.score || 0) + delta;
  if (delta > 0) rep.positiveCount = (rep.positiveCount || 0) + delta;
  else rep.negativeCount = (rep.negativeCount || 0) + Math.abs(delta);

  if (!rep.chatScores) rep.chatScores = {};
  rep.chatScores[chatId] = (rep.chatScores[chatId] || 0) + delta;

  if (!rep.history) rep.history = [];
  rep.history.unshift({
    id: Math.random().toString(36).substr(2, 9),
    fromUserId,
    fromName,
    chatId,
    chatTitle,
    delta,
    reason,
    timestamp: new Date().toISOString()
  });
  if (rep.history.length > 50) rep.history.pop();
  rep.updatedAt = new Date().toISOString();

  if (member) {
    if (member.username) rep.username = member.username.replace('@', '');
    if (member.firstName) rep.firstName = member.firstName;
    if (member.lastName) rep.lastName = member.lastName;
  }

  queueWrite('reputations', targetUserId, cleanData(rep));

  // 1. Add entry to Admin Panel activity logs
  const targetFullName = [rep.firstName, rep.lastName].filter(Boolean).join(' ') || (rep.username ? `@${rep.username}` : `ID ${targetUserId}`);
  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
  const actionEmoji = delta > 0 ? '⭐️' : '🔻';
  const scoreFormatted = rep.score > 0 ? `+${rep.score}` : `${rep.score}`;

  await addLog({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    type: 'SYSTEM',
    user: fromName,
    chat: chatTitle,
    details: `${actionEmoji} Репутация (${deltaLabel}) для ${targetFullName}. Причина: ${reason}. Рейтинг: ${scoreFormatted}`
  });

  // 2. Send Telegram notification to Admin / Info Chat
  const targetChatId = (settings as any).reputationNotifyChatId || (filters as any).reputationNotifyChatId || settings.infoChatId || antiScamKeywordsConfig.notifyChatId || process.env.BOOKRAY_CHAT_ID;
  const notifyInAdminChat = (settings as any).reputationNotifyInAdminChat !== false && (filters as any).reputationNotifyInAdminChat !== false;

  const userHandle = rep.username ? `@${rep.username}` : `ID: ${targetUserId}`;
  const isTargetDigits = /^\d+$/.test(String(targetUserId));
  const targetLink = isTargetDigits 
    ? `<a href="tg://user?id=${targetUserId}">${escapeHtml(targetFullName)}</a>` 
    : `<b>${escapeHtml(targetFullName)}</b>`;

  const isFromDigits = /^\d+$/.test(String(fromUserId));
  const fromHandle = fromUserId.startsWith('admin_') 
    ? `Администратор (${escapeHtml(fromName)})` 
    : isFromDigits 
      ? `<a href="tg://user?id=${fromUserId}">${escapeHtml(fromName)}</a>` 
      : `<b>${escapeHtml(fromName)}</b>`;

  if (targetChatId && bot && notifyInAdminChat) {
    const alertText = 
      `${actionEmoji} <b>Изменение репутации: ${deltaLabel}</b>\n\n` +
      `👤 <b>Кому:</b> ${targetLink} (${escapeHtml(userHandle)})\n` +
      `✍️ <b>От кого:</b> ${fromHandle}\n` +
      `📍 <b>Чат:</b> <i>${escapeHtml(chatTitle)}</i>\n` +
      `💬 <b>Причина:</b> ${escapeHtml(reason)}\n` +
      `📈 <b>Текущий рейтинг:</b> <code>${scoreFormatted}</code>\n` +
      `⏰ <i>${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)</i>`;

    bot.telegram.sendMessage(targetChatId, alertText, { parse_mode: 'HTML' })
      .catch(async (htmlErr) => {
        console.warn('[Reputation] HTML send failed to info chat, trying plain text:', htmlErr?.message || htmlErr);
        const plainAlert = 
          `${actionEmoji} Изменение репутации: ${deltaLabel}\n\n` +
          `👤 Кому: ${targetFullName} (${userHandle})\n` +
          `✍️ От кого: ${fromName}\n` +
          `📍 Чат: ${chatTitle}\n` +
          `💬 Причина: ${reason}\n` +
          `📈 Текущий рейтинг: ${scoreFormatted}\n` +
          `⏰ ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)`;
        await bot.telegram.sendMessage(targetChatId, plainAlert).catch(e => {
          console.error('[Reputation] Failed to send info chat alert (plain):', e?.message || e);
        });
      });
  }

  // 3. Optional Personal DM notification to the user
  const isMuteChangeMessages = !!(settings as any).muteReputationChangeMessages || !!(filters as any).muteReputationChangeMessages;
  const notifyInDm = !isMuteChangeMessages && (settings as any).reputationNotifyInDm !== false && (filters as any).reputationNotifyInDm !== false;
  if (notifyInDm && bot && isTargetDigits) {
    const dmText = 
      `${actionEmoji} <b>Ваша репутация изменилась! (${deltaLabel})</b>\n\n` +
      `📍 <b>Чат:</b> <i>${escapeHtml(chatTitle)}</i>\n` +
      `✍️ <b>От:</b> ${escapeHtml(fromName)}\n` +
      `💬 <b>Причина:</b> ${escapeHtml(reason)}\n` +
      `📈 <b>Ваш текущий рейтинг:</b> <code>${scoreFormatted}</code>`;
    bot.telegram.sendMessage(targetUserId, dmText, { parse_mode: 'HTML' }).catch(async () => {
      const plainDm = `${actionEmoji} Ваша репутация изменилась: ${deltaLabel} в чате «${chatTitle}». Рейтинг: ${scoreFormatted}`;
      await bot.telegram.sendMessage(targetUserId, plainDm).catch(() => {});
    });
  }

  return rep;
}

async function applyWarning(
  targetUser: { id: number; username?: string; first_name?: string; last_name?: string },
  adminName: string,
  adminId: string,
  chatId: string,
  chatTitle: string,
  reason: string
): Promise<{ warning: any; activeWarns: number; banned: boolean }> {
  const warningId = Math.random().toString(36).substr(2, 9);
  const targetUserId = String(targetUser.id);
  const newWarn = {
    id: warningId,
    userId: targetUserId,
    username: targetUser.username,
    firstName: targetUser.first_name,
    lastName: targetUser.last_name,
    chatId,
    chatTitle,
    reason,
    adminId,
    adminName,
    createdAt: new Date().toISOString(),
    active: true
  };

  warnings.push(newWarn);
  queueWrite('warnings', warningId, cleanData(newWarn));

  // Count active warnings in this chat
  const activeWarns = warnings.filter(w => String(w.userId) === targetUserId && String(w.chatId) === String(chatId) && w.active).length;
  const warnLimit = filters.warnLimit || 3;
  let banned = false;

  if (activeWarns >= warnLimit) {
    banned = true;
    for (const w of warnings) {
      if (String(w.userId) === targetUserId && String(w.chatId) === String(chatId) && w.active) {
        w.active = false;
        queueWrite('warnings', w.id, cleanData(w));
      }
    }

    if (bot) {
      try {
        await bot.telegram.banChatMember(chatId, targetUser.id);
      } catch (e) {
        console.error(`Failed to ban user ${targetUserId} after reaching warn limit in ${chatId}:`, e);
      }
    }

    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'BAN',
      user: adminName,
      chat: chatTitle,
      details: `Пользователь ${targetUser.first_name || targetUserId} заблокирован по превышению лимита предупреждений (${activeWarns}/${warnLimit}).`
    });
  } else {
    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'WARN',
      user: adminName,
      chat: chatTitle,
      details: `Пользователю ${targetUser.first_name || targetUserId} выдано предупреждение (${activeWarns}/${warnLimit}): ${reason}`
    });
  }

  return { warning: newWarn, activeWarns, banned };
}

// Helper to update Firestore/Database and local state
async function updateChat(chat: any, immediate = false) {
  try {
    if (!chat.id) throw new Error('Chat ID is required for update');
    const chatIdStr = String(chat.id).trim();
    const chatNormalized = { ...chat, id: chatIdStr };
    const cleaned = cleanData(chatNormalized);
    
    const idx = chats.findIndex(c => String(c.id) === chatIdStr);
    if (idx !== -1) {
      chats[idx] = { ...chats[idx], ...chatNormalized };
    } else {
      chats.push(chatNormalized);
    }

    if (immediate || idx === -1) {
      console.log(`Saving chat ${chatIdStr} to database:`, cleaned);
      await db.collection('chats').doc(chatIdStr).set(cleaned);
      chatLastWrite.set(chatIdStr, Date.now());
    } else {
      const lastWrite = chatLastWrite.get(chatIdStr) || 0;
      if (Date.now() - lastWrite > 2 * 60 * 1000) {
        queueWrite('chats', chatIdStr, cleaned);
        chatLastWrite.set(chatIdStr, Date.now());
      }
    }
  } catch (err) {
    console.error(`Failed to update chat ${chat.id}:`, err);
    handleFirestoreError(err, OperationType.WRITE, `chats/${chat.id}`);
    if (immediate) throw err;
  }
}

async function addLog(log: any) {
  try {
    const cleaned = cleanData(log);
    queueWrite('logs', log.id, cleaned);
    logs.unshift(log);
    if (logs.length > 100) logs.pop();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `logs/${log.id}`);
  }
}

async function updateStats(point: any) {
  try {
    const cleaned = cleanData(point);
    queueWrite('stats', point.date, cleaned);
    const idx = statsHistory.findIndex(s => s.date === point.date);
    if (idx !== -1) statsHistory[idx] = point;
    else {
      statsHistory.push(point);
      statsHistory.sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `stats/${point.date}`);
  }
}

async function incrementDailyStats(chatId: string, type: 'joins' | 'leaves' | 'msgs', amount: number = 1, userId?: string) {
  const { dateStr: todayDate, hour: currentHour, formatted: nameFormatted } = getProjectDate();
  let today = statsHistory.find(s => s.date === todayDate);
  if (!today) {
    today = { 
      date: todayDate, 
      name: nameFormatted, 
      joins: 0, 
      leaves: 0, 
      msgs: 0, 
      chatStats: {},
      hourly: {},
      activeUsers: [],
      onlineUsers: [],
      tzAdjusted: true
    };
  } else {
    today.tzAdjusted = true;
  }

  if (type === 'joins') today.joins = (today.joins || 0) + amount;
  if (type === 'leaves') today.leaves = (today.leaves || 0) + amount;
  if (type === 'msgs') today.msgs = (today.msgs || 0) + amount;

  // Track hourly activity for today
  if (!today.hourly) today.hourly = {};
  if (!today.hourly[currentHour]) {
    today.hourly[currentHour] = { msgs: 0, joins: 0, leaves: 0, activeUsers: [] };
  }
  if (type === 'msgs') today.hourly[currentHour].msgs = (today.hourly[currentHour].msgs || 0) + amount;
  if (type === 'joins') today.hourly[currentHour].joins = (today.hourly[currentHour].joins || 0) + amount;
  if (type === 'leaves') today.hourly[currentHour].leaves = (today.hourly[currentHour].leaves || 0) + amount;

  if (!today.chatStats) today.chatStats = {};
  if (!today.chatStats[chatId]) {
    today.chatStats[chatId] = { joins: 0, leaves: 0, msgs: 0, activeUsers: [], onlineUsers: [], hourly: {} };
  }
  
  if (type === 'joins') today.chatStats[chatId].joins += amount;
  if (type === 'leaves') today.chatStats[chatId].leaves += amount;
  if (type === 'msgs') today.chatStats[chatId].msgs += amount;

  if (!today.chatStats[chatId].hourly) today.chatStats[chatId].hourly = {};
  if (!today.chatStats[chatId].hourly[currentHour]) {
    today.chatStats[chatId].hourly[currentHour] = { msgs: 0, joins: 0, leaves: 0, activeUsers: [] };
  }
  if (type === 'msgs') today.chatStats[chatId].hourly[currentHour].msgs = (today.chatStats[chatId].hourly[currentHour].msgs || 0) + amount;
  if (type === 'joins') today.chatStats[chatId].hourly[currentHour].joins = (today.chatStats[chatId].hourly[currentHour].joins || 0) + amount;
  if (type === 'leaves') today.chatStats[chatId].hourly[currentHour].leaves = (today.chatStats[chatId].hourly[currentHour].leaves || 0) + amount;

  if (userId) {
    if (type === 'msgs' || type === 'joins') {
      if (!today.activeUsers) today.activeUsers = [];
      if (!today.activeUsers.includes(userId)) today.activeUsers.push(userId);
      
      if (!today.chatStats[chatId].activeUsers) today.chatStats[chatId].activeUsers = [];
      if (!today.chatStats[chatId].activeUsers.includes(userId)) today.chatStats[chatId].activeUsers.push(userId);

      if (!today.hourly[currentHour].activeUsers) today.hourly[currentHour].activeUsers = [];
      if (!today.hourly[currentHour].activeUsers.includes(userId)) today.hourly[currentHour].activeUsers.push(userId);

      if (!today.chatStats[chatId].hourly[currentHour].activeUsers) today.chatStats[chatId].hourly[currentHour].activeUsers = [];
      if (!today.chatStats[chatId].hourly[currentHour].activeUsers.includes(userId)) today.chatStats[chatId].hourly[currentHour].activeUsers.push(userId);
    }
    
    if (!today.onlineUsers) today.onlineUsers = [];
    if (!today.onlineUsers.includes(userId)) today.onlineUsers.push(userId);
    
    if (!today.chatStats[chatId].onlineUsers) today.chatStats[chatId].onlineUsers = [];
    if (!today.chatStats[chatId].onlineUsers.includes(userId)) today.chatStats[chatId].onlineUsers.push(userId);
  }

  // Update total members snapshot
  today.totalMembers = chats.filter(c => c.active).reduce((acc, c) => acc + (c.members || 0), 0);
  const chat = chats.find(c => c.id === chatId);
  if (chat) {
    today.chatStats[chatId].totalMembers = chat.members;
  }

  await updateStats(today);
}

const lastNotificationCache = new Map<string, number>();

async function notifyInfoChat(type: 'JOIN' | 'LEAVE', chatId: string, user: { id: number, first_name: string, last_name?: string, username?: string }) {
  if (!settings.infoChatId || !bot) return;
  
  const cacheKey = `${chatId}_${user.id}_${type}`;
  const now = Date.now();
  const lastTime = lastNotificationCache.get(cacheKey) || 0;
  
  if (now - lastTime < 10000) return; // Prevent duplicate notifications within 10 seconds
  lastNotificationCache.set(cacheKey, now);
  
  const icon = type === 'JOIN' ? '📥' : '📤';
  const label = type === 'JOIN' ? 'Вступление' : 'Выход';
  const chat = chats.find(c => c.id === chatId);
  const chatTitle = chat ? chat.title : chatId;
  const userMention = `[${user.first_name}${user.last_name ? ' ' + user.last_name : ''}](tg://user?id=${user.id})${user.username ? ' (@' + user.username + ')' : ''}`;
  
  bot.telegram.sendMessage(settings.infoChatId, `${icon} *${label}*\nЧат: ${chatTitle}\nПользователь: ${userMention}`, { parse_mode: 'Markdown' })
    .catch(e => console.error(`Failed to send ${type} notification:`, e));
}

async function trackMembership(chatId: string, user: { id: number, username?: string, first_name?: string, last_name?: string }, isMessage = false) {
  const userId = user.id.toString();
  
  // Exclude the bot itself from tracking
  if (botInfo && user.id === botInfo.id) return;
  if (user.username && user.username.toLowerCase() === 'motoinformbot') return;

  const membershipId = `${chatId}_${userId}`;
  
  // Heuristic for admin status: if they are in the bot's admin list or we check them
  // For simplicity, we'll check if they are an admin if we don't know yet
  let isAdmin = false;
  const existingMembership = memberships.find(m => m.id === membershipId);
  if (existingMembership && existingMembership.isAdmin !== undefined) {
    isAdmin = existingMembership.isAdmin;
  } else if (bot && isMessage) {
    // Check admin status occasionally (e.g. 1% of messages or if new)
    if (!existingMembership || Math.random() < 0.01) {
      try {
        const member = await bot.telegram.getChatMember(chatId, user.id);
        isAdmin = ['administrator', 'creator'].includes(member.status);
      } catch (e) {}
    }
  }

  const membershipData = {
    id: membershipId,
    chatId,
    userId,
    username: user.username ? `@${user.username}` : null,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    lastSeen: new Date().toISOString(),
    isAdmin
  };
  
  try {
    const existingIdx = memberships.findIndex(m => m.id === membershipId);
    if (existingIdx === -1) {
      const membership = { ...membershipData, joinedAt: new Date().toISOString(), msgCount: isMessage ? 1 : 0 };
      queueWrite('memberships', membershipId, cleanData(membership));
      membershipLastWrite.set(membershipId, Date.now());
      memberships.push(membership);
      console.log(`New membership tracked for user ${userId} in chat ${chatId}`);

      // Count as join
      await incrementDailyStats(chatId, 'joins', 1, userId);

      // Notify info chat
      await notifyInfoChat('JOIN', chatId, {
        id: user.id,
        first_name: user.first_name || userId,
        last_name: user.last_name,
        username: user.username
      });
    } else {
      const currentMembership = memberships[existingIdx];
      const updated = { 
        ...currentMembership, 
        ...membershipData,
        msgCount: (currentMembership.msgCount || 0) + (isMessage ? 1 : 0)
      };
      
      memberships[existingIdx] = updated;

      // Update last seen in DB occasionally to avoid too many writes
      const lastWrite = membershipLastWrite.get(membershipId) || 0;
      if (Date.now() - lastWrite > 15 * 60 * 1000) {
        queueWrite('memberships', membershipId, cleanData(updated));
        membershipLastWrite.set(membershipId, Date.now());
      }
    }

    // Check for multi-chat membership notification (for both new joins and active messages)
    const userMemberships = memberships.filter(m => String(m.userId) === String(userId));
    if (filters.notifyMultiChat && userMemberships.length >= filters.multiChatThreshold) {
      const targetChatId = settings.infoChatId || process.env.BOOKRAY_CHAT_ID;
      const alertCacheKey = `mc_member_alert_${userId}_${userMemberships.length}`;
      const now = Date.now();
      const lastAlert = lastCrossChatAlertTime.get(alertCacheKey) || 0;

      if (targetChatId && bot && (now - lastAlert > 30 * 60 * 1000)) {
        lastCrossChatAlertTime.set(alertCacheKey, now);
        const chatTitles = userMemberships.map(m => {
          const c = chats.find(ch => String(ch.id) === String(m.chatId));
          return c ? c.title : m.chatId;
        }).join(', ');
        
        const alertMsg = 
          `⚠️ <b>Внимание!</b> Пользователь <a href="tg://user?id=${userId}">${escapeHtml(user.first_name || userId)}</a> ` +
          `состоит в <b>${userMemberships.length} чатах</b>.\n\n` +
          `📍 <b>Чаты:</b> ${escapeHtml(chatTitles)}`;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '🚫 Забанить и удалить всё', callback_data: `mc_ban_clean_${userId}` }
            ],
            [
              { text: '🗑 Удалить сообщения', callback_data: `mc_clean_${userId}` },
              { text: '⛔ Только забанить', callback_data: `mc_ban_${userId}` }
            ],
            [
              { text: '✅ В белый список', callback_data: `mc_wl_${userId}` },
              { text: '👤 Профиль', url: `tg://user?id=${userId}` }
            ]
          ]
        };
        bot.telegram.sendMessage(targetChatId, alertMsg, { parse_mode: 'HTML', reply_markup: keyboard })
          .catch(e => console.error('Failed to send multi-chat alert:', e));
      }
    }

      // Count message or just update online status
      if (isMessage) {
        await incrementDailyStats(chatId, 'msgs', 1, userId);
      } else {
        // Just update online status without incrementing msg count
        await incrementDailyStats(chatId, 'msgs', 0, userId); 
      }
  } catch (e) {
    console.error('Failed to save membership:', e);
  }
}

// Second Telegram Bot (AI Companion with Gemini)
let companionBot: Telegraf | null = null;
let companionBotInfo: { id: number; username: string; first_name?: string } | null = null;
let isCompanionBotPollingActive: boolean = false;
let companionBotRepliesCount: number = 0;
const companionRecentMessages = new Map<string, Array<{ sender: string; text: string; time: string; isBot: boolean }>>();
const lastCompanionReplyTime = new Map<string, number>();

async function generateCompanionBotResponse(
  chatTitle: string,
  triggerMessage: { sender: string; text: string },
  recentHistory: Array<{ sender: string; text: string }>,
  companionConfig?: any
): Promise<string> {
  const currentCfg = companionConfig || (settings as any).companionBot || {};

  const humorMap: Record<string, string> = {
    none: 'Общайся строго по делу, вежливо и информативно, без шуток, сарказма или иронии.',
    light: 'Общайся дружелюбно и позитивно. Используй легкий, добрый юмор и улыбку.',
    high: 'Активно используй юмор, байкерские шутки, иронию, остроумные подколки и веселые реплики.',
    sarcastic: 'Используй едкий сарказм, язвительный юмор, остроумные подколки и дерзкие замечания.'
  };
  const humorGuide = humorMap[currentCfg.humorLevel || 'high'] || humorMap.high;

  const banterMap: Record<string, string> = {
    none: 'Не используй подколок и поддразниваний участников.',
    friendly: 'Дружеские, безобидные подколки и доброе подтрунивание по-братски разрешены и приветствуются.',
    sharp: 'Используй острые подколки, едкие панчи и смелые выпады (байкерский роаст), но без мата и прямых оскорблений личности.'
  };
  const banterGuide = banterMap[currentCfg.banterLevel || 'friendly'] || banterMap.friendly;

  const personaMap: Record<string, string> = {
    biker_veteran: 'Ты опытный байкер-старожил. Знаешь всё о мотоциклах, дорогах, поломках в пути, сезонах и мото-братстве. Говоришь уверенно, по-свойски, любишь травить байки.',
    friendly_mate: 'Ты душевный, компанейский участник чата. Всегда готов поддержать разговор, помочь советом, пошутить и поднять настроение в компании.',
    witty_expert: 'Ты эрудированный, остроумный эксперт и мотомеханик. Разбираешься в технике до винтика, на вопросы отвечаешь четко, но с фирменной иронией и меткими комментариями.',
    provocateur: 'Ты задорный трикстер и душа компании. Любишь подлить масла в огонь дискуссии, поддеть кого-то меткой фразой, поднять волну смеха.',
    custom: currentCfg.customSystemPrompt || 'Ты веселый и остроумный участник мото-чата.'
  };
  const personaGuide = personaMap[currentCfg.personaPreset || 'biker_veteran'] || personaMap.biker_veteran;

  const customInstruction = currentCfg.customSystemPrompt?.trim()
    ? `Дополнительные указания администратора:\n${currentCfg.customSystemPrompt.trim()}`
    : '';

  const historyFormatted = recentHistory.map(m => `[${m.sender}]: ${m.text}`).join('\n');

  const prompt = `Ты — живой участник Telegram-чата «${chatTitle}». Твоя роль — органично общаться с людьми в чате.

Твой характер и стиль:
- ${personaGuide}
- Юмор: ${humorGuide}
- Подколки: ${banterGuide}
${customInstruction ? `- ${customInstruction}` : ''}

Правила ответа:
1. Отвечай кратко и емко (1-3 коротких предложения), как реальный участник чата в Telegram, без длинных эссе и простыней.
2. Не начинай сообщение с шаблонных "Привет, я бот" или повторения имени собеседника.
3. Если человек задал вопрос — дай понятный, полезный ответ со своим фирменным стилем и юмором/подколом.
4. Если человек шутит или делится мнением — поддержи разговор, используй меткую шутку или дружескую подколку.
5. Без нецензурных ругательств.

Контекст последних сообщений в чате:
${historyFormatted || '(нет предыдущих сообщений)'}

Текущее сообщение, на которое ты реагируешь:
[${triggerMessage.sender}]: ${triggerMessage.text}

Твой ответ:`;

  return await callAiService(prompt, { model: currentCfg.model || 'gemini-3.1-flash-lite' });
}

async function stopCompanionBot() {
  if (companionBot) {
    try {
      console.log('[CompanionBot] Stopping existing companion bot instance...');
      if ((companionBot as any).polling) {
        await (companionBot as any).stop();
      }
    } catch (e) {}
    companionBot = null;
    companionBotInfo = null;
    isCompanionBotPollingActive = false;
  }
}

async function initCompanionBot(companionConfig?: any) {
  const cfg = companionConfig || (settings as any).companionBot;
  if (!cfg || !cfg.enabled || !cfg.botToken || !cfg.botToken.trim()) {
    await stopCompanionBot();
    return null;
  }

  await stopCompanionBot();

  try {
    const token = cfg.botToken.trim();
    const apiRoot = settings.telegramApiRoot || process.env.TELEGRAM_API_ROOT;
    const telegrafOptions: any = { handlerTimeout: 180000 };
    if (apiRoot) {
      telegrafOptions.telegram = { apiRoot: apiRoot.replace(/\/$/, '') };
    }

    const newBot = new Telegraf(token, telegrafOptions);
    const me = await newBot.telegram.getMe();
    companionBot = newBot;
    companionBotInfo = { id: me.id, username: me.username, first_name: me.first_name };
    console.log(`[CompanionBot] Connected as @${me.username} (${me.first_name || 'Бот'})`);

    newBot.on('message', async (ctx) => {
      try {
        const msg = ctx.message;
        if (!msg) return;
        const chatType = ctx.chat?.type;
        const isGroup = chatType === 'group' || chatType === 'supergroup';
        if (!isGroup) return;

        const chatId = String(ctx.chat.id);
        const fromUser = ctx.from;
        if (!fromUser || fromUser.is_bot) return; // Do not reply to bots

        const currentCfg = (settings as any).companionBot || cfg;
        if (!currentCfg.enabled) return;
        if (Array.isArray(currentCfg.enabledChatIds) && currentCfg.enabledChatIds.length > 0) {
          if (!currentCfg.enabledChatIds.includes(chatId)) return;
        }

        const rawText = ('text' in msg ? msg.text : ('caption' in msg ? msg.caption : '')) || '';
        const senderName = fromUser.first_name || fromUser.username || `User ${fromUser.id}`;

        let history = companionRecentMessages.get(chatId) || [];
        history.push({
          sender: senderName,
          text: rawText,
          time: new Date().toISOString(),
          isBot: false
        });
        const maxHistory = currentCfg.useContextCount || 10;
        if (history.length > maxHistory) {
          history = history.slice(-maxHistory);
        }
        companionRecentMessages.set(chatId, history);

        if (!rawText.trim()) return;

        const botUsername = companionBotInfo?.username?.toLowerCase() || '';
        const textLower = rawText.toLowerCase();

        const isDirectMention = botUsername && (textLower.includes(`@${botUsername}`) || textLower.includes(botUsername));
        const replyToMsg = (msg as any).reply_to_message;
        const isReplyToBot = replyToMsg && replyToMsg.from?.id === companionBotInfo?.id;
        const containsQuestion = rawText.includes('?');

        const now = Date.now();
        const lastReply = lastCompanionReplyTime.get(chatId) || 0;
        const cooldownMs = (currentCfg.minDelayBetweenRepliesSeconds || 180) * 1000;
        const cooldownPassed = (now - lastReply) >= cooldownMs;

        let shouldRespond = false;
        let responseTrigger = '';

        if (isReplyToBot) {
          shouldRespond = true;
          responseTrigger = 'ответ на сообщение бота';
        } else if (isDirectMention && currentCfg.replyToDirectMentions !== false) {
          shouldRespond = true;
          responseTrigger = 'прямое обращение';
        } else if (cooldownPassed) {
          if (containsQuestion && currentCfg.replyToQuestions !== false) {
            const qChance = Math.max(Number(currentCfg.replyProbability) || 15, 35);
            if (Math.random() * 100 < qChance) {
              shouldRespond = true;
              responseTrigger = 'вопрос в чате (?)';
            }
          } else {
            const prob = Number(currentCfg.replyProbability) || 15;
            if (Math.random() * 100 < prob) {
              shouldRespond = true;
              responseTrigger = `случайный ответ (${prob}%)`;
            }
          }
        }

        if (shouldRespond) {
          console.log(`[CompanionBot] Generating reply in "${ctx.chat.title || chatId}" (${responseTrigger})...`);
          try {
            await ctx.sendChatAction('typing');
          } catch (e) {}

          const replyText = await generateCompanionBotResponse(
            ctx.chat.title || 'Чат',
            { sender: senderName, text: rawText },
            history.slice(0, -1),
            currentCfg
          );

          if (replyText && replyText.trim()) {
            try {
              await ctx.reply(replyText.trim(), {
                reply_parameters: { message_id: msg.message_id }
              });
            } catch (replyErr) {
              await ctx.reply(replyText.trim()).catch(e => console.error('[CompanionBot] Reply failed:', e));
            }

            lastCompanionReplyTime.set(chatId, Date.now());
            companionBotRepliesCount++;

            history.push({
              sender: companionBotInfo?.first_name || 'CompanionBot',
              text: replyText.trim(),
              time: new Date().toISOString(),
              isBot: true
            });
            companionRecentMessages.set(chatId, history.slice(-maxHistory));

            await addLog({
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              type: 'SYSTEM',
              user: companionBotInfo?.username ? `@${companionBotInfo.username}` : 'CompanionBot',
              chat: ctx.chat.title || chatId,
              details: `[ИИ-Собеседник] Ответ на сообщение (${responseTrigger}): "${replyText.substring(0, 90)}${replyText.length > 90 ? '...' : ''}"`
            });
          }
        }
      } catch (err: any) {
        console.error('[CompanionBot] Message error:', err?.message || err);
      }
    });

    try {
      await newBot.telegram.deleteWebhook({ drop_pending_updates: false });
    } catch (e) {}

    isCompanionBotPollingActive = true;
    console.log(`[CompanionBot] Starting Long Polling as @${me.username}...`);

    newBot.launch({
      dropPendingUpdates: false,
      allowedUpdates: ['message', 'edited_message']
    }).then(() => {
      isCompanionBotPollingActive = false;
      console.log(`[CompanionBot] Polling ended for @${me.username}`);
    }).catch(err => {
      isCompanionBotPollingActive = false;
      console.error('[CompanionBot] Launch error:', err?.message || err);
    });

    return newBot;
  } catch (err: any) {
    console.error('[CompanionBot] Failed to start:', err?.message || err);
    companionBot = null;
    companionBotInfo = null;
    return null;
  }
}

// Initialize Telegram Bot
let bot: Telegraf | null = null;
let botInfo: { id: number; username: string } | null = null;
let lastSetMenuButtonUrl: string | null = null;
let menuButtonRetryAfterUntil: number = 0;
let isInitializingBot = false;

async function initBot(token: string) {
  if (!token) {
    console.warn('Bot token is empty. Bot functionality is disabled.');
    return null;
  }

  if (isInitializingBot) {
    console.log('[BotSupervisor] Bot initialization already in progress, skipping concurrent duplicate call.');
    return bot;
  }
  isInitializingBot = true;

  try {
    if (bot) {
      console.log('Stopping existing bot instance...');
      try {
        if ((bot as any).polling) {
          await (bot as any).stop();
        }
      } catch (err) {
        // Ignored if bot was not running
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    const cfWorkerUrl = settings.disableCloudflare ? null : (settings.cfWorkerUrl || process.env.CF_WORKER_URL);
    const apiRoot = settings.telegramApiRoot || process.env.TELEGRAM_API_ROOT;
    const telegrafOptions: any = {
      handlerTimeout: 180000 // 3 minutes timeout for long-running handler operations
    };
    if (apiRoot) {
      const cleanApiRoot = apiRoot.replace(/\/$/, '');
      telegrafOptions.telegram = {
        apiRoot: cleanApiRoot
      };
      console.log(`Using Telegram Reverse Proxy API Root: ${cleanApiRoot}`);
    }
    
    bot = new Telegraf(token, telegrafOptions);
    
    // Get bot information
    try {
      const me = await bot.telegram.getMe();
      botInfo = { id: me.id, username: me.username };
      console.log(`Bot initialized as @${me.username} (${me.id})`);

      // Cleanup current memberships if bot is present
      const initialCount = memberships.length;
      const botUserIdentifier = me.id.toString();
      const botUserUsername = me.username.toLowerCase();
      
      const toDeleteIds: string[] = [];
      memberships = memberships.filter(m => {
        const isBot = String(m.userId) === botUserIdentifier || 
                     (m.username && m.username.toLowerCase().replace(/^@/, '') === botUserUsername);
        if (isBot) {
          toDeleteIds.push(m.id);
          return false;
        }
        return true;
      });
      
      if (toDeleteIds.length > 0) {
        console.log(`Removed bot (@${me.username}, ${me.id}) from in-memory memberships and queuing deletion of ${toDeleteIds.length} entries from database`);
        for (const mid of toDeleteIds) {
          queueDelete('memberships', mid);
        }
      } else if (memberships.length < initialCount) {
        console.log(`Removed bot (${me.id}) from in-memory memberships (${initialCount - memberships.length} entries)`);
      }

      // Configure Telegram Chat Menu Button with Mini App URL (with rate-limit protection)
      const defaultAppUrl = getEffectiveWebAppUrl();
      const now = Date.now();
      if (lastSetMenuButtonUrl === defaultAppUrl) {
        // Already set to this exact URL, no need to touch Telegram API
      } else if (now < menuButtonRetryAfterUntil) {
        const waitSec = Math.ceil((menuButtonRetryAfterUntil - now) / 1000);
        console.log(`[Bot] Skipping Chat Menu Button setup: rate-limit backoff active (${waitSec}s remaining).`);
      } else {
        try {
          await (bot.telegram as any).setChatMenuButton({
            menu_button: {
              type: 'web_app',
              text: '📱 Панель',
              web_app: { url: defaultAppUrl }
            }
          });
          lastSetMenuButtonUrl = defaultAppUrl;
          settings.lastSetMenuButtonUrl = defaultAppUrl;
          db.collection('config').doc('settings').update({ lastSetMenuButtonUrl: defaultAppUrl }).catch(() => {});
          console.log(`[Bot] Initialized Chat Menu Button with WebApp URL: ${defaultAppUrl}`);
        } catch (errMenu: any) {
          const errMsg = String(errMenu?.message || errMenu);
          const is429 = errMenu?.response?.error_code === 429 || 
                        errMenu?.parameters?.retry_after !== undefined ||
                        errMsg.includes('429') || 
                        errMsg.includes('Too Many Requests');
          if (is429) {
            const retryMatch = errMsg.match(/retry after (\d+)/i);
            const retrySec = Number(errMenu?.parameters?.retry_after) || (retryMatch ? parseInt(retryMatch[1], 10) : 900);
            menuButtonRetryAfterUntil = Date.now() + (retrySec * 1000);
            settings.menuButtonRetryAfterUntil = menuButtonRetryAfterUntil;
            db.collection('config').doc('settings').update({ menuButtonRetryAfterUntil }).catch(() => {});
            console.log(`[Bot] Chat Menu Button rate-limited by Telegram (429). Backing off for ${retrySec}s.`);
          } else {
            console.warn('[Bot] Note: could not set chat menu button on bot init:', errMsg);
          }
        }
      }
    } catch (e) {
      console.error('Failed to get bot info directly from Telegram (likely due to sandbox environment connection timeout):', e);
      if (!botInfo) {
        try {
          const botIdStr = token.split(':')[0];
          const botId = Number(botIdStr) || 123456789;
          botInfo = { id: botId, username: 'TelegramBot' };
          console.log(`Set fallback botInfo using token ID: ${botId}`);
        } catch (err) {
          botInfo = { id: 123456789, username: 'TelegramBot' };
        }
      }
    }

    bot.catch((err: any, ctx: any) => {
      const isTimeout = err?.name === 'TimeoutError' || (err?.message && err.message.includes('timed out after'));
      if (isTimeout) {
        console.warn(`[Bot Warning] Message/update processing timed out for "${ctx?.updateType || 'unknown'}": ${err?.message || err}`);
      } else {
        console.error(`Unhandled error while processing ${ctx?.updateType || 'unknown'}:`, err);
      }
    });

    // Global middleware to track bot polling heartbeat
    bot.use(async (ctx, next) => {
      isBotPollingActive = true;
      lastTelegramUpdateAt = Date.now();
      return next();
    });
    
    bot.start(async (ctx) => {
      try {
        const userId = ctx.from?.id.toString();
        const username = ctx.from?.username;
        const chatType = ctx.chat?.type;
        const adminUsername = (settings.adminTelegramUsername || 'bookray').toLowerCase().replace(/^@/, '');
        const isCurrentAdmin = (username && username.toLowerCase() === adminUsername) ||
                               (userId === process.env.BOOKRAY_CHAT_ID) ||
                               (username && username.toLowerCase() === 'bookray');

        console.log(`[Bot] /start received from user ${userId} (@${username || 'none'}) in ${chatType} chat ${ctx.chat?.id}`);

        if (chatType === 'private') {
          if (isCurrentAdmin) {
            process.env.BOOKRAY_CHAT_ID = ctx.chat.id.toString();
            const activeChatsCount = chats.filter(c => c.active).length;
            const todayDate = getProjectDate().dateStr;
            const todayStat = statsHistory.find(s => s.date === todayDate);
            const todayMsgs = todayStat?.msgs || 0;

            const appUrl = getEffectiveWebAppUrl();
            const text = `👋 <b>Здравствуйте, Владелец (@${username || 'bookray'})!</b>\n\n` +
              `🤖 <b>TeleGuard Bot</b> активен и работает в штатном режиме.\n\n` +
              `📊 <b>Текущее состояние:</b>\n` +
              `• Активных чатов под защитой: <b>${activeChatsCount}</b>\n` +
              `• Сообщений сегодня: <b>${todayMsgs}</b>\n` +
              `• Режим связи: <b>${isPollingMode ? 'Long Polling (активен)' : 'Webhook (активен)'}</b>\n` +
              `• Ваш Telegram ID: <code>${userId}</code>\n\n` +
              `📱 <b>Мини-приложение:</b> Нажмите кнопку ниже или меню слева для открытия панели управления прямо внутри Telegram без паролей!\n\n` +
              `⚙️ <b>Команды:</b>\n` +
              `• /app или /panel — открыть мини-приложение TeleGuard\n` +
              `• /status — подробная статистика и статус бота\n` +
              `• /id — узнать ID текущего чата и пользователя\n` +
              `• /setinfo — назначить этот чат для логов входов/выходов\n` +
              `• /digest — ручной запуск ИИ-суммаризации\n` +
              `• /help — справка`;

            await ctx.reply(text, { 
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🚀 Открыть веб-панель TeleGuard', web_app: { url: appUrl } }]
                ]
              }
            });
          } else {
            const session = captchaSessions.get(userId);
            if (session) {
              await ctx.reply(`🛡 <b>Проверка Captcha:</b>\n\nПожалуйста, отправьте правильный ответ на капчу в ответном сообщении, чтобы подтвердить заявку на вступление в группу.`, { parse_mode: 'HTML' });
            } else {
              await ctx.reply(`👋 <b>Привет! Я TeleGuard Bot.</b>\n\nЯ защищаю группы и чаты от спама, нежелательных ссылок, мата и собираю аналитику активности.\n\n🆔 Ваш Telegram ID: <code>${userId}</code>\n\nДоступные команды: /id, /ping, /help`, { 
                parse_mode: 'HTML'
              });
            }
          }
        } else {
          await ctx.reply(`🛡 <b>TeleGuard Bot активен в этом чате!</b>\n\nМодерация, фильтры безопасности и сбор аналитики работают в реальном времени.`, { parse_mode: 'HTML' });
        }
      } catch (err) {
        console.error('Error in /start handler:', err);
        ctx.reply('TeleGuard Bot активен!').catch(() => {});
      }
    });

    const sendPanelCommand = async (ctx: any) => {
      try {
        const userId = ctx.from?.id?.toString();
        const username = ctx.from?.username;
        const adminUsername = (settings.adminTelegramUsername || 'bookray').toLowerCase().replace(/^@/, '');
        const isCurrentAdmin = (username && username.toLowerCase() === adminUsername) ||
                               (userId === process.env.BOOKRAY_CHAT_ID) ||
                               (username && username.toLowerCase() === 'bookray');

        if (!isCurrentAdmin) {
          return ctx.reply(`⛔ <b>Доступ запрещен.</b>\n\nМини-приложение TeleGuard доступно исключительно владельцу бота (@${adminUsername || 'bookray'}).`, {
            parse_mode: 'HTML'
          });
        }

        const appUrl = getEffectiveWebAppUrl();
        await ctx.reply('📱 <b>Панель управления TeleGuard</b>\n\nНажмите кнопку ниже, чтобы открыть веб-панель прямо в Telegram:', {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Открыть веб-панель TeleGuard', web_app: { url: appUrl } }]
            ]
          }
        });
      } catch (e: any) {
        ctx.reply('Ошибка: ' + (e?.message || e)).catch(() => {});
      }
    };

    bot.command('app', sendPanelCommand);
    bot.command('panel', sendPanelCommand);
    bot.command('admin', sendPanelCommand);
    bot.command('webapp', sendPanelCommand);

    bot.command('help', async (ctx) => {
      try {
        const userId = ctx.from?.id?.toString();
        const username = ctx.from?.username;
        const adminUsername = (settings.adminTelegramUsername || 'bookray').toLowerCase().replace(/^@/, '');
        const isCurrentAdmin = (username && username.toLowerCase() === adminUsername) ||
                               (userId === process.env.BOOKRAY_CHAT_ID) ||
                               (username && username.toLowerCase() === 'bookray');

        if (isCurrentAdmin) {
          const appUrl = getEffectiveWebAppUrl();
          const text = `📖 <b>Справка по командам TeleGuard (Владелец):</b>\n\n` +
            `• /start — Запуск и главное меню бота\n` +
            `• /app, /panel — Открыть мини-приложение TeleGuard прямо в Telegram\n` +
            `• /status — Проверка статуса, аптайма и сегодняшней статистики\n` +
            `• /id — Показать ID чата и ваш ID\n` +
            `• /ping — Проверка отклика бота\n` +
            `• /setinfo — Назначить чат для уведомлений\n` +
            `• /digest или /summary — Сформировать ИИ-сводку за 24 часа\n\n` +
            `Управление фильтрами, списками, рассылками и аналитикой доступно в веб-панели.`;
          await ctx.reply(text, { 
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📱 Открыть панель управления', web_app: { url: appUrl } }]
              ]
            }
          });
        } else {
          const text = `📖 <b>Справка TeleGuard Bot:</b>\n\n` +
            `• /start — Информация о боте\n` +
            `• /id — Показать ваш Telegram ID\n` +
            `• /ping — Проверка связи с ботом\n\n` +
            `Бот защищает чаты от спама, нежелательных ссылок и собирает аналитику.`;
          await ctx.reply(text, { parse_mode: 'HTML' });
        }
      } catch (e) {
        ctx.reply('TeleGuard Bot: справка доступна по команде /help.').catch(() => {});
      }
    });

    bot.command('status', async (ctx) => {
      try {
        const activeChats = chats.filter(c => c.active);
        const totalMembers = activeChats.reduce((acc, c) => acc + (c.members || 0), 0);
        const todayDate = getProjectDate().dateStr;
        const todayStat = statsHistory.find(s => s.date === todayDate);
        const todayMsgs = todayStat?.msgs || 0;
        const todayJoins = todayStat?.joins || 0;
        const todayLeaves = todayStat?.leaves || 0;

        const text = `📊 <b>Статус системы TeleGuard:</b>\n\n` +
          `• Состояние бота: 🟢 <b>Онлайн</b>\n` +
          `• Режим подключения: <b>${isPollingMode ? 'Long Polling (надёжный)' : 'Webhook'}</b>\n` +
          `• Подключенных чатов: <b>${activeChats.length}</b> (активных)\n` +
          `• Всего участников в базе: <b>${totalMembers}</b>\n` +
          `• Сообщений сегодня: <b>${todayMsgs}</b>\n` +
          `• Входов в группы сегодня: <b>${todayJoins}</b>\n` +
          `• Выходов сегодня: <b>${todayLeaves}</b>\n` +
          `• ID текущего чата: <code>${ctx.chat.id}</code>`;

        await ctx.reply(text, { parse_mode: 'HTML' });
      } catch (e: any) {
        ctx.reply('Ошибка получения статуса: ' + (e?.message || e)).catch(() => {});
      }
    });

    bot.command('id', async (ctx) => {
      try {
        const chatId = ctx.chat.id;
        const userId = ctx.from?.id;
        const chatType = ctx.chat.type;
        const title = 'title' in ctx.chat ? (ctx.chat as any).title : 'Личный диалог';
        await ctx.reply(`🆔 <b>Информация об ID:</b>\n\n• Ваш User ID: <code>${userId}</code>\n• Chat ID: <code>${chatId}</code>\n• Название чата: <b>${escapeHtml(title)}</b>\n• Тип: <code>${chatType}</code>`, { parse_mode: 'HTML' });
      } catch (e: any) {
        ctx.reply(`ID: ${ctx.chat.id}`).catch(() => {});
      }
    });

    bot.command('ping', async (ctx) => {
      try {
        const now = Date.now();
        const msg = await ctx.reply('🏓 Понг...');
        const latency = Date.now() - now;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `🏓 <b>Понг!</b> Бот онлайн.\n⚡ Задержка: <code>${latency}ms</code>`, { parse_mode: 'HTML' });
      } catch (e) {
        ctx.reply('🏓 Понг! Бот онлайн.').catch(() => {});
      }
    });
    
    // Track pinned messages directly via pinned_message event
    bot.on('pinned_message', async (ctx) => {
      try {
        const chatId = ctx.chat.id.toString();
        const pinned = (ctx.message as any)?.pinned_message;
        if (pinned) {
          console.log(`[PinnedEvent] Detected pinned message #${pinned.message_id} in chat ${chatId}`);
          await recordPinnedMessage(chatId, pinned, false);
        }
      } catch (err) {
        console.error('Error handling pinned_message event:', err);
      }
    });

    bot.on('message', async (ctx) => {
      if (settings.maintenanceMode) return;

      const chatId = ctx.chat.id.toString();
      const chatType = ctx.chat.type;
      const userId = ctx.from.id.toString();
      const username = ctx.from.username;

      // Detect and record service pinned message in general message stream if present
      if ((ctx.message as any)?.pinned_message) {
        try {
          const pinned = (ctx.message as any).pinned_message;
          console.log(`[MessageHook] Detected pinned message #${pinned.message_id} in chat ${chatId}`);
          await recordPinnedMessage(chatId, pinned, false);
        } catch (e) {
          console.error('Error recording pinned message from message update:', e);
        }
      }

      const adminUsername = (settings.adminTelegramUsername || 'bookray').toLowerCase();
      const isCurrentAdmin = username && username.toLowerCase() === adminUsername;

      // Set Info Chat for notifications
      if (isCurrentAdmin && (ctx.message as any)?.text === '/setinfo') {
        settings.infoChatId = chatId;
        await db.collection('config').doc('settings').update({ infoChatId: chatId }).catch(e => console.error('Failed to save infoChatId:', e));
        return ctx.reply('✅ Этот чат установлен как информационный для уведомлений о входах/выходах.');
      }

      // Check for global bans
      const isGloballyBanned = bans.find(b => String(b.userId) === String(userId));
      const isWhitelisted = whitelist.some(w => String(w.userId) === String(userId) || (username && w.username && w.username.toLowerCase() === `@${username.toLowerCase()}`));

      if (isGloballyBanned && !isWhitelisted && chatType !== 'private') {
        try {
          await ctx.telegram.banChatMember(chatId, Number(userId));
          await ctx.deleteMessage();
          console.log(`Auto-banned globally banned user ${userId} in chat ${chatId} after message`);
          return;
        } catch (e) {
          console.error(`Failed to auto-ban globally banned user ${userId} in chat ${chatId}:`, (e as Error).message);
        }
      }

      // Store admin's chatId for reports
      if (isCurrentAdmin && chatType === 'private') {
        process.env.BOOKRAY_CHAT_ID = chatId;
      }

      // Restrict bot communication to admin
      // If it's a private chat and not admin, ignore or notify
      if (chatType === 'private' && !isCurrentAdmin) {
        // If they are in a captcha session, we must allow it
        const session = captchaSessions.get(userId);
        const isCommand = ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/');
        if (!session && !isCommand) {
          console.log(`Unauthorized private interaction from @${username || 'No Username'} (${userId})`);
          await ctx.reply(`ℹ️ <b>TeleGuard Bot</b>\n\nВаш Telegram-логин: @${username || '(не установлен)'}\nВаш ID: <code>${userId}</code>\n\nБот управляется администратором панели (@${settings.adminTelegramUsername || 'bookray'}).\n\nДоступные команды: /id, /status, /help`, { parse_mode: 'HTML' }).catch(e => console.error('Failed to send auth warning:', e));
          return; 
        }
      }

      // Handle Broadcast from Admin
      if (chatType === 'private' && isCurrentAdmin) {
        const existingSession = broadcastSessions.get(userId);

        // Check if admin is currently entering custom unpin days number
        if (existingSession && existingSession.options?.waitingForUnpinDaysInput && ctx.message && 'text' in ctx.message) {
          const textVal = ctx.message.text.trim();
          const daysNum = parseInt(textVal, 10);
          if (!isNaN(daysNum) && daysNum >= 0 && daysNum <= 365) {
            existingSession.options.unpinDays = daysNum;
            if (daysNum > 0) {
              existingSession.options.pin = true;
            }
            existingSession.options.waitingForUnpinDaysInput = false;
            broadcastSessions.set(userId, existingSession);

            const daysLabel = daysNum === 0 
              ? '♾️ Бессрочно (не откреплять)' 
              : `${daysNum} ${getDaysPlural(daysNum)}`;

            await ctx.reply(`✅ <b>Срок открепления установлен:</b> ${daysLabel}${daysNum > 0 ? '\n📌 Закрепление поста автоматически включено.' : ''}`, { parse_mode: 'HTML' });
            
            await ctx.reply(renderBroadcastOptionsText(existingSession.options), {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: renderBroadcastOptionsKeyboard(existingSession.options)
              }
            });
            return;
          } else {
            await ctx.reply('⚠️ Пожалуйста, введите целое число от 0 до 365 (0 — не откреплять, или число дней, например: <code>3</code> или <code>7</code>):', { 
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '❌ Отмена ввода', callback_data: 'bc_options' }]]
              }
            });
            return;
          }
        }

        // If it's a command, handle it normally. 
        if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/')) {
          const cmd = ctx.message.text.trim();
          if (cmd.startsWith('/clean ') || cmd.startsWith('/purge ')) {
            const target = cmd.replace(/^\/(clean|purge)\s+/, '').trim().replace(/^@/, '');
            const waitReply = await ctx.reply(`🧹 Начинаю очистку всех сообщений пользователя <code>${target}</code> во всех чатах...`, { parse_mode: 'HTML' });
            const cleanRes = await cleanUserMessages(target, false);
            await ctx.telegram.editMessageText(chatId, waitReply.message_id, undefined,
              `✅ <b>Очистка завершена!</b>\n\n👤 Пользователь: <code>${target}</code>\n🗑 Удалено сообщений: <b>${cleanRes.deletedCount}</b>\n📍 Затронуто чатов: <b>${cleanRes.chatsCount}</b>`,
              { parse_mode: 'HTML' }
            );
            return;
          }
          if (cmd.startsWith('/cleanban ')) {
            const target = cmd.replace(/^\/cleanban\s+/, '').trim().replace(/^@/, '');
            const waitReply = await ctx.reply(`🚫🧹 Блокирую и очищаю все сообщения пользователя <code>${target}</code> во всех чатах...`, { parse_mode: 'HTML' });
            const cleanRes = await cleanUserMessages(target, true, 'Бан и удаление через /cleanban');
            await ctx.telegram.editMessageText(chatId, waitReply.message_id, undefined,
              `✅ <b>Бан и очистка завершены!</b>\n\n👤 Пользователь: <code>${target}</code> заблокирован глобально.\n🗑 Удалено сообщений: <b>${cleanRes.deletedCount}</b>\n📍 Затронуто чатов: <b>${cleanRes.chatsCount}</b>`,
              { parse_mode: 'HTML' }
            );
            return;
          }
          // allow other commands to pass through
        } else if (ctx.message) {
          const mediaGroupId = (ctx.message as any).media_group_id;

          if (mediaGroupId) {
            let buffer = mediaGroupBuffers.get(mediaGroupId);
            if (!buffer) {
              buffer = {
                mediaGroupId,
                messages: [ctx.message],
                timer: setTimeout(async () => {
                  const buf = mediaGroupBuffers.get(mediaGroupId);
                  mediaGroupBuffers.delete(mediaGroupId);
                  if (!buf || !buf.messages.length) return;

                  buf.messages.sort((a, b) => a.message_id - b.message_id);

                  broadcastSessions.set(userId, {
                    message: buf.messages[0],
                    messages: buf.messages,
                    options: {
                      pin: false,
                      unpinDays: 0,
                      delay: 10,
                      silent: false,
                      selectedChats: chats.filter(c => c.active).map(c => String(c.id)),
                      waitingForUnpinDaysInput: false
                    }
                  });

                  const count = buf.messages.length;
                  await ctx.reply(`📢 Вы прислали альбом из ${count} медиафайлов для рассылки. Выберите действие:`, {
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: '🚀 Начать рассылку', callback_data: 'bc_start' }],
                        [{ text: '👥 Выбор чатов', callback_data: 'bc_select_chats' }],
                        [{ text: '⚙️ Настройки', callback_data: 'bc_options' }],
                        [{ text: '❌ Отмена', callback_data: 'bc_cancel' }]
                      ]
                    }
                  });
                }, 500)
              };
              mediaGroupBuffers.set(mediaGroupId, buffer);
            } else {
              buffer.messages.push(ctx.message);
            }
            return;
          } else {
            // Single message (text, single photo, document, etc.)
            broadcastSessions.set(userId, { 
              message: ctx.message,
              messages: [ctx.message], 
              options: { 
                pin: false, 
                unpinDays: 0,
                delay: 10, 
                silent: false, 
                selectedChats: chats.filter(c => c.active).map(c => String(c.id)),
                waitingForUnpinDaysInput: false
              } 
            });
            
            return ctx.reply('📢 Вы прислали сообщение для рассылки. Выберите действие:', {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🚀 Начать рассылку', callback_data: 'bc_start' }],
                  [{ text: '👥 Выбор чатов', callback_data: 'bc_select_chats' }],
                  [{ text: '⚙️ Настройки', callback_data: 'bc_options' }],
                  [{ text: '❌ Отмена', callback_data: 'bc_cancel' }]
                ]
              }
            });
          }
        }
      }

      // Handle Captcha in Private Messages
      if (chatType === 'private') {
        const session = captchaSessions.get(userId);
        if (session && 'text' in ctx.message) {
          const expectedAnswer = String(session.answer).trim().toLowerCase();
          const userAnswer = ctx.message.text.trim().toLowerCase();
          
          console.log(`User ${userId} provided captcha answer: "${userAnswer}". Expected: "${expectedAnswer}"`);
          
          if (userAnswer === expectedAnswer) {
            captchaSessions.delete(userId);
            try {
              await handleCaptchaPassed(ctx, session.chatId, userId, session.userObj || ctx.from);
            } catch (e) {
              console.error('Failed to handle captcha success flow:', e);
              ctx.reply('❌ Ошибка при обработке заявки. Возможно, срок действия заявки истек.').catch(() => {});
            }
          } else {
            ctx.reply('❌ Неверный ответ. Попробуйте еще раз.');
          }
        }
        return;
      }
      
      // Update message count for existing chats
      let chat = chats.find(c => String(c.id) === chatId);
      
      // Automatically add chat if it's a group/supergroup and not in the list
      if (!chat && (chatType === 'group' || chatType === 'supergroup')) {
        // Double check to prevent race condition duplicates
        if (!chats.some(c => String(c.id) === chatId)) {
          console.log(`New chat detected via message: ${chatId}`);
          let memberCount = 0;
          let avatarUrl = `https://picsum.photos/seed/${chatId}/200`;
          try {
            memberCount = await ctx.telegram.getChatMembersCount(ctx.chat.id);
            const chatFull = await ctx.telegram.getChat(ctx.chat.id);
            if (chatFull.photo) {
              const fileId = chatFull.photo.small_file_id;
              const fileLink = await ctx.telegram.getFileLink(fileId);
              avatarUrl = fileLink.toString();
            }
          } catch (e) {
            console.error('Failed to get member count on message:', e);
          }

          chat = {
            id: chatId,
            title: 'title' in ctx.chat ? ctx.chat.title : 'Group',
            members: memberCount,
            muteNewcomers: false,
            muteDurationMinutes: 30,
            autoApprove: true,
            msgCount: 0,
            avatarUrl,
            active: false // New chats are deactivated by default
          };
          await updateChat(chat, true);
          
          await addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'SYSTEM',
            user: 'Bot',
            chat: chat.title,
            details: 'Чат автоматически добавлен после получения сообщения (деактивирован).'
          });
        }
      }

      if (chat) {
        chat.msgCount = (chat.msgCount || 0) + 1;
        await updateChat(chat);
        
        // Track membership on message
        await trackMembership(chatId, {
          id: Number(userId),
          username: ctx.from.username,
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name
        }, true);

        // Detect if forward and extract text / caption
        const msg = ctx.message as any;
        const isForward = Boolean(
          msg?.forward_origin ||
          msg?.forward_from ||
          msg?.forward_from_chat ||
          msg?.forward_date ||
          msg?.forward_sender_name
        );
        let forwardSource = '';
        if (msg?.forward_origin) {
          const origin = msg.forward_origin;
          if (origin.type === 'user' && origin.sender_user) {
            forwardSource = origin.sender_user.username ? `@${origin.sender_user.username}` : (origin.sender_user.first_name || `User ${origin.sender_user.id}`);
          } else if (origin.type === 'channel' && origin.chat) {
            forwardSource = origin.chat.title || origin.chat.username || `Channel ${origin.chat.id}`;
          } else if (origin.type === 'chat' && origin.sender_chat) {
            forwardSource = origin.sender_chat.title || `Chat ${origin.sender_chat.id}`;
          } else if (origin.type === 'hidden_user') {
            forwardSource = origin.sender_user_name || 'Скрытый пользователь';
          }
        } else if (msg?.forward_from) {
          forwardSource = msg.forward_from.username ? `@${msg.forward_from.username}` : (msg.forward_from.first_name || `User ${msg.forward_from.id}`);
        } else if (msg?.forward_from_chat) {
          forwardSource = msg.forward_from_chat.title || msg.forward_from_chat.username || `Chat ${msg.forward_from_chat.id}`;
        } else if (msg?.forward_sender_name) {
          forwardSource = msg.forward_sender_name;
        }

        const rawText = ('text' in ctx.message ? ctx.message.text : ('caption' in ctx.message ? ctx.message.caption : '')) || '';

        // Record message in storage so cleaner can purge it across all chats if needed
        if (ctx.message && ctx.message.message_id) {
          await recordChatMessage({
            id: `${chatId}_${ctx.message.message_id}`,
            messageId: ctx.message.message_id,
            chatId,
            userId: String(userId),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name,
            text: rawText,
            timestamp: new Date().toISOString(),
            isForward,
            forwardSource
          });

          // Check real-time cross-chat spam activity
          await checkCrossChatActivity(
            chatId,
            {
              id: Number(userId),
              username: ctx.from.username,
              first_name: ctx.from.first_name,
              last_name: ctx.from.last_name
            },
            {
              messageId: ctx.message.message_id,
              text: rawText,
              isForward,
              forwardSource
            }
          );
        }

        // Cache message author for reactions
        if (ctx.message && ctx.message.message_id) {
          messageAuthorCache.set(`${chatId}_${ctx.message.message_id}`, {
            userId: String(userId),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name
          });
        }
        
        const effectiveChatTitle = chat?.title || ('title' in ctx.chat ? (ctx.chat as any).title : chatId);

        // Reputation Trigger: Gratitude / Rating replies, quotes & commands (active across all groups when enabled)
        if (filters.reputationEnabled !== false && ctx.message && ('text' in ctx.message || 'caption' in ctx.message)) {
          const rawMsgText = ('text' in ctx.message ? ctx.message.text : ('caption' in ctx.message ? ctx.message.caption : ''))?.trim() || '';
          const replyTo = ctx.message.reply_to_message;
          
          // Check that this is a genuine user quote/reply, NOT a system/channel/bot message
          const isAutomaticOrSystem = replyTo && (
            Boolean((replyTo as any).is_automatic_forward) ||
            Boolean((replyTo as any).forum_topic_created) ||
            Boolean((replyTo as any).pinned_message) ||
            Boolean((replyTo as any).sender_chat) ||
            Boolean(replyTo.from && [777000, 1087968824, 136817688].includes(replyTo.from.id))
          );

          const repCmdMatch = rawMsgText.match(/^([\/!])(rep|реп|reputation|репутация|карма|топ)(?:@\w+)?(?:\s+(.*))?$/i);

          // 1. Command /топ, /rep top or /реп топ: Display top reputation leaders in current chat
          if (repCmdMatch && (repCmdMatch[2].toLowerCase() === 'топ' || repCmdMatch[3]?.toLowerCase() === 'top' || repCmdMatch[3]?.toLowerCase() === 'топ')) {
            const chatScoresList = reputations
              .map(r => ({
                ...r,
                chatScore: (r.chatScores && r.chatScores[chatId] !== undefined) ? r.chatScores[chatId] : r.score
              }))
              .filter(r => r.chatScore > 0)
              .sort((a, b) => b.chatScore - a.chatScore)
              .slice(0, 5);

            let topText = `🏆 <b>Топ репутации в чате «${escapeHtml(effectiveChatTitle)}»:</b>\n\n`;
            if (chatScoresList.length === 0) {
              topText += '<i>В этом чате пока никто не заработал рейтинг. Поблагодарите кого-нибудь словом «спасибо» или плюсиком «+» в ответ на полезное сообщение!</i>';
            } else {
              const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
              chatScoresList.forEach((r, idx) => {
                const name = [r.firstName, r.lastName].filter(Boolean).join(' ') || (r.username ? `@${r.username}` : `User ${r.userId}`);
                topText += `${medals[idx] || '•'} <b>${escapeHtml(name)}</b> — <code>+${r.chatScore}</code>\n`;
              });
            }

            try {
              await ctx.reply(topText, {
                parse_mode: 'HTML',
                reply_parameters: { message_id: ctx.message.message_id }
              });
            } catch (e) {
              await ctx.reply(topText, { parse_mode: 'HTML' }).catch(() => {});
            }
          } 
          // 2. Command /rep or /реп without args & without reply: Show own reputation
          else if (repCmdMatch && !replyTo && (!repCmdMatch[3] || !repCmdMatch[3].trim())) {
            const ownRep = reputations.find(r => String(r.userId) === String(ctx.from.id));
            const globalScore = ownRep?.score || 0;
            const inChatScore = (ownRep?.chatScores && ownRep.chatScores[chatId] !== undefined) ? ownRep.chatScores[chatId] : globalScore;
            const scoreSign = inChatScore > 0 ? `+${inChatScore}` : `${inChatScore}`;
            const globalSign = globalScore > 0 ? `+${globalScore}` : `${globalScore}`;

            const ownText = 
              `⭐️ <b>Ваша репутация:</b>\n\n` +
              `📍 В этом чате: <b>${scoreSign}</b>\n` +
              `🌐 Глобальный рейтинг: <b>${globalSign}</b> (👍 +${ownRep?.positiveCount || 0} / 🔻 -${ownRep?.negativeCount || 0})\n\n` +
              `<i>Чтобы повысить репутацию другому участнику, ответьте на его сообщение «спасибо» или «+»!</i>`;

            try {
              await ctx.reply(ownText, {
                parse_mode: 'HTML',
                reply_parameters: { message_id: ctx.message.message_id }
              });
            } catch (e) {
              await ctx.reply(ownText, { parse_mode: 'HTML' }).catch(() => {});
            }
          }
          // 3. Command /rep or /реп with @username argument (e.g. /rep @user +1 or /rep @user)
          else if (repCmdMatch && repCmdMatch[3] && repCmdMatch[3].trim().startsWith('@')) {
            const parts = repCmdMatch[3].trim().split(/\s+/);
            const targetU = parts[0].replace(/^@/, '').toLowerCase();
            const actionArg = (parts[1] || '').toLowerCase();
            let cmdDelta = 0;
            if (actionArg === '+' || actionArg === '+1' || actionArg === '++' || actionArg === '+rep' || actionArg === '+реп' || actionArg === 'плюс') {
              cmdDelta = 1;
            } else if (actionArg === '-' || actionArg === '-1' || actionArg === '--' || actionArg === '-rep' || actionArg === '-реп' || actionArg === 'минус') {
              cmdDelta = -1;
            }

            const targetMember = memberships.find(m => m.username && m.username.replace(/^@/, '').toLowerCase() === targetU);
            const targetRep = reputations.find(r => (r.username && r.username.toLowerCase() === targetU) || (targetMember && String(r.userId) === String(targetMember.userId)));
            const targetId = targetMember ? String(targetMember.userId) : (targetRep ? String(targetRep.userId) : null);
            const targetName = targetMember?.firstName || targetRep?.firstName || `@${targetU}`;

            if (targetId) {
              if (targetId === String(ctx.from.id)) {
                await ctx.reply('⚠️ Вы не можете изменять репутацию самому себе!', {
                  reply_parameters: { message_id: ctx.message.message_id }
                }).catch(() => {});
              } else if (cmdDelta !== 0) {
                const repCooldownKey = `${ctx.from.id}_${targetId}`;
                const lastRepTime = reputationCooldownMap.get(repCooldownKey) || 0;
                const now = Date.now();
                if (now - lastRepTime >= 10 * 1000) {
                  reputationCooldownMap.set(repCooldownKey, now);
                  const rep = await adjustUserReputation(
                    targetId,
                    cmdDelta,
                    cmdDelta > 0 ? 'Повышение по команде /rep @username' : 'Снижение по команде /rep @username',
                    String(ctx.from.id),
                    ctx.from.first_name || ctx.from.username || 'Пользователь',
                    chatId,
                    effectiveChatTitle
                  );
                  const scoreStr = rep.score > 0 ? `+${rep.score}` : `${rep.score}`;
                  const deltaEmoji = cmdDelta > 0 ? '⭐️' : '🔻';
                  const actionWord = cmdDelta > 0 ? 'повышена' : 'снижена';
                  const deltaStr = cmdDelta > 0 ? `+${cmdDelta}` : `${cmdDelta}`;
                  const replyHtml = 
                    `${deltaEmoji} <b>Репутация ${actionWord}!</b> (<code>${deltaStr}</code>)\n` +
                    `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name || 'Участник')}</a> изменил(а) репутацию ` +
                    `<a href="tg://user?id=${targetId}">${escapeHtml(targetName)}</a>\n` +
                    `📈 Текущая репутация: <b>${scoreStr}</b>`;
                  const isMuteRepMessages = !!(settings as any).muteReputationChangeMessages || !!(filters as any).muteReputationChangeMessages;
                  const notifyGroup = !isMuteRepMessages && (settings as any).reputationNotifyInGroup !== false && (filters as any).reputationNotifyInGroup !== false;
                  if (notifyGroup) {
                    try {
                      await ctx.reply(replyHtml, { parse_mode: 'HTML', reply_parameters: { message_id: ctx.message.message_id } });
                    } catch (e) {
                      await ctx.reply(replyHtml, { parse_mode: 'HTML' }).catch(() => {});
                    }
                  }
                } else {
                  const waitSec = Math.ceil((10000 - (now - lastRepTime)) / 1000);
                  await ctx.reply(`⏳ Вы уже недавно изменяли репутацию этому участнику. Подождите ещё ${waitSec} сек.!`, {
                    reply_parameters: { message_id: ctx.message.message_id }
                  }).catch(() => {});
                }
              } else {
                const tScore = targetRep?.score || 0;
                const inChat = (targetRep?.chatScores && targetRep.chatScores[chatId] !== undefined) ? targetRep.chatScores[chatId] : tScore;
                const scoreSign = inChat > 0 ? `+${inChat}` : `${inChat}`;
                const cardText = 
                  `👤 <b>Репутация пользователя <a href="tg://user?id=${targetId}">${escapeHtml(targetName)}</a>:</b>\n\n` +
                  `📍 В этом чате: <b>${scoreSign}</b>\n` +
                  `🌐 Общий рейтинг: <b>${tScore > 0 ? `+${tScore}` : `${tScore}`}</b> (👍 +${targetRep?.positiveCount || 0} / 🔻 -${targetRep?.negativeCount || 0})`;
                try {
                  await ctx.reply(cardText, { parse_mode: 'HTML', reply_parameters: { message_id: ctx.message.message_id } });
                } catch (e) {
                  await ctx.reply(cardText, { parse_mode: 'HTML' }).catch(() => {});
                }
              }
            } else {
              await ctx.reply(`🔍 Пользователь @${targetU} не найден в базе активности чатов.`, {
                reply_parameters: { message_id: ctx.message.message_id }
              }).catch(() => {});
            }
          }
          // 4. Command /rep with reply or arguments (+1, -1)
          else if (repCmdMatch && replyTo && replyTo.from && !replyTo.from.is_bot && !isAutomaticOrSystem) {
            const arg = (repCmdMatch[3] || '').trim().toLowerCase();
            let cmdDelta = 0;
            let cmdReason = '';

            if (arg === '+' || arg === '+1' || arg === '++' || arg === 'плюс' || arg === '+rep' || arg === '+реп') {
              cmdDelta = 1;
              cmdReason = 'Повышение через команду /rep';
            } else if (arg === '-' || arg === '-1' || arg === '--' || arg === 'минус' || arg === '-rep' || arg === '-реп') {
              cmdDelta = -1;
              cmdReason = 'Снижение через команду /rep';
            } else if (!arg) {
              // Show replied user's reputation card
              const targetRep = reputations.find(r => String(r.userId) === String(replyTo.from.id));
              const tScore = targetRep?.score || 0;
              const tChatScore = (targetRep?.chatScores && targetRep.chatScores[chatId] !== undefined) ? targetRep.chatScores[chatId] : tScore;
              const tScoreSign = tChatScore > 0 ? `+${tChatScore}` : `${tChatScore}`;
              const tName = replyTo.from.first_name || (replyTo.from.username ? `@${replyTo.from.username}` : `User ${replyTo.from.id}`);

              const infoText = 
                `👤 <b>Репутация участника <a href="tg://user?id=${replyTo.from.id}">${escapeHtml(tName)}</a>:</b>\n\n` +
                `📍 В этом чате: <b>${tScoreSign}</b>\n` +
                `🌐 Общий рейтинг: <b>${tScore > 0 ? `+${tScore}` : `${tScore}`}</b> (👍 +${targetRep?.positiveCount || 0} / 🔻 -${targetRep?.negativeCount || 0})`;

              try {
                await ctx.reply(infoText, {
                  parse_mode: 'HTML',
                  reply_parameters: { message_id: ctx.message.message_id }
                });
              } catch (e) {
                await ctx.reply(infoText, { parse_mode: 'HTML' }).catch(() => {});
              }
            }

            if (cmdDelta !== 0) {
              if (replyTo.from.id === ctx.from.id) {
                await ctx.reply('⚠️ Вы не можете изменять репутацию самому себе!', {
                  reply_parameters: { message_id: ctx.message.message_id }
                }).catch(() => {});
              } else {
                const repCooldownKey = `${ctx.from.id}_${replyTo.from.id}`;
                const lastRepTime = reputationCooldownMap.get(repCooldownKey) || 0;
                const now = Date.now();

                if (now - lastRepTime >= 10 * 1000) {
                  reputationCooldownMap.set(repCooldownKey, now);

                  const rep = await adjustUserReputation(
                    String(replyTo.from.id),
                    cmdDelta,
                    cmdReason,
                    String(ctx.from.id),
                    ctx.from.first_name || ctx.from.username || 'Пользователь',
                    chatId,
                    effectiveChatTitle
                  );

                  const targetName = replyTo.from.first_name || (replyTo.from.username ? `@${replyTo.from.username}` : `User ${replyTo.from.id}`);
                  const scoreStr = rep.score > 0 ? `+${rep.score}` : `${rep.score}`;
                  const deltaEmoji = cmdDelta > 0 ? '⭐️' : '🔻';
                  const actionWord = cmdDelta > 0 ? 'повышена' : 'снижена';
                  const deltaStr = cmdDelta > 0 ? `+${cmdDelta}` : `${cmdDelta}`;
                  const verb = cmdDelta > 0 ? 'повысил(а) репутацию' : 'поставил(а) минус';

                  const replyHtml = 
                    `${deltaEmoji} <b>Репутация ${actionWord}!</b> (<code>${deltaStr}</code>)\n` +
                    `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name || 'Участник')}</a> ${verb} ` +
                    `<a href="tg://user?id=${replyTo.from.id}">${escapeHtml(targetName)}</a>\n` +
                    `📈 Текущая репутация: <b>${scoreStr}</b>`;

                  const isMuteRepMessages = !!(settings as any).muteReputationChangeMessages || !!(filters as any).muteReputationChangeMessages;
                  const notifyGroup = !isMuteRepMessages && (settings as any).reputationNotifyInGroup !== false && (filters as any).reputationNotifyInGroup !== false;
                  if (notifyGroup) {
                    try {
                      await ctx.reply(replyHtml, {
                        parse_mode: 'HTML',
                        reply_parameters: { message_id: ctx.message.message_id }
                      });
                    } catch (e) {
                      await ctx.reply(replyHtml, { parse_mode: 'HTML' }).catch(() => {});
                    }
                  }
                } else {
                  const waitSec = Math.ceil((10000 - (now - lastRepTime)) / 1000);
                  await ctx.reply(`⏳ Вы уже недавно изменяли репутацию этому участнику. Подождите ещё ${waitSec} сек.!`, {
                    reply_parameters: { message_id: ctx.message.message_id }
                  }).catch(() => {});
                }
              }
            }
          }
          // 5. Natural replies (gratitude, +, +rep, спасибо, etc.)
          else if (replyTo && replyTo.from && !replyTo.from.is_bot && !isAutomaticOrSystem) {
            const textRaw = rawMsgText;
            const trimmed = textRaw.trim();
            const lower = trimmed.toLowerCase();

            // Positive reputation expressions
            const posExact = new Set([
              '+', '++', '+++', '+1', '+ 1', '+rep', '+ rep', '+реп', '+ реп', 
              '+репутация', '+ репутация', '+карма', '+ карма', '+респект', '+ респект',
              'респект', 'уважуха', 'красава', 'молодец', 'лайк', 'плюсую', 'плюс',
              '👍', '🤝', '❤️', '🔥', '👏', '🏆', '💎', '⚡️', '+карму', '+в карму',
              'благодарочка', 'сенкс', 'дякую', 'благодарен', 'спасибо', 'спс'
            ]);
            const posRegex = /(?:^|\s)(?:спасибо|спс|благодарю|благодарствую|от души|сяп|спасибки|thx|thanks|thank you|дякую|сенкс|благодарочка|благодарен|респект|красава|молодец|плюсую)[\s!.,:;]*$/i;
            const posPrefixRegex = /^(\+|плюс|\+1|\+rep|\+реп|\+карма)[\s!.,:;]?/i;

            // Negative reputation expressions
            const negExact = new Set([
              '-', '--', '---', '-1', '- 1', '-rep', '- rep', '-реп', '- реп', 
              '-репутация', '- репутация', '-карма', '- карма', '-респект',
              'дизлайк', 'фу', '👎', '💩', '🤡', '-карму', '-в карму'
            ]);
            const negPrefixRegex = /^(\-|минус|\-1|\-rep|\-реп|\-карма)[\s!.,:;]?/i;

            let repDelta = 0;
            let repReason = '';

            if (posExact.has(lower) || posPrefixRegex.test(lower) || (trimmed.length <= 100 && posRegex.test(lower))) {
              repDelta = 1;
              repReason = posRegex.test(lower) ? 'Благодарность в сообщении' : 'Повышение репутации (+1)';
            } else if (negExact.has(lower) || negPrefixRegex.test(lower)) {
              repDelta = -1;
              repReason = 'Снижение репутации (-1)';
            }

            if (repDelta !== 0) {
              // Prevent self-reputation
              if (replyTo.from.id === ctx.from.id) {
                try {
                  await ctx.reply('⚠️ Вы не можете изменять репутацию самому себе!', {
                    reply_parameters: { message_id: ctx.message.message_id }
                  });
                } catch (e) {}
              } else {
                // Cooldown check (10 seconds between same pair)
                const repCooldownKey = `${ctx.from.id}_${replyTo.from.id}`;
                const lastRepTime = reputationCooldownMap.get(repCooldownKey) || 0;
                const now = Date.now();

                if (now - lastRepTime >= 10 * 1000) {
                  reputationCooldownMap.set(repCooldownKey, now);

                  const rep = await adjustUserReputation(
                    String(replyTo.from.id),
                    repDelta,
                    repReason,
                    String(ctx.from.id),
                    ctx.from.first_name || ctx.from.username || 'Пользователь',
                    chatId,
                    effectiveChatTitle
                  );

                  const targetName = replyTo.from.first_name || (replyTo.from.username ? `@${replyTo.from.username}` : `User ${replyTo.from.id}`);
                  const scoreStr = rep.score > 0 ? `+${rep.score}` : `${rep.score}`;
                  const deltaEmoji = repDelta > 0 ? '⭐️' : '🔻';
                  const actionWord = repDelta > 0 ? 'повышена' : 'снижена';
                  const deltaStr = repDelta > 0 ? `+${repDelta}` : `${repDelta}`;
                  const verb = repDelta > 0 ? 'поблагодарил(а)' : 'поставил(а) минус';

                  const replyHtml = 
                    `${deltaEmoji} <b>Репутация ${actionWord}!</b> (<code>${deltaStr}</code>)\n` +
                    `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name || 'Участник')}</a> ${verb} ` +
                    `<a href="tg://user?id=${replyTo.from.id}">${escapeHtml(targetName)}</a>\n` +
                    `📈 Текущая репутация: <b>${scoreStr}</b>`;

                  const isMuteRepMessages = !!(settings as any).muteReputationChangeMessages || !!(filters as any).muteReputationChangeMessages;
                  const notifyGroup = !isMuteRepMessages && (settings as any).reputationNotifyInGroup !== false && (filters as any).reputationNotifyInGroup !== false;
                  if (notifyGroup) {
                    try {
                      await ctx.reply(replyHtml, {
                        parse_mode: 'HTML',
                        reply_parameters: { message_id: ctx.message.message_id }
                      });
                    } catch (replyErr) {
                      try {
                        await ctx.reply(replyHtml, { parse_mode: 'HTML' });
                      } catch (e) {
                        console.error('Failed to send reputation reply:', e);
                      }
                    }
                  }
                } else {
                  const waitSec = Math.ceil((10000 - (now - lastRepTime)) / 1000);
                  await ctx.reply(`⏳ Вы уже недавно изменяли репутацию этому участнику. Подождите ещё ${waitSec} сек.!`, {
                    reply_parameters: { message_id: ctx.message.message_id }
                  }).catch(() => {});
                }
              }
            }
          }
          // 6. Direct mentions without reply (+rep @username, спасибо @username)
          else if (!replyTo && rawMsgText) {
            const mentionMatch = rawMsgText.match(/(\+rep|\+реп|\+|спасибо|спс|респект|-rep|-реп|-)\s+@([a-zA-Z0-9_]{4,32})/i);
            if (mentionMatch) {
              const actionPrefix = mentionMatch[1].toLowerCase();
              const targetUsername = mentionMatch[2].toLowerCase();

              // Find user in memberships or reputations
              const targetMember = memberships.find(m => m.username && m.username.toLowerCase().replace(/^@/, '') === targetUsername);
              const targetRep = reputations.find(r => r.username && r.username.toLowerCase() === targetUsername);
              const targetId = targetMember ? String(targetMember.userId) : (targetRep ? String(targetRep.userId) : null);

              if (targetId && targetId !== String(ctx.from.id)) {
                const isNeg = actionPrefix.startsWith('-') || actionPrefix.includes('минус');
                const delta = isNeg ? -1 : 1;
                const repCooldownKey = `${ctx.from.id}_${targetId}`;
                const lastRepTime = reputationCooldownMap.get(repCooldownKey) || 0;
                const now = Date.now();

                if (now - lastRepTime >= 10 * 1000) {
                  reputationCooldownMap.set(repCooldownKey, now);

                  const rep = await adjustUserReputation(
                    targetId,
                    delta,
                    isNeg ? 'Снижение по упоминанию @username' : 'Повышение по упоминанию @username',
                    String(ctx.from.id),
                    ctx.from.first_name || ctx.from.username || 'Пользователь',
                    chatId,
                    effectiveChatTitle
                  );

                  const targetName = targetMember?.firstName || targetRep?.firstName || `@${targetUsername}`;
                  const scoreStr = rep.score > 0 ? `+${rep.score}` : `${rep.score}`;
                  const deltaEmoji = delta > 0 ? '⭐️' : '🔻';
                  const actionWord = delta > 0 ? 'повышена' : 'снижена';
                  const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

                  const replyHtml = 
                    `${deltaEmoji} <b>Репутация ${actionWord}!</b> (<code>${deltaStr}</code>)\n` +
                    `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name || 'Участник')}</a> изменил(а) репутацию ` +
                    `<a href="tg://user?id=${targetId}">${escapeHtml(targetName)}</a>\n` +
                    `📈 Текущая репутация: <b>${scoreStr}</b>`;

                  const isMuteRepMessages = !!(settings as any).muteReputationChangeMessages || !!(filters as any).muteReputationChangeMessages;
                  const notifyGroup = !isMuteRepMessages && (settings as any).reputationNotifyInGroup !== false && (filters as any).reputationNotifyInGroup !== false;
                  if (notifyGroup) {
                    try {
                      await ctx.reply(replyHtml, { parse_mode: 'HTML', reply_parameters: { message_id: ctx.message.message_id } });
                    } catch (e) {
                      await ctx.reply(replyHtml, { parse_mode: 'HTML' }).catch(() => {});
                    }
                  }
                } else {
                  const waitSec = Math.ceil((10000 - (now - lastRepTime)) / 1000);
                  await ctx.reply(`⏳ Вы уже недавно изменяли репутацию этому участнику. Подождите ещё ${waitSec} сек.!`, {
                    reply_parameters: { message_id: ctx.message.message_id }
                  }).catch(() => {});
                }
              }
            }
          }
        }

        // Moderation Logic (for chats with active automated protection)
        if (chat.active) {
          // Check Global Ban List (ID or Username)
          const isBanned = bans.some(b => {
            if (b.userId.startsWith('@')) {
              return ctx.from.username && `@${ctx.from.username.toLowerCase()}` === b.userId.toLowerCase();
            }
            return b.userId === userId;
          });

          if (isBanned) {
            try {
              await ctx.deleteMessage();
              await ctx.banChatMember(ctx.from.id);
              await addLog({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toISOString(),
                type: 'BAN',
                user: ctx.from.first_name,
                chat: chat.title,
                details: 'Пользователь удален (глобальный бан-лист).'
              });
              return;
            } catch (e) {
              console.error('Moderation failed (ban):', e);
            }
          }

          // Moderation Commands: /mute, /unmute, /ban, /unban, /warn, /unwarn (also !, un+)
          if (ctx.message && 'text' in ctx.message) {
            const rawText = ctx.message.text.trim();
            const cmdMatch = rawText.match(/^([\/!])(un\+?|)(mute|ban|warn)(?:@\w+)?(?:\s+(.*))?$/i);

            if (cmdMatch) {
              const isUn = Boolean(cmdMatch[2]);
              const action = cmdMatch[3].toLowerCase(); // 'mute' | 'ban' | 'warn'
              const argsStr = (cmdMatch[4] || '').trim();
              const args = argsStr ? argsStr.split(/\s+/) : [];

              const isAdmin = await isModeratorOrAdmin(ctx, chatId, ctx.from.id);
              if (!isAdmin) {
                console.log(`User ${userId} tried to use /${isUn ? 'un' : ''}${action} without admin privileges in ${chatId}`);
              } else {
                const adminName = ctx.from.first_name || ctx.from.username || 'Администратор';
                const adminId = String(ctx.from.id);

                let targetUser: { id: number; username?: string; first_name?: string; last_name?: string } | null = null;
                let remainingArgs = [...args];

                if (ctx.message.reply_to_message && ctx.message.reply_to_message.from) {
                  targetUser = ctx.message.reply_to_message.from;
                } else if (args.length > 0) {
                  const first = args[0];
                  if (first.startsWith('@')) {
                    const cleanU = first.slice(1).toLowerCase();
                    const found = memberships.find(m => m.username && m.username.replace('@', '').toLowerCase() === cleanU);
                    if (found) {
                      targetUser = {
                        id: Number(found.userId),
                        username: found.username.replace('@', ''),
                        first_name: found.firstName || found.username,
                        last_name: found.lastName
                      };
                      remainingArgs = args.slice(1);
                    }
                  } else if (/^\d{5,15}$/.test(first)) {
                    const tid = Number(first);
                    const found = memberships.find(m => String(m.userId) === String(tid));
                    targetUser = {
                      id: tid,
                      username: found?.username ? found.username.replace('@', '') : undefined,
                      first_name: found?.firstName || `User ${tid}`,
                      last_name: found?.lastName
                    };
                    remainingArgs = args.slice(1);
                  }
                }

                if (!targetUser) {
                  await ctx.reply(
                    `❌ Укажите пользователя: ответьте на его сообщение или укажите @username / ID.\n` +
                    `Пример: /${isUn ? 'un' : ''}${action} @username 30m спам`
                  );
                  return;
                }

                if (targetUser.id === ctx.from.id) {
                  await ctx.reply('🤔 Вы не можете применить эту команду к себе.');
                  return;
                }

                const targetName = targetUser.first_name || (targetUser.username ? `@${targetUser.username}` : `User ${targetUser.id}`);
                const targetMention = `[${targetName}](tg://user?id=${targetUser.id})`;

                // 1. MUTE / UNMUTE
                if (action === 'mute') {
                  if (isUn) {
                    try {
                      await ctx.telegram.restrictChatMember(chatId, targetUser.id, {
                        permissions: {
                          can_send_messages: true,
                          can_send_audios: true,
                          can_send_documents: true,
                          can_send_photos: true,
                          can_send_videos: true,
                          can_send_video_notes: true,
                          can_send_voice_notes: true,
                          can_send_polls: true,
                          can_send_other_messages: true,
                          can_add_web_page_previews: true
                        }
                      });
                      await ctx.reply(
                        `🔊 С пользователя ${targetMention} сняты ограничения.`,
                        { parse_mode: 'Markdown' }
                      );
                      await addLog({
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: new Date().toISOString(),
                        type: 'UNMUTE',
                        user: adminName,
                        chat: chat.title,
                        details: `Сняты ограничения с пользователя ${targetName}`
                      });
                    } catch (e) {
                      console.error('Failed to unmute:', e);
                      await ctx.reply(`❌ Не удалось снять ограничения: ${(e as Error).message}`);
                    }
                    return;
                  } else {
                    let durationInfo = remainingArgs.length > 0 ? parseDuration(remainingArgs[0]) : null;
                    let reason = 'Нарушение правил';
                    if (durationInfo) {
                      reason = remainingArgs.slice(1).join(' ') || 'Нарушение правил';
                    } else {
                      durationInfo = parseDuration('1h') || { seconds: 3600, formatted: '1 ч.' };
                      reason = remainingArgs.join(' ') || 'Нарушение правил';
                    }

                    try {
                      const untilDate = Math.floor(Date.now() / 1000) + durationInfo.seconds;
                      await ctx.telegram.restrictChatMember(chatId, targetUser.id, {
                        permissions: {
                          can_send_messages: false,
                          can_send_audios: false,
                          can_send_documents: false,
                          can_send_photos: false,
                          can_send_videos: false,
                          can_send_video_notes: false,
                          can_send_voice_notes: false,
                          can_send_polls: false,
                          can_send_other_messages: false,
                          can_add_web_page_previews: false
                        },
                        until_date: untilDate
                      });

                      await ctx.reply(
                        `🔇 Пользователь ${targetMention} обеззвучен на *${durationInfo.formatted}*.\n📝 Причина: _${reason}_`,
                        { parse_mode: 'Markdown' }
                      );

                      await addLog({
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: new Date().toISOString(),
                        type: 'MUTE',
                        user: adminName,
                        chat: chat.title,
                        details: `Пользователь ${targetName} обеззвучен на ${durationInfo.formatted}. Причина: ${reason}`
                      });
                    } catch (e) {
                      console.error('Failed to mute:', e);
                      await ctx.reply(`❌ Не удалось обеззвучить: ${(e as Error).message}`);
                    }
                    return;
                  }
                }

                // 2. BAN / UNBAN
                if (action === 'ban') {
                  if (isUn) {
                    try {
                      await ctx.telegram.unbanChatMember(chatId, targetUser.id, { only_if_banned: true });
                      await ctx.reply(
                        `✅ Пользователь ${targetMention} разблокирован в чате.`,
                        { parse_mode: 'Markdown' }
                      );
                      await addLog({
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: new Date().toISOString(),
                        type: 'UNBAN',
                        user: adminName,
                        chat: chat.title,
                        details: `Пользователь ${targetName} разблокирован.`
                      });
                    } catch (e) {
                      console.error('Failed to unban:', e);
                      await ctx.reply(`❌ Не удалось разблокировать: ${(e as Error).message}`);
                    }
                    return;
                  } else {
                    let durationInfo = remainingArgs.length > 0 ? parseDuration(remainingArgs[0]) : null;
                    let reason = 'Нарушение правил';
                    if (durationInfo) {
                      reason = remainingArgs.slice(1).join(' ') || 'Нарушение правил';
                    } else {
                      reason = remainingArgs.join(' ') || 'Нарушение правил';
                    }

                    try {
                      const untilDate = durationInfo ? Math.floor(Date.now() / 1000) + durationInfo.seconds : undefined;
                      await ctx.telegram.banChatMember(chatId, targetUser.id, untilDate);

                      await ctx.reply(
                        `🚫 Пользователь ${targetMention} заблокирован ${durationInfo ? 'на *' + durationInfo.formatted + '*' : '*навсегда*'}.\n📝 Причина: _${reason}_`,
                        { parse_mode: 'Markdown' }
                      );

                      await addLog({
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: new Date().toISOString(),
                        type: 'BAN',
                        user: adminName,
                        chat: chat.title,
                        details: `Пользователь ${targetName} заблокирован ${durationInfo ? 'на ' + durationInfo.formatted : 'навсегда'}. Причина: ${reason}`
                      });
                    } catch (e) {
                      console.error('Failed to ban:', e);
                      await ctx.reply(`❌ Не удалось заблокировать: ${(e as Error).message}`);
                    }
                    return;
                  }
                }

                // 3. WARN / UNWARN
                if (action === 'warn') {
                  const warnLimit = filters.warnLimit || 3;
                  if (isUn) {
                    const userWarns = warnings.filter(w => String(w.userId) === String(targetUser!.id) && String(w.chatId) === String(chatId) && w.active);
                    if (userWarns.length === 0) {
                      await ctx.reply(`ℹ️ У пользователя ${targetMention} нет активных предупреждений.`, { parse_mode: 'Markdown' });
                      return;
                    }

                    userWarns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    const latestWarn = userWarns[0];
                    latestWarn.active = false;
                    queueWrite('warnings', latestWarn.id, cleanData(latestWarn));

                    const remainingActive = userWarns.length - 1;
                    await ctx.reply(
                      `✅ С пользователя ${targetMention} снято предупреждение.\nТекущее количество: *${remainingActive}/${warnLimit}*`,
                      { parse_mode: 'Markdown' }
                    );

                    await addLog({
                      id: Math.random().toString(36).substr(2, 9),
                      timestamp: new Date().toISOString(),
                      type: 'UNWARN',
                      user: adminName,
                      chat: chat.title,
                      details: `Снято предупреждение с ${targetName}. Осталось: ${remainingActive}/${warnLimit}`
                    });
                    return;
                  } else {
                    const reason = remainingArgs.join(' ') || 'Нарушение правил';
                    const { activeWarns, banned } = await applyWarning(
                      targetUser,
                      adminName,
                      adminId,
                      chatId,
                      chat.title,
                      reason
                    );

                    if (banned) {
                      await ctx.reply(
                        `🚫 Пользователь ${targetMention} набрал(а) максимум предупреждений (*${activeWarns}/${warnLimit}*) и был(а) *заблокирован(а)*!\n📝 Причина последнего: _${reason}_`,
                        { parse_mode: 'Markdown' }
                      );
                    } else {
                      await ctx.reply(
                        `⚠️ Пользователю ${targetMention} выдано предупреждение (*${activeWarns}/${warnLimit}*).\n📝 Причина: _${reason}_`,
                        { parse_mode: 'Markdown' }
                      );
                    }
                    return;
                  }
                }
              }
            }
          }

          // Handle /userban and /usermute
          if (ctx.message && 'text' in ctx.message && (ctx.message.text.startsWith('/userban') || ctx.message.text.startsWith('/usermute'))) {
            if (filters.userVoteEnabled) {
              const isBan = ctx.message.text.startsWith('/userban');
              const type = isBan ? 'BAN' : 'MUTE';
              let targetUser: { id: number, name: string } | null = null;

              if (ctx.message.reply_to_message) {
                targetUser = {
                  id: ctx.message.reply_to_message.from!.id,
                  name: ctx.message.reply_to_message.from!.first_name || ctx.message.reply_to_message.from!.username || 'User'
                };
              } else {
                const parts = ctx.message.text.split(' ');
                if (parts.length > 1) {
                  const query = parts.slice(1).join(' ').replace('@', '').toLowerCase();
                  const found = memberships.find(m => 
                    m.chatId === chatId && 
                    (m.username?.replace('@', '').toLowerCase() === query || 
                     m.firstName?.toLowerCase() === query ||
                     m.userId === query)
                  );
                  if (found) {
                    targetUser = {
                      id: Number(found.userId),
                      name: found.firstName || found.username || 'User'
                    };
                  }
                }
              }

              if (targetUser) {
                if (targetUser.id === ctx.from.id) {
                  await ctx.reply('🤔 Вы не можете начать голосование против самого себя.');
                } else {
                  // Calculate required votes
                  const chatMembers = chat ? chat.members : 0;
                  let requiredVotes = Math.ceil((chatMembers * filters.userVotePercentage) / 100);
                  if (requiredVotes < filters.userVoteMin) requiredVotes = filters.userVoteMin;
                  if (requiredVotes > filters.userVoteMax) requiredVotes = filters.userVoteMax;

                  const voteId = `${chatId}_${targetUser.id}_${Date.now()}`;
                  const keyboard = {
                    inline_keyboard: [[
                      { text: `🗳 Проголосовать (0/${requiredVotes})`, callback_data: `vote_${voteId}` }
                    ]]
                  };

                  const voteMsg = await ctx.reply(
                    `🗳 **Голосование за ${isBan ? 'БАН' : 'МУТ'}**\n\n` +
                    `Пользователь: ${targetUser.name}\n` +
                    `Инициатор: ${ctx.from.first_name}\n` +
                    `Необходимо голосов: ${requiredVotes}\n\n` +
                    `Нажмите кнопку ниже, чтобы проголосовать.`,
                    { parse_mode: 'Markdown', reply_markup: keyboard }
                  );

                  activeVotes.set(voteId, {
                    targetUserId: targetUser.id,
                    targetName: targetUser.name,
                    chatId: Number(chatId),
                    type,
                    votes: new Set(),
                    requiredVotes,
                    messageId: voteMsg.message_id,
                    expiresAt: Date.now() + (filters.userVoteDuration || 1440) * 60 * 1000
                  });
                }
                return;
              } else {
                await ctx.reply('❌ Пользователь не найден. Ответьте на сообщение пользователя или укажите его имя/username.');
                return;
              }
            }
          }

          // Check Channel Subscription requirement (if enabled for this chat or globally in filters)
          const effectiveRequireSub = (chat.requireChannelSubscription !== undefined && chat.requireChannelSubscription !== null)
            ? chat.requireChannelSubscription
            : !!filters.requireChannelSubscription;

          const rawSubTarget = (chat.channelSubscriptionTarget && chat.channelSubscriptionTarget.trim())
            ? chat.channelSubscriptionTarget.trim()
            : (filters.channelSubscriptionTarget && filters.channelSubscriptionTarget.trim()) ? filters.channelSubscriptionTarget.trim() : '';

          const rawSubMessage = (chat.channelSubscriptionMessage && chat.channelSubscriptionMessage.trim())
            ? chat.channelSubscriptionMessage.trim()
            : (filters.channelSubscriptionMessage && filters.channelSubscriptionMessage.trim()) ? filters.channelSubscriptionMessage.trim() : '';

          if (effectiveRequireSub && rawSubTarget && !isWhitelisted && !isCurrentAdmin) {
            let isSenderAdmin = false;
            try {
              const member = await ctx.telegram.getChatMember(chatId, ctx.from.id);
              isSenderAdmin = ['creator', 'administrator'].includes(member.status);
            } catch (e) {
              isSenderAdmin = false;
            }

            if (!isSenderAdmin) {
              let targetChannel = rawSubTarget;
              if (targetChannel.startsWith('https://t.me/')) {
                const part = targetChannel.split('https://t.me/')[1]?.split('/')[0]?.split('?')[0];
                if (part) targetChannel = `@${part}`;
              } else if (!targetChannel.startsWith('@') && !targetChannel.startsWith('-100')) {
                targetChannel = `@${targetChannel}`;
              }

              let isSubscribed = false;
              try {
                const chMember = await ctx.telegram.getChatMember(targetChannel, ctx.from.id);
                isSubscribed = ['creator', 'administrator', 'member', 'restricted'].includes(chMember.status);
              } catch (chErr: any) {
                console.warn(`[ChannelSubscription] Verification check error for user ${ctx.from.id} in channel ${targetChannel}:`, chErr?.message);
              }

              if (!isSubscribed) {
                try {
                  await ctx.deleteMessage().catch(() => {});
                  
                  // Mute user for 24 hours (86400 seconds)
                  const untilDate = Math.floor(Date.now() / 1000) + 86400;
                  await ctx.telegram.restrictChatMember(chatId, ctx.from.id, {
                    permissions: {
                      can_send_messages: false,
                      can_send_other_messages: false,
                      can_add_web_page_previews: false
                    },
                    until_date: untilDate
                  });

                  const channelLink = targetChannel.startsWith('@') ? `https://t.me/${targetChannel.substring(1)}` : (targetChannel.startsWith('https://') ? targetChannel : `https://t.me/${targetChannel}`);
                  const userMention = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Участник');
                  const defaultMsg = `⚠️ <b>Ограничение отправки сообщений</b>\n\n${escapeHtml(userMention)}, для общения в этом чате необходимо быть подписчиком канала:\n👉 <a href="${channelLink}">${escapeHtml(targetChannel)}</a>\n\nВы временно обеззвучены на 24 часа. Подпишитесь на канал, чтобы писать в чате!`;
                  const noticeMsg = rawSubMessage ? rawSubMessage.replace('{user}', userMention).replace('{channel}', targetChannel) : defaultMsg;

                  const warnReply = await ctx.reply(noticeMsg, {
                    parse_mode: 'HTML',
                    link_preview_options: { is_disabled: false }
                  });

                  setTimeout(async () => {
                    try {
                      await ctx.telegram.deleteMessage(chatId, warnReply.message_id);
                    } catch (e) {}
                  }, 60000);

                  await addLog({
                    id: Math.random().toString(36).substr(2, 9),
                    timestamp: new Date().toISOString(),
                    type: 'MUTE',
                    user: ctx.from.first_name || String(ctx.from.id),
                    chat: chat.title,
                    details: `Мут на 24ч (нет подписки на канал ${targetChannel})`
                  });
                } catch (err) {
                  console.error('[ChannelSubscription] Failed to restrict user:', err);
                }
                return;
              }
            }
          }

          // Check for Admin Tagger (@admin call)
          const textRaw = (ctx.message && 'text' in ctx.message ? ctx.message.text : ((ctx.message as any)?.caption || '')) || '';
          const hasAdminTag = /(?:^|\s)@admin(?:istrators?|s)?(?:\s|$|[.,!?])/i.test(textRaw) || textRaw.trim().startsWith('/admin');

          const effectiveTagAdmins = (chat.tagAdminsEnabled !== undefined && chat.tagAdminsEnabled !== null)
            ? chat.tagAdminsEnabled
            : (filters.tagAdminsEnabled !== undefined ? filters.tagAdminsEnabled : true);

          const rawTagAdminsMessage = (chat.tagAdminsMessage && chat.tagAdminsMessage.trim())
            ? chat.tagAdminsMessage.trim()
            : (filters.tagAdminsMessage && filters.tagAdminsMessage.trim()) ? filters.tagAdminsMessage.trim() : '🚨 <b>Вызов администрации чата</b>\nПоступил запрос от пользователя. Администраторы уведомлены:';

          if (hasAdminTag && effectiveTagAdmins) {
            try {
              const adminMembers = await ctx.telegram.getChatAdministrators(chatId);
              // Exclude bots and anonymous/hidden admins
              const visibleAdmins = adminMembers.filter(a => !a.user.is_bot && !a.is_anonymous);
              
              if (visibleAdmins.length > 0) {
                const mentions = visibleAdmins.map(a => {
                  if (a.user.username) {
                    return `@${a.user.username}`;
                  }
                  return `<a href="tg://user?id=${a.user.id}">${escapeHtml(a.user.first_name || 'Администратор')}</a>`;
                });

                const tagMessage = `${rawTagAdminsMessage}\n\n🛡 ${mentions.join(' ')}`;

                await ctx.reply(tagMessage, {
                  parse_mode: 'HTML',
                  reply_parameters: { message_id: ctx.message.message_id }
                });

                await addLog({
                  id: Math.random().toString(36).substr(2, 9),
                  timestamp: new Date().toISOString(),
                  type: 'SYSTEM',
                  user: ctx.from.first_name || String(ctx.from.id),
                  chat: chat.title,
                  details: `Вызов администрации (@admin): тегнуто ${visibleAdmins.length} админов`
                });
              } else {
                await ctx.reply('⚠️ В чате не найдено открытых администраторов (все админы скрыты или являются ботами).', {
                  reply_parameters: { message_id: ctx.message.message_id }
                });
              }
            } catch (tagErr: any) {
              console.error('[AdminTagger] Error tagging administrators:', tagErr?.message);
            }
          }

          // Filters
          let violation = null;
          const text = 'text' in ctx.message ? ctx.message.text : ('caption' in ctx.message ? ctx.message.caption : '');
          
          const effectiveFilters = {
            blockLinks: (chat.blockLinks !== undefined && chat.blockLinks !== null) ? chat.blockLinks : filters.blockLinks,
            blockTelegramLinks: (chat.blockTelegramLinks !== undefined && chat.blockTelegramLinks !== null) ? chat.blockTelegramLinks : filters.blockTelegramLinks,
            blockMedia: (chat.blockMedia !== undefined && chat.blockMedia !== null) ? chat.blockMedia : filters.blockMedia,
            blockForwards: (chat.blockForwards !== undefined && chat.blockForwards !== null) ? chat.blockForwards : filters.blockForwards,
            forbiddenWords: (chat.forbiddenWords && chat.forbiddenWords.length > 0) ? chat.forbiddenWords : (filters.forbiddenWords || []),
            deleteCommands: (chat.deleteCommands !== undefined && chat.deleteCommands !== null) ? chat.deleteCommands : filters.deleteCommands,
            muteNewcomers: (chat.muteNewcomers !== undefined && chat.muteNewcomers !== null) ? chat.muteNewcomers : filters.muteNewcomers,
            muteDurationHours: (chat.muteDurationHours !== undefined && chat.muteDurationHours !== null) ? chat.muteDurationHours : filters.muteDurationHours,
          };

          console.log(`Checking moderation for message in ${chatId}. Filters:`, effectiveFilters);

          // Check Mute Newcomers
          if (effectiveFilters.muteNewcomers) {
            const membership = memberships.find(m => String(m.userId) === String(userId) && String(m.chatId) === String(chatId));
            if (membership) {
              const joinedAt = new Date(membership.joinedAt).getTime();
              const now = Date.now();
              const muteDurationMs = (effectiveFilters.muteDurationHours || 0) * 3600 * 1000;
              if (now - joinedAt < muteDurationMs) {
                violation = `Новичкам нельзя писать первые ${effectiveFilters.muteDurationHours}ч.`;
              }
            }
          }

          if (!violation && effectiveFilters.blockLinks && (ctx.message as any).entities?.some((e: any) => e.type === 'url' || e.type === 'text_link')) {
            violation = 'Ссылки запрещены';
          } else if (!violation && effectiveFilters.blockTelegramLinks) {
            const hasTelegramLink = (ctx.message as any).entities?.some((e: any) => {
              if (e.type === 'mention') return true;
              if (e.type === 'url' || e.type === 'text_link') {
                const url = e.type === 'url' ? text.substring(e.offset, e.offset + e.length) : e.url;
                return url?.includes('t.me') || url?.includes('telegram.me');
              }
              return false;
            });
            if (hasTelegramLink) violation = 'Telegram-ссылки запрещены';
          } else if (!violation && effectiveFilters.blockForwards && (
            (ctx.message as any).forward_origin || 
            (ctx.message as any).forward_from || 
            (ctx.message as any).forward_from_chat || 
            (ctx.message as any).forward_date || 
            (ctx.message as any).forward_sender_name
          )) {
            violation = 'Пересылки запрещены';
          } else if (!violation && effectiveFilters.blockMedia && (
            (ctx.message as any).photo || 
            (ctx.message as any).video || 
            (ctx.message as any).document || 
            (ctx.message as any).voice || 
            (ctx.message as any).audio || 
            (ctx.message as any).video_note || 
            (ctx.message as any).animation || 
            (ctx.message as any).sticker
          )) {
            violation = 'Медиа запрещено';
          } else if (!violation && text && effectiveFilters.forbiddenWords && effectiveFilters.forbiddenWords.length > 0) {
            for (const word of effectiveFilters.forbiddenWords) {
              if (!word) continue;
              try {
                // Try as regex first
                const regex = new RegExp(word, 'i');
                if (regex.test(text)) {
                  violation = `Запрещенное слово (regex): ${word}`;
                  break;
                }
              } catch (e) {
                // Fallback to simple include if regex is invalid
                if (text.toLowerCase().includes(word.toLowerCase())) {
                  violation = `Запрещенное слово: ${word}`;
                  break;
                }
              }
            }
          } else if (!violation && text && effectiveFilters.deleteCommands && (text.startsWith('/') || text.startsWith('!'))) {
            violation = 'Команды запрещены';
          }

          // Anti-Scam Keywords Detection & Admin Alert
          if (!isWhitelisted && !isCurrentAdmin && antiScamKeywordsConfig.enabled && text && antiScamKeywordsConfig.keywords && antiScamKeywordsConfig.keywords.length > 0) {
            const textLower = text.toLowerCase();
            let matchedKeyword: string | null = null;

            for (const kw of antiScamKeywordsConfig.keywords) {
              const trimmed = kw.trim();
              if (!trimmed) continue;
              try {
                if (trimmed.startsWith('/') && trimmed.endsWith('/') && trimmed.length > 2) {
                  const re = new RegExp(trimmed.slice(1, -1), 'i');
                  if (re.test(text)) {
                    matchedKeyword = trimmed;
                    break;
                  }
                } else {
                  if (textLower.includes(trimmed.toLowerCase())) {
                    matchedKeyword = trimmed;
                    break;
                  }
                }
              } catch (e) {
                if (textLower.includes(trimmed.toLowerCase())) {
                  matchedKeyword = trimmed;
                  break;
                }
              }
            }

            if (matchedKeyword) {
              console.log(`[AntiScam] Matched keyword "${matchedKeyword}" in chat ${chatId} from user ${userId}`);
              const cooldownMs = (antiScamKeywordsConfig.cooldownSeconds || 60) * 1000;
              const alertKey = `${chatId}_${userId}_${matchedKeyword}`;
              const now = Date.now();
              const lastAlert = lastScamAlertCache.get(alertKey) || 0;

              const userFullName = `${ctx.from.first_name || ''}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`.trim() || 'Пользователь';
              const userHandle = ctx.from.username ? `@${ctx.from.username}` : `ID: ${userId}`;
              const currentChatTitle = chat ? chat.title : ('title' in ctx.chat ? ctx.chat.title : chatId);

              // 1. Log alert event
              const alertLogEntry = {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toISOString(),
                chatId,
                chatTitle: currentChatTitle,
                userId,
                username: ctx.from.username,
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name,
                matchedKeyword,
                messageText: text,
                messageId: ctx.message.message_id,
                messageDeleted: Boolean(antiScamKeywordsConfig.deleteMessage)
              };
              scamAlertLogs.unshift(alertLogEntry);
              if (scamAlertLogs.length > 200) scamAlertLogs.pop();
              queueWrite('scam_alert_logs', alertLogEntry.id, cleanData(alertLogEntry));

              await addLog({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toISOString(),
                type: 'WARN',
                user: userFullName,
                chat: currentChatTitle,
                details: `🚨 Анти-мошенник: обнаружено слово «${matchedKeyword}» от ${userHandle}`
              });

              // 2. Send Telegram Notification to Admin
              if (now - lastAlert >= cooldownMs) {
                lastScamAlertCache.set(alertKey, now);

                const targetAlertChat = antiScamKeywordsConfig.notifyChatId || process.env.BOOKRAY_CHAT_ID || settings.infoChatId;
                if (targetAlertChat && bot) {
                  const snippet = text.length > 350 ? text.substring(0, 350) + '...' : text;
                  const alertMsg = 
                    `🚨 <b>СИГНАЛ АНТИ-МОШЕННИК</b>\n\n` +
                    `📍 <b>Чат:</b> ${escapeHtml(currentChatTitle)} (<code>${chatId}</code>)\n` +
                    `👤 <b>Пользователь:</b> <a href="tg://user?id=${userId}">${escapeHtml(userFullName)}</a> (${userHandle})\n` +
                    `🔑 <b>Ключевое слово:</b> <code>${escapeHtml(matchedKeyword)}</code>\n\n` +
                    `💬 <b>Текст сообщения:</b>\n<blockquote>${escapeHtml(snippet)}</blockquote>\n\n` +
                    `⏰ <i>${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)</i>`;

                  const keyboard = {
                    inline_keyboard: [
                      [
                        { text: '🚫 Забанить в чате', callback_data: `chat_ban_${chatId}_${userId}` },
                        { text: '⛔️ Глобальный бан', callback_data: `mc_ban_${userId}` }
                      ],
                      [
                        { text: '🗑 Удалить сообщение', callback_data: `del_msg_${chatId}_${ctx.message.message_id}` },
                        { text: '👤 Профиль', url: `tg://user?id=${userId}` }
                      ]
                    ]
                  };

                  bot.telegram.sendMessage(targetAlertChat, alertMsg, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                  }).catch(e => console.error('[AntiScam] Failed to send telegram alert:', e));
                }
              }

              // 3. Optional actions: delete message or warn in group
              if (antiScamKeywordsConfig.deleteMessage) {
                violation = `Анти-мошенник: обнаружено слово «${matchedKeyword}»`;
              } else if (antiScamKeywordsConfig.notifyInGroup) {
                try {
                  const warnInGroup = await ctx.reply(
                    `⚠️ <b>Внимание:</b> Сообщение содержит признаки подозрительного предложения. Будьте осторожны, не переводите средства незнакомцам!`,
                    { parse_mode: 'HTML', reply_parameters: { message_id: ctx.message.message_id } }
                  );
                  setTimeout(() => {
                    ctx.telegram.deleteMessage(chatId, warnInGroup.message_id).catch(() => {});
                  }, 90000);
                } catch (e) {}
              }
            }
          }

          if (violation) {
            console.log(`Violation found: ${violation}. Deleting message...`);
            try {
              await ctx.deleteMessage();
              
              if (violation.includes('Новичкам нельзя писать')) {
                const mention = `[${ctx.from.first_name}](tg://user?id=${ctx.from.id})`;
                const warningMsg = await ctx.reply(`${mention}, ${violation}`, { parse_mode: 'Markdown' });
                
                // Delete warning after 1 minute
                setTimeout(async () => {
                  try {
                    await ctx.telegram.deleteMessage(chatId, warningMsg.message_id);
                  } catch (e) {}
                }, 60000);
              }

              await addLog({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toISOString(),
                type: 'WARN',
                user: ctx.from.first_name,
                chat: chat.title,
                details: `Сообщение удалено: ${violation}`
              });
            } catch (e) {
              console.error('Moderation failed (delete):', e);
            }
          } else {
            // No violation: record for AI summarization if text message and not command
            if (ctx.message && 'text' in ctx.message) {
              const textTrim = ctx.message.text.trim();
              const textLower = textTrim.toLowerCase();

              // Check for /summary, /дайджест, /digest command
              if (textLower === '/summary' || textLower.startsWith('/summary ') || textLower === '/дайджест' || textLower.startsWith('/дайджест ') || textLower === '/digest' || textLower.startsWith('/digest ')) {
                let isAdmin = false;
                try {
                  const member = await ctx.telegram.getChatMember(chatId, ctx.from.id);
                  isAdmin = ['creator', 'administrator'].includes(member.status);
                } catch (e) {
                  isAdmin = true;
                }

                if (!isAdmin) {
                  await ctx.reply('⚠️ Только администраторы чата могут запрашивать ИИ-дайджест.');
                  return;
                }

                const waitMsg = await ctx.reply('🤖 Анализирую сообщения за 24ч и формирую дайджест с помощью Gemini AI... Пожалуйста, подождите несколько секунд.');

                // Run generation asynchronously so Telegraf message middleware resolves immediately
                (async () => {
                  try {
                    const digest = await generateChatSummary(chatId, 24, undefined, false);
                    try {
                      await ctx.telegram.deleteMessage(chatId, waitMsg.message_id);
                    } catch (e) {}

                    await sendTelegramHtmlMessage(chatId, digest.summary);
                    digest.sentToTelegram = true;
                    (digest as any).sentAt = new Date().toISOString();
                    queueWrite('chat_digests', digest.id, cleanData(digest));
                  } catch (err: any) {
                    console.error('Failed to generate summary on command:', err);
                    const isThresholdErr = err?.message?.includes('требуется минимум 10') || err?.message?.includes('только');
                    const errorText = isThresholdErr 
                      ? `ℹ️ <b>Дайджест не сформирован</b>\n\nЗа последние 24 часа в чате зафиксировано мало активности (меньше 10 сообщений). Дайджест составляется только при активном общении участников.`
                      : `❌ <b>Ошибка генерации:</b> ${escapeHtml(err.message || String(err))}`;

                    try {
                      await ctx.telegram.editMessageText(chatId, waitMsg.message_id, undefined, errorText, { parse_mode: 'HTML' });
                    } catch (e) {
                      try {
                        await ctx.reply(errorText, { parse_mode: 'HTML' });
                      } catch (replyErr) {}
                    }
                  }
                })();
                return;
              }

              if (!textTrim.startsWith('/') && !textTrim.startsWith('!')) {
                await recordChatMessage({
                  id: `${chatId}_${ctx.message.message_id}`,
                  chatId,
                  userId: String(ctx.from.id),
                  username: ctx.from.username,
                  firstName: ctx.from.first_name,
                  lastName: ctx.from.last_name,
                  text: textTrim,
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        }
      }

      console.log(`Message from ${ctx.from.first_name} in ${chatType} ${chatId}: ${'text' in ctx.message ? ctx.message.text : 'non-text'}`);
    });

    // Handle Left Members
    bot.on('left_chat_member', async (ctx) => {
      const chatId = ctx.chat.id.toString();
      const chat = chats.find(c => c.id === chatId);
      if (!chat) return;

      console.log(`Left chat member detected in ${chatId}`);

      const shouldDelete = chat.deleteSystemMessages !== undefined ? chat.deleteSystemMessages : filters.deleteSystemMessages;
      if (shouldDelete) {
        try { await ctx.deleteMessage(); } catch (e) {}
      }

      const member = ctx.message.left_chat_member;
      if (member.is_bot) return;

      // Update member count
      try {
        const memberCount = await ctx.telegram.getChatMembersCount(ctx.chat.id);
        chat.members = memberCount;
        await updateChat(chat);
      } catch (e) {
        console.error('Failed to update member count on leave:', e);
      }

      // Track membership removal
      const membershipId = `${chatId}_${member.id}`;
      try {
        queueDelete('memberships', membershipId);
        memberships = memberships.filter(m => m.id !== membershipId);
        console.log(`Membership removed for user ${member.id} in chat ${chatId}`);
      } catch (e) {
        console.error('Failed to remove membership:', e);
      }

      // Update stats
      await incrementDailyStats(chatId, 'leaves', 1, member.id.toString());

      // Notify info chat
      await notifyInfoChat('LEAVE', chatId, {
        id: member.id,
        first_name: member.first_name,
        last_name: member.last_name,
        username: member.username
      });
    });

    // Handle Join Requests
    bot.on('chat_join_request', async (ctx) => {
      const chatId = ctx.chat.id.toString();
      const userId = ctx.from.id.toString();
      const chat = chats.find(c => c.id === chatId);

      if (!chat || !chat.active) return;

      const effectiveAutoApprove = chat.autoApprove !== undefined ? chat.autoApprove : filters.autoApprove;
      const effectiveCaptchaEnabled = chat.captchaEnabled !== undefined ? chat.captchaEnabled : filters.captchaEnabled;
      const effectiveCaptchaType = (chat.captchaType || filters.captchaType || 'math') as any;
      const effectiveCaptchaQuestion = chat.captchaQuestion !== undefined ? chat.captchaQuestion : filters.captchaQuestion;
      const effectiveCaptchaAnswer = chat.captchaAnswer !== undefined ? chat.captchaAnswer : filters.captchaAnswer;

      if (!effectiveAutoApprove) return;

      if (effectiveCaptchaEnabled) {
        try {
          const challenge = generateCaptchaChallenge(effectiveCaptchaType, effectiveCaptchaQuestion, effectiveCaptchaAnswer, userId);
          
          const greetingText = `👋 Привет, <b>${escapeHtml(ctx.from.first_name || 'пользователь')}</b>!\n` +
            `Вы подали заявку на вступление в чат «<b>${escapeHtml(chat.title)}</b>».\n\n` +
            challenge.question;

          await ctx.telegram.sendMessage(ctx.from.id, greetingText, {
            parse_mode: 'HTML',
            reply_markup: challenge.keyboard
          });

          captchaSessions.set(userId, { 
            chatId, 
            type: challenge.type,
            answer: challenge.answer,
            question: challenge.question,
            userObj: {
              id: ctx.from.id,
              username: ctx.from.username,
              first_name: ctx.from.first_name,
              last_name: ctx.from.last_name
            },
            timestamp: Date.now() 
          });
          
          console.log(`[Captcha] Sent ${challenge.type} challenge to user ${userId} for chat ${chatId}. Expected answer: ${challenge.answer}`);
          await addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'SYSTEM',
            user: ctx.from.first_name,
            chat: chat.title,
            details: `Отправлена каптча (${challenge.type}) новому участнику.`
          });
        } catch (e: any) {
          console.error('Failed to send captcha DM:', e?.message || e);
          // If DM fails (e.g. user blocked bot or hasn't started DM), fallback to handleCaptchaPassed
          try {
            await handleCaptchaPassed(ctx, chatId, userId, ctx.from);
          } catch (approveErr) {
            console.error('Failed to approve after DM fail:', approveErr);
          }
        }
      } else {
        await handleCaptchaPassed(ctx, chatId, userId, ctx.from);
      }
    });

    // Handle New Members (Mute & Membership Tracking)
    bot.on('new_chat_members', async (ctx) => {
      const chatId = ctx.chat.id.toString();
      const chat = chats.find(c => c.id === chatId);
      if (!chat) return;

      const shouldDelete = chat.deleteSystemMessages !== undefined ? chat.deleteSystemMessages : filters.deleteSystemMessages;
      if (shouldDelete) {
        try { await ctx.deleteMessage(); } catch (e) {}
      }

      // Update member count
      try {
        const memberCount = await ctx.telegram.getChatMembersCount(ctx.chat.id);
        chat.members = memberCount;
        await updateChat(chat);
      } catch (e) {
        console.error('Failed to update member count on join:', e);
      }

      // Track membership
      const newMembers = (ctx.message as any).new_chat_members.filter((m: any) => !m.is_bot);
      for (const member of newMembers) {
        // Check for global bans
        const isGloballyBanned = bans.find(b => String(b.userId) === String(member.id));
        const isWhitelisted = whitelist.some(w => String(w.userId) === String(member.id) || (member.username && w.username && w.username.toLowerCase() === `@${member.username.toLowerCase()}`));
        
        if (isGloballyBanned && !isWhitelisted) {
          try {
            await ctx.telegram.banChatMember(chatId, member.id);
            console.log(`Auto-banned globally banned user ${member.id} in chat ${chatId} on join`);
            continue; // Skip tracking for banned user
          } catch (e) {
            console.error(`Failed to auto-ban globally banned user ${member.id} in chat ${chatId}:`, (e as Error).message);
          }
        }

        // Track membership on join
        await trackMembership(chatId, member);
      }

      if (!chat.active) return;

      const effectiveMuteNewcomers = chat.muteNewcomers !== undefined ? chat.muteNewcomers : filters.muteNewcomers;
      const effectiveMuteDurationHours = chat.muteDurationHours !== undefined ? chat.muteDurationHours : filters.muteDurationHours;
      const effectiveMuteMessage = chat.muteMessage !== undefined ? chat.muteMessage : filters.muteMessage;

      if (effectiveMuteNewcomers && effectiveMuteDurationHours > 0) {
        for (const member of (ctx.message as any).new_chat_members) {
          if (member.is_bot) continue;
          try {
            console.log(`Muting newcomer ${member.id} in chat ${chatId} for ${effectiveMuteDurationHours}h`);
            await applyMuteToUser(chatId, String(member.id), effectiveMuteDurationHours, 'newcomer', member.first_name);

            const welcomeMsg = (effectiveMuteMessage || 'вам выдан временный мут на {hours} ч.').replace('{hours}', effectiveMuteDurationHours.toString());
            const mention = `[${member.first_name}](tg://user?id=${member.id})`;
            const sentMsg = await ctx.reply(`${mention}, ${welcomeMsg}`, { parse_mode: 'Markdown' });

            // Delete welcome message after 1 minute if it's a mute notification
            setTimeout(async () => {
              try {
                await ctx.telegram.deleteMessage(chatId, sentMsg.message_id);
              } catch (e) {}
            }, 60000);
          } catch (e) {
            console.error('Failed to mute newcomer:', e);
          }
        }
      }
    });


    // Automatically manage chats based on bot membership
    bot.on('my_chat_member', async (ctx) => {
      const { new_chat_member, chat } = ctx.myChatMember;
      const chatId = chat.id.toString();

      if (['administrator', 'member'].includes(new_chat_member.status)) {
        const chatExists = chats.find(c => String(c.id) === chatId);
        let memberCount = 0;
        let avatarUrl = `https://picsum.photos/seed/${chatId}/200`;
        
        try {
          memberCount = await ctx.telegram.getChatMembersCount(chat.id);
          const chatFull = await ctx.telegram.getChat(chat.id);
          if (chatFull.photo) {
            const fileId = chatFull.photo.small_file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            avatarUrl = fileLink.toString();
          }
        } catch (e) {
          console.error('Failed to get chat info:', e);
        }

        const newChat = {
          id: chatId,
          title: 'title' in chat ? chat.title : (chatExists?.title || 'Group'),
          members: memberCount || chatExists?.members || 0,
          muteNewcomers: chatExists?.muteNewcomers ?? false,
          muteDurationMinutes: chatExists?.muteDurationMinutes ?? 30,
          autoApprove: chatExists?.autoApprove ?? true,
          msgCount: chatExists?.msgCount || 0,
          avatarUrl: avatarUrl || chatExists?.avatarUrl,
          active: chatExists ? chatExists.active : false
        };
        await updateChat(newChat, true);
        
        await addLog({
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          type: 'SYSTEM',
          user: 'Bot',
          chat: 'title' in chat ? chat.title : chatId,
          details: `Бот зарегистрирован в чате (${new_chat_member.status}).`
        });
        
        console.log(`Added/Updated managed chat: ${'title' in chat ? chat.title : chatId}`);
      } else if (['left', 'kicked'].includes(new_chat_member.status)) {
        const existingChat = chats.find(c => String(c.id) === chatId);
        if (existingChat) {
          existingChat.active = false;
          await updateChat(existingChat, true);
          
          await addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'SYSTEM',
            user: 'Bot',
            chat: existingChat.title || chatId,
            details: 'Бот удален из чата. Чат деактивирован.'
          });
          
          console.log(`Bot left/kicked from chat: ${existingChat.title || chatId}`);
        }
      }
    });

    // Handle Chat Member Updates (Reliable join/leave tracking)
    bot.on('chat_member', async (ctx) => {
      const { old_chat_member, new_chat_member, chat } = ctx.chatMember;
      const chatId = chat.id.toString();
      const user = new_chat_member.user;
      const userId = user.id.toString();

      if (user.is_bot) return;

      const oldStatus = old_chat_member.status;
      const newStatus = new_chat_member.status;

      // Join detection: transition from non-member status to member status
      const becameMember = !['member', 'administrator', 'creator'].includes(oldStatus) && 
                            ['member', 'administrator', 'creator'].includes(newStatus);
      
      // Leave detection: transition from member status to non-member status
      const leftMember = ['member', 'administrator', 'creator', 'restricted'].includes(oldStatus) && 
                         ['left', 'kicked'].includes(newStatus);

      if (becameMember) {
        console.log(`User ${userId} joined ${chatId} (detected via chat_member update)`);
        await trackMembership(chatId, user);
      } else if (leftMember) {
        console.log(`User ${userId} left ${chatId} (detected via chat_member update)`);
        
        // Track membership removal
        const membershipId = `${chatId}_${userId}`;
        memberships = memberships.filter(m => m.id !== membershipId);
        queueDelete('memberships', membershipId);
        
        // Update stats
        await incrementDailyStats(chatId, 'leaves', 1, userId);

        // Notify info chat
        await notifyInfoChat('LEAVE', chatId, {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username
        });
      }
    });

    bot.on('callback_query', async (ctx) => {
      const userId = ctx.from.id.toString();
      const username = ctx.from.username;
      const data = (ctx.callbackQuery as any).data;

      // Captcha Refresh
      if (data.startsWith('cap_refresh_')) {
        const session = captchaSessions.get(userId);
        if (!session) {
          return ctx.answerCbQuery('⚠️ Сессия проверки устарела. Подайте заявку заново.');
        }
        const chat = chats.find(c => c.id === session.chatId);
        const effectiveCaptchaType = (chat?.captchaType || filters.captchaType || 'math') as any;
        const effectiveCaptchaQuestion = chat?.captchaQuestion !== undefined ? chat.captchaQuestion : filters.captchaQuestion;
        const effectiveCaptchaAnswer = chat?.captchaAnswer !== undefined ? chat.captchaAnswer : filters.captchaAnswer;

        const challenge = generateCaptchaChallenge(effectiveCaptchaType, effectiveCaptchaQuestion, effectiveCaptchaAnswer, userId);
        session.type = challenge.type;
        session.answer = challenge.answer;
        session.question = challenge.question;
        session.timestamp = Date.now();

        const greetingText = `👋 Привет, <b>${escapeHtml(ctx.from.first_name || 'пользователь')}</b>!\n` +
          `Вы подали заявку на вступление в чат «<b>${escapeHtml(chat?.title || 'Группа')}</b>».\n\n` +
          challenge.question;

        try {
          await ctx.editMessageText(greetingText, {
            parse_mode: 'HTML',
            reply_markup: challenge.keyboard
          });
          await ctx.answerCbQuery('🔄 Вопрос обновлен!');
        } catch (err) {}
        return;
      }

      // Captcha Answer Click
      if (data.startsWith('cap_ans_')) {
        const parts = data.split('_');
        const targetUserId = parts[parts.length - 1];
        if (targetUserId !== 'user' && targetUserId !== userId) {
          return ctx.answerCbQuery('⚠️ Эта кнопка предназначена не для вас.', { show_alert: true });
        }

        const rawAns = parts.slice(2, parts.length - 1).join('_');
        const selectedAnswer = decodeURIComponent(rawAns).trim().toLowerCase();

        const session = captchaSessions.get(userId);
        if (!session) {
          return ctx.answerCbQuery('⚠️ Сессия проверки не найдена или уже завершена.');
        }

        const expected = String(session.answer).trim().toLowerCase();
        if (selectedAnswer === expected) {
          await ctx.answerCbQuery('✅ Верно!');
          captchaSessions.delete(userId);
          await handleCaptchaPassed(ctx, session.chatId, userId, session.userObj || ctx.from);
        } else {
          await ctx.answerCbQuery('❌ Неверно! Попробуйте другой вариант или обновите вопрос.', { show_alert: true });
        }
        return;
      }

      // Subscription Choice: Confirm Subscription
      if (data.startsWith('sub_confirm_')) {
        const sessionUserId = data.replace('sub_confirm_', '');
        if (sessionUserId !== userId) {
          return ctx.answerCbQuery('⚠️ Это действие доступно только для заявителя.', { show_alert: true });
        }

        const session = subscriptionChoiceSessions.get(userId);
        if (!session) {
          return ctx.answerCbQuery('⚠️ Сессия выбора устарела. Подайте заявку заново.', { show_alert: true });
        }

        const { chatId, targetChannel, newcomerMuteHours, userObj } = session;
        const chat = chats.find(c => String(c.id) === String(chatId));

        // Check actual subscription in Telegram channel
        let isSubscribed = false;
        try {
          let checkTarget = targetChannel;
          if (checkTarget.startsWith('https://t.me/')) {
            const part = checkTarget.split('https://t.me/')[1]?.split('/')[0]?.split('?')[0];
            if (part) checkTarget = `@${part}`;
          } else if (!checkTarget.startsWith('@') && !checkTarget.startsWith('-100')) {
            checkTarget = `@${checkTarget}`;
          }

          const chMember = await ctx.telegram.getChatMember(checkTarget, Number(userId));
          isSubscribed = ['creator', 'administrator', 'member', 'restricted'].includes(chMember.status);
        } catch (chErr: any) {
          console.warn(`[SubCheck] Could not verify membership in channel ${targetChannel} for user ${userId}:`, chErr?.message || chErr);
          // If channel check fails due to bot not being admin, let user through
          isSubscribed = true;
        }

        if (!isSubscribed) {
          return ctx.answerCbQuery(`⚠️ Вы еще не подписались на канал ${targetChannel}! Подпишитесь и нажмите кнопку снова.`, { show_alert: true });
        }

        // User is confirmed subscribed!
        subscriptionChoiceSessions.delete(userId);
        await ctx.answerCbQuery('✅ Подписка подтверждена!');

        try {
          await ctx.telegram.approveChatJoinRequest(chatId, Number(userId));
          await trackMembership(chatId, {
            id: Number(userId),
            username: userObj?.username,
            first_name: userObj?.first_name || userObj?.firstName,
            last_name: userObj?.last_name || userObj?.lastName
          });

          if (newcomerMuteHours > 0) {
            await applyMuteToUser(chatId, userId, newcomerMuteHours, 'newcomer', userObj?.first_name || userObj?.firstName);
            const approvedText = `✅ <b>Подписка на канал подтверждена! Заявка одобрена.</b>\n\n` +
              `⏳ В чате «<b>${escapeHtml(chat?.title || 'Группа')}</b>» действует стандартный мут новичка на <b>${newcomerMuteHours} ч.</b>\n` +
              `По истечении времени вы сможете писать в чат. Спасибо за подписку!`;
            await ctx.editMessageText(approvedText, { parse_mode: 'HTML' });
          } else {
            const approvedText = `✅ <b>Подписка на канал подтверждена! Заявка одобрена.</b>\n\n` +
              `Добро пожаловать в чат «<b>${escapeHtml(chat?.title || 'Группа')}</b>»!`;
            await ctx.editMessageText(approvedText, { parse_mode: 'HTML' });
          }

          await addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'SYSTEM',
            user: userObj?.first_name || userObj?.firstName || String(userId),
            chat: chat?.title || chatId,
            details: `Принят в чат после подтверждения подписки на канал ${targetChannel}.`
          });
        } catch (apprErr: any) {
          console.error(`[SubCheck] Failed to approve user ${userId}:`, apprErr);
          await ctx.editMessageText('❌ Ошибка при одобрении заявки. Возможно, срок заявки истек.').catch(() => {});
        }
        return;
      }

      // Subscription Choice: Refuse Subscription -> 24h Mute
      if (data.startsWith('sub_refuse_')) {
        const sessionUserId = data.replace('sub_refuse_', '');
        if (sessionUserId !== userId) {
          return ctx.answerCbQuery('⚠️ Это действие доступно только для заявителя.', { show_alert: true });
        }

        const session = subscriptionChoiceSessions.get(userId);
        if (!session) {
          return ctx.answerCbQuery('⚠️ Сессия выбора устарела. Подайте заявку заново.', { show_alert: true });
        }

        const { chatId, targetChannel, userObj } = session;
        const chat = chats.find(c => String(c.id) === String(chatId));

        subscriptionChoiceSessions.delete(userId);
        await ctx.answerCbQuery('ℹ️ Вы отказались от подписки. Будет применен мут на 24ч.');

        try {
          await ctx.telegram.approveChatJoinRequest(chatId, Number(userId));
          await trackMembership(chatId, {
            id: Number(userId),
            username: userObj?.username,
            first_name: userObj?.first_name || userObj?.firstName,
            last_name: userObj?.last_name || userObj?.lastName
          });

          // Apply 24h mute for refusing subscription
          await applyMuteToUser(chatId, userId, 24, 'channel_subscription_refusal', userObj?.first_name || userObj?.firstName);

          const refuseResultText = `⚠️ <b>Вы приняты в чат «${escapeHtml(chat?.title || 'Группа')}»</b>\n\n` +
            `Поскольку вы отказались от подписки на канал <i>${escapeHtml(targetChannel)}</i>, вам выдан <b>мут на 24 часа</b>.\n\n` +
            `⏰ Мут снимется автоматически ровно через 24 часа. До этого времени отправка сообщений ограничена.`;

          await ctx.editMessageText(refuseResultText, { parse_mode: 'HTML' });

          await addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'MUTE',
            user: userObj?.first_name || userObj?.firstName || String(userId),
            chat: chat?.title || chatId,
            details: 'Принят в чат с мутом на 24ч из-за отказа от подписки на канал.'
          });
        } catch (apprErr: any) {
          console.error(`[SubRefuse] Failed to approve user ${userId}:`, apprErr);
          await ctx.editMessageText('❌ Ошибка при одобрении заявки. Попробуйте подать заявку снова.').catch(() => {});
        }
        return;
      }

      if (data.startsWith('vote_')) {
        const voteId = data.replace('vote_', '');
        const vote = activeVotes.get(voteId);

        if (!vote) {
          return ctx.answerCbQuery('❌ Голосование не найдено или завершено.');
        }

        if (Date.now() > vote.expiresAt) {
          activeVotes.delete(voteId);
          return ctx.answerCbQuery('❌ Срок голосования истек.');
        }

        if (vote.votes.has(ctx.from.id)) {
          return ctx.answerCbQuery('⚠️ Вы уже проголосовали.');
        }

        vote.votes.add(ctx.from.id);
        const currentVotes = vote.votes.size;

        if (currentVotes >= vote.requiredVotes) {
          activeVotes.delete(voteId);
          try {
            if (vote.type === 'BAN') {
              await ctx.telegram.banChatMember(vote.chatId, vote.targetUserId);
              await ctx.editMessageText(`✅ Пользователь ${vote.targetName} был забанен по результатам голосования!`);
            } else {
              const until = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
              await ctx.telegram.restrictChatMember(vote.chatId, vote.targetUserId, {
                permissions: { can_send_messages: false },
                until_date: until
              });
              await ctx.editMessageText(`✅ Пользователь ${vote.targetName} был замучен на 24 часа по результатам голосования!`);
            }
            
            await addLog({
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              type: vote.type === 'BAN' ? 'BAN' : 'MUTE',
              user: vote.targetName,
              chat: 'Voting',
              details: `Пользователь ${vote.type === 'BAN' ? 'забанен' : 'замучен'} по результатам голосования.`
            });
          } catch (e) {
            console.error('Voting action failed:', e);
            await ctx.editMessageText(`❌ Не удалось выполнить ${vote.type === 'BAN' ? 'бан' : 'мут'} пользователя ${vote.targetName}.`);
          }
        } else {
          const keyboard = {
            inline_keyboard: [[
              { text: `🗳 Проголосовать (${currentVotes}/${vote.requiredVotes})`, callback_data: `vote_${voteId}` }
            ]]
          };
          try {
            await ctx.editMessageReplyMarkup(keyboard);
          } catch (e) {}
          await ctx.answerCbQuery('✅ Ваш голос учтен!');
        }
        return;
      }

      if (data.startsWith('mc_ban_clean_') || data.startsWith('mc_clean_') || data.startsWith('mc_ban_')) {
        const isCleanOnly = data.startsWith('mc_clean_');
        const isBanAndClean = data.startsWith('mc_ban_clean_');
        const targetUserId = data.replace('mc_ban_clean_', '').replace('mc_clean_', '').replace('mc_ban_', '');
        const adminTag = username ? `@${username}` : (ctx.from.first_name || 'Админ');

        if (isCleanOnly) {
          // Clean messages only without banning
          const cleanRes = await cleanUserMessages(targetUserId, false);
          await ctx.answerCbQuery(`🗑 Сообщения удалены (${cleanRes.deletedCount} сообщ. в ${cleanRes.chatsCount} чатах)!`);

          const currentText = (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message) ? ctx.callbackQuery.message.text : '';
          const updatedText = `${currentText}\n\n🧹 *СТАТУС:* Все сообщения удалены во всех чатах (${cleanRes.deletedCount} сообщ., ${adminTag}).`;

          try {
            await ctx.editMessageText(updatedText, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🚫 Заблокировать глобально', callback_data: `mc_ban_${targetUserId}` }],
                  [{ text: '✅ В белый список', callback_data: `mc_wl_${targetUserId}` }]
                ]
              }
            });
          } catch (e) {}
          return;
        }

        // Banning or Ban+Clean: Add user to global ban list
        const existingBanIndex = bans.findIndex(b => String(b.userId) === String(targetUserId));
        if (existingBanIndex === -1) {
          const newBan = {
            id: targetUserId,
            userId: targetUserId,
            reason: isBanAndClean ? 'Спам в нескольких чатах (Бан + Очистка)' : 'Мультичат бан (через кнопку в Telegram)',
            createdAt: new Date().toISOString()
          };
          bans.push(newBan);
          queueWrite('bans', targetUserId, cleanData(newBan));
        }

        // Remove from whitelist if present
        const existingWlIndex = whitelist.findIndex(w => String(w.userId) === String(targetUserId));
        if (existingWlIndex !== -1) {
          whitelist.splice(existingWlIndex, 1);
          queueDelete('whitelist', targetUserId);
        }

        // Ban user in all active managed chats with revoke_messages: true
        let bannedInChatsCount = 0;
        const userMembershipsList = memberships.filter(m => String(m.userId) === String(targetUserId));
        for (const m of userMembershipsList) {
          try {
            await ctx.telegram.banChatMember(m.chatId, Number(targetUserId), { revoke_messages: true } as any);
            bannedInChatsCount++;
          } catch (e) {
            console.error(`Failed to ban user ${targetUserId} in chat ${m.chatId}:`, e);
          }
        }

        for (const chat of chats.filter(c => c.active)) {
          if (!userMembershipsList.some(m => String(m.chatId) === String(chat.id))) {
            try {
              await ctx.telegram.banChatMember(chat.id, Number(targetUserId), { revoke_messages: true } as any);
              bannedInChatsCount++;
            } catch (e) {}
          }
        }

        // Also purge tracked messages from database and memory
        let cleanRes = null;
        if (isBanAndClean) {
          try {
            cleanRes = await cleanUserMessages(targetUserId, false);
          } catch (e) {
            console.error('Failed to clean messages during mc_ban_clean:', e);
          }
        }

        await addLog({
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          type: 'BAN',
          user: `ID ${targetUserId}`,
          chat: 'MultiChat',
          details: `Пользователь заблокирован во всех чатах (${bannedInChatsCount})${isBanAndClean ? ` и удалено ${cleanRes?.deletedCount || 0} сообщений` : ''} (${adminTag}).`
        });

        await ctx.answerCbQuery(isBanAndClean ? '🚫 Пользователь забанен, все сообщения удалены!' : '🚫 Пользователь заблокирован во всех чатах!');

        const currentText = (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message) ? ctx.callbackQuery.message.text : '';
        const cleanNotice = isBanAndClean ? ` + удалено ${cleanRes?.deletedCount || 0} сообщ.` : '';
        const updatedText = `${currentText}\n\n🛑 *СТАТУС:* Заблокирован во всех чатах${cleanNotice} (${adminTag}).`;

        try {
          await ctx.editMessageText(updatedText, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '⛔ Заблокирован (Глобальный бан)', callback_data: `mc_info_banned_${targetUserId}` },
                { text: '✅ Перенести в белый список', callback_data: `mc_wl_${targetUserId}` }
              ]]
            }
          });
        } catch (e) {
          try {
            await ctx.editMessageReplyMarkup({
              inline_keyboard: [[
                { text: '⛔ Заблокирован (Глобальный бан)', callback_data: `mc_info_banned_${targetUserId}` },
                { text: '✅ Перенести в белый список', callback_data: `mc_wl_${targetUserId}` }
              ]]
            });
          } catch (err) {}
        }
        return;
      }

      if (data.startsWith('mc_wl_')) {
        const targetUserId = data.replace('mc_wl_', '');

        // Remove from global ban list if present
        const banIndex = bans.findIndex(b => String(b.userId) === String(targetUserId));
        if (banIndex !== -1) {
          bans.splice(banIndex, 1);
          queueDelete('bans', targetUserId);
        }

        // Add to Whitelist
        const existingWlIndex = whitelist.findIndex(w => String(w.userId) === String(targetUserId));
        if (existingWlIndex === -1) {
          const userMem = memberships.find(m => String(m.userId) === String(targetUserId));
          const newWl = {
            id: targetUserId,
            userId: targetUserId,
            username: userMem?.username || null,
            firstName: userMem?.firstName || `User ${targetUserId}`,
            addedAt: new Date().toISOString()
          };
          whitelist.push(newWl);
          queueWrite('whitelist', targetUserId, cleanData(newWl));
        }

        // Unban in chats if previously banned
        const userMembershipsList = memberships.filter(m => String(m.userId) === String(targetUserId));
        for (const m of userMembershipsList) {
          try {
            await ctx.telegram.unbanChatMember(m.chatId, Number(targetUserId), { only_if_banned: true });
          } catch (e) {}
        }

        await addLog({
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          type: 'WHITELIST',
          user: `ID ${targetUserId}`,
          chat: 'MultiChat',
          details: 'Пользователь добавлен в белый список.'
        });

        await ctx.answerCbQuery('✅ Пользователь добавлен в белый список!');

        const currentText = (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message) ? ctx.callbackQuery.message.text : '';
        const adminTag = username ? `@${username}` : (ctx.from.first_name || 'Админ');
        const updatedText = `${currentText}\n\n✅ *СТАТУС:* Добавлен в белый список (${adminTag}).`;

        try {
          await ctx.editMessageText(updatedText, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '🚫 Заблокировать', callback_data: `mc_ban_${targetUserId}` },
                { text: '✅ В белом списке', callback_data: `mc_info_wl_${targetUserId}` }
              ]]
            }
          });
        } catch (e) {
          try {
            await ctx.editMessageReplyMarkup({
              inline_keyboard: [[
                { text: '🚫 Заблокировать', callback_data: `mc_ban_${targetUserId}` },
                { text: '✅ В белом списке', callback_data: `mc_info_wl_${targetUserId}` }
              ]]
            });
          } catch (err) {}
        }
        return;
      }

      if (data.startsWith('mc_info_')) {
        return ctx.answerCbQuery('Текущий статус пользователя уже применен.');
      }

      if (data.startsWith('chat_ban_')) {
        const parts = data.split('_');
        const cId = parts[2];
        const uId = parts[3];

        if (cId && uId) {
          try {
            await ctx.telegram.banChatMember(cId, Number(uId));
            await ctx.answerCbQuery('✅ Пользователь заблокирован в этом чате!');
            
            const newChatBan = {
              id: `${cId}_${uId}_${Date.now()}`,
              userId: uId,
              chatId: cId,
              chatTitle: chats.find(c => String(c.id) === String(cId))?.title || cId,
              reason: 'Анти-мошенник (подозрительное сообщение)',
              type: 'BAN',
              untilDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
              createdAt: new Date().toISOString()
            };
            chatBans.push(newChatBan);
            queueWrite('chat_bans', newChatBan.id, cleanData(newChatBan));

            try {
              const currentText = (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message) ? ctx.callbackQuery.message.text : '';
              await ctx.editMessageText(`${currentText}\n\n🚫 <b>СТАТУС:</b> Заблокирован в чате администратором.`, {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[
                    { text: '⛔️ Глобальный бан во всех чатах', callback_data: `mc_ban_${uId}` },
                    { text: '👤 Профиль', url: `tg://user?id=${uId}` }
                  ]]
                }
              });
            } catch (e) {}
          } catch (err: any) {
            await ctx.answerCbQuery(`❌ Ошибка бана: ${err.message || err}`, { show_alert: true });
          }
        }
        return;
      }

      if (data.startsWith('del_msg_')) {
        const parts = data.split('_');
        const cId = parts[2];
        const mId = Number(parts[3]);

        if (cId && mId) {
          try {
            await ctx.telegram.deleteMessage(cId, mId);
            await ctx.answerCbQuery('✅ Сообщение удалено из чата!');
            try {
              const currentText = (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message) ? ctx.callbackQuery.message.text : '';
              await ctx.editMessageText(`${currentText}\n\n🗑 <b>СТАТУС:</b> Сообщение удалено из чата.`, {
                parse_mode: 'HTML'
              });
            } catch (e) {}
          } catch (err: any) {
            await ctx.answerCbQuery(`⚠️ Не удалось удалить: ${err.message || 'возможно, уже удалено'}`, { show_alert: true });
          }
        }
        return;
      }

      if (data === 'test_alert_ack') {
        await ctx.answerCbQuery('✅ Тест подтвержден! Система оповещений работает в штатном режиме.', { show_alert: true });
        return;
      }

      const adminUsername = (settings.adminTelegramUsername || 'bookray').toLowerCase();
      if (!username || username.toLowerCase() !== adminUsername) return ctx.answerCbQuery('У вас нет прав.');

      const session = broadcastSessions.get(userId);
      if (!session && data.startsWith('bc_')) {
        return ctx.answerCbQuery('Сессия рассылки не найдена.');
      }

      if (data === 'bc_cancel') {
        broadcastSessions.delete(userId);
        await ctx.editMessageText('❌ Рассылка отменена.');
        return ctx.answerCbQuery();
      }

      if (data === 'bc_options') {
        session!.options.waitingForUnpinDaysInput = false;
        return ctx.editMessageText(renderBroadcastOptionsText(session!.options), {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: renderBroadcastOptionsKeyboard(session!.options)
          }
        });
      }

      if (data === 'bc_opt_unpin_menu') {
        session!.options.waitingForUnpinDaysInput = false;
        return ctx.editMessageText(renderBroadcastUnpinMenuText(session!.options), {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: renderBroadcastUnpinMenuKeyboard(session!.options)
          }
        });
      }

      if (data.startsWith('bc_unpin_set_')) {
        const days = parseInt(data.replace('bc_unpin_set_', ''), 10);
        session!.options.unpinDays = isNaN(days) ? 0 : Math.max(0, days);
        if (session!.options.unpinDays > 0) {
          session!.options.pin = true;
        }
        session!.options.waitingForUnpinDaysInput = false;
        broadcastSessions.set(userId, session!);
        const label = session!.options.unpinDays === 0 ? 'Бессрочно' : `${session!.options.unpinDays} ${getDaysPlural(session!.options.unpinDays)}`;
        await ctx.answerCbQuery(`Выбрано: ${label}`);
        return ctx.editMessageText(renderBroadcastOptionsText(session!.options), {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: renderBroadcastOptionsKeyboard(session!.options)
          }
        });
      }

      if (data === 'bc_unpin_custom') {
        session!.options.waitingForUnpinDaysInput = true;
        broadcastSessions.set(userId, session!);
        await ctx.editMessageText(
          `✏️ <b>Введите количество дней до открепления поста:</b>\n\n` +
          `Отправьте в ответ сообщением число дней (например: <code>1</code>, <code>4</code>, <code>10</code>, <code>60</code>) или <code>0</code> для бессрочного закрепления.\n\n` +
          `<i>По истечении указанного срока бот автоматически открепит пост во всех чатах.</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Отмена', callback_data: 'bc_options' }]
              ]
            }
          }
        );
        return ctx.answerCbQuery();
      }

      if (data === 'bc_select_chats') {
        const activeChats = chats.filter(c => c.active);
        const selected = session!.options.selectedChats;
        
        const keyboard = activeChats.map(chat => {
          const isSelected = selected.includes(String(chat.id));
          return [{ 
            text: `${isSelected ? '✅' : '❌'} ${chat.title}`, 
            callback_data: `bc_toggle_${chat.id}` 
          }];
        });

        keyboard.push([
          { text: '✅ Все', callback_data: 'bc_sel_all' },
          { text: '❌ Ни одного', callback_data: 'bc_sel_none' }
        ]);
        keyboard.push([{ text: '⬅️ Назад', callback_data: 'bc_back' }]);

        return ctx.editMessageText(`👥 Выберите чаты для рассылки (${selected.length}/${activeChats.length}):`, {
          reply_markup: { inline_keyboard: keyboard }
        });
      }

      if (data === 'bc_sel_all') {
        session!.options.selectedChats = chats.filter(c => c.active).map(c => String(c.id));
        broadcastSessions.set(userId, session!);
        return ctx.editMessageReplyMarkup({
          inline_keyboard: [
            ...chats.filter(c => c.active).map(chat => [{ 
              text: `✅ ${chat.title}`, 
              callback_data: `bc_toggle_${chat.id}` 
            }]),
            [{ text: '✅ Все', callback_data: 'bc_sel_all' }, { text: '❌ Ни одного', callback_data: 'bc_sel_none' }],
            [{ text: '⬅️ Назад', callback_data: 'bc_back' }]
          ]
        });
      }

      if (data === 'bc_sel_none') {
        session!.options.selectedChats = [];
        broadcastSessions.set(userId, session!);
        return ctx.editMessageReplyMarkup({
          inline_keyboard: [
            ...chats.filter(c => c.active).map(chat => [{ 
              text: `❌ ${chat.title}`, 
              callback_data: `bc_toggle_${chat.id}` 
            }]),
            [{ text: '✅ Все', callback_data: 'bc_sel_all' }, { text: '❌ Ни одного', callback_data: 'bc_sel_none' }],
            [{ text: '⬅️ Назад', callback_data: 'bc_back' }]
          ]
        });
      }

      if (data.startsWith('bc_toggle_')) {
        const chatId = data.replace('bc_toggle_', '');
        const selected = session!.options.selectedChats;
        if (selected.includes(chatId)) {
          session!.options.selectedChats = selected.filter(id => id !== chatId);
        } else {
          session!.options.selectedChats.push(chatId);
        }
        broadcastSessions.set(userId, session!);
        
        const activeChats = chats.filter(c => c.active);
        const keyboard = activeChats.map(chat => {
          const isSelected = session!.options.selectedChats.includes(String(chat.id));
          return [{ 
            text: `${isSelected ? '✅' : '❌'} ${chat.title}`, 
            callback_data: `bc_toggle_${chat.id}` 
          }];
        });
        keyboard.push([
          { text: '✅ Все', callback_data: 'bc_sel_all' },
          { text: '❌ Ни одного', callback_data: 'bc_sel_none' }
        ]);
        keyboard.push([{ text: '⬅️ Назад', callback_data: 'bc_back' }]);

        return ctx.editMessageText(`👥 Выберите чаты для рассылки (${session!.options.selectedChats.length}/${activeChats.length}):`, {
          reply_markup: { inline_keyboard: keyboard }
        });
      }

      if (data === 'bc_back') {
        const msgCount = session?.messages?.length || 1;
        const label = msgCount > 1
          ? `📢 Вы прислали альбом из ${msgCount} медиафайлов для рассылки. Выберите действие:`
          : '📢 Вы прислали сообщение для рассылки. Выберите действие:';
        return ctx.editMessageText(label, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Начать рассылку', callback_data: 'bc_start' }],
              [{ text: '👥 Выбор чатов', callback_data: 'bc_select_chats' }],
              [{ text: '⚙️ Настройки', callback_data: 'bc_options' }],
              [{ text: '❌ Отмена', callback_data: 'bc_cancel' }]
            ]
          }
        });
      }

      if (data.startsWith('bc_opt_')) {
        if (data === 'bc_opt_pin') session!.options.pin = !session!.options.pin;
        if (data === 'bc_opt_silent') session!.options.silent = !session!.options.silent;
        if (data === 'bc_opt_delay') {
          const delays = [10, 60, 120, 300];
          const currentIndex = delays.indexOf(session!.options.delay);
          session!.options.delay = delays[(currentIndex + 1) % delays.length];
        }
        broadcastSessions.set(userId, session!);
        return ctx.editMessageText(renderBroadcastOptionsText(session!.options), {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: renderBroadcastOptionsKeyboard(session!.options)
          }
        });
      }

      if (data === 'bc_start') {
        const targetChatIds = session!.options.selectedChats;
        const targetChats = Array.from(new Map(chats.filter(c => targetChatIds.includes(String(c.id))).map(c => [String(c.id), c])).values());
        
        if (targetChats.length === 0) {
          return ctx.answerCbQuery('Не выбрано ни одного чата для рассылки.');
        }

        await ctx.editMessageText(`🚀 Начинаю рассылку в ${targetChats.length} чатов...`);
        
        const { pin, unpinDays = 0, delay, silent } = session!.options;
        const messages = session!.messages || (session!.message ? [session!.message] : []);
        const primaryMessage = messages[0] || session!.message;
        const historyEntryId = Math.random().toString(36).substr(2, 9);
        
        broadcastSessions.delete(userId);

        // Run broadcast in background
        (async () => {
          let success = 0;
          let failed = 0;
          const currentBroadcastMessages: { chatId: string, messageId: number }[] = [];
          const reportLinks: string[] = [];
          const messageIds: { chatId: string, messageId: number }[] = [];

          for (const chat of targetChats) {
            try {
              let sentMsgIds: number[] = [];

              if (messages.length === 1) {
                const sentMsg = await ctx.telegram.copyMessage(chat.id, ctx.chat!.id, messages[0].message_id, {
                  disable_notification: silent
                });
                sentMsgIds = [sentMsg.message_id];
              } else if (messages.length > 1) {
                const msgIds = messages.map((m: any) => m.message_id);
                try {
                  const res: any = await ctx.telegram.callApi('copyMessages', {
                    chat_id: chat.id,
                    from_chat_id: ctx.chat!.id,
                    message_ids: msgIds,
                    disable_notification: silent
                  });
                  const resArray = Array.isArray(res) ? res : [res];
                  sentMsgIds = resArray.map((item: any) => typeof item === 'number' ? item : (item.message_id || item));
                } catch (copyErr) {
                  console.warn('copyMessages API failed, falling back to sequential copyMessage:', copyErr);
                  for (const m of messages) {
                    const s = await ctx.telegram.copyMessage(chat.id, ctx.chat!.id, m.message_id, { disable_notification: silent });
                    sentMsgIds.push(s.message_id);
                  }
                }
              }

              for (const mId of sentMsgIds) {
                currentBroadcastMessages.push({ chatId: chat.id, messageId: mId });
                messageIds.push({ chatId: String(chat.id), messageId: mId });
              }

              const mainMsgId = sentMsgIds[0];

              // Generate link
              let link = '';
              if (mainMsgId) {
                if (chat.id.toString().startsWith('-100')) {
                  const cleanId = chat.id.toString().replace('-100', '');
                  link = `https://t.me/c/${cleanId}/${mainMsgId}`;
                } else {
                  try {
                    const chatInfo = await ctx.telegram.getChat(chat.id);
                    if ('username' in chatInfo && chatInfo.username) {
                      link = `https://t.me/${chatInfo.username}/${mainMsgId}`;
                    }
                  } catch (e) {}
                }
              }
              
              if (link) {
                reportLinks.push(`${chat.title}: ${link}`);
              } else {
                reportLinks.push(`${chat.title}: (ссылка недоступна)`);
              }

              if (pin && mainMsgId) {
                try {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  console.log(`[Pin Bot] Attempting to pin in ${chat.id}`);
                  await ctx.telegram.pinChatMessage(chat.id, mainMsgId, { disable_notification: false });
                  console.log(`[Pin Bot] Successfully pinned in ${chat.id}`);
                  await recordPinnedMessage(chat.id, primaryMessage || { message_id: mainMsgId, date: Math.floor(Date.now() / 1000) }, false);

                  // Schedule auto-unpin if unpinDays > 0
                  if (unpinDays > 0) {
                    const unpinAt = new Date(Date.now() + unpinDays * 24 * 60 * 60 * 1000).toISOString();
                    scheduledUnpins.push({
                      id: Math.random().toString(36).substr(2, 9),
                      chatId: String(chat.id),
                      messageId: mainMsgId,
                      unpinAt: unpinAt,
                      broadcastId: historyEntryId,
                      createdAt: new Date().toISOString()
                    });
                    console.log(`[ScheduledUnpin] Registered unpin for msg ${mainMsgId} in ${chat.id} at ${unpinAt} (${unpinDays} days)`);
                  }
                } catch (e) {
                  console.error(`[Pin Bot] Failed to pin in ${chat.id}:`, (e as any).message || e);
                }
              }
              
              success++;
              if (delay > 0 && success < targetChats.length) await new Promise(r => setTimeout(r, delay * 1000));
            } catch (e) {
              console.error(`Failed to send broadcast to ${chat.id}:`, e);
              failed++;
            }
          }

          if (unpinDays > 0 && scheduledUnpins.length > 0) {
            await db.collection('config').doc('unpins').set({ items: scheduledUnpins }).catch(e => console.error('Failed to save unpins to db:', e));
          }

          let textSummary = 'Media message';
          if (primaryMessage) {
            if ('text' in primaryMessage && primaryMessage.text) textSummary = primaryMessage.text;
            else if ('caption' in primaryMessage && primaryMessage.caption) textSummary = primaryMessage.caption;
          }
          if (messages.length > 1) {
            textSummary = `[Альбом из ${messages.length} медиа] ${textSummary}`;
          }

          // Save to history
          const historyEntry = {
            id: historyEntryId,
            userId: userId,
            username: username || userId,
            text: textSummary,
            timestamp: new Date().toISOString(),
            chatIds: targetChats.map(c => String(c.id)),
            messageIds: messageIds,
            pin: pin,
            unpinDays: unpinDays,
            pinTime: unpinDays * 24,
            source: 'BOT'
          };
          broadcastHistory.unshift(historyEntry);
          if (broadcastHistory.length > 100) broadcastHistory.pop();
          await db.collection('broadcast_history').doc(historyEntry.id).set(cleanData(historyEntry));

          // Update lastBroadcastMessages for deletion feature
          lastBroadcastMessages = currentBroadcastMessages;

          let reportText = `✅ Рассылка завершена!\n\nУспешно: ${success}\nОшибок: ${failed}`;
          if (pin) {
            const unpinNote = unpinDays > 0 ? `${unpinDays} ${getDaysPlural(unpinDays)}` : 'бессрочно';
            reportText += `\n📌 Закреп: Включен (открепление: ${unpinNote})`;
          }
          reportText += `\n\n🔗 Ссылки:\n${reportLinks.join('\n')}`;
          
          // If report is too long, split it
          if (reportText.length > 4000) {
             let shortReport = `✅ Рассылка завершена!\n\nУспешно: ${success}\nОшибок: ${failed}`;
             if (pin) {
               const unpinNote = unpinDays > 0 ? `${unpinDays} ${getDaysPlural(unpinDays)}` : 'бессрочно';
               shortReport += `\n📌 Закреп: Включен (открепление: ${unpinNote})`;
             }
             await ctx.telegram.sendMessage(ctx.chat!.id, shortReport);
             // Send links in chunks
             for (let i = 0; i < reportLinks.length; i += 20) {
               await ctx.telegram.sendMessage(ctx.chat!.id, reportLinks.slice(i, i + 20).join('\n'));
             }
          } else {
             await ctx.telegram.sendMessage(ctx.chat!.id, reportText, { link_preview_options: { is_disabled: true } });
          }
          
          await addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'SYSTEM',
            user: 'Bot (Admin)',
            chat: 'Broadcast',
            details: `Рассылка завершена. Успешно: ${success}, Ошибок: ${failed}${pin ? ` (Закреп: ${unpinDays > 0 ? `${unpinDays} дн.` : 'бессрочно'})` : ''}`
          });
        })();
        
        return ctx.answerCbQuery();
      }
    });

    // Handle Message Reactions (Reputation +/-)
    bot.on('message_reaction', async (ctx) => {
      try {
        if (filters.reputationEnabled === false) return;
        const mr = (ctx.update as any).message_reaction;
        if (!mr) return;

        const chatId = String(mr.chat?.id);
        const msgId = mr.message_id;
        const reactor = mr.user;
        if (!reactor || reactor.is_bot) return;

        let cachedAuthor = messageAuthorCache.get(`${chatId}_${msgId}`);
        if (!cachedAuthor) {
          // Fallback to chatMessages in memory
          const cm = chatMessages.find(m => String(m.chatId) === chatId && Number(m.messageId) === Number(msgId));
          if (cm) {
            cachedAuthor = {
              userId: cm.userId,
              username: cm.username,
              firstName: cm.firstName,
              lastName: cm.lastName
            };
            messageAuthorCache.set(`${chatId}_${msgId}`, cachedAuthor);
          } else {
            // Fallback to Firestore chat_messages
            try {
              const doc = await db.collection('chat_messages').doc(`${chatId}_${msgId}`).get();
              if (doc.exists) {
                const data = doc.data()!;
                cachedAuthor = {
                  userId: String(data.userId),
                  username: data.username,
                  firstName: data.firstName,
                  lastName: data.lastName
                };
                messageAuthorCache.set(`${chatId}_${msgId}`, cachedAuthor);
              }
            } catch (e) {}
          }
        }

        if (!cachedAuthor) return;
        if (String(reactor.id) === String(cachedAuthor.userId)) return; // Cannot react to own message

        const oldEmojis = (mr.old_reaction || []).map((r: any) => r.emoji || '');
        const newEmojis = (mr.new_reaction || []).map((r: any) => r.emoji || '');

        const chat = chats.find(c => c.id === chatId);
        const chatTitle = chat ? chat.title : chatId;

        const positiveSet = ['👍', '❤️', '🔥', '👏', '🎉', '🥰', '⚡️'];
        const negativeSet = ['👎', '🤡', '💩', '🤮'];

        const hasNewPositive = newEmojis.some((e: string) => positiveSet.includes(e));
        const hadOldPositive = oldEmojis.some((e: string) => positiveSet.includes(e));
        const hasNewNegative = newEmojis.some((e: string) => negativeSet.includes(e));
        const hadOldNegative = oldEmojis.some((e: string) => negativeSet.includes(e));

        let delta = 0;
        let reason = '';

        if (hasNewPositive && !hadOldPositive) {
          delta += 1;
          reason = 'Реакция 👍/❤️ на сообщение';
        } else if (!hasNewPositive && hadOldPositive) {
          delta -= 1;
          reason = 'Снятие реакции 👍/❤️';
        }

        if (hasNewNegative && !hadOldNegative) {
          delta -= 1;
          reason = 'Реакция 👎/🤡 на сообщение';
        } else if (!hasNewNegative && hadOldNegative) {
          delta += 1;
          reason = 'Снятие реакции 👎/🤡';
        }

        if (delta !== 0) {
          await adjustUserReputation(
            cachedAuthor.userId,
            delta,
            reason,
            String(reactor.id),
            reactor.first_name || reactor.username || 'Пользователь',
            chatId,
            chatTitle
          );
          console.log(`Reputation adjusted by ${delta} for user ${cachedAuthor.userId} via reaction (${reason})`);
        }
      } catch (err) {
        console.error('Error in message_reaction handler:', err);
      }
    });

    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL;
    const isDevelopmentPreview = process.env.NODE_ENV !== 'production' || !!process.env.APPLET_ID;
    const useWebhooks = process.env.USE_WEBHOOKS === 'true' && !!cfWorkerUrl && !settings.disableCloudflare;

    if (useWebhooks && cfWorkerUrl) {
      try {
        const cleanWorkerUrl = cfWorkerUrl.replace(/\/$/, "");
        const targetUrl = detectedAppUrl || appUrl;
        const targetWebhookUrl = targetUrl 
          ? `${cleanWorkerUrl}/webhook?target=${encodeURIComponent(targetUrl.replace(/\/$/, "") + "/telegram")}`
          : cleanWorkerUrl;
        
        console.log(`Setting Telegram webhook via Cloudflare Worker target: ${targetWebhookUrl}`);
        await bot.telegram.setWebhook(targetWebhookUrl, {
          allowed_updates: ['message', 'edited_message', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request', 'message_reaction']
        });
        isPollingMode = false;
        console.log(`Telegram bot webhook successfully configured via Cloudflare Worker at: ${cleanWorkerUrl}`);
      } catch (err: any) {
        console.error('Failed to set webhook on Telegram:', err?.message || err);
      }
    } else {
      try {
        console.log('Starting Telegram bot in Long Polling mode (reliable)...');
        isPollingMode = true;
        // Delete any existing webhook so Telegram immediately delivers all updates to getUpdates polling
        try {
          await bot.telegram.deleteWebhook({ drop_pending_updates: false });
          console.log('Cleared Telegram webhook: active in Long Polling mode');
        } catch (delErr: any) {
          console.warn('Note on clearing webhook:', delErr?.message || delErr);
        }
        
        isBotPollingActive = true;
        console.log('Telegram bot launched in Long Polling mode');

        bot.launch({
          dropPendingUpdates: false,
          allowedUpdates: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request', 'message_reaction']
        }).then(() => {
          isBotPollingActive = false;
          console.log('Telegram bot polling stopped.');
        }).catch(err => {
          isBotPollingActive = false;
          const isConflict = err && (err.code === 409 || err.response?.error_code === 409 || String(err).includes('409') || String(err).includes('Conflict'));
          if (isConflict) {
            console.warn('⚠️ Конфликт 409: Другой экземпляр бота с таким же токеном опрашивает Telegram API. Повторная попытка через 30 сек...');
          } else {
            console.error('Failed to launch bot via polling:', err?.message || err);
          }
          if (botReconnectTimer) clearTimeout(botReconnectTimer);
          const reconnectDelay = isConflict ? 30000 : 15000;
          botReconnectTimer = setTimeout(() => {
            botReconnectTimer = null;
            if (settings.botToken && !isBotPollingActive && !isInitializingBot) {
              console.log('[BotSupervisor] 🔄 Auto-recovering bot polling connection...');
              initBot(settings.botToken).catch(e => console.error('[BotSupervisor] Recovery error:', e));
            }
          }, reconnectDelay);
        });
      } catch (err: any) {
        isBotPollingActive = false;
        if (err.response && err.response.error_code === 409) {
          console.warn('Telegram bot conflict detected (409).');
        } else {
          throw err;
        }
      }
    }
    return bot;
  } catch (err) {
    console.error('Failed to initialize Telegram bot:', err);
    bot = null;
    return null;
  } finally {
    isInitializingBot = false;
  }
}

// Initial bot launch
syncData().then(() => {
  if (settings.botToken) {
    initBot(settings.botToken);
  }
  if ((settings as any).companionBot?.enabled && (settings as any).companionBot?.botToken) {
    initCompanionBot((settings as any).companionBot);
  }
}).catch(err => {
  console.error('Data sync failed during startup:', err);
});

// Helper to fix invalid URLs for Telegram (e.g. localhost)
function fixUrl(url: string): string {
  if (!url) return '';
  // Telegram doesn't allow localhost URLs
  if (url.includes('localhost')) {
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || '';
    if (appUrl) {
      return url.replace(/https?:\/\/localhost(:\d+)?/, appUrl);
    }
  }
  // Ensure it starts with http or https
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

app.post('/api/broadcast', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const { text: bodyText, message: bodyMessage, chatIds, pin, silent, pinTime, imageUrl, buttons, delay: broadcastDelay } = req.body;
    const rawText = bodyText || bodyMessage || '';
    const text = rawText.replace(/&nbsp;/g, ' ');
    const delay = broadcastDelay || 10;

    if (!Array.isArray(chatIds)) {
      return res.status(400).json({ error: 'chatIds должен быть массивом' });
    }

    // Check advertiser limits
    if (user.role === 'ADVERTISER') {
      const userDoc = await db.collection('users').doc(user.id).get();
      const userData = userDoc.data();
      if (userData) {
        const max = userData.maxMessages || 0;
        const sent = userData.messagesSent || 0;
        if (max > 0 && sent >= max) {
          return res.status(403).json({ error: 'Лимит сообщений исчерпан' });
        }
        
        // Check if trying to send to unassigned chats
        const assigned = userData.assignedChatIds || [];
        const unauthorized = chatIds.filter((id: string) => !assigned.includes(id));
        if (unauthorized.length > 0) {
          return res.status(403).json({ error: 'У вас нет доступа к некоторым выбранным чатам' });
        }

        // Update sent count
        await db.collection('users').doc(user.id).update({
          messagesSent: sent + 1
        });
      }
    }
    
    console.log('Broadcast request params:', { pin, silent, pinTime, delay });
    const isPin = String(pin) === 'true';
    const isSilent = String(silent) === 'true';

    if (!bot) {
      return res.status(500).json({ error: 'Бот не инициализирован' });
    }

    const results: any[] = [];
    const newBroadcastMessages: any[] = [];
    const reportLinks: string[] = [];

    // Send immediate response
    res.json({ success: true, message: `Начинаю рассылку в ${chatIds.length} чатов с задержкой ${delay}с.` });

    // Process in background
    (async () => {
      const messageIds: { chatId: string, messageId: number }[] = [];
      const pinResults: { [chatId: string]: { success: boolean, error?: string } } = {};
      
      for (let i = 0; i < chatIds.length; i++) {
        const chatId = chatIds[i];
        try {
          const extra: any = {
            disable_notification: isSilent
          };

          if (buttons && buttons.length > 0) {
            extra.reply_markup = {
              inline_keyboard: [buttons.map((b: any) => ({ text: b.text, url: fixUrl(b.url) }))]
            };
          }

          let sentMsg;
          if (imageUrl) {
            let photoInput: any = imageUrl;
            if (imageUrl.includes('/uploads/')) {
              const filename = imageUrl.split('/uploads/').pop();
              if (filename) {
                const filePath = path.join(process.cwd(), 'uploads', filename);
                if (fs.existsSync(filePath)) {
                  photoInput = { source: filePath };
                }
              }
            }

            sentMsg = await bot.telegram.sendPhoto(chatId, photoInput, { 
              caption: text, 
              parse_mode: 'HTML',
              ...extra 
            });
          } else {
            sentMsg = await bot.telegram.sendMessage(chatId, text, {
              parse_mode: 'HTML',
              ...extra
            });
          }
          
          // Generate link (for supergroups/channels it's t.me/c/ID/MSG_ID)
          const cleanChatId = String(chatId).replace('-100', '');
          const msgLink = `https://t.me/c/${cleanChatId}/${sentMsg.message_id}`;
          reportLinks.push(msgLink);

          if (isPin) {
            try {
              // Small delay before pinning to ensure message is indexed
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              console.log(`[Pin] Attempting to pin message ${sentMsg.message_id} in chat ${chatId}`);
              // Use both pin flags to see if it helps
              await bot.telegram.pinChatMessage(chatId, sentMsg.message_id, { disable_notification: false });
              console.log(`[Pin] Successfully pinned message ${sentMsg.message_id} in chat ${chatId}`);
              pinResults[chatId] = { success: true };
              await recordPinnedMessage(chatId, sentMsg, false);
              
              // Delayed unpin if pinTime > 0 (hours)
              if (pinTime > 0) {
                const timeoutMs = Number(pinTime) * 60 * 60 * 1000;
                setTimeout(async () => {
                  try {
                    if (bot) await bot.telegram.unpinChatMessage(chatId, sentMsg.message_id);
                    console.log(`[Pin] Auto-unpinned message ${sentMsg.message_id} in ${chatId}`);
                    await recordPinnedMessage(chatId, sentMsg, true);
                  } catch (e) {
                    console.error(`[Pin] Failed to auto-unpin message ${sentMsg.message_id} in ${chatId}:`, e);
                  }
                }, timeoutMs);
              }
            } catch (pinError) {
              const pErr = (pinError as any).message || String(pinError);
              console.error(`[Pin] Failed to pin message in ${chatId}:`, pErr);
              pinResults[chatId] = { success: false, error: pErr };
            }
          }
          
          results.push({ chatId, success: true, messageId: sentMsg.message_id });
          newBroadcastMessages.push({ chatId, messageId: sentMsg.message_id });
          messageIds.push({ chatId: String(chatId), messageId: sentMsg.message_id });
        } catch (e) {
          const errorMessage = (e as Error).message || String(e);
          console.error(`Failed to send broadcast to ${chatId}:`, errorMessage);
          results.push({ chatId, success: false, error: errorMessage });
          
          // If chat is not found, deactivate it
          if (errorMessage.includes('chat not found')) {
            const chat = chats.find(c => String(c.id) === String(chatId));
            if (chat) {
              console.log(`Deactivating chat ${chatId} because it was not found during broadcast.`);
              chat.active = false;
              await updateChat(chat, true);
            }
          }
        }

        // Wait before next message
        if (i < chatIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
      }

      // Save to history
      const historyEntry = {
        id: Math.random().toString(36).substr(2, 9),
        userId: user.id,
        username: user.username,
        text: text,
        timestamp: new Date().toISOString(),
        chatIds: chatIds,
        messageIds: messageIds,
        pin: pin,
        pinResults: pinResults,
        pinTime: pinTime,
        imageUrl: imageUrl,
        buttons: buttons,
        source: 'ADMIN'
      };
      broadcastHistory.unshift(historyEntry);
      if (broadcastHistory.length > 100) broadcastHistory.pop();
      await db.collection('broadcast_history').doc(historyEntry.id).set(cleanData(historyEntry));

      // Replace lastBroadcastMessages with the new batch
      lastBroadcastMessages = newBroadcastMessages;
    await db.collection('config').doc('broadcast').set({ messages: lastBroadcastMessages });
    
    await addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type: 'BROADCAST',
      user: 'Admin',
      chat: `${chatIds.length} чатов`,
      details: `Рассылка завершена в ${chatIds.length} чатов.`
    });

    // Send report to @bookray
    const bookrayChatId = process.env.BOOKRAY_CHAT_ID;
    if (bookrayChatId && bot) {
      const reportText = `📢 *Отчет о рассылке*\n\nОтправлено в ${reportLinks.length} чатов.\n\n${reportLinks.join('\n')}`;
      try {
        await bot.telegram.sendMessage(bookrayChatId, reportText, { parse_mode: 'Markdown' });
      } catch (e) {
        console.error('Failed to send report to @bookray:', e);
      }
    }
  })();
  } catch (err) {
    console.error('Broadcast API error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Ошибка сервера при инициализации рассылки' });
    }
  }
});

app.get('/api/broadcasts', authenticateToken, (req, res) => {
  const user = (req as any).user;
  if (user.role === 'SUPER_ADMIN') {
    res.json(broadcastHistory);
  } else {
    res.json(broadcastHistory.filter(b => b.userId === user.id));
  }
});

app.post('/api/broadcasts/:id/delete', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const entry = broadcastHistory.find(b => b.id === id);
  
  if (!entry) return res.status(404).json({ error: 'Рассылка не найдена' });
  if (user.role !== 'SUPER_ADMIN' && entry.userId !== user.id) {
    return res.status(403).json({ error: 'У вас нет прав для удаления этой рассылки' });
  }

  if (!bot) return res.status(500).json({ error: 'Бот не инициализирован' });

  const results = [];
  const messageIds = entry.messageIds || [];
  
  for (const msg of messageIds) {
    try {
      await bot.telegram.deleteMessage(msg.chatId, msg.messageId);
      results.push({ ...msg, success: true });
    } catch (e) {
      results.push({ ...msg, success: false, error: (e as Error).message });
    }
  }

  broadcastHistory = broadcastHistory.filter(b => b.id !== id);
  await db.collection('broadcast_history').doc(id).delete();
  
  await addLog({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    type: 'BROADCAST',
    user: user.username,
    chat: 'Global',
    details: `Удалена прошедшая рассылка из всех чатов (ID: ${id}).`
  });
  
  res.json({ success: true, results });
});

app.post('/api/broadcasts/:id/unpin', authenticateToken, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const entry = broadcastHistory.find(b => b.id === id);
  
  if (!entry) return res.status(404).json({ error: 'Рассылка не найдена' });
  if (user.role !== 'SUPER_ADMIN' && entry.userId !== user.id) {
    return res.status(403).json({ error: 'У вас нет прав для изменения этой рассылки' });
  }

  if (!bot) return res.status(500).json({ error: 'Бот не инициализирован' });

  const results = [];
  const messageIds = entry.messageIds || [];

  for (const msg of messageIds) {
    try {
      await bot.telegram.unpinChatMessage(msg.chatId, msg.messageId);
      results.push({ ...msg, success: true });
    } catch (e) {
      results.push({ ...msg, success: false, error: (e as Error).message });
    }
  }

  const idx = broadcastHistory.findIndex(b => b.id === id);
  if (idx !== -1) {
    broadcastHistory[idx].pin = false;
    await db.collection('broadcast_history').doc(id).update({ pin: false });
  }
  
  await addLog({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    type: 'BROADCAST',
    user: user.username,
    chat: 'Global',
    details: `Откреплена прошедшая рассылка во всех чатах (ID: ${id}).`
  });
  
  res.json({ success: true, results });
});

app.post('/api/broadcast/delete', authenticateToken, async (req, res) => {
  if (!bot) {
    return res.status(500).json({ error: 'Bot not initialized' });
  }

  const results = [];
  for (const item of lastBroadcastMessages) {
    try {
      await bot.telegram.deleteMessage(item.chatId, item.messageId);
      results.push({ chatId: item.chatId, success: true });
    } catch (e) {
      console.error(`Failed to delete broadcast from ${item.chatId}:`, e);
      results.push({ chatId: item.chatId, success: false, error: String(e) });
    }
  }

  lastBroadcastMessages = [];
  await db.collection('config').doc('broadcast').set({ messages: [] });
  
  await addLog({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    type: 'SYSTEM',
    user: 'Admin',
    chat: 'Global',
    details: 'Последняя рассылка удалена из всех чатов.'
  });

  res.json({ success: true, results });
});

// ==========================================
// PUBLIC CHATS STATS & DIGESTS API FOR MOTOTG.RU
// ==========================================

// Global CORS & preflight middleware for all public endpoints (allowing remote static site on mototg.ru to connect)
app.use('/api/public', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

let publicStatsCache: {
  timestamp: number;
  data: any;
} | null = null;

async function generatePublicChatsStats(forceRefresh = false) {
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  
  // Return cached result if fresh and not forced (cache valid for 1 hour for responsive live updates)
  if (!forceRefresh && publicStatsCache && (now - publicStatsCache.timestamp < 3600 * 1000)) {
    return publicStatsCache.data;
  }

  const twentyFourHoursAgo = now - ONE_DAY_MS;
  const todayDateStr = getProjectDate().dateStr;
  const yesterdayDate = getProjectDate(new Date(now - ONE_DAY_MS)).dateStr;

  const todayStats = statsHistory.find(s => s.date === todayDateStr);
  const yesterdayStats = statsHistory.find(s => s.date === yesterdayDate);

  const results: any[] = [];
  let totalMembers = 0;
  let totalMessages24h = 0;

  // Iterate over all 41 catalog items to ensure complete coverage for the website
  for (const catItem of CHATS_CATALOG) {
    const mapping = CHAT_TO_DB_MAPPING[catItem.slug];
    
    // Find matching managed chat in bot's chat array
    const matchedChat = chats.find(c => {
      if (!c) return false;
      const cIdStr = String(c.id);
      if (mapping?.id && cIdStr === mapping.id) return true;
      if (c.username && (c.username.toLowerCase().replace('@', '') === catItem.username.toLowerCase() || mapping?.altUsernames?.includes(c.username.toLowerCase().replace('@', '')))) return true;
      if (c.title && (c.title.toLowerCase().includes(catItem.title.toLowerCase()) || catItem.title.toLowerCase().includes(c.title.toLowerCase()))) return true;
      if (mapping?.altTitles?.some(t => c.title?.toLowerCase().includes(t))) return true;
      return false;
    });

    const targetChatIdStr = matchedChat ? String(matchedChat.id) : (mapping?.id || '');

    // 1. Calculate messages in last 24h from chatMessages and statsHistory
    let messages24h = 0;
    if (targetChatIdStr) {
      const recentMsgs = chatMessages.filter(m => String(m.chatId) === targetChatIdStr && (m.timestamp ? new Date(m.timestamp).getTime() : 0) >= twentyFourHoursAgo);
      if (recentMsgs.length > 0) {
        messages24h = recentMsgs.length;
      } else {
        const todayCount = todayStats?.chatStats?.[targetChatIdStr]?.msgs || 0;
        const yesterdayCount = yesterdayStats?.chatStats?.[targetChatIdStr]?.msgs || 0;
        messages24h = todayCount + Math.round(yesterdayCount * 0.5);
      }
    }

    // 2. Calculate real members count
    let members = matchedChat?.members || 0;
    if ((!members || forceRefresh) && bot && matchedChat?.active && matchedChat?.id) {
      try {
        const count = await bot.telegram.getChatMembersCount(matchedChat.id);
        if (typeof count === 'number') {
          members = count;
          matchedChat.members = count;
        }
      } catch (e) {
        // Ignore API limits/permissions errors
      }
    }

    if (!members) {
      members = catItem.estimatedMembers || 1500;
    }

    totalMembers += members;
    totalMessages24h += messages24h;

    // Requirement: if messages < 10, display "Нет данных"
    const messagesText = messages24h >= 10 ? `${messages24h}` : 'Нет данных';
    const cleanUsername = catItem.username.replace('@', '');

    results.push({
      id: targetChatIdStr || catItem.slug,
      slug: catItem.slug,
      title: catItem.title,
      username: cleanUsername,
      link: catItem.telegramLink,
      members: members,
      messages24h: messages24h,
      messagesText: messagesText,
      active: matchedChat ? matchedChat.active !== false : true
    });
  }

  const payload = {
    success: true,
    updatedAt: new Date().toISOString(),
    nextUpdateAt: new Date(now + 3600 * 1000).toISOString(),
    totalChats: results.length,
    totalMembers: totalMembers,
    totalMessages24h: totalMessages24h,
    chats: results
  };

  publicStatsCache = {
    timestamp: now,
    data: payload
  };

  // Save snapshot to firestore
  try {
    await db.collection('config').doc('public_chats_stats').set({
      timestamp: now,
      data: payload
    });
  } catch (e) {
    console.warn('[PublicStats] Не удалось сохранить кэш в Firestore:', e);
  }

  return payload;
}

// Public API endpoints for website
app.get(['/api/public/chats-stats', '/api/public/chat-stats'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour browser caching

  try {
    const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
    const stats = await generatePublicChatsStats(forceRefresh);
    res.json(stats);
  } catch (error: any) {
    console.error('Public stats error:', error);
    res.status(500).json({ success: false, error: 'Ошибка получения статистики чатов' });
  }
});

// Full Catalog with Metadata and Summaries Status
app.get('/api/public/chats-catalog', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const stats = await generatePublicChatsStats();
    const statsMap = new Map((stats.chats || []).map((c: any) => [c.username?.toLowerCase() || '', c]));

    const catalogWithLiveStats = CHATS_CATALOG.map(chat => {
      const live = statsMap.get(chat.username.toLowerCase()) || {};
      const summaries = getChatSummaries(chat.slug);
      return {
        ...chat,
        liveMembers: (live as any).members || chat.estimatedMembers,
        liveMessages24h: (live as any).messages24h || 0,
        liveMessagesText: (live as any).messagesText || 'Нет данных',
        totalSummariesCount: summaries.length,
        latestSummaryDate: summaries[0]?.date || null,
        pageUrl: `/chats/${chat.slug}.html`
      };
    });

    res.json({
      success: true,
      totalChats: catalogWithLiveStats.length,
      chats: catalogWithLiveStats
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Single Chat Details & Last 30 Daily Summaries
app.get(['/api/public/chat/:slugOrUsername', '/api/public/chat-details'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const rawTarget = req.params.slugOrUsername || (req.query.slug as string) || (req.query.username as string) || (req.query.id as string);
    const target = Array.isArray(rawTarget) ? rawTarget[0] : String(rawTarget || '');
    if (!target) {
      return res.status(400).json({ success: false, error: 'Не указан slug или username чата' });
    }

    const chat = findChatInCatalog(target);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Чат не найден в каталоге' });
    }

    const stats = await generatePublicChatsStats();
    const live = (stats.chats || []).find((c: any) => c.username?.toLowerCase() === chat.username.toLowerCase()) || {};
    const summaries = getChatSummaries(chat.slug);

    res.json({
      success: true,
      chat: {
        ...chat,
        liveMembers: (live as any).members || chat.estimatedMembers,
        liveMessages24h: (live as any).messages24h || 0,
        liveMessagesText: (live as any).messagesText || 'Нет данных',
      },
      summariesCount: summaries.length,
      maxRetentionDays: 30,
      summaries: summaries // Exactly up to 30 items
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Public XML export endpoints for external website cron & integrations
app.get(['/export.xml', '/api/public/export.xml', '/api/export/xml'], (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache

  try {
    const xml = getLatestExportXml({ chats, chatMessages, statsHistory });
    res.send(xml);
  } catch (error: any) {
    console.error('[XmlExport] Error generating XML export:', error);
    res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?><error>${error.message || 'Error generating XML'}</error>`);
  }
});

// XML Export status & metadata
app.get('/api/export/xml/status', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const metadata = getExportMetadata();
  const filePath = path.join(process.cwd(), 'public', 'export.xml');
  const fileExists = fs.existsSync(filePath);
  let fileSize = 0;
  let fileMtime: string | null = null;
  if (fileExists) {
    const stat = fs.statSync(filePath);
    fileSize = stat.size;
    fileMtime = stat.mtime.toISOString();
  }

  res.json({
    success: true,
    totalCatalogChats: CHATS_CATALOG.length,
    activeChatsCount: chats.filter(c => c.active).length,
    ...metadata,
    diskFile: {
      exists: fileExists,
      path: '/export.xml',
      sizeBytes: fileSize,
      sizeKb: (fileSize / 1024).toFixed(1),
      modifiedAt: fileMtime
    },
    exportUrl: '/export.xml',
    apiExportUrl: '/api/public/export.xml'
  });
});

// Manual on-demand XML export trigger
app.post('/api/export/xml/generate', authenticateToken, async (req, res) => {
  try {
    await loadRealDigestsFromDatabase();
    const result = saveXmlExportToFile({ chats, chatMessages, statsHistory });
    res.json({
      success: true,
      message: 'XML файл успешно сгенерирован и сохранён',
      ...result,
      exportUrl: '/export.xml'
    });
  } catch (error: any) {
    console.error('[XmlExport] Error in manual generation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    try {
      await loadRealDigestsFromDatabase();
      saveXmlExportToFile({ chats, chatMessages, statsHistory });
    } catch (genErr) {
      console.warn('[XmlExport] Error generating initial XML export:', genErr);
    }
  });

  // Scheduler background job
  setInterval(async () => {
    const now = new Date();
    const tzOffset = typeof settings.timezoneOffset === 'number' ? settings.timezoneOffset : 3;
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const adjustedNow = new Date(utcMs + (tzOffset * 3600000));
    
    const currentHHmm = now.toISOString().substring(11, 16); // "HH:mm" in UTC
    const localHHmm = `${String(adjustedNow.getHours()).padStart(2, '0')}:${String(adjustedNow.getMinutes()).padStart(2, '0')}`;
    const todayDateStr = adjustedNow.toISOString().split('T')[0];

    // Handle expired votes
    for (const [voteId, vote] of activeVotes.entries()) {
      if (Date.now() > vote.expiresAt) {
        activeVotes.delete(voteId);
        try {
          if (bot) await bot.telegram.deleteMessage(vote.chatId, vote.messageId);
          console.log(`Deleted expired vote message ${vote.messageId} in ${vote.chatId}`);
        } catch (e) {
          console.error(`Failed to delete expired vote message ${vote.messageId} in ${vote.chatId}:`, e);
        }
      }
    }

    // Handle scheduled deletions
    const remainingDeletions = [];
    let deletionsChanged = false;
    for (const item of scheduledDeletions) {
      if (new Date(item.deleteAt) <= now) {
        try {
          if (bot) await bot.telegram.deleteMessage(item.chatId, item.messageId);
          console.log(`Deleted scheduled message ${item.messageId} in ${item.chatId}`);
          deletionsChanged = true;
        } catch (e) {
          console.error(`Failed to delete scheduled message ${item.messageId} in ${item.chatId}:`, e);
          // If message is not found or too old, we still remove it from the list
          deletionsChanged = true;
        }
      } else {
        remainingDeletions.push(item);
      }
    }
    if (deletionsChanged) {
      scheduledDeletions = remainingDeletions;
      await db.collection('config').doc('deletions').set({ items: scheduledDeletions });
    }

    // Handle scheduled unpins (e.g. broadcast messages auto-unpin after N days)
    const remainingUnpins = [];
    let unpinsChanged = false;
    for (const item of scheduledUnpins) {
      if (new Date(item.unpinAt) <= now) {
        try {
          if (bot) {
            await bot.telegram.unpinChatMessage(item.chatId, item.messageId);
            console.log(`[ScheduledUnpin] Auto-unpinned message ${item.messageId} in ${item.chatId} after expiration`);
          }
          unpinsChanged = true;
        } catch (e) {
          console.error(`[ScheduledUnpin] Failed to unpin message ${item.messageId} in ${item.chatId}:`, (e as any).message || e);
          unpinsChanged = true;
        }
      } else {
        remainingUnpins.push(item);
      }
    }
    if (unpinsChanged) {
      scheduledUnpins = remainingUnpins;
      await db.collection('config').doc('unpins').set({ items: scheduledUnpins }).catch(e => console.error('Failed to save unpins:', e));
    }

    // Periodic 48h chat message retention cleanup (prunes messages older than 48 hours)
    cleanupOldChatMessages().catch(e => console.warn('[Cleanup48h] Error:', e?.message));

    // Bot Watchdog: ensure bot instance is active and polling is alive
    if (settings.botToken) {
      if (!bot || !isBotPollingActive) {
        if (!isInitializingBot && !botReconnectTimer) {
          console.log('[BotSupervisor] ⚠️ Bot instance is missing or polling is inactive. Auto-reconnecting...');
          initBot(settings.botToken).catch(e => console.error('[BotSupervisor] Auto-reconnect error:', e?.message));
        }
      } else {
        bot.telegram.getMe().then(me => {
          botInfo = { id: me.id, username: me.username };
        }).catch(err => {
          console.warn('[BotSupervisor] ⚠️ Bot ping getMe failed:', err?.message || err);
          const is401 = String(err).includes('401') || String(err).includes('Unauthorized');
          const is429 = String(err).includes('429') || (err as any)?.response?.error_code === 429;
          if (!is401 && !is429 && !isInitializingBot && !botReconnectTimer) {
            console.log('[BotSupervisor] Attempting soft reconnection...');
            initBot(settings.botToken).catch(e => console.error('[BotSupervisor] Soft reconnection error:', e?.message));
          }
        });
      }
    }

    // Ensure today's stats entry exists in statsHistory
    if (!statsHistory.some(s => s.date === todayDateStr)) {
      const [y, m, d] = todayDateStr.split('-');
      const totalMembers = chats.filter(c => c.active).reduce((acc, c) => acc + (c.members || 0), 0);
      const newTodayPoint = {
        date: todayDateStr,
        name: `${d}.${m}.${y}`,
        joins: 0,
        leaves: 0,
        msgs: 0,
        chatStats: {},
        hourly: {},
        activeUsers: [],
        onlineUsers: [],
        totalMembers: totalMembers
      };
      updateStats(newTodayPoint).catch(() => {});
    }

    // Handle scheduled daily AI digests using sequential queue (with automatic 15-minute retry on transient errors)
    for (const config of digestConfigs) {
      if (!config.enabled) continue;

      const isScheduledMinute = (config.scheduleTime === localHHmm || config.scheduleTime === currentHHmm);
      const isRetryDue = !!config.nextRetryAt && new Date(config.nextRetryAt).getTime() <= now.getTime();

      if (!isScheduledMinute && !isRetryDue) {
        continue;
      }

      // If regular scheduled minute (not a retry), skip if already sent or attempted today
      if (isScheduledMinute && !isRetryDue) {
        if (config.lastAttemptedDate === todayDateStr || (config.lastSentAt && config.lastSentAt.startsWith(todayDateStr))) {
          continue;
        }
      }

      const wasRetry = isRetryDue;
      const attemptNum = wasRetry ? (config.retryCount || 1) : 0;

      // Mark attempt today to prevent double enqueueing in the same minute
      config.lastAttemptedDate = todayDateStr;
      config.nextRetryAt = undefined; // Clear pending flag while in queue
      config.status = 'generating';
      await db.collection('config').doc('digest_configs').set(cleanData({ configs: digestConfigs }));

      console.log(`[AI Digest] 📥 Enqueueing ${wasRetry ? `RETRY #${attemptNum}` : 'scheduled'} daily summary for chat ${config.chatId} (${config.chatTitle}) into sequential queue`);
      const hours = config.hoursBack || 24;

      enqueueDigest({
        id: Math.random().toString(36).substr(2, 9),
        chatId: config.chatId,
        hoursBack: hours,
        customPrompt: config.customPrompt,
        sendImmediately: config.autoSendTelegram !== false,
        targetChatId: config.targetChatId,
        toneStyle: config.toneStyle || 'default',
        isScheduled: true
      }).then(async () => {
        config.lastGeneratedAt = new Date().toISOString();
        config.lastSentAt = new Date().toISOString();
        config.status = 'success';
        config.lastError = undefined;
        config.retryCount = 0;
        config.nextRetryAt = undefined;
        await db.collection('config').doc('digest_configs').set(cleanData({ configs: digestConfigs }));
        console.log(`[AI Digest] ✅ Sequential queue completed ${wasRetry ? 'retry' : 'scheduled'} digest for chat ${config.chatId}`);

        if (wasRetry) {
          addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'DIGEST',
            user: 'AI Summarizer',
            chat: config.chatTitle || config.chatId,
            details: `✅ [Дайджест опубликован после повтора] Успешно сформирован и отправлен (попытка ${attemptNum}) после временной ошибки ИИ.`
          }).catch(() => {});
        }
      }).catch(async (digestErr: any) => {
        if (digestErr?.isSkipped || digestErr?.name === 'DigestSkippedError' || digestErr?.message?.includes('минимум') || digestErr?.message?.includes('волны')) {
          console.log(`[AI Digest] ℹ️ Skipped chat ${config.chatId} (${config.chatTitle || 'chat'}): ${digestErr.message}`);
          config.status = 'idle';
          config.retryCount = 0;
          config.nextRetryAt = undefined;
          await db.collection('config').doc('digest_configs').set(cleanData({ configs: digestConfigs })).catch(() => {});
        } else {
          console.error(`[AI Digest] ❌ Failed scheduled digest in queue for chat ${config.chatId}:`, digestErr);

          const maxRetries = 3;
          const retryMinutes = 15;
          const nextAttempt = (config.retryCount || 0) + 1;

          if (nextAttempt <= maxRetries) {
            config.retryCount = nextAttempt;
            const retryDate = new Date(Date.now() + retryMinutes * 60 * 1000);
            config.nextRetryAt = retryDate.toISOString();
            config.status = 'error';
            config.lastError = digestErr?.message || String(digestErr);

            const { dateObj: retryLocalObj } = getProjectDate(retryDate);
            const retryTimeStr = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(retryLocalObj);

            await db.collection('config').doc('digest_configs').set(cleanData({ configs: digestConfigs })).catch(() => {});

            addLog({
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              type: 'WARN',
              user: 'AI Summarizer',
              chat: config.chatTitle || config.chatId,
              details: `⚠️ [Сбой ИИ: автоповтор через ${retryMinutes} мин] Ошибка при формировании (${digestErr?.message || digestErr}). Попытка ${nextAttempt}/${maxRetries} запланирована на ~${retryTimeStr}.`
            }).catch(() => {});
          } else {
            // Max retries reached
            config.status = 'error';
            config.lastError = digestErr?.message || String(digestErr);
            config.retryCount = 0;
            config.nextRetryAt = undefined;
            await db.collection('config').doc('digest_configs').set(cleanData({ configs: digestConfigs })).catch(() => {});

            addLog({
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              type: 'ERROR',
              user: 'AI Summarizer',
              chat: config.chatTitle || config.chatId,
              details: `❌ [Сбой расписания: все попытки исчерпаны] Не удалось сформировать дайджест после ${maxRetries} повторов (с паузами по ${retryMinutes} мин). Причина: ${digestErr?.message || digestErr}`
            }).catch(() => {});
          }
        }
      });
    }

    for (const task of tasks) {
      if (!task.active) continue;
      if (task.time !== localHHmm && task.time !== currentHHmm) continue;

      const lastRun = task.lastRun ? new Date(task.lastRun) : null;
      const daysSinceLastRun = lastRun ? Math.floor((now.getTime() - lastRun.getTime()) / (1000 * 60 * 60 * 24)) : Infinity;

      if (daysSinceLastRun >= task.intervalDays) {
        console.log(`Running scheduled task: ${task.id}`);
        for (const chatId of task.chatIds) {
          try {
            if (bot) {
              const extra: any = {};
              if (task.buttons && task.buttons.length > 0) {
                extra.reply_markup = {
                  inline_keyboard: [task.buttons.map((b: any) => ({ text: b.text, url: fixUrl(b.url) }))]
                };
              }

              let sentMsg;
              if (task.imageUrl) {
                let photoInput: any = task.imageUrl;
                if (task.imageUrl.includes('/uploads/')) {
                  const filename = task.imageUrl.split('/uploads/').pop();
                  if (filename) {
                    const filePath = path.join(process.cwd(), 'uploads', filename);
                    if (fs.existsSync(filePath)) {
                      photoInput = { source: filePath };
                    }
                  }
                }
                sentMsg = await bot.telegram.sendPhoto(chatId, photoInput, { caption: task.text, ...extra });
              } else {
                const messageText = task.text || task.message || '';
              sentMsg = await bot.telegram.sendMessage(chatId, messageText, extra);
              }

              // Handle pin
              if (task.pin) {
                try {
                  await bot.telegram.pinChatMessage(chatId, sentMsg.message_id);
                  await recordPinnedMessage(chatId, sentMsg, false);
                } catch (pinError) {
                  console.error(`Failed to pin scheduled message in ${chatId}:`, pinError);
                }
              }

              // Handle scheduled deletion
              if (task.deleteAfterDays > 0 || task.deleteAfterHours > 0) {
                const deleteAt = new Date(now.getTime() + (task.deleteAfterDays || 0) * 24 * 60 * 60 * 1000 + (task.deleteAfterHours || 0) * 60 * 60 * 1000);
                scheduledDeletions.push({
                  chatId,
                  messageId: sentMsg.message_id,
                  deleteAt: deleteAt.toISOString()
                });
                await db.collection('config').doc('deletions').set({ items: scheduledDeletions });
              }

              await addLog({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toISOString(),
                type: 'SYSTEM',
                user: 'Bot',
                chat: chats.find(c => c.id === chatId)?.title || chatId,
                details: `Запланированное сообщение отправлено: ${task.text.substring(0, 20)}...`
              });
            }
          } catch (err) {
            console.error(`Failed to send scheduled message to ${chatId}:`, err);
          }
        }
        task.lastRun = now.toISOString();
        await db.collection('tasks').doc(task.id).set(task);
      }
    }

    // Daily public stats snapshot update (runs at midnight 00:00 UTC or if cache is missing)
    if (currentHHmm === '00:00' || !publicStatsCache) {
      try {
        await generatePublicChatsStats(true);
        console.log('[PublicStats] ✅ Суточная статистика чатов успешно обновлена');
      } catch (e) {
        console.warn('[PublicStats] Ошибка автообновления статистики:', e);
      }
    }

    // Nightly automatic XML export generation (runs at 03:30 MSK/local and hourly on minute :05)
    if (localHHmm === '03:30' || currentHHmm === '00:15' || now.getMinutes() === 5) {
      try {
        saveXmlExportToFile({ chats, chatMessages, statsHistory });
      } catch (e: any) {
        console.warn('[XmlExport] Ошибка плановой генерации XML:', e?.message || e);
      }
    }
  }, 60000); // Check every minute
}

startServer().catch(err => {
  console.error('CRITICAL: Failed to start server:', err);
  process.exit(1);
});

// Enable graceful stop
process.once('SIGINT', async () => {
  await flushWrites();
  try {
    if (bot && (bot as any).polling) {
      bot.stop('SIGINT');
    }
  } catch (e) {}
});
process.once('SIGTERM', async () => {
  await flushWrites();
  try {
    if (bot && (bot as any).polling) {
      bot.stop('SIGTERM');
    }
  } catch (e) {}
});

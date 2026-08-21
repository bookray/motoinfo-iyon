import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import fs from 'fs';
import { Telegraf } from 'telegraf';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { GoogleGenAI } from '@google/genai';
import { db } from './database';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'teleguard-secret-key-2026';

let geminiClient: GoogleGenAI | null = null;
let lastGeminiKey: string | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Ключ GEMINI_API_KEY не настроен. Укажите ключ в панели управления (ИИ-Суммаризация -> Настройки ИИ).');
  }
  if (!geminiClient || lastGeminiKey !== apiKey) {
    geminiClient = new GoogleGenAI({ apiKey });
    lastGeminiKey = apiKey;
  }
  return geminiClient;
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
    const model = options?.model || settings?.openRouterModel || 'google/gemini-2.5-flash';
    
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
      })
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
      })
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

  const model = options?.model || settings?.geminiModel || 'gemini-2.5-flash';
  const effectiveBaseUrl = getGeminiEffectiveBaseUrl();

  const executeGemini = async (baseUrl: string | null): Promise<string> => {
    if (baseUrl) {
      const cleanBase = baseUrl.replace(/\/$/, '');
      const url = `${cleanBase}/v1beta/models/${model}:generateContent?key=${geminiKey.trim()}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini Proxy (${cleanBase}) HTTP ${response.status}: ${errText}`);
      }
      const data: any = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini вернул пустой ответ через прокси');
      return text;
    } else {
      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model,
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

  try {
    return await executeGemini(effectiveBaseUrl);
  } catch (err: any) {
    const msg = err?.message || String(err);
    // If direct failed because of region restriction and a Cloudflare worker proxy is available, auto-retry via worker!
    if (!effectiveBaseUrl && (msg.includes('User location is not supported') || msg.includes('FAILED_PRECONDITION'))) {
      const fallbackProxy = (settings?.cfWorkerUrl && !settings.disableCloudflare ? settings.cfWorkerUrl : null) || (settings?.geminiBaseUrl ? settings.geminiBaseUrl : null);
      if (fallbackProxy) {
        console.log(`[Gemini] Direct connection blocked by region. Auto-retrying through detected proxy: ${fallbackProxy}`);
        try {
          return await executeGemini(fallbackProxy);
        } catch (proxyErr: any) {
          console.error(`[Gemini] Fallback proxy attempt also failed:`, proxyErr);
        }
      }
      throw new Error('❌ Ошибка Google Gemini: Геолокация сервера ограничена Google (User location is not supported).\n\n💡 Решение:\n1. Переключитесь на OpenRouter (вкладка ИИ-Суммаризация -> Настройки ИИ) — работает без региональных ограничений.\n2. Или разверните Cloudflare Worker по инструкции и укажите его URL в Настройках.');
    }
    throw err;
  }
}

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

let detectedAppUrl: string | null = null;
let isPollingMode = false;

app.use((req: any, res: any, next: any) => {
  const xForwardedHost = req.headers['x-forwarded-host'];
  const xForwardedProto = req.headers['x-forwarded-proto'] || 'https';
  if ((xForwardedHost || process.env.APP_URL) && !isPollingMode) {
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

      if (bot) {
        // Run webhook registration asynchronously in the background so it doesn't block the HTTP request
        (async () => {
          if (cfWorkerUrl) {
            try {
              const cleanWorkerUrl = cfWorkerUrl.replace(/\/$/, "");
              const targetWebhookUrl = `${cleanWorkerUrl}/webhook?target=${encodeURIComponent(currentUrl + "/telegram")}`;
              console.log(`Re-registering Telegram Webhook with target (background): ${targetWebhookUrl}`);
              await bot.telegram.setWebhook(targetWebhookUrl, {
                allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request']
              });
              console.log(`Telegram bot webhook successfully configured via Cloudflare Worker at: ${cleanWorkerUrl}`);
            } catch (err: any) {
              console.error(`Failed to auto-update webhook with target URL:`, err.message || err);
            }
          } else if (currentUrl.startsWith('https')) {
            // If Cloudflare is disabled but we have a secure public URL, we can set up direct webhooks
            try {
              const token = settings.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
              if (token) {
                const secretPath = `/telegraf-webhook/${token.split(':')[1]}`;
                console.log(`Re-registering direct Telegram Webhook at (background): ${currentUrl}${secretPath}`);
                await bot.telegram.setWebhook(`${currentUrl}${secretPath}`, {
                  allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request']
                });
                console.log(`Telegram bot webhook directly configured at: ${currentUrl}${secretPath}`);
              }
            } catch (err: any) {
              console.error(`Failed to auto-update direct webhook URL:`, err.message || err);
            }
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
    const userSnap = await db.collection('users').where('username', '==', username).get();
    if (userSnap.empty) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const user = userSnap.docs[0].data();
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    
    // Don't send password back
    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
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
  
  console.log(`Calculating multi-chat users. Memberships: ${memberships.length}, Chats: ${chats.length}`);
  
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
        chats: []
      });
    }
    const user = userMap.get(userId);
    const chat = chats.find(c => String(c.id) === String(m.chatId));
    if (chat) {
      // Avoid duplicate chats for the same user
      if (!user.chats.some((c: any) => String(c.id) === String(chat.id))) {
        user.chats.push({ id: chat.id, title: chat.title });
      }
    }
  });

  const multiChatUsersResult = Array.from(userMap.values())
    .filter(u => u.chats.length > 1)
    .map(u => ({
      ...u,
      isWhitelisted: whitelist.some(w => String(w.userId) === String(u.userId) || String(w.id) === String(u.userId)),
      isBanned: bans.some(b => String(b.userId) === String(u.userId) || String(b.id) === String(u.userId))
    }));

  console.log(`Found ${multiChatUsersResult.length} users in multiple chats`);
  res.json(multiChatUsersResult);
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
  
  const todayDate = new Date().toISOString().split('T')[0];
  const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
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

  let filteredStatsHistory = [...statsHistory];
  if (startDate) {
    filteredStatsHistory = filteredStatsHistory.filter(s => s.date >= startDate);
  }
  if (endDate) {
    filteredStatsHistory = filteredStatsHistory.filter(s => s.date <= endDate);
  }

  // If no date range provided, default to last 7 days for the chart
  if (!startDate && !endDate) {
    filteredStatsHistory = filteredStatsHistory.slice(-7);
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

  res.json({
    totalMembers,
    totalMembersTrend,
    totalMessages24h,
    messagesTrend,
    modActions,
    modActionsTrend,
    activeChats: activeChatsCount,
    chartData,
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
          // Telegram API expects a number for userId
          await bot.telegram.banChatMember(chat.id, Number(ban.userId));
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
    
    res.json(ban);
  } catch (err) {
    console.error('Failed to create global ban:', err);
    res.status(500).json({ error: (err as Error).message });
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

app.post('/api/chats', async (req, res) => {
  try {
    const chat = req.body;
    console.log('Adding chat:', chat);
    await updateChat(chat);
    res.json(chat);
  } catch (err) {
    console.error('Failed to add chat:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/chats/:id', async (req, res) => {
  try {
    const chatId = req.params.id;
    console.log('Removing chat:', chatId);
    await db.collection('chats').doc(chatId).delete();
    chats = chats.filter(c => c.id !== chatId);
    res.json({ success: true });
  } catch (err) {
    console.error(`Failed to remove chat ${req.params.id}:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put('/api/chats/:id', async (req, res) => {
  try {
    const updatedChat = req.body;
    console.log(`Updating chat ${req.params.id} (immediate):`, updatedChat);
    await updateChat(updatedChat, true);
    res.json({ success: true });
  } catch (err) {
    console.error(`Failed to update chat ${req.params.id}:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/chats/:id/settings', async (req, res) => {
  try {
    const chatSettings = req.body;
    await db.collection('chats').doc(req.params.id).update({ settings: cleanData(chatSettings) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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

app.post('/api/reputation/:userId/adjust', authenticateToken, async (req, res) => {
  try {
    const { delta, reason, chatId } = req.body;
    const user = (req as any).user;
    const targetUserId = req.params.userId;
    
    const rep = await adjustUserReputation(
      targetUserId,
      Number(delta) || 1,
      reason || 'Корректировка администратором',
      `admin_${user.id}`,
      user.username || 'Admin',
      chatId || 'global',
      chatId ? (chats.find(c => c.id === chatId)?.title || 'Chat') : 'Глобально'
    );

    res.json(rep);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/reputation/:userId/reset', authenticateToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    await db.collection('reputations').doc(targetUserId).delete();
    reputations = reputations.filter(r => String(r.userId) !== String(targetUserId));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
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
    ? (settings?.openRouterModel || 'google/gemini-2.5-flash')
    : (provider === 'custom' ? (settings?.customAiModel || 'gpt-4o-mini') : (settings?.geminiModel || 'gemini-2.5-flash'));

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
      geminiModel: settings?.geminiModel || 'gemini-2.5-flash',
      geminiBaseUrl: settings?.geminiBaseUrl || '',
      geminiUseProxy: settings?.geminiUseProxy !== false,
      geminiProxySource: settings?.geminiProxySource || 'auto',
      openRouterApiKey: settings?.openRouterApiKey ? (settings.openRouterApiKey.slice(0, 8) + '...' + settings.openRouterApiKey.slice(-4)) : '',
      openRouterModel: settings?.openRouterModel || 'google/gemini-2.5-flash',
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
    if (geminiModel !== undefined) updatedAiSettings.geminiModel = geminiModel;
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
      const model = testModel || settings?.geminiModel || 'gemini-2.5-flash';
      
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
          const client = new GoogleGenAI({ apiKey: key.trim() });
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
    if (msg.includes('Access denied by security policy')) {
      hint = 'OpenRouter отклонил запрос политикой безопасности ключа. Решение: 1) В кабинете openrouter.ai/keys создайте ключ без ограничений (Default). 2) Если баланс $0, укажите бесплатную модель (например, google/gemini-2.0-flash-exp:free или meta-llama/llama-3.3-70b-instruct:free). 3) В настройках аккаунта openrouter.ai/settings/privacy проверьте правила доступа.';
    } else if (msg.includes('404') && (msg.includes('Proxy') || msg.includes('description":"Not Found"'))) {
      hint = 'Указанный прокси вернул 404 Not Found. Обратите внимание: Telegram API Proxy (telegram-bot-api) предназначен исключительно для Telegram и не умеет обрабатывать запросы к Google Gemini. Для Gemini используйте Cloudflare Worker или переключитесь на OpenRouter.';
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

    const chat = chats.find(c => String(c.id) === String(configData.chatId));
    const configIndex = digestConfigs.findIndex(c => String(c.chatId) === String(configData.chatId));

    const updatedConfig = {
      chatId: String(configData.chatId),
      chatTitle: chat?.title || configData.chatTitle || `Чат ${configData.chatId}`,
      enabled: !!configData.enabled,
      scheduleTime: configData.scheduleTime || '21:00',
      hoursBack: Number(configData.hoursBack) || 24,
      targetChatId: configData.targetChatId || configData.chatId,
      customPrompt: configData.customPrompt || '',
      autoSendTelegram: configData.autoSendTelegram !== undefined ? !!configData.autoSendTelegram : true,
      lastGeneratedAt: configData.lastGeneratedAt,
      lastSentAt: configData.lastSentAt
    };

    if (configIndex >= 0) {
      digestConfigs[configIndex] = { ...digestConfigs[configIndex], ...updatedConfig };
    } else {
      digestConfigs.push(updatedConfig);
    }

    await db.collection('config').doc('digest_configs').set({ configs: digestConfigs });
    res.json(updatedConfig);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    const { chatId, hoursBack, customPrompt, sendImmediately, targetChatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }

    const digest = await generateChatSummary(
      chatId,
      Number(hoursBack) || 24,
      customPrompt,
      !!sendImmediately,
      targetChatId
    );

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
    const parts = splitTelegramMessage(digest.summary, 4000);
    for (const part of parts) {
      await bot.telegram.sendMessage(destChatId, part, { parse_mode: 'Markdown' });
    }

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
let captchaSessions = new Map<string, { chatId: string, answer: string, timestamp: number }>();
let broadcastSessions = new Map<string, { 
  message: any, 
  messages?: any[],
  options: { pin: boolean, delay: number, silent: boolean, selectedChats: string[] } 
}>();
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
const messageAuthorCache = new Map<string, { userId: string, username?: string, firstName?: string, lastName?: string }>();

async function recordChatMessage(record: {
  id: string;
  chatId: string;
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  text: string;
  timestamp: string;
}) {
  if (!record.text || record.text.trim().length === 0) return;
  chatMessages.unshift(record);
  if (chatMessages.length > 3000) chatMessages.pop();
  queueWrite('chat_messages', record.id, cleanData(record));
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

async function generateChatSummary(
  chatId: string,
  hoursBack = 24,
  customPrompt?: string,
  sendImmediately = false,
  targetChatId?: string
) {
  const chat = chats.find(c => String(c.id) === String(chatId));
  const chatTitle = chat ? chat.title : `Чат ${chatId}`;
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  let msgs = chatMessages.filter(m => String(m.chatId) === String(chatId) && m.timestamp >= cutoffTime);

  if (msgs.length === 0) {
    try {
      const snap = await db.collection('chat_messages').get();
      const allDbMsgs = snap.docs.map(d => d.data());
      msgs = allDbMsgs.filter(m => String(m.chatId) === String(chatId) && m.timestamp >= cutoffTime);
    } catch (e) {
      console.warn('Could not load chat messages from db:', e);
    }
  }

  msgs = msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const uniqueUsers = new Set(msgs.map(m => m.userId || m.username || m.firstName));
  const userCount = uniqueUsers.size;
  const messageCount = msgs.length;

  let formattedChatLog = '';
  if (msgs.length > 0) {
    formattedChatLog = msgs.map(m => {
      const timeStr = new Date(m.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const author = m.firstName ? `${m.firstName}${m.username ? ` (@${m.username})` : ''}` : (m.username ? `@${m.username}` : `User_${m.userId}`);
      return `[${timeStr}] ${author}: ${m.text}`;
    }).join('\n');
  } else {
    formattedChatLog = '(За последние 24 часа активных текстовых сообщений от участников не зафиксировано или бот был недавно подключен)';
  }

  const dateRangeStr = `${new Date(Date.now() - hoursBack * 3600 * 1000).toLocaleDateString('ru-RU')} - ${new Date().toLocaleDateString('ru-RU')}`;

  const promptText = `Ты — умный и доброжелательный ИИ-ассистент модератора Telegram-сообщества.
Твоя цель: составить информативный, легкий для чтения и структурированный суточный дайджест (обзор) тем, обсуждавшихся в чате «${chatTitle}» за последние ${hoursBack} часов.

${customPrompt ? `Специальные пожелания от администратора:\n«${customPrompt}»\n` : ''}

Статистика сообщений:
- Название чата: ${chatTitle}
- Период: ${dateRangeStr} (последние ${hoursBack} ч)
- Обработано сообщений: ${messageCount}
- Активных участников: ${userCount}

Сообщения из чата:
---
${formattedChatLog.slice(0, 30000)}
---

Сформируй суточный дайджест на русском языке со следующей визуальной структурой:

📊 **Суточный дайджест: ${chatTitle}**
📅 За последние ${hoursBack}ч (${new Date().toLocaleDateString('ru-RU')})
💬 Сообщений: ${messageCount} | 👥 Участников: ${userCount}

🔥 **Главные темы и обсуждения**
• [Название темы 1]: Краткая суть обсуждения, выводы участников
• [Название темы 2]: Краткая суть обсуждения...

💡 **Полезные советы и рекомендации**
• (Если обсуждались конкретные локации, решения технических проблем, советы, отзывы)

📣 **Анонсы, встречи и события**
• (Если участники договаривались о поездках, встречах или публиковали объявления)

👥 **Атмосфера дня**
• (Кратко в 1-2 предложениях об общем настроении и активности)

Правила:
- Если сообщений было мало, честно отметь это и пожелай участникам отличного дня.
- Пиши живо, емко, без канцелярита.
- Используй четкий Markdown.`;

  let summaryText = '';
  try {
    summaryText = await generateAIResponse(promptText);
  } catch (aiErr: any) {
    console.error('Failed to generate AI response:', aiErr);
    throw aiErr;
  }

  const digestEntry = {
    id: Math.random().toString(36).substr(2, 9),
    chatId: String(chatId),
    chatTitle,
    summary: summaryText,
    messageCount,
    userCount,
    hoursBack,
    createdAt: new Date().toISOString(),
    sentToTelegram: false,
    targetChatId: targetChatId || chatId
  };

  if (sendImmediately && bot) {
    const destinationChatId = targetChatId || chatId;
    try {
      const parts = splitTelegramMessage(summaryText, 4000);
      for (const part of parts) {
        await bot.telegram.sendMessage(destinationChatId, part, { parse_mode: 'Markdown' });
      }
      digestEntry.sentToTelegram = true;
      (digestEntry as any).sentAt = new Date().toISOString();
      console.log(`Digest ${digestEntry.id} successfully sent to Telegram chat ${destinationChatId}`);
    } catch (sendErr) {
      console.error(`Failed to send digest to Telegram chat ${destinationChatId}:`, sendErr);
    }
  }

  chatDigests.unshift(digestEntry);
  if (chatDigests.length > 200) chatDigests.pop();
  queueWrite('chat_digests', digestEntry.id, cleanData(digestEntry));

  await addLog({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    type: 'SYSTEM',
    user: 'Gemini AI',
    chat: chatTitle,
    details: `Сформирован суточный дайджест (${messageCount} сообщ.)${digestEntry.sentToTelegram ? ' и отправлен в чат' : ''}`
  });

  return digestEntry;
}

let filters = {
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
  reputationEnabled: true
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
  aiProvider: 'gemini' as 'gemini' | 'openrouter' | 'custom',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: 'gemini-2.5-flash',
  geminiBaseUrl: '',
  geminiUseProxy: true,
  geminiProxySource: 'auto' as 'auto' | 'tg_proxy' | 'cf_worker' | 'custom' | 'direct',
  openRouterApiKey: '',
  openRouterModel: 'google/gemini-2.5-flash',
  customAiEndpoint: '',
  customAiApiKey: '',
  customAiModel: 'gpt-4o-mini'
};

// Sync functions
async function syncData() {
  try {
    console.log(`Starting data sync from ${process.env.DB_TYPE || 'database'}...`);
    // Initial load
    const chatsSnap = await db.collection('chats').get();
    chats = chatsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${chats.length} chats`);

    const tasksSnap = await db.collection('tasks').get();
    tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${tasks.length} tasks`);

    const bansSnap = await db.collection('bans').get();
    bans = bansSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${bans.length} bans`);

    const membershipsSnap = await db.collection('memberships').get();
    memberships = membershipsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${memberships.length} memberships`);

    const whitelistSnap = await db.collection('whitelist').get();
    whitelist = whitelistSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${whitelist.length} whitelisted users`);

    const chatBansSnap = await db.collection('chat_bans').get();
    chatBans = chatBansSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${chatBans.length} chat-specific bans`);

    const reputationsSnap = await db.collection('reputations').get();
    reputations = reputationsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${reputations.length} reputation entries`);

    const warningsSnap = await db.collection('warnings').get();
    warnings = warningsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${warnings.length} warning entries`);

    const logsSnap = await db.collection('logs').orderBy('timestamp', 'desc').limit(100).get();
    logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${logs.length} logs`);

    const statsSnap = await db.collection('stats').orderBy('date', 'asc').get();
    statsHistory = statsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${statsHistory.length} stats history entries`);

    const filtersDoc = await db.collection('config').doc('moderation').get();
    if (filtersDoc.exists) {
      filters = { ...filters, ...filtersDoc.data() as any };
      console.log('Loaded moderation filters');
    }

    const settingsDoc = await db.collection('config').doc('settings').get();
    if (settingsDoc.exists) {
      settings = { ...settings, ...settingsDoc.data() as any };
      console.log('Loaded settings');
    }

    const broadcastDoc = await db.collection('config').doc('broadcast').get();
    if (broadcastDoc.exists) {
      lastBroadcastMessages = (broadcastDoc.data() as any).messages || [];
    }

    const broadcastHistorySnap = await db.collection('broadcast_history').orderBy('timestamp', 'desc').limit(100).get();
    broadcastHistory = broadcastHistorySnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${broadcastHistory.length} broadcast history entries`);

    const deletionsDoc = await db.collection('config').doc('deletions').get();
    if (deletionsDoc.exists) {
      scheduledDeletions = (deletionsDoc.data() as any).items || [];
    }

    const digestsSnap = await db.collection('chat_digests').orderBy('createdAt', 'desc').limit(50).get();
    chatDigests = digestsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${chatDigests.length} chat digests`);

    const digestConfigsDoc = await db.collection('config').doc('digest_configs').get();
    if (digestConfigsDoc.exists) {
      digestConfigs = (digestConfigsDoc.data() as any).configs || [];
      console.log(`Loaded ${digestConfigs.length} digest configs`);
    }

    const messagesSnap = await db.collection('chat_messages').orderBy('timestamp', 'desc').limit(500).get();
    chatMessages = messagesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`Loaded ${chatMessages.length} cached chat messages for AI digests`);

    // Create default super admin if no users exist
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

    // Periodically refresh chat info if bot is ready
    setInterval(async () => {
      if (!bot) return;
      console.log('Refreshing chat info...');
      for (const chat of chats) {
        try {
          const chatFull = await bot.telegram.getChat(chat.id);
          const memberCount = await bot.telegram.getChatMembersCount(chat.id);
          let avatarUrl = chat.avatarUrl;
          
          if (chatFull.photo) {
            const fileId = chatFull.photo.small_file_id;
            const fileLink = await bot.telegram.getFileLink(fileId);
            avatarUrl = fileLink.toString();
          }

          const updatedChat = {
            ...chat,
            title: 'title' in chatFull ? chatFull.title : chat.title,
            members: memberCount,
            avatarUrl
          };
          
          if (JSON.stringify(updatedChat) !== JSON.stringify(chat)) {
            await updateChat(updatedChat);
          }
        } catch (e) {
          console.error(`Failed to refresh chat info for ${chat.id}:`, e);
        }
      }
    }, 1000 * 60 * 60); // Every hour

    // Polling for config updates instead of unstable onSnapshot
    const syncConfig = async () => {
      try {
        const [modDoc, setDoc] = await Promise.all([
          db.collection('config').doc('moderation').get(),
          db.collection('config').doc('settings').get()
        ]);

        if (modDoc.exists) {
          filters = { ...filters, ...modDoc.data() as any };
        }

        if (setDoc.exists) {
          const newSettings = setDoc.data() as any;
          const tokenChanged = newSettings.botToken !== settings.botToken;
          const apiRootChanged = newSettings.telegramApiRoot !== settings.telegramApiRoot;
          settings = { ...settings, ...newSettings };
          if (tokenChanged || apiRootChanged) {
            console.log('Bot token or Telegram API Root updated from Firestore (via polling), restarting...');
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

    console.log('Data synced from Firestore successfully with polling enabled');
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

// Helper to update Firestore and local state
async function updateChat(chat: any, immediate = false) {
  try {
    if (!chat.id) throw new Error('Chat ID is required for update');
    const cleaned = cleanData(chat);
    
    const idx = chats.findIndex(c => c.id === chat.id.toString());
    if (idx !== -1) chats[idx] = chat;
    else chats.push(chat);

    if (immediate) {
      console.log(`Saving chat ${chat.id} to Firestore (immediate):`, cleaned);
      await db.collection('chats').doc(chat.id.toString()).set(cleaned);
      chatLastWrite.set(chat.id.toString(), Date.now());
    } else {
      // Only queue write if last write was > 5 minutes ago or it's a new chat
      const lastWrite = chatLastWrite.get(chat.id.toString()) || 0;
      if (Date.now() - lastWrite > 5 * 60 * 1000) {
        queueWrite('chats', chat.id.toString(), cleaned);
        chatLastWrite.set(chat.id.toString(), Date.now());
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
  const todayDate = new Date().toISOString().split('T')[0];
  let today = statsHistory.find(s => s.date === todayDate);
  if (!today) {
    const [y, m, d] = todayDate.split('-');
    today = { 
      date: todayDate, 
      name: `${d}.${m}.${y}`, 
      joins: 0, 
      leaves: 0, 
      msgs: 0, 
      chatStats: {},
      activeUsers: [],
      onlineUsers: []
    };
  }

  if (type === 'joins') today.joins = (today.joins || 0) + amount;
  if (type === 'leaves') today.leaves = (today.leaves || 0) + amount;
  if (type === 'msgs') today.msgs = (today.msgs || 0) + amount;

  if (!today.chatStats) today.chatStats = {};
  if (!today.chatStats[chatId]) {
    today.chatStats[chatId] = { joins: 0, leaves: 0, msgs: 0, activeUsers: [], onlineUsers: [] };
  }
  
  if (type === 'joins') today.chatStats[chatId].joins += amount;
  if (type === 'leaves') today.chatStats[chatId].leaves += amount;
  if (type === 'msgs') today.chatStats[chatId].msgs += amount;

  if (userId) {
    if (type === 'msgs' || type === 'joins') {
      if (!today.activeUsers) today.activeUsers = [];
      if (!today.activeUsers.includes(userId)) today.activeUsers.push(userId);
      
      if (!today.chatStats[chatId].activeUsers) today.chatStats[chatId].activeUsers = [];
      if (!today.chatStats[chatId].activeUsers.includes(userId)) today.chatStats[chatId].activeUsers.push(userId);
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

      // Check for multi-chat join notification
      const userMemberships = memberships.filter(m => m.userId === userId);
      if (filters.notifyMultiChat && userMemberships.length >= filters.multiChatThreshold) {
        const targetChatId = settings.infoChatId || process.env.BOOKRAY_CHAT_ID;
        if (targetChatId && bot) {
          const chatTitles = userMemberships.map(m => {
            const c = chats.find(ch => ch.id === m.chatId);
            return c ? c.title : m.chatId;
          }).join(', ');
          
          const alertMsg = `⚠️ *Внимание!* Пользователь [${user.first_name || userId}](tg://user?id=${userId}) вступил в ${userMemberships.length} чатов.\n\n*Чаты:* ${chatTitles}`;
          const keyboard = {
            inline_keyboard: [[
              { text: '🚫 Блокировать', callback_data: `mc_ban_${userId}` },
              { text: '✅ В белый список', callback_data: `mc_wl_${userId}` }
            ]]
          };
          bot.telegram.sendMessage(targetChatId, alertMsg, { parse_mode: 'Markdown', reply_markup: keyboard }).catch(e => console.error('Failed to send multi-chat alert:', e));
        }
      }
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

      // Count message or just update online status
      if (isMessage) {
        await incrementDailyStats(chatId, 'msgs', 1, userId);
      } else {
        // Just update online status without incrementing msg count
        await incrementDailyStats(chatId, 'msgs', 0, userId); 
      }
    }
  } catch (e) {
    console.error('Failed to save membership:', e);
  }
}

// Initialize Telegram Bot
let bot: Telegraf | null = null;
let botInfo: { id: number; username: string } | null = null;

async function initBot(token: string) {
  if (!token) {
    console.warn('Bot token is empty. Bot functionality is disabled.');
    return null;
  }

  try {
    if (bot) {
      console.log('Stopping existing bot instance...');
      try {
        await bot.stop();
      } catch (err) {
        // Ignored if bot was not running
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    const cfWorkerUrl = settings.disableCloudflare ? null : (settings.cfWorkerUrl || process.env.CF_WORKER_URL);
    const apiRoot = settings.telegramApiRoot || process.env.TELEGRAM_API_ROOT;
    const telegrafOptions: any = {};
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

    bot.catch((err, ctx) => {
      console.error(`Unhandled error while processing ${ctx.updateType}:`, err);
    });
    
    bot.start((ctx) => {
      console.log('Start command received');
      ctx.reply('TeleGuard Admin Bot is active!');
    });
    
    bot.help((ctx) => ctx.reply('Send me a message to see how I can help you manage your chats.'));
    
    bot.on('message', async (ctx) => {
      if (settings.maintenanceMode) return;

      const chatId = ctx.chat.id.toString();
      const chatType = ctx.chat.type;
      const userId = ctx.from.id.toString();
      const username = ctx.from.username;

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
        if (!session) {
          console.log(`Unauthorized private interaction from @${username || 'No Username'} (${userId})`);
          await ctx.reply(`❌ Доступ запрещен.\nВаш Telegram-логин: @${username || '(не установлен)'}\n\nЭтот бот может управляться только администратором, указанным в настройках панели (текущий: @${settings.adminTelegramUsername || 'bookray'}). Если вы являетесь владельцем бота, укажите ваш точный никнейм в настройках панели управления (раздел Настройки).`).catch(e => console.error('Failed to send auth warning:', e));
          return; 
        }
      }

      // Handle Broadcast from Admin
      if (chatType === 'private' && isCurrentAdmin) {
        // If it's a command, handle it normally. 
        if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/')) {
           // allow commands to pass through
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
                      delay: 10,
                      silent: false,
                      selectedChats: chats.filter(c => c.active).map(c => String(c.id))
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
                delay: 10, 
                silent: false, 
                selectedChats: chats.filter(c => c.active).map(c => String(c.id))
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
            try {
              await ctx.telegram.approveChatJoinRequest(session.chatId, ctx.from.id);
              
              // Track membership on captcha success
              await trackMembership(session.chatId, {
                id: ctx.from.id,
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                last_name: ctx.from.last_name
              });

              captchaSessions.delete(userId);
              ctx.reply('✅ Правильно! Ваша заявка одобрена.');
              
              await addLog({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toISOString(),
                type: 'SYSTEM',
                user: ctx.from.first_name,
                chat: 'Private',
                details: `Пользователь прошел каптчу и был одобрен в чат.`
              });
            } catch (e) {
              console.error('Failed to approve after captcha:', e);
              ctx.reply('❌ Ошибка при одобрении заявки. Возможно, срок действия заявки истек.');
            }
          } else {
            ctx.reply('❌ Неверный ответ. Попробуйте еще раз.');
          }
        }
        return;
      }
      
      // Update message count for existing chats
      let chat = chats.find(c => c.id === chatId);
      
      // Automatically add chat if it's a group/supergroup and not in the list
      if (!chat && (chatType === 'group' || chatType === 'supergroup')) {
        // Double check to prevent race condition duplicates
        if (!chats.some(c => c.id === chatId)) {
          console.log(`New chat detected via message: ${chatId}`);
          let memberCount = 0;
          try {
            memberCount = await ctx.telegram.getChatMembersCount(ctx.chat.id);
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
            avatarUrl: `https://picsum.photos/seed/${chatId}/200`,
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

        // Cache message author for reactions
        if (ctx.message && ctx.message.message_id) {
          messageAuthorCache.set(`${chatId}_${ctx.message.message_id}`, {
            userId: String(userId),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name
          });
        }
        
        // Moderation Logic
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

          // Reputation Trigger: Gratitude replies / quotes
          if (filters.reputationEnabled !== false && ctx.message && 'text' in ctx.message) {
            const replyTo = ctx.message.reply_to_message;
            const threadId = (ctx.message as any).message_thread_id;
            
            // Check that this is a genuine user quote/reply, NOT a topic header, channel forward, bot, or service message
            const isAutomaticOrSystem = replyTo && (
              Boolean((replyTo as any).is_automatic_forward) ||
              Boolean((replyTo as any).forum_topic_created) ||
              Boolean((replyTo as any).pinned_message) ||
              Boolean((replyTo as any).sender_chat) ||
              Boolean(threadId && replyTo.message_id === threadId) || // replying to forum topic origin
              Boolean(replyTo.from && [777000, 1087968824, 136817688].includes(replyTo.from.id))
            );

            // The replied message must contain actual user content (text, caption, media)
            const hasRepliedContent = replyTo && Boolean(
              replyTo.text || (replyTo as any).caption || (replyTo as any).photo || 
              (replyTo as any).document || (replyTo as any).video || (replyTo as any).voice || 
              (replyTo as any).audio || (replyTo as any).sticker
            );

            if (replyTo && replyTo.from && !replyTo.from.is_bot && replyTo.from.id !== ctx.from.id && !isAutomaticOrSystem && hasRepliedContent) {
              const textRaw = ctx.message.text.trim();
              const textLower = textRaw.toLowerCase();
              const gratitudeRegex = /(^|\s)(спасибо|спс|благодарю|благодарствую|от души|сяп|спасибки|thx|thanks|thank you)([\s!?.,]|$)/i;
              
              // Only trigger if message is concise (<= 80 chars) and represents gratitude, or is a plus/thumbs up
              const isGratitude = textRaw.length <= 80 && (
                gratitudeRegex.test(textLower) || 
                textRaw === '+' || textRaw === '+1' || textRaw === '👍' || textRaw === '🤝' || textRaw === '❤️' || textRaw === '🔥'
              );

              if (isGratitude) {
                const rep = await adjustUserReputation(
                  String(replyTo.from.id),
                  1,
                  'Благодарность в сообщении',
                  String(ctx.from.id),
                  ctx.from.first_name || ctx.from.username || 'Пользователь',
                  chatId,
                  chat.title
                );

                const targetName = replyTo.from.first_name || (replyTo.from.username ? `@${replyTo.from.username}` : `User ${replyTo.from.id}`);
                const scoreStr = rep.score > 0 ? `+${rep.score}` : `${rep.score}`;

                try {
                  await ctx.reply(
                    `⭐️ *Репутация повышена!*\n` +
                    `[${ctx.from.first_name}](tg://user?id=${ctx.from.id}) поблагодарил(а) [${targetName}](tg://user?id=${replyTo.from.id}) *(+1)*\n` +
                    `📈 Текущая репутация: *${scoreStr}*`,
                    { parse_mode: 'Markdown', reply_parameters: { message_id: ctx.message.message_id } }
                  );
                } catch (e) {
                  console.error('Failed to send reputation gratitude reply:', e);
                }
              }
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
                        `🔊 С пользователя ${targetMention} сняты ограничения.\n👮‍♂️ Модератор: [${adminName}](tg://user?id=${adminId})`,
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
                        `🔇 Пользователь ${targetMention} обеззвучен на *${durationInfo.formatted}*.\n📝 Причина: _${reason}_\n👮‍♂️ Модератор: [${adminName}](tg://user?id=${adminId})`,
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
                        `✅ Пользователь ${targetMention} разблокирован в чате.\n👮‍♂️ Модератор: [${adminName}](tg://user?id=${adminId})`,
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
                        `🚫 Пользователь ${targetMention} заблокирован ${durationInfo ? 'на *' + durationInfo.formatted + '*' : '*навсегда*'}.\n📝 Причина: _${reason}_\n👮‍♂️ Модератор: [${adminName}](tg://user?id=${adminId})`,
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
                      `✅ С пользователя ${targetMention} снято предупреждение.\nТекущее количество: *${remainingActive}/${warnLimit}*\n👮‍♂️ Модератор: [${adminName}](tg://user?id=${adminId})`,
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
                        `🚫 Пользователь ${targetMention} набрал(а) максимум предупреждений (*${activeWarns}/${warnLimit}*) и был(а) *заблокирован(а)*!\n📝 Причина последнего: _${reason}_\n👮‍♂️ Модератор: [${adminName}](tg://user?id=${adminId})`,
                        { parse_mode: 'Markdown' }
                      );
                    } else {
                      await ctx.reply(
                        `⚠️ Пользователю ${targetMention} выдано предупреждение (*${activeWarns}/${warnLimit}*).\n📝 Причина: _${reason}_\n👮‍♂️ Модератор: [${adminName}](tg://user?id=${adminId})`,
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
          } else if (!violation && effectiveFilters.blockForwards && ((ctx.message as any).forward_from || (ctx.message as any).forward_from_chat || (ctx.message as any).forward_date)) {
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

                const waitMsg = await ctx.reply('🤖 Собираю сообщения за 24ч и формирую дайджест с помощью Gemini AI... Пожалуйста, подождите 5-10 секунд.');

                try {
                  const digest = await generateChatSummary(chatId, 24, undefined, false);
                  const parts = splitTelegramMessage(digest.summary, 4000);
                  try {
                    await ctx.telegram.deleteMessage(chatId, waitMsg.message_id);
                  } catch (e) {}

                  for (const part of parts) {
                    await ctx.reply(part, { parse_mode: 'Markdown' });
                  }
                  digest.sentToTelegram = true;
                  (digest as any).sentAt = new Date().toISOString();
                  queueWrite('chat_digests', digest.id, cleanData(digest));
                } catch (err: any) {
                  console.error('Failed to generate summary on command:', err);
                  try {
                    await ctx.telegram.editMessageText(chatId, waitMsg.message_id, undefined, `❌ Ошибка генерации: ${err.message || err}`);
                  } catch (e) {}
                }
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
      const effectiveCaptchaQuestion = chat.captchaQuestion !== undefined ? chat.captchaQuestion : filters.captchaQuestion;

      if (!effectiveAutoApprove) return;

      if (effectiveCaptchaEnabled) {
        try {
          const effectiveCaptchaAnswer = chat.captchaAnswer !== undefined ? chat.captchaAnswer : filters.captchaAnswer;
          
          // Send captcha DM
          await ctx.telegram.sendMessage(ctx.from.id, `Привет! Вы подали заявку на вступление в чат "${chat.title}".\n\nДля подтверждения ответьте на вопрос:\n${effectiveCaptchaQuestion}`);
          captchaSessions.set(userId, { 
            chatId, 
            answer: effectiveCaptchaAnswer, 
            timestamp: Date.now() 
          });
          
          console.log(`Captcha sent to user ${userId} for chat ${chatId}. Expected answer: ${effectiveCaptchaAnswer}`);
          await addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'SYSTEM',
            user: ctx.from.first_name,
            chat: chat.title,
            details: `Отправлена каптча новому участнику: ${effectiveCaptchaQuestion}`
          });
        } catch (e) {
          console.error('Failed to send captcha DM:', e);
          // If DM fails, we might want to approve anyway or notify the admins
          // For now, let's try to approve if DM fails to avoid blocking users
          try {
            await ctx.telegram.approveChatJoinRequest(chatId, Number(userId));
            console.log(`Auto-approved user ${userId} for chat ${chatId} because DM failed`);
            
            // Track membership on auto-approval
            await trackMembership(chatId, {
              id: ctx.from.id,
              username: ctx.from.username,
              first_name: ctx.from.first_name,
              last_name: ctx.from.last_name
            });
          } catch (approveErr) {
            console.error('Failed to approve after DM fail:', approveErr);
          }
        }
      } else {
        try {
          await ctx.telegram.approveChatJoinRequest(chatId, Number(userId));
          console.log(`Auto-approved user ${userId} for chat ${chatId}`);
          
          // Track membership on auto-approval
          await trackMembership(chatId, {
            id: ctx.from.id,
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name
          });

          const todayDate = new Date().toISOString().split('T')[0];
          let today = statsHistory.find(s => s.date === todayDate);
          if (!today) {
            const [y, m, d] = todayDate.split('-');
            today = { 
              date: todayDate, 
              name: `${d}.${m}.${y}`, 
              joins: 0, 
              leaves: 0, 
              msgs: 0, 
              chatStats: {},
              activeUsers: [],
              onlineUsers: []
            };
          }
          today.joins = (today.joins || 0) + 1;
          if (!today.chatStats) today.chatStats = {};
          if (!today.chatStats[chatId]) today.chatStats[chatId] = { joins: 0, leaves: 0, msgs: 0, activeUsers: [], onlineUsers: [] };
          today.chatStats[chatId].joins++;
          
          // Update total members for today
          today.totalMembers = chats.filter(c => c.active).reduce((acc, c) => acc + (c.members || 0), 0);
          today.chatStats[chatId].totalMembers = chat.members;
          
          await updateStats(today);

          await addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'SYSTEM',
            user: ctx.from.first_name,
            chat: chat.title,
            details: 'Автоматическое одобрение участника.'
          });
        } catch (e) {
          console.error('Failed to auto-approve:', e);
        }
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

      if (effectiveMuteNewcomers) {
        for (const member of (ctx.message as any).new_chat_members) {
          if (member.is_bot) continue;
          try {
            console.log(`Muting newcomer ${member.id} in chat ${chatId} for ${effectiveMuteDurationHours}h`);
            const untilDate = Math.floor(Date.now() / 1000) + (effectiveMuteDurationHours * 3600);
            
            await ctx.telegram.restrictChatMember(chatId, member.id, {
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

            const welcomeMsg = effectiveMuteMessage.replace('{hours}', effectiveMuteDurationHours.toString());
            const mention = `[${member.first_name}](tg://user?id=${member.id})`;
            const sentMsg = await ctx.reply(`${mention}, ${welcomeMsg}`, { parse_mode: 'Markdown' });

            // Delete welcome message after 1 minute if it's a mute notification
            setTimeout(async () => {
              try {
                await ctx.telegram.deleteMessage(chatId, sentMsg.message_id);
              } catch (e) {}
            }, 60000);

            await addLog({
              id: Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              type: 'MUTE_INFO',
              user: member.first_name,
              chat: chat.title,
              details: `Новый участник замучен на ${effectiveMuteDurationHours}ч.`
            });
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

      if (new_chat_member.status === 'administrator') {
        const chatExists = chats.find(c => c.id === chatId);
        if (!chatExists) {
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
            title: 'title' in chat ? chat.title : 'Private Chat',
            members: memberCount,
            muteNewcomers: false,
            muteDurationMinutes: 30,
            autoApprove: true,
            msgCount: 0,
            avatarUrl,
            active: false // New chats are deactivated by default
          };
          await updateChat(newChat, true);
          
          await addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'SYSTEM',
            user: 'Bot',
            chat: 'title' in chat ? chat.title : chatId,
            details: 'Бот добавлен в чат как администратор. Чат добавлен в управление (деактивирован).'
          });
          
          console.log(`Added new managed chat: ${'title' in chat ? chat.title : chatId}`);
        }
      } else if (['left', 'kicked', 'member'].includes(new_chat_member.status)) {
        // If bot is no longer admin or left, remove from managed chats
        const chatIndex = chats.findIndex(c => c.id === chatId);
        if (chatIndex !== -1) {
          const removedChat = chats[chatIndex];
          await db.collection('chats').doc(chatId).delete();
          chats.splice(chatIndex, 1);
          
          await addLog({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            type: 'SYSTEM',
            user: 'Bot',
            chat: removedChat.title,
            details: 'Бот лишен прав администратора или удален из чата. Чат удален из управления.'
          });
          
          console.log(`Removed managed chat: ${removedChat.title}`);
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

      if (data.startsWith('mc_ban_')) {
        const targetUserId = data.replace('mc_ban_', '');

        // Add user to global ban list
        const existingBanIndex = bans.findIndex(b => String(b.userId) === String(targetUserId));
        if (existingBanIndex === -1) {
          const newBan = {
            id: targetUserId,
            userId: targetUserId,
            reason: 'Мультичат бан (через кнопку в Telegram)',
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

        // Ban user in all active managed chats
        let bannedInChatsCount = 0;
        const userMembershipsList = memberships.filter(m => String(m.userId) === String(targetUserId));
        for (const m of userMembershipsList) {
          try {
            await ctx.telegram.banChatMember(m.chatId, Number(targetUserId));
            bannedInChatsCount++;
          } catch (e) {
            console.error(`Failed to ban user ${targetUserId} in chat ${m.chatId}:`, e);
          }
        }

        for (const chat of chats.filter(c => c.active)) {
          if (!userMembershipsList.some(m => m.chatId === chat.id)) {
            try {
              await ctx.telegram.banChatMember(chat.id, Number(targetUserId));
              bannedInChatsCount++;
            } catch (e) {}
          }
        }

        await addLog({
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          type: 'BAN',
          user: `ID ${targetUserId}`,
          chat: 'MultiChat',
          details: `Пользователь заблокирован во всех чатах (${bannedInChatsCount}) и добавлен в глобальный бан-лист.`
        });

        await ctx.answerCbQuery('🚫 Пользователь заблокирован во всех чатах!');

        const currentText = (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message) ? ctx.callbackQuery.message.text : '';
        const adminTag = username ? `@${username}` : (ctx.from.first_name || 'Админ');
        const updatedText = `${currentText}\n\n🛑 *СТАТУС:* Заблокирован в бан-листе (${adminTag}).`;

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
        const { pin, delay, silent } = session!.options;
        return ctx.editMessageText(`⚙️ Настройки рассылки:\n\nЗакреп: ${pin ? '✅' : '❌'}\nЗадержка: ${delay} сек.\nБез звука: ${silent ? '✅' : '❌'}`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: `Закреп: ${pin ? 'Выкл' : 'Вкл'}`, callback_data: 'bc_opt_pin' }],
              [{ text: `Без звука: ${silent ? 'Выкл' : 'Вкл'}`, callback_data: 'bc_opt_silent' }],
              [{ text: `Задержка: ${delay} сек.`, callback_data: 'bc_opt_delay' }],
              [{ text: '⬅️ Назад', callback_data: 'bc_back' }]
            ]
          }
        });
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
        return ctx.editMessageText(`⚙️ Настройки рассылки:\n\nЗакреп: ${session!.options.pin ? '✅' : '❌'}\nЗадержка: ${session!.options.delay} сек.\nБез звука: ${session!.options.silent ? '✅' : '❌'}`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: `Закреп: ${session!.options.pin ? 'Выкл' : 'Вкл'}`, callback_data: 'bc_opt_pin' }],
              [{ text: `Без звука: ${session!.options.silent ? 'Выкл' : 'Вкл'}`, callback_data: 'bc_opt_silent' }],
              [{ text: `Задержка: ${session!.options.delay} сек.`, callback_data: 'bc_opt_delay' }],
              [{ text: '⬅️ Назад', callback_data: 'bc_back' }]
            ]
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
        
        const { pin, delay, silent } = session!.options;
        const messages = session!.messages || (session!.message ? [session!.message] : []);
        const primaryMessage = messages[0] || session!.message;
        
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
            id: Math.random().toString(36).substr(2, 9),
            userId: userId,
            username: username || userId,
            text: textSummary,
            timestamp: new Date().toISOString(),
            chatIds: targetChats.map(c => String(c.id)),
            messageIds: messageIds,
            pin: pin,
            source: 'BOT'
          };
          broadcastHistory.unshift(historyEntry);
          if (broadcastHistory.length > 100) broadcastHistory.pop();
          await db.collection('broadcast_history').doc(historyEntry.id).set(cleanData(historyEntry));

          // Update lastBroadcastMessages for deletion feature
          lastBroadcastMessages = currentBroadcastMessages;

          const reportText = `✅ Рассылка завершена!\n\nУспешно: ${success}\nОшибок: ${failed}\n\n🔗 Ссылки:\n${reportLinks.join('\n')}`;
          
          // If report is too long, split it
          if (reportText.length > 4000) {
             await ctx.telegram.sendMessage(ctx.chat!.id, `✅ Рассылка завершена!\n\nУспешно: ${success}\nОшибок: ${failed}`);
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
            details: `Рассылка завершена. Успешно: ${success}, Ошибок: ${failed}`
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

        const cachedAuthor = messageAuthorCache.get(`${chatId}_${msgId}`);
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
    const useWebhooks = !isDevelopmentPreview && (process.env.USE_WEBHOOKS === 'true' || !!cfWorkerUrl || (appUrl && appUrl.startsWith('https')));

    if (useWebhooks && cfWorkerUrl) {
      try {
        const cleanWorkerUrl = cfWorkerUrl.replace(/\/$/, "");
        const targetUrl = detectedAppUrl || appUrl;
        const targetWebhookUrl = targetUrl 
          ? `${cleanWorkerUrl}/webhook?target=${encodeURIComponent(targetUrl.replace(/\/$/, "") + "/telegram")}`
          : cleanWorkerUrl;
        
        console.log(`Setting initial Telegram webhook via Cloudflare Worker target: ${targetWebhookUrl}`);
        await bot.telegram.setWebhook(targetWebhookUrl, {
          allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request', 'message_reaction']
        });
        console.log(`Telegram bot webhook successfully configured via Cloudflare Worker at: ${cleanWorkerUrl}`);
      } catch (err) {
        console.error('Failed to set webhook on Telegram directly (expected due to sandboxed container network limits):', err);
        console.log('Skipping active direct webhook registration. The webhook handler endpoint (/telegram) remains fully active, and if Cloudflare is already configured to route events here, the bot will process updates successfully!');
      }
    } else if (useWebhooks && appUrl && appUrl.startsWith('https')) {
      const secretPath = `/telegraf-webhook/${token.split(':')[1]}`;
      try {
        await bot.telegram.setWebhook(`${appUrl}${secretPath}`, {
          allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request', 'message_reaction']
        });
        console.log(`Telegram bot initialized with direct webhook at ${appUrl}${secretPath}`);
      } catch (err) {
        console.error('Failed to register webhook directly:', err);
        console.log('Skipping active direct webhook registration. Webhook endpoint is registered and ready to receive requests.');
      }
    } else {
      try {
        console.log('Starting Telegram bot in polling mode...');
        isPollingMode = true;
        // Delete webhook first to ensure polling works
        try {
          await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        } catch (delErr) {
          console.warn('Failed to delete webhook for polling mode:', delErr);
        }
        
        bot.launch({
          allowedUpdates: ['message', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request', 'message_reaction']
        }).then(() => {
          console.log('Telegram bot launched successfully using polling');
        }).catch(err => {
          if (err && (err.code === 409 || err.response?.error_code === 409 || String(err).includes('409') || String(err).includes('Conflict'))) {
            console.warn('⚠️ Конфликт 409: Другой экземпляр бота с таким же токеном опрашивает Telegram API (например, на старом сервере или в окне предпросмотра). Для непрерывной работы опустите второй экземпляр.');
          } else {
            console.error('Failed to launch bot via polling:', err);
          }
        });
      } catch (err: any) {
        if (err.response && err.response.error_code === 409) {
          console.warn('Telegram bot conflict detected (409). Polling instance might be already active elsewhere.');
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
  }
}

// Initial bot launch
syncData().then(() => {
  if (settings.botToken) {
    initBot(settings.botToken);
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
              
              // Delayed unpin if pinTime > 0 (hours)
              if (pinTime > 0) {
                const timeoutMs = Number(pinTime) * 60 * 60 * 1000;
                setTimeout(async () => {
                  try {
                    if (bot) await bot.telegram.unpinChatMessage(chatId, sentMsg.message_id);
                    console.log(`[Pin] Auto-unpinned message ${sentMsg.message_id} in ${chatId}`);
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

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Scheduler background job
  setInterval(async () => {
    const now = new Date();
    const currentHHmm = now.toISOString().substring(11, 16); // "HH:mm" in UTC

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

    // Handle scheduled daily AI digests
    const localHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todayDateStr = now.toISOString().split('T')[0];

    for (const config of digestConfigs) {
      if (!config.enabled) continue;
      if (config.scheduleTime === localHHmm || config.scheduleTime === currentHHmm) {
        if (config.lastSentAt && config.lastSentAt.startsWith(todayDateStr)) {
          continue;
        }

        console.log(`[AI Digest] Running scheduled daily summary for chat ${config.chatId} (${config.chatTitle})`);
        try {
          const hours = config.hoursBack || 24;
          await generateChatSummary(
            config.chatId,
            hours,
            config.customPrompt,
            config.autoSendTelegram !== false,
            config.targetChatId
          );

          config.lastGeneratedAt = new Date().toISOString();
          config.lastSentAt = new Date().toISOString();
          await db.collection('config').doc('digest_configs').set({ configs: digestConfigs });
          console.log(`[AI Digest] Successfully completed scheduled digest for chat ${config.chatId}`);
        } catch (digestErr) {
          console.error(`[AI Digest] Failed scheduled digest for chat ${config.chatId}:`, digestErr);
        }
      }
    }

    for (const task of tasks) {
      if (!task.active) continue;
      if (task.time !== currentHHmm) continue;

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
  }, 60000); // Check every minute
}

startServer().catch(err => {
  console.error('CRITICAL: Failed to start server:', err);
  process.exit(1);
});

// Enable graceful stop
process.once('SIGINT', async () => {
  await flushWrites();
  bot?.stop('SIGINT');
});
process.once('SIGTERM', async () => {
  await flushWrites();
  bot?.stop('SIGTERM');
});

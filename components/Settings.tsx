import React, { useState } from 'react';
import { BotSettings, DatabaseType } from '../types';
import { 
  Save, 
  Key, 
  Bot, 
  Database, 
  ShieldCheck, 
  AlertTriangle, 
  Mail, 
  RefreshCw, 
  Network, 
  Send, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Sparkles,
  Cpu,
  Globe,
  ExternalLink,
  Zap,
  Clock,
  Calendar,
  Smartphone,
  Copy,
  Check
} from 'lucide-react';

interface SettingsProps {
  settings: BotSettings;
  onUpdateSettings: (settings: BotSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onUpdateSettings }) => {
  const [localSettings, setLocalSettings] = useState<BotSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // Live ticking clock for server time & project time preview
  const [currentUtc, setCurrentUtc] = useState<Date>(new Date());
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentUtc(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync local state if props change (e.g. after successful save or remote update)
  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const [isVerifying, setIsVerifying] = useState(false);
  const [botInfo, setBotInfo] = useState<any>(null);
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<any>(null);

  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<any>(null);

  const [isUpdatingMenuButton, setIsUpdatingMenuButton] = useState(false);
  const [menuButtonResult, setMenuButtonResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedAppUrl, setCopiedAppUrl] = useState(false);

  const handleUpdateMenuButton = async () => {
    setIsUpdatingMenuButton(true);
    setMenuButtonResult(null);
    try {
      const token = localStorage.getItem('token');
      const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const publicOrigin = rawOrigin.replace('ais-dev-', 'ais-pre-');
      const targetUrl = (localSettings.webAppUrl && localSettings.webAppUrl.trim()) 
        ? localSettings.webAppUrl.trim() 
        : publicOrigin;

      const res = await fetch('/api/telegram-menu-button', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ webAppUrl: targetUrl })
      });
      const data = await res.json();
      if (res.ok) {
        setMenuButtonResult({ success: true, message: data.message || 'Кнопка меню бота успешно обновлена в Telegram!' });
      } else {
        setMenuButtonResult({ success: false, message: data.error || 'Ошибка настройки кнопки меню' });
      }
    } catch (e: any) {
      setMenuButtonResult({ success: false, message: e.message || 'Ошибка запроса к серверу' });
    } finally {
      setIsUpdatingMenuButton(false);
    }
  };

  const handleCopyAppUrl = () => {
    const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const publicOrigin = rawOrigin.replace('ais-dev-', 'ais-pre-');
    const url = (localSettings.webAppUrl && localSettings.webAppUrl.trim()) 
      ? localSettings.webAppUrl.trim() 
      : publicOrigin;
    navigator.clipboard.writeText(url);
    setCopiedAppUrl(true);
    setTimeout(() => setCopiedAppUrl(false), 2000);
  };

  const handleTestAi = async () => {
    setIsTestingAi(true);
    setAiTestResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          provider: localSettings.aiProvider || 'gemini',
          apiKey: (localSettings.aiProvider === 'openrouter') 
            ? localSettings.openRouterApiKey 
            : (localSettings.aiProvider === 'custom' ? localSettings.customAiApiKey : localSettings.geminiApiKey),
          model: (localSettings.aiProvider === 'openrouter') 
            ? localSettings.openRouterModel 
            : (localSettings.aiProvider === 'custom' ? localSettings.customAiModel : localSettings.geminiModel),
          baseUrl: localSettings.geminiBaseUrl,
          endpoint: localSettings.customAiEndpoint,
          useProxy: localSettings.geminiUseProxy !== false,
          proxySource: localSettings.geminiProxySource || 'auto'
        })
      });
      const data = await res.json();
      setAiTestResult(data);
    } catch (e: any) {
      setAiTestResult({
        success: false,
        error: 'Ошибка при проверке соединения с ИИ: ' + (e.message || String(e))
      });
    } finally {
      setIsTestingAi(false);
    }
  };

  const handleTestProxy = async () => {
    setIsTestingProxy(true);
    setProxyTestResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/test-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          proxyUrl: localSettings.telegramApiRoot,
          token: localSettings.botToken
        })
      });
      const data = await res.json();
      setProxyTestResult(data);
    } catch (e: any) {
      setProxyTestResult({
        success: false,
        apiError: 'Ошибка выполнения запроса проверки: ' + (e.message || String(e))
      });
    } finally {
      setIsTestingProxy(false);
    }
  };

  const handleVerifyToken = async () => {
    setIsVerifying(true);
    setBotInfo(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/bot/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBotInfo(data.bot);
        setStatusMessage({ text: `Бот найден: @${data.bot.username}`, type: 'success' });
      } else {
        setStatusMessage({ text: data.error || 'Ошибка проверки бота', type: 'error' });
      }
    } catch (e) {
      setStatusMessage({ text: 'Ошибка сети при проверке', type: 'error' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateSettings(localSettings);
      setStatusMessage({ text: 'Настройки сохранены', type: 'success' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e: any) {
      setStatusMessage({ text: e.message || 'Ошибка при сохранении', type: 'error' });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestartBot = async () => {
    setIsRestarting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/bot/restart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setStatusMessage({ text: 'Бот успешно перезапущен', type: 'success' });
      } else {
        setStatusMessage({ text: 'Ошибка при перезапуске бота', type: 'error' });
      }
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e) {
      setStatusMessage({ text: 'Ошибка сети при перезапуске', type: 'error' });
    } finally {
      setIsRestarting(false);
    }
  };

  const handleDbSetup = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/settings/db-setup', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({ error: 'Некорректный ответ сервера' }));
      if (res.ok) {
        setStatusMessage({ text: 'База данных успешно настроена', type: 'success' });
      } else {
        setStatusMessage({ text: data.error || 'Ошибка настройки БД', type: 'error' });
      }
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e) {
      setStatusMessage({ text: 'Ошибка сети при настройке БД', type: 'error' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {statusMessage && (
        <div className={`fixed top-20 right-6 z-50 px-6 py-3 rounded-xl shadow-2xl border animate-in slide-in-from-right-4 ${
          statusMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-rose-500/10 border-rose-500/50 text-rose-400'
        }`}>
          {statusMessage.text}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Настройки системы</h2>
          <p className="text-slate-400 text-sm">Управление токенами, паролями и подключением к БД</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20"
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          Сохранить изменения
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Server Time & Project Timezone Settings */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm lg:col-span-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Серверное время и часовой пояс проекта</h3>
                <p className="text-xs text-slate-400">
                  Корректировка времени для расписания задач, AI-дайджестов, тепловой карты и ночного экспорта XML
                </p>
              </div>
            </div>

            {/* Live Clock Badges */}
            {(() => {
              const tz = typeof localSettings.timezoneOffset === 'number' ? localSettings.timezoneOffset : 3;
              const utcMs = currentUtc.getTime() + (currentUtc.getTimezoneOffset() * 60000);
              const projectDate = new Date(utcMs + (tz * 3600000));
              const pad = (n: number) => String(n).padStart(2, '0');
              const serverUtcTimeStr = `${pad(currentUtc.getUTCHours())}:${pad(currentUtc.getUTCMinutes())}:${pad(currentUtc.getUTCSeconds())} UTC`;
              const projectTimeStr = `${pad(projectDate.getHours())}:${pad(projectDate.getMinutes())}:${pad(projectDate.getSeconds())}`;

              return (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <span className="text-slate-500 mr-1.5 font-medium">Сервер (UTC):</span>
                    <span className="font-mono font-bold text-slate-300">{serverUtcTimeStr}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-emerald-400 font-medium">Время проекта:</span>
                    <span className="font-mono font-bold text-white text-sm">{projectTimeStr}</span>
                    <span className="text-emerald-300/80 font-mono text-[11px]">
                      (UTC{tz >= 0 ? `+${tz}` : tz})
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                  Смещение часового пояса (часов от UTC)
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">UTC</span>
                    <input
                      type="number"
                      min="-12"
                      max="14"
                      step="1"
                      value={typeof localSettings.timezoneOffset === 'number' ? localSettings.timezoneOffset : 3}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setLocalSettings({ ...localSettings, timezoneOffset: isNaN(val) ? 0 : val });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-14 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono text-sm font-bold"
                      placeholder="3"
                    />
                  </div>
                  <span className="text-sm font-bold text-emerald-400 font-mono">
                    {((typeof localSettings.timezoneOffset === 'number' ? localSettings.timezoneOffset : 3) >= 0 ? '+' : '') +
                      (typeof localSettings.timezoneOffset === 'number' ? localSettings.timezoneOffset : 3)} ч.
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
                  По умолчанию установлено <strong className="text-slate-200">+3 (Московское время MSK)</strong>. 
                  Все графики, суточные срезы, отложенные задачи и тепловая карта рассчитываются с учетом этого смещения.
                </p>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Быстрый выбор часового пояса:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'UTC +0 (Лондон)', val: 0 },
                    { label: 'UTC +2 (Калининград)', val: 2 },
                    { label: 'UTC +3 (Москва, СПб, Минск)', val: 3 },
                    { label: 'UTC +4 (Самара, Баку)', val: 4 },
                    { label: 'UTC +5 (Екатеринбург, Ташкент)', val: 5 },
                    { label: 'UTC +6 (Омск, Алматы)', val: 6 },
                    { label: 'UTC +7 (Красноярск, Новосибирск)', val: 7 },
                    { label: 'UTC +8 (Иркутск)', val: 8 },
                    { label: 'UTC +9 (Якутск, Токио)', val: 9 },
                    { label: 'UTC +10 (Владивосток)', val: 10 }
                  ].map((preset) => {
                    const currentVal = typeof localSettings.timezoneOffset === 'number' ? localSettings.timezoneOffset : 3;
                    const isActive = currentVal === preset.val;
                    return (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => setLocalSettings({ ...localSettings, timezoneOffset: preset.val })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          isActive 
                            ? 'bg-emerald-600 text-white shadow-sm font-bold border border-emerald-500' 
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Time Details Card */}
            {(() => {
              const tz = typeof localSettings.timezoneOffset === 'number' ? localSettings.timezoneOffset : 3;
              const utcMs = currentUtc.getTime() + (currentUtc.getTimezoneOffset() * 60000);
              const projectDate = new Date(utcMs + (tz * 3600000));
              const daysRu = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
              const pad = (n: number) => String(n).padStart(2, '0');
              const projectTimeStr = `${pad(projectDate.getHours())}:${pad(projectDate.getMinutes())}:${pad(projectDate.getSeconds())}`;
              const projectDateStr = `${pad(projectDate.getDate())}.${pad(projectDate.getMonth() + 1)}.${projectDate.getFullYear()}`;
              const dayName = daysRu[projectDate.getDay()];

              return (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      Текущий локальный момент проекта:
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      UTC{tz >= 0 ? `+${tz}` : tz}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold block">Время:</span>
                      <span className="text-xl font-bold font-mono text-white">{projectTimeStr}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold block">Дата:</span>
                      <span className="text-sm font-bold text-slate-200">{projectDateStr}</span>
                      <span className="text-[10px] text-slate-400 block font-medium">({dayName})</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 text-[11px] text-slate-400 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Подсветка квадрата в тепловой карте: <strong>{dayName.substring(0, 2)}, {pad(projectDate.getHours())}:00</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Авто-генерация XML: <strong>03:30</strong> (по локальному времени)</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Telegram Bot Settings */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <Bot className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Telegram Бот</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Токен бота (Bot Token)
              </label>
              <input
                type="text"
                value={localSettings.botToken}
                onChange={(e) => setLocalSettings({ ...localSettings, botToken: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm"
                placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Имя пользователя Telegram (Администратор)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">@</span>
                <input
                  type="text"
                  value={localSettings.adminTelegramUsername || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, adminTelegramUsername: e.target.value.replace(/^@/, '') })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm"
                  placeholder="bookray"
                />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500 leading-normal">
                Бот будет реагировать на команды в личных сообщениях только от этого пользователя.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Telegram API Proxy (Reverse Proxy)
              </label>
              <input
                type="text"
                value={localSettings.telegramApiRoot || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, telegramApiRoot: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm"
                placeholder="https://tgproxy.yourdomain.com или http://123.45.67.89:8080"
              />
              <p className="mt-1.5 text-[10px] text-slate-500 leading-relaxed">
                Укажите URL вашего Reverse Proxy сервера (Nginx или Cloudflare Worker), если доступ к <code className="bg-slate-950 text-blue-400 px-1 py-0.5 rounded font-mono">api.telegram.org</code> заблокирован.
              </p>
              <p className="mt-1 text-[10px] text-emerald-400/90 leading-relaxed font-medium">
                💡 Этот же Reverse Proxy используется для автоматической маршрутизации Google Gemini, чтобы обойти ошибку «User location is not supported».
              </p>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleTestProxy}
                  disabled={isTestingProxy || !localSettings.telegramApiRoot}
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white rounded-xl border border-slate-700 text-xs font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isTestingProxy ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" /> : <Network className="w-3.5 h-3.5 text-purple-400" />}
                  <span>{isTestingProxy ? 'Проверка связи с прокси...' : 'Проверить подключение и доставку'}</span>
                </button>

                {proxyTestResult && (
                  <div className="mt-3 p-3.5 rounded-xl border bg-slate-950/80 text-xs space-y-2.5 animate-in fade-in duration-300 border-slate-800">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 font-bold">
                      <span className="text-slate-300 flex items-center gap-1.5">
                        <Network className="w-4 h-4 text-purple-400" /> Результат проверки Telegram Proxy
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${
                        proxyTestResult.success ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {proxyTestResult.success ? 'Успешно' : 'Ошибка'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-slate-400">HTTP Ping:</span>
                        {proxyTestResult.httpPingOk ? (
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> {proxyTestResult.httpPingTime} мс
                          </span>
                        ) : (
                          <span className="text-rose-400 font-medium flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> {proxyTestResult.httpError || 'Недоступен'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                        <span className="text-slate-400">Telegram getMe:</span>
                        {proxyTestResult.apiOk ? (
                          <span className="text-emerald-400 font-medium flex items-center gap-1 truncate" title={`@${proxyTestResult.botUsername}`}>
                            <CheckCircle2 className="w-3 h-3 shrink-0" /> @{proxyTestResult.botUsername} ({proxyTestResult.apiTime} мс)
                          </span>
                        ) : (
                          <span className="text-rose-400 font-medium flex items-center gap-1 truncate" title={proxyTestResult.apiError}>
                            <XCircle className="w-3 h-3 shrink-0" /> {proxyTestResult.apiError || 'Ошибка'}
                          </span>
                        )}
                      </div>
                    </div>

                    {proxyTestResult.deliveryMessage && (
                      <div className={`p-2.5 rounded text-[11px] flex items-start gap-2 border ${
                        proxyTestResult.deliveryOk
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : proxyTestResult.apiOk
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                            : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                      }`}>
                        {proxyTestResult.deliveryOk ? (
                          <Send className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                        )}
                        <span className="leading-relaxed">{proxyTestResult.deliveryMessage}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Cloudflare Worker URL (Проброс вебхуков)
              </label>
              <input
                type="text"
                value={localSettings.cfWorkerUrl || ''}
                disabled={localSettings.disableCloudflare}
                onChange={(e) => setLocalSettings({ ...localSettings, cfWorkerUrl: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm disabled:opacity-40"
                placeholder="https://your-worker.your-subdomain.workers.dev"
              />
              <p className="mt-1.5 text-[10px] text-slate-500 leading-relaxed leading-normal">
                Заполните это поле, если вы используете Cloudflare Worker для проброса вебхуков на адрес <code className="bg-slate-950 text-blue-400 px-1 py-0.5 rounded font-mono">/telegram</code> вашего сервера.
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800">
              <div>
                <p className="text-xs font-bold text-slate-200 uppercase tracking-wide">Отключить Cloudflare</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Запросы будут отправляться напрямую на сервер (webhooks или polling) без использования Cloudflare.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLocalSettings({ ...localSettings, disableCloudflare: !localSettings.disableCloudflare })}
                className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${localSettings.disableCloudflare ? 'bg-amber-500' : 'bg-slate-800'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${localSettings.disableCloudflare ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleVerifyToken}
                  disabled={isVerifying}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700 flex items-center justify-center gap-2"
                >
                  {isVerifying ? <div className="w-3 h-3 border-2 border-slate-500 border-t-slate-200 rounded-full animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Проверить токен
                </button>
                <button
                  onClick={handleRestartBot}
                  disabled={isRestarting}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700 flex items-center justify-center gap-2"
                >
                  {isRestarting ? <div className="w-3 h-3 border-2 border-slate-500 border-t-slate-200 rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Перезапуск
                </button>
              </div>
              
              {botInfo && (
                <div className="mt-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-1 animate-in fade-in duration-300">
                  <p className="text-xs font-bold text-emerald-400">@{botInfo.username}</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{botInfo.firstName}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${botInfo.canReadAllGroupMessages ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                      {botInfo.canReadAllGroupMessages ? 'Чтение всех сообщений' : 'Приватный режим'}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-500 rounded">
                      ID: {botInfo.id}
                    </span>
                  </div>
                </div>
              )}

              <p className="mt-2 text-[10px] text-slate-500 italic">
                * Изменение токена потребует перезапуска бота
              </p>
            </div>
          </div>
        </div>

        {/* Telegram Mini App (TMA) Settings */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Telegram Mini App (TMA)</h3>
              <p className="text-xs text-slate-400">Доступ к веб-панели прямо внутри Telegram</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                URL мини-приложения (WebApp URL)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localSettings.webAppUrl || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, webAppUrl: e.target.value })}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono text-xs"
                  placeholder={typeof window !== 'undefined' ? window.location.origin : 'https://ваш-домен.app'}
                />
                <button
                  type="button"
                  onClick={handleCopyAppUrl}
                  className="px-3.5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  title="Скопировать ссылку"
                >
                  {copiedAppUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedAppUrl ? 'Скопировано!' : 'Копировать'}</span>
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500 leading-normal">
                Если поле не заполнено, бот использует текущий домен сервера (<code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded font-mono">{typeof window !== 'undefined' ? window.location.origin : 'https://...'}</code>).
              </p>
            </div>

            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-200">Кнопка меню в диалоге с ботом</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Устанавливает кнопку «📱 Панель» в левом нижнем углу чата с ботом.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleUpdateMenuButton}
                  disabled={isUpdatingMenuButton || !localSettings.botToken}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/30 flex items-center gap-2 cursor-pointer shrink-0"
                >
                  {isUpdatingMenuButton ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Обновить меню в Telegram</span>
                </button>
              </div>

              {menuButtonResult && (
                <div className={`p-3 rounded-lg text-xs flex items-center gap-2 border animate-in fade-in duration-200 ${
                  menuButtonResult.success 
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                }`}>
                  {menuButtonResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                  <span>{menuButtonResult.message}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-blue-400">
                <Sparkles className="w-4 h-4" />
                <span>Возможности Telegram Mini App:</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 text-[11px] list-disc list-inside">
                <li><b>Бесшовная авторизация:</b> Администратор Telegram (@{localSettings.adminTelegramUsername || 'bookray'}) входит в панель автоматически без ввода логина и пароля.</li>
                <li><b>Команды в боте:</b> Команды <code className="text-blue-300 bg-slate-900 px-1 rounded">/app</code>, <code className="text-blue-300 bg-slate-900 px-1 rounded">/panel</code> и <code className="text-blue-300 bg-slate-900 px-1 rounded">/start</code> присылают кнопку быстрого открытия приложения.</li>
                <li><b>100% функционал:</b> Все вкладки (Статистика, Чаты, ИИ-Суммаризация, Модерация, Анти-мошенники, Репутация, Планировщик, Рассылки, Логи, Настройки) работают прямо в мобильном Telegram.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Panel Security */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Безопасность панели</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Пароль администратора
              </label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={localSettings.adminPassword || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, adminPassword: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                  placeholder="Оставьте пустым, чтобы не менять"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                Email для восстановления
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={localSettings.recoveryEmail || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, recoveryEmail: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800">
              <div>
                <p className="text-sm font-medium text-slate-200">Режим обслуживания</p>
                <p className="text-xs text-slate-500">Бот будет игнорировать команды</p>
              </div>
              <button
                onClick={() => setLocalSettings({ ...localSettings, maintenanceMode: !localSettings.maintenanceMode })}
                className={`w-12 h-6 rounded-full transition-colors relative ${localSettings.maintenanceMode ? 'bg-amber-500' : 'bg-slate-800'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${localSettings.maintenanceMode ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* AI & Gemini Configuration Card */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm lg:col-span-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-blue-500/20 rounded-xl text-blue-400 border border-blue-500/30">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">ИИ-провайдер и ключи API (Суммаризация)</h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                    Управление из админки
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Настройте ключ Google Gemini или альтернативный провайдер (OpenRouter / OpenAI Proxy) для суточных дайджестов
                </p>
              </div>
            </div>

            {/* Provider Switcher */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 self-start md:self-auto">
              <button
                type="button"
                onClick={() => setLocalSettings({ ...localSettings, aiProvider: 'gemini' })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  (localSettings.aiProvider || 'gemini') === 'gemini' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                Google Gemini
              </button>
              <button
                type="button"
                onClick={() => setLocalSettings({ ...localSettings, aiProvider: 'openrouter' })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  localSettings.aiProvider === 'openrouter' 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                OpenRouter (Без ограничений)
              </button>
              <button
                type="button"
                onClick={() => setLocalSettings({ ...localSettings, aiProvider: 'custom' })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  localSettings.aiProvider === 'custom' 
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-900/40' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                Custom / Proxy
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Google Gemini Settings */}
            {(localSettings.aiProvider || 'gemini') === 'gemini' && (
              <>
                <div className="space-y-4 md:col-span-2">
                  <div>
                    <div className="flex items-center justify-between mb-1.5 ml-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Google Gemini API Key (GEMINI_API_KEY)
                      </label>
                      <a 
                        href="https://aistudio.google.com/app/apikey" 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        Получить ключ бесплатно <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        value={localSettings.geminiApiKey || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, geminiApiKey: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm placeholder:text-slate-600"
                        placeholder="AIzaSy..."
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      Ключ сохраняется в защищенной базе данных Firestore и сразу готов к использованию без изменения <code className="text-blue-400 font-mono text-[10px]">.env</code> файлов.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                    Модель Gemini
                  </label>
                  <select
                    value={localSettings.geminiModel || 'gemini-2.0-flash'}
                    onChange={(e) => setLocalSettings({ ...localSettings, geminiModel: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm font-medium"
                  >
                    <option value="gemini-2.0-flash">⚡ gemini-2.0-flash (Рекомендуется: быстрая, стабильная, высокая квота)</option>
                    <option value="gemini-2.0-flash-lite">🚀 gemini-2.0-flash-lite (Минимальная задержка и экономия квоты)</option>
                    <option value="gemini-1.5-flash">🛡️ gemini-1.5-flash (Проверенная базовая модель)</option>
                    <option value="gemini-1.5-pro">🧠 gemini-1.5-pro (Глубокий анализ контекста)</option>
                    <option value="gemini-2.5-pro">💎 gemini-2.5-pro (Флагманская модель)</option>
                    <option value="gemini-3.7-flash">✨ gemini-3.7-flash (Gemini 3.7 Flash)</option>
                    <option value="gemini-3.6-flash">✨ gemini-3.6-flash (Gemini 3.6 Flash)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                    Маршрутизация прокси (Обход блокировок)
                  </label>
                  <select
                    value={localSettings.geminiProxySource || 'auto'}
                    onChange={(e) => setLocalSettings({ ...localSettings, geminiProxySource: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm font-medium"
                  >
                    <option value="auto">⚡ Авто (Cloudflare Worker или кастомный прокси)</option>
                    <option value="cf_worker">☁️ Использовать Cloudflare Worker ({localSettings.cfWorkerUrl || 'не задан'})</option>
                    <option value="custom">✏️ Кастомный Base URL / Прокси (ручной ввод)</option>
                    <option value="direct">⛔ Прямое подключение к Google (без прокси)</option>
                  </select>
                </div>

                {localSettings.geminiProxySource === 'custom' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                      Кастомный Base URL / Прокси
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={localSettings.geminiBaseUrl || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, geminiBaseUrl: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm placeholder:text-slate-600"
                        placeholder="https://your-worker.workers.dev"
                      />
                    </div>
                  </div>
                )}

                <div className="md:col-span-2 p-3 bg-blue-950/30 border border-blue-800/40 rounded-xl text-xs text-blue-300 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Активный маршрут для Gemini:</span>
                  </span>
                  <span className="font-mono text-emerald-300 font-bold truncate max-w-sm">
                    {localSettings.geminiProxySource === 'direct' 
                      ? 'Прямое подключение к Google API' 
                      : (localSettings.geminiBaseUrl || (localSettings.cfWorkerUrl && !localSettings.disableCloudflare ? localSettings.cfWorkerUrl : 'Прямое подключение к Google API'))}
                  </span>
                </div>
              </>
            )}

            {/* OpenRouter Settings */}
            {localSettings.aiProvider === 'openrouter' && (
              <>
                <div className="space-y-4 md:col-span-2">
                  <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 flex items-start gap-2.5">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong>OpenRouter решает проблему «User location is not supported»</strong>: работает в любой стране без блокировок регионов, дает доступ к Gemini 2.5 Flash, DeepSeek, Llama 3.3 и др.
                      <div className="mt-1 text-slate-400">
                        💡 <em>При создании ключа на OpenRouter оставьте лимит пустым и создавайте ключ со стандартной политикой (Default, без ограничений по доменам).</em>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5 ml-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        OpenRouter API Key
                      </label>
                      <a 
                        href="https://openrouter.ai/keys" 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        Получить ключ на OpenRouter <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        value={localSettings.openRouterApiKey || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, openRouterApiKey: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono text-sm placeholder:text-slate-600"
                        placeholder="sk-or-v1-..."
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                    Модель OpenRouter
                  </label>
                  <select
                    value={localSettings.openRouterModel || 'google/gemini-2.0-flash-001'}
                    onChange={(e) => setLocalSettings({ ...localSettings, openRouterModel: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm font-medium"
                  >
                    <option value="google/gemini-2.0-flash-001">google/gemini-2.0-flash-001 (Google Gemini 2.0 Flash)</option>
                    <option value="google/gemini-2.0-flash-exp:free">google/gemini-2.0-flash-exp:free (Бесплатный Gemini 2.0)</option>
                    <option value="meta-llama/llama-3.3-70b-instruct:free">meta-llama/llama-3.3-70b-instruct:free (Бесплатная Llama 3.3)</option>
                    <option value="deepseek/deepseek-r1:free">deepseek/deepseek-r1:free (Бесплатный DeepSeek R1)</option>
                    <option value="deepseek/deepseek-chat">deepseek/deepseek-chat (DeepSeek V3)</option>
                    <option value="meta-llama/llama-3.3-70b-instruct">meta-llama/llama-3.3-70b-instruct (Meta Llama 3.3)</option>
                    <option value="openai/gpt-4o-mini">openai/gpt-4o-mini (OpenAI GPT-4o mini)</option>
                  </select>
                </div>
              </>
            )}

            {/* Custom AI / OpenAI-compatible endpoint */}
            {localSettings.aiProvider === 'custom' && (
              <>
                <div className="space-y-4 md:col-span-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      URL эндпоинта (OpenAI Compatible API)
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={localSettings.customAiEndpoint || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, customAiEndpoint: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-mono text-sm placeholder:text-slate-600"
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      API Key
                    </label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        value={localSettings.customAiApiKey || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, customAiApiKey: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-mono text-sm placeholder:text-slate-600"
                        placeholder="sk-..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                      Имя модели
                    </label>
                    <input
                      type="text"
                      value={localSettings.customAiModel || 'gpt-4o-mini'}
                      onChange={(e) => setLocalSettings({ ...localSettings, customAiModel: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-mono text-sm"
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Test & Status Area */}
            <div className="md:col-span-2 pt-2 border-t border-slate-800/80 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestAi}
                  disabled={isTestingAi}
                  className="bg-slate-800 hover:bg-slate-700 text-blue-400 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-2 disabled:opacity-50"
                >
                  {isTestingAi ? (
                    <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Cpu className="w-4 h-4" />
                  )}
                  🧪 Проверить соединение с ИИ
                </button>
                <span className="text-xs text-slate-500">
                  Тестовый запрос отправляется моментально для проверки валидности ключа и модели.
                </span>
              </div>

              {aiTestResult && (
                <div className={`p-4 rounded-xl text-xs border animate-in fade-in duration-200 ${
                  aiTestResult.success 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  <div className="flex items-start gap-3">
                    {aiTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1.5 flex-1">
                      <div className="font-bold flex items-center justify-between">
                        <span>{aiTestResult.message || (aiTestResult.success ? 'Успешно' : 'Ошибка')}</span>
                        {aiTestResult.duration && (
                          <span className="font-mono text-[10px] text-slate-400 font-normal">
                            {aiTestResult.duration} мс
                          </span>
                        )}
                      </div>
                      {aiTestResult.error && (
                        <p className="font-mono text-[11px] text-rose-200 bg-black/40 p-2 rounded border border-rose-500/20">
                          {aiTestResult.error}
                        </p>
                      )}
                      {aiTestResult.sample && (
                        <div className="bg-black/30 p-2 rounded text-slate-300">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Ответ модели:</span>
                          «{aiTestResult.sample}»
                        </div>
                      )}
                      {aiTestResult.hint && (
                        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
                          💡 <strong>Подсказка:</strong> {aiTestResult.hint}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Database Connection */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">База данных</h3>
            </div>
            
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setLocalSettings({ ...localSettings, dbType: DatabaseType.FIREBASE })}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  localSettings.dbType === DatabaseType.FIREBASE ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Firebase
              </button>
              <button
                onClick={() => setLocalSettings({ ...localSettings, dbType: DatabaseType.MYSQL })}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  localSettings.dbType === DatabaseType.MYSQL ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                MySQL
              </button>
            </div>
          </div>
          
          {localSettings.dbType === DatabaseType.MYSQL ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                    Хост (Host)
                  </label>
                  <input
                    type="text"
                    value={localSettings.dbHost}
                    onChange={(e) => setLocalSettings({ ...localSettings, dbHost: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                    Порт (Port)
                  </label>
                  <input
                    type="number"
                    value={localSettings.dbPort}
                    onChange={(e) => setLocalSettings({ ...localSettings, dbPort: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                    Имя базы (Database Name)
                  </label>
                  <input
                    type="text"
                    value={localSettings.dbName}
                    onChange={(e) => setLocalSettings({ ...localSettings, dbName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                    Пользователь (User)
                  </label>
                  <input
                    type="text"
                    value={localSettings.dbUser}
                    onChange={(e) => setLocalSettings({ ...localSettings, dbUser: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                    Пароль (Password)
                  </label>
                  <input
                    type="password"
                    value={localSettings.dbPass}
                    onChange={(e) => setLocalSettings({ ...localSettings, dbPass: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-center pt-4">
                <button
                  onClick={handleDbSetup}
                  className="flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-6 py-3 rounded-xl font-bold transition-all"
                >
                  <RefreshCw className="w-5 h-5" />
                  Первичная настройка MySQL
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500 mb-4">
                <Database size={32} />
              </div>
              <h4 className="text-white font-bold mb-2">Используется Firebase</h4>
              <p className="text-slate-500 text-sm max-w-md">
                Все данные синхронизируются с облачной базой данных Firebase Firestore. 
                Настройки подключения не требуются.
              </p>
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <h3 className="text-lg font-bold text-rose-500">Опасная зона</h3>
          </div>
          <p className="text-sm text-slate-400 mb-6">Действия ниже могут привести к потере данных или остановке сервиса.</p>
          
          <div className="flex flex-wrap gap-4">
            <button className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-sm font-bold transition-all border border-rose-500/30">
              Сброс всех логов
            </button>
            <button 
              onClick={handleRestartBot}
              disabled={isRestarting}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-sm font-bold transition-all border border-rose-500/30 disabled:opacity-50"
            >
              {isRestarting ? 'Перезапуск...' : 'Перезагрузить бота'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

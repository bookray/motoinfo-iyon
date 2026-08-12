import React, { useState } from 'react';
import { BotSettings, DatabaseType } from '../types';
import { Save, Key, Bot, Database, ShieldCheck, AlertTriangle, Mail, RefreshCw, Network, Send, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface SettingsProps {
  settings: BotSettings;
  onUpdateSettings: (settings: BotSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onUpdateSettings }) => {
  const [localSettings, setLocalSettings] = useState<BotSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // Sync local state if props change (e.g. after successful save or remote update)
  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const [isVerifying, setIsVerifying] = useState(false);
  const [botInfo, setBotInfo] = useState<any>(null);
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<any>(null);

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
              <p className="mt-1.5 text-[10px] text-slate-500 leading-relaxed leading-normal">
                Укажите URL вашего Nginx Reverse Proxy сервера, если доступ к <code className="bg-slate-950 text-blue-400 px-1 py-0.5 rounded font-mono">api.telegram.org</code> заблокирован. Оставьте пустым для прямого подключения.
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

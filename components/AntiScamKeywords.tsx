import React, { useState, useEffect } from 'react';
import { 
  BellRing, ShieldAlert, Plus, Trash2, Check, RefreshCw, 
  Send, ExternalLink, AlertTriangle, Sparkles, Sliders, 
  Search, X, CheckCircle2, Copy, Shield, Ban, MessageSquare
} from 'lucide-react';
import { AntiScamKeywordConfig, AntiScamTriggerLog } from '../types';
import { formatDateTime } from '../src/utils/dateUtils';

interface AntiScamKeywordsProps {
  authenticatedFetch?: (url: string, options?: RequestInit) => Promise<Response>;
  currentUser?: any;
  onBan?: (userId: string, reason: string) => void;
}

const DEFAULT_RECOMMENDED_KEYWORDS = [
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
  'работа на дому высокий доход',
  'подработка в интернете',
  'выплата сразу',
  'оплата на киви',
  'слив курса',
  'взлом аккаунтов',
  'помогу заработать'
];

export const AntiScamKeywords: React.FC<AntiScamKeywordsProps> = ({
  authenticatedFetch,
  currentUser,
  onBan
}) => {
  const [config, setConfig] = useState<AntiScamKeywordConfig>({
    enabled: true,
    keywords: [],
    notifyChatId: '',
    deleteMessage: false,
    notifyInGroup: false,
    cooldownSeconds: 60
  });
  const [logs, setLogs] = useState<AntiScamTriggerLog[]>([]);
  const [detectedAdminChatId, setDetectedAdminChatId] = useState('');
  const [adminUsername, setAdminUsername] = useState('bookray');
  
  const [newKeyword, setNewKeyword] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const [testingAlert, setTestingAlert] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedKeyword, setCopiedKeyword] = useState<string | null>(null);

  const fetchWithAuth = async (url: string, options?: RequestInit) => {
    if (authenticatedFetch) {
      return authenticatedFetch(url, options);
    }
    return fetch(url, options);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/antiscam/keywords');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(data.config);
        }
        if (Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
        if (data.detectedAdminChatId) {
          setDetectedAdminChatId(data.detectedAdminChatId);
        }
        if (data.adminTelegramUsername) {
          setAdminUsername(data.adminTelegramUsername);
        }
      }
    } catch (e) {
      console.error('Failed to load anti-scam keywords:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveConfig = async (newConfig: AntiScamKeywordConfig) => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      const res = await fetchWithAuth('/api/antiscam/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(data.config);
        }
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (e) {
      console.error('Failed to save anti-scam keywords:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddKeyword = () => {
    const raw = newKeyword.trim();
    if (!raw) return;

    // Handle comma, semicolon or newline separated entries
    const items = raw.split(/[\n,;]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
    const existing = new Set(config.keywords.map(k => k.toLowerCase()));
    
    const added: string[] = [];
    for (const item of items) {
      if (!existing.has(item)) {
        added.push(item);
        existing.add(item);
      }
    }

    if (added.length > 0) {
      const updated = {
        ...config,
        keywords: [...config.keywords, ...added]
      };
      setConfig(updated);
      saveConfig(updated);
    }
    setNewKeyword('');
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    const updated = {
      ...config,
      keywords: config.keywords.filter(k => k !== keywordToRemove)
    };
    setConfig(updated);
    saveConfig(updated);
  };

  const handleAddRecommended = (word: string) => {
    if (config.keywords.some(k => k.toLowerCase() === word.toLowerCase())) return;
    const updated = {
      ...config,
      keywords: [...config.keywords, word.toLowerCase()]
    };
    setConfig(updated);
    saveConfig(updated);
  };

  const handleAddAllRecommended = () => {
    const existing = new Set(config.keywords.map(k => k.toLowerCase()));
    const toAdd = DEFAULT_RECOMMENDED_KEYWORDS.filter(w => !existing.has(w.toLowerCase()));
    if (toAdd.length === 0) return;

    const updated = {
      ...config,
      keywords: [...config.keywords, ...toAdd]
    };
    setConfig(updated);
    saveConfig(updated);
  };

  const handleClearAllKeywords = () => {
    if (!window.confirm('Вы уверены, что хотите удалить все ключевые слова из списка?')) return;
    const updated = {
      ...config,
      keywords: []
    };
    setConfig(updated);
    saveConfig(updated);
  };

  const handleToggleEnabled = () => {
    const updated = {
      ...config,
      enabled: !config.enabled
    };
    setConfig(updated);
    saveConfig(updated);
  };

  const handleTestAlert = async () => {
    try {
      setTestingAlert(true);
      setTestResult(null);
      const res = await fetchWithAuth('/api/antiscam/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: config.notifyChatId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `Тестовое оповещение успешно отправлено в Telegram (Chat ID: ${data.sentTo})!`
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Не удалось отправить оповещение. Проверьте ID получателя.'
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Ошибка соединения с сервером'
      });
    } finally {
      setTestingAlert(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Очистить журнал срабатываний анти-мошенника?')) return;
    try {
      await fetchWithAuth('/api/antiscam/logs', { method: 'DELETE' });
      setLogs([]);
    } catch (e) {
      console.error('Failed to clear logs:', e);
    }
  };

  const filteredKeywords = config.keywords.filter(k => 
    k.toLowerCase().includes(filterSearch.toLowerCase())
  );

  const activeDestination = config.notifyChatId || detectedAdminChatId || `@${adminUsername}`;

  return (
    <div className="space-y-6">
      {/* Top Banner & Main Switch */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className={`p-3.5 rounded-2xl border transition-all ${
              config.enabled 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-lg shadow-amber-500/10' 
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              <BellRing className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-white tracking-tight">
                  Оповещения по ключевым словам
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                  config.enabled 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {config.enabled ? '● Активно' : '○ Отключено'}
                </span>
                {saveSuccess && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 animate-in fade-in duration-300">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Сохранено
                  </span>
                )}
                {saving && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Сохранение...
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Бот сканирует входящие сообщения во всех чатах. При упоминании любого подозрительного слова из списка вам в Telegram мгновенно отправляется уведомление с текстом сообщения и кнопками быстрой блокировки.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 self-end lg:self-center">
            <button
              onClick={handleToggleEnabled}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg ${
                config.enabled
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              {config.enabled ? 'Мониторинг включен' : 'Включить мониторинг'}
            </button>
          </div>
        </div>

        {/* Telegram Destination Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="flex items-center gap-2 text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800/50">
            <Send className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="truncate">
              <span className="text-slate-500 block">Получатель оповещений:</span>
              <span className="font-mono text-slate-200 font-bold truncate">
                {activeDestination || 'Не настроен (по умолчанию)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800/50">
            <Shield className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="text-slate-500 block">Активных ключевых слов:</span>
              <span className="font-bold text-slate-200">{config.keywords.length} слов / фраз</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800/50">
            <Sliders className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="text-slate-500 block">Режим реакции:</span>
              <span className="font-bold text-slate-200">
                {config.deleteMessage ? 'Удаление + Оповещение' : 'Только оповещение'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Settings & Alert Target Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center gap-2 text-white font-bold text-base">
          <Sliders className="w-5 h-5 text-amber-400" />
          <span>Настройки доставки и реакции</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Notify Chat ID */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
              Telegram ID для оповещений
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.notifyChatId || ''}
                onChange={(e) => setConfig({ ...config, notifyChatId: e.target.value })}
                onBlur={() => saveConfig(config)}
                placeholder="Например: 123456789 или -100..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <button
                type="button"
                onClick={handleTestAlert}
                disabled={testingAlert}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs transition-all flex items-center gap-1.5 shrink-0 shadow-lg shadow-blue-900/20"
                title="Отправить тестовое оповещение в Telegram"
              >
                {testingAlert ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Тест</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Ваш личный Telegram User ID или ID сервисного чата. Если пусто — используется чат администратора.
            </p>
          </div>

          {/* Action Flags */}
          <div className="space-y-3 lg:col-span-2 flex flex-col justify-center">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
              Действия при обнаружении
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 cursor-pointer hover:bg-slate-950 transition-colors">
                <input
                  type="checkbox"
                  checked={Boolean(config.deleteMessage)}
                  onChange={(e) => {
                    const updated = { ...config, deleteMessage: e.target.checked };
                    setConfig(updated);
                    saveConfig(updated);
                  }}
                  className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-500"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-200 block">Авто-удаление сообщения</span>
                  <span className="text-[11px] text-slate-500">Удалять сообщение из чата сразу после обнаружения</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 cursor-pointer hover:bg-slate-950 transition-colors">
                <input
                  type="checkbox"
                  checked={Boolean(config.notifyInGroup)}
                  onChange={(e) => {
                    const updated = { ...config, notifyInGroup: e.target.checked };
                    setConfig(updated);
                    saveConfig(updated);
                  }}
                  className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-500"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-200 block">Предупреждение в группе</span>
                  <span className="text-[11px] text-slate-500">Отправлять временное предупреждение для участников чата</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Test Alert Result Message */}
        {testResult && (
          <div className={`p-4 rounded-xl border flex items-start gap-3 text-sm animate-in fade-in duration-300 ${
            testResult.success 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {testResult.success ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />}
            <div className="flex-1">
              <p className="font-bold">{testResult.success ? 'Успешная проверка' : 'Ошибка отправки'}</p>
              <p className="text-xs opacity-90 mt-0.5">{testResult.message}</p>
            </div>
            <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Keywords Management Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <span>Список ключевых слов и фраз</span>
              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md text-xs font-mono">
                {config.keywords.length}
              </span>
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Поиск ведется без учета регистра. Можно указывать как отдельные слова («предоплата»), так и целые фразы («скинь на карту»).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddAllRecommended}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
              title="Добавить готовый набор часто используемых мошенниками фраз"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Добавить базовый набор</span>
            </button>
            {config.keywords.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllKeywords}
                className="px-3 py-1.5 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
                title="Очистить весь список"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Очистить</span>
              </button>
            )}
          </div>
        </div>

        {/* Input Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddKeyword();
                }
              }}
              placeholder="Введите ключевое слово или фразу (можно через запятую)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
            />
          </div>
          <button
            type="button"
            onClick={handleAddKeyword}
            disabled={!newKeyword.trim()}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:hover:bg-amber-600 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2 shrink-0 text-sm"
          >
            <Plus className="w-4 h-4" /> Добавить в список
          </button>
        </div>

        {/* Recommended Preset Chips */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Рекомендованные шаблоны (нажмите для быстрого добавления):</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_RECOMMENDED_KEYWORDS.slice(0, 12).map((word) => {
              const alreadyAdded = config.keywords.some(k => k.toLowerCase() === word.toLowerCase());
              return (
                <button
                  key={word}
                  type="button"
                  onClick={() => !alreadyAdded && handleAddRecommended(word)}
                  disabled={alreadyAdded}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                    alreadyAdded
                      ? 'bg-slate-950/50 border-slate-800/60 text-slate-600 cursor-default'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-amber-300 hover:border-amber-500/40 hover:bg-amber-500/5'
                  }`}
                >
                  {alreadyAdded ? <Check className="w-3 h-3 text-emerald-500" /> : <Plus className="w-3 h-3 text-slate-500" />}
                  <span>{word}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter and Keywords Grid */}
        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          {config.keywords.length > 8 && (
            <div className="relative max-w-sm">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Поиск по добавленным словам..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {config.keywords.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-500">
              <BellRing className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">Список ключевых слов пуст</p>
              <p className="text-xs text-slate-600 mt-1">Добавьте подозрительные слова вручную или нажмите «Добавить базовый набор» выше.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1">
              {filteredKeywords.map((kw) => (
                <div
                  key={kw}
                  className="group flex items-center gap-1.5 bg-slate-950 border border-slate-800 hover:border-amber-500/40 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 transition-all"
                >
                  <span className="font-mono text-amber-400/90">{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(kw)}
                    className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors ml-1"
                    title={`Удалить слово «${kw}»`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {filteredKeywords.length === 0 && (
                <p className="text-xs text-slate-500 py-4 italic">Ничего не найдено по запросу «{filterSearch}»</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Trigger History (Logs) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">Журнал срабатываний ключевых слов</h4>
              <p className="text-xs text-slate-500">Последние сообщения, в которых бот зафиксировал подозрительные слова</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
              title="Обновить журнал"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {logs.length > 0 && (
              <button
                type="button"
                onClick={handleClearLogs}
                className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-rose-500/10 rounded-xl transition-all flex items-center gap-1.5 border border-slate-700/60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Очистить журнал</span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/50 text-slate-500 text-[10px] font-bold uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4">Время (МСК)</th>
                <th className="px-6 py-4">Пользователь</th>
                <th className="px-6 py-4">Чат</th>
                <th className="px-6 py-4">Ключевое слово</th>
                <th className="px-6 py-4">Фрагмент сообщения</th>
                <th className="px-6 py-4 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {logs.length > 0 ? (
                logs.map((log) => {
                  const userFullName = `${log.firstName || ''}${log.lastName ? ' ' + log.lastName : ''}`.trim() || 'Пользователь';
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-bold text-white">{userFullName}</p>
                          <p className="text-[11px] font-mono text-blue-400">
                            {log.username ? `@${log.username}` : `ID: ${log.userId}`}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 border border-slate-700">
                          {log.chatTitle || log.chatId}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {log.matchedKeyword}
                        </span>
                        {log.messageDeleted && (
                          <span className="block text-[10px] text-rose-400 mt-1">🗑 Удалено</span>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-xs text-slate-300 line-clamp-2 italic bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                          «{log.messageText}»
                        </p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onBan && (
                            <button
                              onClick={() => onBan(log.userId, `Анти-мошенник: ключевое слово «${log.matchedKeyword}»`)}
                              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"
                              title="Глобальный бан"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                          <a
                            href={`tg://user?id=${log.userId}`}
                            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                            title="Открыть профиль в Telegram"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-600 italic">
                    Срабатываний ключевых слов пока не зафиксировано
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

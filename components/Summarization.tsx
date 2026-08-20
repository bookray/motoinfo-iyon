import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Clock, 
  Send, 
  Settings2, 
  History, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  RefreshCw, 
  Trash2, 
  MessageSquare, 
  Bot, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  KeyRound,
  ShieldCheck,
  Calendar,
  Layers,
  HelpCircle,
  Play
} from 'lucide-react';
import { Chat, ChatDigestConfig, ChatDigestEntry } from '../types';

interface SummarizationProps {
  chats: Chat[];
}

export const Summarization: React.FC<SummarizationProps> = ({ chats }) => {
  const [configs, setConfigs] = useState<ChatDigestConfig[]>([]);
  const [history, setHistory] = useState<ChatDigestEntry[]>([]);
  const [geminiStatus, setGeminiStatus] = useState<{ configured: boolean; model: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingChatId, setGeneratingChatId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string>(chats[0]?.id || '');
  const [hoursBack, setHoursBack] = useState<number>(24);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [autoSendTelegram, setAutoSendTelegram] = useState<boolean>(true);
  const [currentDigest, setCurrentDigest] = useState<ChatDigestEntry | null>(null);
  const [showKeyGuide, setShowKeyGuide] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedDigestId, setExpandedDigestId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'schedule' | 'generator' | 'history'>('schedule');

  const token = localStorage.getItem('token');

  const authFetch = async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  };

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statusRes, configsRes, historyRes] = await Promise.all([
        authFetch('/api/gemini/status'),
        authFetch('/api/digests/configs'),
        authFetch('/api/digests/history')
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setGeminiStatus(data);
      }

      if (configsRes.ok) {
        const data = await configsRes.json();
        setConfigs(data);
      }

      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data);
        if (data.length > 0 && !currentDigest) {
          setCurrentDigest(data[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load digest data:', e);
      showNotification('Не удалось загрузить данные дайджестов', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (chats.length > 0 && !selectedChatId) {
      setSelectedChatId(chats[0].id);
    }
  }, [chats]);

  const handleUpdateConfig = async (chatId: string, updates: Partial<ChatDigestConfig>) => {
    try {
      const existing = configs.find(c => c.chatId === chatId) || {
        chatId,
        chatTitle: chats.find(c => c.id === chatId)?.title || chatId,
        enabled: false,
        scheduleTime: '21:00',
        hoursBack: 24,
        includeTopics: true,
        includeStats: true,
        autoSendTelegram: true
      };

      const updated = { ...existing, ...updates };

      const res = await authFetch('/api/digests/configs', {
        method: 'POST',
        body: JSON.stringify(updated)
      });

      if (res.ok) {
        const saved = await res.json();
        setConfigs(prev => {
          const index = prev.findIndex(c => c.chatId === chatId);
          if (index >= 0) {
            const next = [...prev];
            next[index] = saved;
            return next;
          }
          return [...prev, saved];
        });
        showNotification('Настройки расписания сохранены');
      } else {
        const err = await res.json();
        showNotification(err.error || 'Ошибка при сохранении настроек', 'error');
      }
    } catch (e: any) {
      showNotification(e.message || 'Ошибка сети', 'error');
    }
  };

  const handleGenerateNow = async (targetChatId?: string, overrideHours?: number, overridePrompt?: string, send = false) => {
    const chatIdToUse = targetChatId || selectedChatId;
    if (!chatIdToUse) {
      showNotification('Выберите чат для генерации дайджеста', 'error');
      return;
    }

    setIsGenerating(true);
    setGeneratingChatId(chatIdToUse);

    try {
      const res = await authFetch('/api/digests/generate', {
        method: 'POST',
        body: JSON.stringify({
          chatId: chatIdToUse,
          hoursBack: overrideHours || hoursBack,
          customPrompt: overridePrompt !== undefined ? overridePrompt : customPrompt,
          sendImmediately: send || autoSendTelegram
        })
      });

      if (res.ok) {
        const newDigest = await res.json();
        setCurrentDigest(newDigest);
        setHistory(prev => [newDigest, ...prev]);
        setExpandedDigestId(newDigest.id);
        showNotification(send ? 'Дайджест сгенерирован и отправлен в Telegram!' : 'Дайджест успешно сгенерирован с помощью Gemini!');
        
        // Refresh history
        const histRes = await authFetch('/api/digests/history');
        if (histRes.ok) setHistory(await histRes.json());
      } else {
        const err = await res.json();
        showNotification(err.error || 'Ошибка при генерации дайджеста', 'error');
      }
    } catch (e: any) {
      showNotification(e.message || 'Ошибка генерации', 'error');
    } finally {
      setIsGenerating(false);
      setGeneratingChatId(null);
    }
  };

  const handleSendToTelegram = async (digestId: string, customTargetChat?: string) => {
    try {
      const res = await authFetch('/api/digests/send', {
        method: 'POST',
        body: JSON.stringify({
          digestId,
          targetChatId: customTargetChat
        })
      });

      if (res.ok) {
        showNotification('Дайджест успешно отправлен в Telegram!');
        const histRes = await authFetch('/api/digests/history');
        if (histRes.ok) setHistory(await histRes.json());
      } else {
        const err = await res.json();
        showNotification(err.error || 'Не удалось отправить в Telegram', 'error');
      }
    } catch (e: any) {
      showNotification(e.message || 'Ошибка отправки', 'error');
    }
  };

  const handleDeleteDigest = async (id: string) => {
    try {
      const res = await authFetch(`/api/digests/history/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setHistory(prev => prev.filter(d => d.id !== id));
        if (currentDigest?.id === id) {
          setCurrentDigest(history.find(d => d.id !== id) || null);
        }
        showNotification('Запись дайджеста удалена');
      }
    } catch (e: any) {
      showNotification(e.message || 'Ошибка удаления', 'error');
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    showNotification('Текст дайджеста скопирован в буфер обмена');
  };

  const activeChats = chats.filter(c => c.active);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {statusMessage && (
        <div 
          className={`p-4 rounded-xl flex items-center gap-3 border transition-all ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
          )}
          <span className="text-sm font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* Top Banner / API Key Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="p-3.5 bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-blue-500/30 rounded-xl text-blue-400">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-white tracking-tight">ИИ-Суммаризация и Дайджесты</h2>
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-medium">
                  <Bot className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-slate-300 font-mono">Gemini 3.7 Flash</span>
                </div>
                {geminiStatus?.configured ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    API Ключ активен
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Ключ не настроен
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Автоматический суточный анализ сообщений чатов. Бот собирает обсуждаемые темы, полезные советы и важные анонсы, генерируя структурированный дайджест по вашему расписанию.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <button
              onClick={() => setShowKeyGuide(!showKeyGuide)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            >
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>Где взять GEMINI_API_KEY?</span>
              {showKeyGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-all"
              title="Обновить данные"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Gemini API Key Guide Dropdown */}
        {showKeyGuide && (
          <div className="mt-6 pt-6 border-t border-slate-800/80 bg-slate-950/60 -mx-6 -mb-6 p-6 rounded-b-2xl">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="space-y-3 flex-1 text-sm text-slate-300">
                <h4 className="font-semibold text-white text-base">Инструкция: как получить бесплатный GEMINI_API_KEY</h4>
                <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed">
                  <li>
                    Перейдите на официальный портал Google: {' '}
                    <a 
                      href="https://aistudio.google.com/app/apikey" 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      Google AI Studio <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </li>
                  <li>Войдите под вашим Google-аккаунтом.</li>
                  <li>Нажмите кнопку <strong>«Create API key»</strong> (Создать ключ API).</li>
                  <li>Скопируйте полученную строку ключа (начинается с <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300 font-mono text-xs">AIzaSy...</code>).</li>
                  <li>
                    В AI Studio / файле <code className="bg-slate-800 px-1.5 py-0.5 rounded text-blue-300 font-mono text-xs">.env</code> укажите переменную:
                    <div className="mt-2 bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono text-xs text-emerald-300 select-all">
                      GEMINI_API_KEY=ваш_полученный_ключ_здесь
                    </div>
                  </li>
                </ol>
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Модель <strong>Gemini 3.7 Flash</strong> полностью бесплатна в рамках стандартных лимитов Google AI Studio и идеально подходит для регулярной суммаризации сообщений.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('schedule')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeSubTab === 'schedule'
              ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Расписание и чаты</span>
          <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-full">
            {configs.filter(c => c.enabled).length} активных
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('generator')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeSubTab === 'generator'
              ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
          }`}
        >
          <Play className="w-4 h-4" />
          <span>Быстрая генерация</span>
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeSubTab === 'history'
              ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span>История дайджестов</span>
          <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-full">
            {history.length}
          </span>
        </button>
      </div>

      {/* TAB 1: SCHEDULE & CHATS */}
      {activeSubTab === 'schedule' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Автоматическая отправка по расписанию</h3>
              <p className="text-sm text-slate-400">Настройте ежедневное время генерации и отправки дайджеста для каждого чата</p>
            </div>
            <div className="text-xs text-slate-400 font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span>Период: 24 часа</span>
            </div>
          </div>

          {activeChats.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-400 space-y-3">
              <MessageSquare className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-base font-medium text-slate-300">Нет активных чатов</p>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Активируйте нужные группы во вкладке «Управление чатами», чтобы настроить для них расписание ИИ-дайджестов.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {activeChats.map(chat => {
                const config = configs.find(c => c.chatId === chat.id) || {
                  chatId: chat.id,
                  chatTitle: chat.title,
                  enabled: false,
                  scheduleTime: '21:00',
                  hoursBack: 24,
                  includeTopics: true,
                  includeStats: true,
                  autoSendTelegram: true
                };

                const isGeneratingThis = isGenerating && generatingChatId === chat.id;

                return (
                  <div 
                    key={chat.id} 
                    className={`bg-slate-900 border rounded-2xl p-5 transition-all space-y-4 ${
                      config.enabled 
                        ? 'border-blue-500/40 bg-gradient-to-b from-slate-900 to-slate-900/90 shadow-lg shadow-blue-950/20' 
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={chat.avatarUrl || `https://picsum.photos/seed/${chat.id}/200`} 
                          alt={chat.title} 
                          className="w-11 h-11 rounded-xl object-cover border border-slate-700" 
                        />
                        <div>
                          <h4 className="font-semibold text-white leading-tight">{chat.title}</h4>
                          <span className="text-xs text-slate-400 font-mono">ID: {chat.id} • {chat.members || 0} уч.</span>
                        </div>
                      </div>

                      {/* Enable/Disable Toggle */}
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={config.enabled} 
                          onChange={(e) => handleUpdateConfig(chat.id, { enabled: e.target.checked })}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {/* Schedule Settings Form */}
                    <div className="space-y-3 pt-2 border-t border-slate-800/80">
                      <div className="grid grid-cols-2 gap-3">
                        {/* Time Picker */}
                        <div>
                          <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-400" />
                            Время отправки
                          </label>
                          <input 
                            type="time" 
                            value={config.scheduleTime || '21:00'}
                            onChange={(e) => handleUpdateConfig(chat.id, { scheduleTime: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        {/* Period / Hours Back */}
                        <div>
                          <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-purple-400" />
                            Глубина охвата
                          </label>
                          <select
                            value={config.hoursBack || 24}
                            onChange={(e) => handleUpdateConfig(chat.id, { hoursBack: Number(e.target.value) })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                          >
                            <option value={12}>За 12 часов</option>
                            <option value={24}>За 24 часа (сутки)</option>
                            <option value={48}>За 48 часов (2 дня)</option>
                          </select>
                        </div>
                      </div>

                      {/* Target Chat */}
                      <div>
                        <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5 text-emerald-400" />
                          Куда отправлять дайджест
                        </label>
                        <select
                          value={config.targetChatId || chat.id}
                          onChange={(e) => handleUpdateConfig(chat.id, { targetChatId: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                        >
                          <option value={chat.id}>В этот же чат ({chat.title})</option>
                          {chats.filter(c => c.id !== chat.id).map(c => (
                            <option key={c.id} value={c.id}>В чат: {c.title}</option>
                          ))}
                        </select>
                      </div>

                      {/* Custom Prompt / Special Focus */}
                      <div>
                        <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          Фокус / Тематический акцент (опционально)
                        </label>
                        <input
                          type="text"
                          placeholder="Например: обращать особое внимание на вопросы по ремонту и покатушкам"
                          value={config.customPrompt || ''}
                          onChange={(e) => handleUpdateConfig(chat.id, { customPrompt: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Footer Info & Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                      <div className="text-slate-500">
                        {config.lastSentAt ? (
                          <span>Посл. отправка: {new Date(config.lastSentAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} ({new Date(config.lastSentAt).toLocaleDateString('ru-RU')})</span>
                        ) : (
                          <span>Еще не отправлялся</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleGenerateNow(chat.id, config.hoursBack || 24, config.customPrompt, false)}
                          disabled={isGeneratingThis}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-all flex items-center gap-1.5"
                          title="Сгенерировать и просмотреть без отправки"
                        >
                          <Sparkles className={`w-3.5 h-3.5 text-blue-400 ${isGeneratingThis ? 'animate-spin' : ''}`} />
                          <span>{isGeneratingThis ? 'Создание...' : 'Тест ИИ'}</span>
                        </button>

                        <button
                          onClick={() => handleGenerateNow(chat.id, config.hoursBack || 24, config.customPrompt, true)}
                          disabled={isGeneratingThis}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all flex items-center gap-1.5 shadow-sm shadow-blue-900/40"
                          title="Сгенерировать и сразу отправить в Telegram"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Отправить сейчас</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Telegram Command Banner */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Команда бота в Telegram</h4>
                <p className="text-xs text-slate-400">Администраторы чата могут запросить свежую сводку прямо в группе с помощью команд <code className="bg-slate-800 px-1.5 py-0.5 rounded text-blue-300 font-mono">/summary</code> или <code className="bg-slate-800 px-1.5 py-0.5 rounded text-blue-300 font-mono">/дайджест</code>.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FAST GENERATOR */}
      {activeSubTab === 'generator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Column */}
          <div className="lg:col-span-1 space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                Параметры генерации
              </h3>

              {/* Chat Selector */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Выберите чат</label>
                <select
                  value={selectedChatId}
                  onChange={(e) => setSelectedChatId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {chats.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.active ? 'Активен' : 'Откл'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Timeframe */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Период охвата</label>
                <div className="grid grid-cols-3 gap-2">
                  {[12, 24, 48].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHoursBack(h)}
                      className={`py-2 text-xs font-medium rounded-xl border transition-all ${
                        hoursBack === h
                          ? 'bg-blue-600/10 border-blue-500 text-blue-400 font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {h} часов
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Prompt */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">
                  Индивидуальные инструкции для Gemini
                </label>
                <textarea
                  rows={3}
                  placeholder="Например: Выдели только технические вопросы по мотоциклам и анонсы мероприятий..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Auto send toggle */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-300">Сразу отправить в Telegram</span>
                <input 
                  type="checkbox" 
                  checked={autoSendTelegram} 
                  onChange={(e) => setAutoSendTelegram(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* Action button */}
              <button
                onClick={() => handleGenerateNow()}
                disabled={isGenerating || !selectedChatId}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Анализирую сообщения с Gemini...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Сгенерировать обзор</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Result Column */}
          <div className="lg:col-span-2 space-y-4">
            {currentDigest ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                {/* Result Header */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-base">Дайджест: {currentDigest.chatTitle}</h4>
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs rounded-full font-medium">
                        Готово
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Создан {new Date(currentDigest.createdAt).toLocaleString('ru-RU')} • Обработано: {currentDigest.messageCount} сообщ. ({currentDigest.userCount} уч.)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(currentDigest.summary, currentDigest.id)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-all"
                      title="Скопировать текст"
                    >
                      {copiedId === currentDigest.id ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      onClick={() => handleSendToTelegram(currentDigest.id)}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Отправить в Telegram</span>
                    </button>
                  </div>
                </div>

                {/* Markdown / Text Content */}
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-5 text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-wrap selection:bg-blue-600 selection:text-white">
                  {currentDigest.summary}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-4">
                <Sparkles className="w-12 h-12 mx-auto text-slate-600 animate-pulse" />
                <h4 className="font-semibold text-slate-200 text-base">Дайджест еще не сгенерирован</h4>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Выберите чат слева и нажмите «Сгенерировать обзор». Модель Gemini 3.7 Flash проанализирует сообщения и составит структурированную сводку.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: HISTORY */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Архив созданных дайджестов</h3>
              <p className="text-sm text-slate-400">Все ранее сформированные обзоры чатов и статус их отправки</p>
            </div>
            <span className="text-xs text-slate-400 font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
              Всего записей: {history.length}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
              <History className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-base font-medium text-slate-300">История пуста</p>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Здесь будут сохраняться все сгенерированные дайджесты — как по расписанию, так и созданные вручную.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => {
                const isExpanded = expandedDigestId === item.id;

                return (
                  <div 
                    key={item.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden transition-all"
                  >
                    <div 
                      onClick={() => setExpandedDigestId(isExpanded ? null : item.id)}
                      className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600/10 text-blue-400 rounded-lg border border-blue-500/20">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-white text-sm">{item.chatTitle}</h4>
                            {item.sentToTelegram ? (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] rounded-full font-medium">
                                Отправлен в Telegram
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded-full font-medium">
                                Только в панели
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 font-mono">
                            {new Date(item.createdAt).toLocaleString('ru-RU')} • {item.messageCount} сообщ. • {item.userCount} уч.
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(item.summary, item.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
                          title="Скопировать"
                        >
                          {copiedId === item.id ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendToTelegram(item.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800 transition-all"
                          title="Отправить в Telegram"
                        >
                          <Send className="w-4 h-4" />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDigest(item.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-all"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="text-slate-500">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-5 pt-0 border-t border-slate-800/80 bg-slate-950/40">
                        <div className="mt-3 bg-slate-950 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {item.summary}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

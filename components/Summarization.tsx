import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Clock, 
  Send, 
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
  Calendar,
  Play,
  Zap,
  Globe,
  Sliders,
  Cpu,
  X,
  Check,
  Smile,
  Flame,
  Laugh,
  Heart,
  Sun,
  ShieldCheck
} from 'lucide-react';
import { Chat, ChatDigestConfig, ChatDigestEntry, DigestToneStyle, TONE_STYLES, TONE_STYLE_LIST } from '../types';

interface SummarizationProps {
  chats: Chat[];
}

export const TelegramFormattedDigest: React.FC<{ text: string }> = ({ text }) => {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [expandedQuotes, setExpandedQuotes] = useState<Record<number, boolean>>({});

  const parseBlocks = (raw: string) => {
    let processed = raw || '';
    // Standardize any markdown bold/italic/headers if mixed
    processed = processed.replace(/^###?\s+(.+)$/gm, '<b>$1</b>');
    processed = processed.replace(/^#\s+(.+)$/gm, '<b>$1</b>');
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    processed = processed.replace(/__(.+?)__/g, '<b>$1</b>');
    processed = processed.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<i>$1</i>');
    processed = processed.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<i>$1</i>');
    processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
    processed = processed.replace(/^[\*\-]\s+/gm, '• ');

    // Match expandable and normal blockquotes
    const segments: Array<{ type: 'text' | 'expandable' | 'quote'; content: string }> = [];
    const quoteRegex = /<blockquote(\s+expandable)?>([\s\S]*?)<\/blockquote>/gi;
    let lastIndex = 0;
    let match;

    while ((match = quoteRegex.exec(processed)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: processed.slice(lastIndex, match.index) });
      }
      const isExpandable = !!match[1] || match[0].includes('expandable');
      segments.push({
        type: isExpandable ? 'expandable' : 'quote',
        content: match[2].trim()
      });
      lastIndex = quoteRegex.lastIndex;
    }

    if (lastIndex < processed.length) {
      segments.push({ type: 'text', content: processed.slice(lastIndex) });
    }

    return segments;
  };

  const segments = parseBlocks(text || '');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          <span className="font-medium text-slate-300">Telegram HTML (свёрнутые блоки &lt;blockquote expandable&gt;)</span>
        </div>
        <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              viewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Telegram Вид
          </button>
          <button
            type="button"
            onClick={() => setViewMode('code')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              viewMode === 'code' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Код HTML
          </button>
        </div>
      </div>

      {viewMode === 'code' ? (
        <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed overflow-x-auto select-all">
          {text}
        </pre>
      ) : (
        <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-5 text-sm text-slate-200 font-sans leading-relaxed space-y-3 shadow-inner">
          {segments.map((seg, idx) => {
            if (seg.type === 'expandable') {
              const isExpanded = !!expandedQuotes[idx];
              return (
                <div key={idx} className="my-2.5 rounded-lg border-l-4 border-blue-500 bg-blue-950/20 border border-slate-800/60 overflow-hidden">
                  <div 
                    onClick={() => setExpandedQuotes(prev => ({ ...prev, [idx]: !prev[idx] }))}
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-blue-900/20 transition-all select-none text-xs font-semibold text-blue-400"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>💬 Подробности обсуждения / Цитаты</span>
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-blue-400/90 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      {isExpanded ? 'Свернуть ▲' : 'Развернуть ▼'}
                    </span>
                  </div>
                  {isExpanded && (
                    <div className="p-3 pt-1 border-t border-slate-800/40 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                      <span dangerouslySetInnerHTML={{ __html: seg.content }} />
                    </div>
                  )}
                </div>
              );
            }
            if (seg.type === 'quote') {
              return (
                <blockquote key={idx} className="my-2 border-l-4 border-slate-600 bg-slate-900/40 pl-3.5 pr-2 py-2 rounded-r-lg text-xs italic text-slate-300">
                  <span dangerouslySetInnerHTML={{ __html: seg.content }} />
                </blockquote>
              );
            }
            return (
              <div key={idx} className="whitespace-pre-wrap">
                <span dangerouslySetInnerHTML={{ __html: seg.content }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const TIME_SLOTS_5MIN = Array.from({ length: 288 }, (_, i) => {
  const h = Math.floor((i * 5) / 60);
  const m = (i * 5) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

export const Summarization: React.FC<SummarizationProps> = ({ chats }) => {
  const [configs, setConfigs] = useState<ChatDigestConfig[]>([]);
  const [history, setHistory] = useState<ChatDigestEntry[]>([]);
  const [geminiStatus, setGeminiStatus] = useState<any>(null);
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
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string; hint?: string } | null>(null);
  const [expandedDigestId, setExpandedDigestId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'schedule' | 'generator' | 'history'>('schedule');
  const [selectedToneStyle, setSelectedToneStyle] = useState<DigestToneStyle>('default');

  // In-Admin AI Settings Modal State
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [aiForm, setAiForm] = useState({
    aiProvider: 'gemini' as 'gemini' | 'openrouter' | 'custom',
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    geminiBaseUrl: '',
    geminiUseProxy: true,
    geminiProxySource: 'auto' as 'auto' | 'tg_proxy' | 'cf_worker' | 'custom' | 'direct',
    openRouterApiKey: '',
    openRouterModel: 'google/gemini-2.5-flash',
    customAiEndpoint: '',
    customAiApiKey: '',
    customAiModel: 'gpt-4o-mini'
  });
  const [isTestingAi, setIsTestingAi] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isSavingAi, setIsSavingAi] = useState<boolean>(false);

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

  const showNotification = (text: string, type: 'success' | 'error' = 'success', hint?: string) => {
    setStatusMessage({ type, text, hint });
    if (type === 'success') {
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statusRes, configsRes, historyRes] = await Promise.all([
        authFetch('/api/ai/status'),
        authFetch('/api/digests/configs'),
        authFetch('/api/digests/history')
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setGeminiStatus(data);
        if (data.settings) {
          setAiForm(prev => ({
            ...prev,
            aiProvider: data.settings.aiProvider || 'gemini',
            geminiApiKey: data.settings.geminiApiKey || '',
            geminiModel: data.settings.geminiModel || 'gemini-2.5-flash',
            geminiBaseUrl: data.settings.geminiBaseUrl || '',
            geminiUseProxy: data.settings.geminiUseProxy !== false,
            geminiProxySource: data.settings.geminiProxySource || 'auto',
            openRouterApiKey: data.settings.openRouterApiKey || '',
            openRouterModel: data.settings.openRouterModel || 'google/gemini-2.5-flash',
            customAiEndpoint: data.settings.customAiEndpoint || '',
            customAiApiKey: data.settings.customAiApiKey || '',
            customAiModel: data.settings.customAiModel || 'gpt-4o-mini'
          }));
        }
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

  const handleSaveAiSettings = async () => {
    setIsSavingAi(true);
    try {
      const res = await authFetch('/api/ai/settings', {
        method: 'POST',
        body: JSON.stringify(aiForm)
      });
      if (res.ok) {
        showNotification('Настройки ИИ и API-ключ успешно сохранены в базе!');
        setShowAiModal(false);
        setTestResult(null);
        await loadData();
      } else {
        const err = await res.json();
        showNotification(err.error || 'Ошибка сохранения настроек ИИ', 'error');
      }
    } catch (e: any) {
      showNotification(e.message || 'Ошибка сети', 'error');
    } finally {
      setIsSavingAi(false);
    }
  };

  const handleTestAiConnection = async () => {
    setIsTestingAi(true);
    setTestResult(null);
    try {
      const res = await authFetch('/api/ai/test', {
        method: 'POST',
        body: JSON.stringify({
          provider: aiForm.aiProvider,
          apiKey: aiForm.aiProvider === 'openrouter' ? aiForm.openRouterApiKey : (aiForm.aiProvider === 'custom' ? aiForm.customAiApiKey : aiForm.geminiApiKey),
          model: aiForm.aiProvider === 'openrouter' ? aiForm.openRouterModel : (aiForm.aiProvider === 'custom' ? aiForm.customAiModel : aiForm.geminiModel),
          baseUrl: aiForm.geminiBaseUrl,
          endpoint: aiForm.customAiEndpoint,
          useProxy: aiForm.geminiUseProxy !== false,
          proxySource: aiForm.geminiProxySource || 'auto'
        })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e: any) {
      setTestResult({
        success: false,
        error: e.message || 'Не удалось выполнить проверку'
      });
    } finally {
      setIsTestingAi(false);
    }
  };

  const handleAutoDistribute = async (startTime = '21:00') => {
    try {
      const res = await authFetch('/api/digests/distribute-schedules', {
        method: 'POST',
        body: JSON.stringify({ startTime, intervalMinutes: 5 })
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs);
        showNotification('Время отправки успешно распределено по чатам с шагом 5 минут без пересечений!');
      } else {
        const err = await res.json();
        showNotification(err.error || 'Не удалось распределить время', 'error');
      }
    } catch (e: any) {
      showNotification(e.message || 'Ошибка сети', 'error');
    }
  };

  const handleUpdateConfig = async (chatId: string, updates: Partial<ChatDigestConfig>) => {
    const chatIdStr = String(chatId);
    const existing = configs.find(c => String(c.chatId) === chatIdStr) || {
      chatId: chatIdStr,
      chatTitle: chats.find(c => String(c.id) === chatIdStr)?.title || chatIdStr,
      enabled: false,
      scheduleTime: '21:00',
      hoursBack: 24,
      includeTopics: true,
      includeStats: true,
      autoSendTelegram: true,
      toneStyle: 'default',
      minMessageThreshold: 10
    };

    const willBeEnabled = updates.enabled !== undefined ? updates.enabled : existing.enabled;
    const targetTime = updates.scheduleTime || existing.scheduleTime || '21:00';

    // Conflict check: ensure no two active chats share the exact same posting time
    if (willBeEnabled) {
      const conflict = configs.find(c => String(c.chatId) !== chatIdStr && c.enabled && c.scheduleTime === targetTime);
      if (conflict && (updates.enabled === true || (updates.scheduleTime && updates.scheduleTime !== existing.scheduleTime))) {
        showNotification(
          `Время ${targetTime} уже закреплено за чатом «${conflict.chatTitle || conflict.chatId}». Выберите другое свободное время.`,
          'error',
          'Используйте «⚡ Распределить с шагом 5 мин», чтобы автоматически разнести время всех чатов.'
        );
        return;
      }
    }

    const updated = { ...existing, ...updates };

    // Optimistic immediate update to local state so UI responds instantly without refresh
    setConfigs(prev => {
      const index = prev.findIndex(c => String(c.chatId) === chatIdStr);
      if (index >= 0) {
        const next = [...prev];
        next[index] = updated;
        return next;
      }
      return [...prev, updated];
    });

    try {
      const res = await authFetch('/api/digests/configs', {
        method: 'POST',
        body: JSON.stringify(updated)
      });

      if (res.ok) {
        const saved = await res.json();
        setConfigs(prev => {
          const index = prev.findIndex(c => String(c.chatId) === chatIdStr);
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
        // Rollback on failure
        setConfigs(prev => {
          const index = prev.findIndex(c => String(c.chatId) === chatIdStr);
          if (index >= 0) {
            const next = [...prev];
            next[index] = existing;
            return next;
          }
          return prev;
        });
        showNotification(err.error || 'Ошибка при сохранении настроек', 'error', err.suggestedTime ? `Предлагаемое свободное время: ${err.suggestedTime}` : undefined);
      }
    } catch (e: any) {
      // Rollback on network error
      setConfigs(prev => {
        const index = prev.findIndex(c => String(c.chatId) === chatIdStr);
        if (index >= 0) {
          const next = [...prev];
          next[index] = existing;
          return next;
        }
        return prev;
      });
      showNotification(e.message || 'Ошибка сети при сохранении', 'error');
    }
  };

  const handleBulkToggleAll = async (enabled: boolean) => {
    const updatedList = activeChats.map(chat => {
      const existing = configs.find(c => String(c.chatId) === String(chat.id)) || {
        chatId: String(chat.id),
        chatTitle: chat.title,
        enabled: false,
        scheduleTime: '21:00',
        hoursBack: 24,
        includeTopics: true,
        includeStats: true,
        autoSendTelegram: true,
        toneStyle: 'default'
      };
      return { ...existing, enabled };
    });

    setConfigs(updatedList);

    try {
      const res = await authFetch('/api/digests/configs/bulk', {
        method: 'POST',
        body: JSON.stringify({ configs: updatedList })
      });
      if (res.ok) {
        showNotification(enabled ? 'Расписание включено для всех активных чатов' : 'Расписание выключено для всех чатов');
      } else {
        showNotification('Не удалось сохранить групповые настройки', 'error');
      }
    } catch (e: any) {
      showNotification(e.message || 'Ошибка сети', 'error');
    }
  };

  const handleGenerateNow = async (targetChatId?: string, overrideHours?: number, overridePrompt?: string, send = false, overrideTone?: DigestToneStyle) => {
    const chatIdToUse = targetChatId || selectedChatId;
    if (!chatIdToUse) {
      showNotification('Выберите чат для генерации дайджеста', 'error');
      return;
    }

    setIsGenerating(true);
    setGeneratingChatId(chatIdToUse);
    setStatusMessage(null);

    try {
      const toneToUse = overrideTone || selectedToneStyle;
      const res = await authFetch('/api/digests/generate', {
        method: 'POST',
        body: JSON.stringify({
          chatId: chatIdToUse,
          hoursBack: overrideHours || hoursBack,
          customPrompt: overridePrompt !== undefined ? overridePrompt : customPrompt,
          sendImmediately: send || autoSendTelegram,
          toneStyle: toneToUse
        })
      });

      if (res.ok) {
        const newDigest = await res.json();
        setCurrentDigest(newDigest);
        setHistory(prev => [newDigest, ...prev]);
        setExpandedDigestId(newDigest.id);
        showNotification(send ? 'Дайджест сгенерирован и отправлен в Telegram!' : 'Дайджест успешно сгенерирован ИИ!');
        
        // Refresh history
        const histRes = await authFetch('/api/digests/history');
        if (histRes.ok) setHistory(await histRes.json());
      } else {
        const err = await res.json();
        const errMsg = err.error || 'Ошибка при генерации дайджеста';
        let hint = '';
        if (errMsg.includes('минимум 10') || errMsg.includes('зафиксировано только')) {
          hint = 'Дайджест не составляется для чатов с низкой активностью (< 10 сообщений за 24 ч), чтобы не спамить участников.';
        } else if (errMsg.includes('User location is not supported') || errMsg.includes('FAILED_PRECONDITION')) {
          hint = 'Google блокирует запросы из региона сервера. Нажмите «Настройки ИИ» и выберите OpenRouter — это снимет ограничение!';
        }
        showNotification(errMsg, 'error', hint);
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

  const getProviderName = (provider?: string) => {
    if (provider === 'openrouter') return 'OpenRouter';
    if (provider === 'custom') return 'Custom AI / Proxy';
    return 'Google Gemini';
  };

  return (
    <div className="space-y-6">
      {/* Toast / Error Notification */}
      {statusMessage && (
        <div 
          className={`p-4 rounded-xl flex items-start justify-between gap-3 border transition-all ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-start gap-3">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" />
            )}
            <div className="space-y-1 text-sm font-medium">
              <p className="whitespace-pre-wrap">{statusMessage.text}</p>
              {statusMessage.hint && (
                <div className="mt-2 p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
                  <span>💡 {statusMessage.hint}</span>
                  <button
                    onClick={() => {
                      setAiForm(f => ({ ...f, aiProvider: 'openrouter' }));
                      setShowAiModal(true);
                    }}
                    className="px-2.5 py-1 bg-amber-500 text-black font-bold rounded-lg text-xs hover:bg-amber-400 shrink-0"
                  >
                    Переключить на OpenRouter
                  </button>
                </div>
              )}
            </div>
          </div>
          <button 
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
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
                  <span className="text-slate-300 font-mono">
                    {getProviderName(geminiStatus?.provider)} ({geminiStatus?.model || 'gemini-2.5-flash'})
                  </span>
                  {geminiStatus?.effectiveGeminiProxy && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-500/30">
                      Reverse Proxy
                    </span>
                  )}
                </div>
                {geminiStatus?.configured ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Ключ активен {geminiStatus.activeKeyMasked ? `(${geminiStatus.activeKeyMasked})` : ''}
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

          <div className="flex items-center gap-2.5 self-start md:self-center flex-wrap">
            <button
              onClick={() => setShowAiModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-900/30"
            >
              <Sliders className="w-4 h-4" />
              <span>Настройки ИИ и Ключ</span>
            </button>

            <button
              onClick={() => setShowKeyGuide(!showKeyGuide)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
            >
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>Где взять ключ?</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-blue-400 font-bold">
                  <Bot className="w-4 h-4" />
                  <span>Вариант 1: Google Gemini API (Бесплатно)</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>Откройте <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Google AI Studio</a>.</li>
                  <li>Войдите в Google аккаунт и нажмите <strong>«Create API key»</strong>.</li>
                  <li>Скопируйте ключ (<code className="text-amber-300">AIzaSy...</code>) и вставьте в окно «Настройки ИИ» в этой панели.</li>
                  <li><em>Примечание: если сервер расположен в регионе с блокировкой Google, используйте вариант 2.</em></li>
                </ol>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Вариант 2: OpenRouter (Без ограничений стран)</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>Зарегистрируйтесь на <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">OpenRouter.ai</a>.</li>
                  <li>Создайте ключ (<code className="text-amber-300">sk-or-v1-...</code>).</li>
                  <li>В «Настройках ИИ» выберите провайдер <strong>OpenRouter</strong> и вставьте ключ.</li>
                  <li>Доступны модели: Gemini 2.5 Flash, DeepSeek V3, Llama 3.3 без геоблокировок!</li>
                </ol>
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
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white">Автоматическая отправка по расписанию</h3>
              <p className="text-sm text-slate-400">Настройте уникальное ежедневное время генерации и отправки дайджеста для каждого чата</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleAutoDistribute('21:00')}
                className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-amber-950/20"
                title="Автоматически распределить время постинга активных чатов с интервалом 5 минут начиная с 21:00"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>⚡ Распределить время (шаг 5 мин)</span>
              </button>
              <button
                onClick={() => handleBulkToggleAll(true)}
                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-all"
                title="Включить ежедневное расписание для всех активных чатов"
              >
                Включить для всех
              </button>
              <button
                onClick={() => handleBulkToggleAll(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition-all"
                title="Отключить расписание для всех чатов"
              >
                Отключить для всех
              </button>
            </div>
          </div>

          {/* Key System Rules Banner */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <span className="font-bold text-slate-200">Разбег 5 минут (Защита 429)</span>
                <p className="text-slate-400 leading-relaxed">
                  Каждый чат занимает отдельный слот. Одно и то же время нельзя выбрать двум чатам одновременно.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <span className="font-bold text-slate-200">100% Обезличенность</span>
                <p className="text-slate-400 leading-relaxed">
                  В дайджесте полностью исключены имена, ники и теги участников. Описывается только суть и факты.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <span className="font-bold text-slate-200">Умный порог активности (&gt;10)</span>
                <p className="text-slate-400 leading-relaxed">
                  Пустой дайджест не спамит каждый день. Публикуется 1 раз после дня с &gt;10 сообщ. и ждет новой волны.
                </p>
              </div>
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
                const config = configs.find(c => String(c.chatId) === String(chat.id)) || {
                  chatId: String(chat.id),
                  chatTitle: chat.title,
                  enabled: false,
                  scheduleTime: '21:00',
                  hoursBack: 24,
                  includeTopics: true,
                  includeStats: true,
                  autoSendTelegram: true,
                  toneStyle: 'default',
                  minMessageThreshold: 10
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2.5 rounded-xl ${config.enabled ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                          <MessageSquare className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-white text-base truncate">{chat.title}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-mono">ID: {chat.id}</span>
                            {config.enabled && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-mono text-[11px] font-bold border border-blue-500/20">
                                ⏱️ {config.scheduleTime || '21:00'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

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

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                        <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                          Время отправки (интервал 5 мин)
                        </label>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                          <select
                            value={config.scheduleTime || '21:00'}
                            disabled={!config.enabled}
                            onChange={(e) => handleUpdateConfig(chat.id, { scheduleTime: e.target.value })}
                            className="bg-transparent text-white font-mono text-xs focus:outline-none w-full disabled:opacity-40"
                          >
                            {TIME_SLOTS_5MIN.map(slot => {
                              const occupiedBy = configs.find(c => String(c.chatId) !== String(chat.id) && c.enabled && c.scheduleTime === slot);
                              return (
                                <option 
                                  key={slot} 
                                  value={slot} 
                                  disabled={!!occupiedBy}
                                  className={occupiedBy ? 'text-slate-600 bg-slate-950' : 'text-slate-100 bg-slate-900'}
                                >
                                  {slot} {occupiedBy ? `(Занято: ${occupiedBy.chatTitle.slice(0, 16)}...)` : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                        <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                          Период анализа
                        </label>
                        <select
                          value={config.hoursBack || 24}
                          disabled={!config.enabled}
                          onChange={(e) => handleUpdateConfig(chat.id, { hoursBack: Number(e.target.value) })}
                          className="bg-transparent text-white text-xs focus:outline-none w-full disabled:opacity-40"
                        >
                          <option value={12}>12 часов</option>
                          <option value={24}>24 часа (сутки)</option>
                          <option value={48}>48 часов (2 дня)</option>
                        </select>
                      </div>
                    </div>

                    {/* Tone Style Selector for Chat Schedule */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                      <label className="text-[11px] font-bold text-slate-400 uppercase flex items-center justify-between mb-1.5">
                        <span>Стиль повествования</span>
                        <span className="text-[10px] text-blue-400 font-normal">
                          {TONE_STYLES[config.toneStyle || 'default']?.label}
                        </span>
                      </label>
                      <select
                        value={config.toneStyle || 'default'}
                        disabled={!config.enabled}
                        onChange={(e) => handleUpdateConfig(chat.id, { toneStyle: e.target.value as DigestToneStyle })}
                        className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-40"
                      >
                        {TONE_STYLE_LIST.map(style => (
                          <option key={style.id} value={style.id}>
                            {style.icon} {style.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Activity wave and threshold status */}
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl px-3 py-2 text-[11px] text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span>Порог отправки: <strong>&ge; 10 сообщений</strong></span>
                      </span>
                      {config.lastWaveSummarizedAt ? (
                        <span className="text-slate-500 text-[10px]">
                          Волна от: {new Date(config.lastWaveSummarizedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">Ожидает первой волны</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                      <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.autoSendTelegram}
                          onChange={(e) => handleUpdateConfig(chat.id, { autoSendTelegram: e.target.checked })}
                          className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
                        />
                        <span>Авто-отправка в группу</span>
                      </label>

                      <button
                        onClick={() => handleGenerateNow(chat.id, config.hoursBack, undefined, true, config.toneStyle)}
                        disabled={isGenerating}
                        className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg font-medium flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {isGeneratingThis ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>Сгенерировать сейчас</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FAST GENERATOR */}
      {activeSubTab === 'generator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 h-fit">
            <div>
              <h3 className="text-base font-bold text-white">Параметры генерации</h3>
              <p className="text-xs text-slate-400 mt-0.5">Создайте и просмотрите дайджест в реальном времени</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Выберите чат
              </label>
              <select
                value={selectedChatId}
                onChange={(e) => setSelectedChatId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                {activeChats.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Период (часы)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[12, 24, 48].map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHoursBack(h)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      hoursBack === h 
                        ? 'bg-blue-600 text-white border-blue-500' 
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {h} ч
                  </button>
                ))}
              </div>
            </div>

            {/* Tone Style Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Стиль повествования ИИ
              </label>
              <div className="grid grid-cols-1 gap-2">
                {TONE_STYLE_LIST.map(style => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setSelectedToneStyle(style.id)}
                    className={`p-2.5 rounded-xl text-left transition-all border flex items-center justify-between ${
                      selectedToneStyle === style.id
                        ? 'bg-blue-600/15 text-white border-blue-500 shadow-sm'
                        : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{style.icon}</span>
                      <div>
                        <div className="text-xs font-bold text-white">{style.label}</div>
                        <div className="text-[10px] text-slate-400 leading-tight">{style.description}</div>
                      </div>
                    </div>
                    {selectedToneStyle === style.id && (
                      <Check className="w-4 h-4 text-blue-400 flex-shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Особые пожелания к ИИ (Промпт)
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Например: выдели главные новости о разработке или сделай акцент на отзывах участников..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="autoSend"
                checked={autoSendTelegram}
                onChange={(e) => setAutoSendTelegram(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
              />
              <label htmlFor="autoSend" className="text-xs text-slate-300 cursor-pointer">
                Сразу отправить в Telegram после генерации
              </label>
            </div>

            <button
              onClick={() => handleGenerateNow()}
              disabled={isGenerating || !selectedChatId}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-blue-950/40 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>ИИ анализирует сообщения...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Сгенерировать дайджест</span>
                </>
              )}
            </button>
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Результат генерации</h3>
                <p className="text-xs text-slate-400">Предпросмотр готового дайджеста</p>
              </div>

              {currentDigest && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(currentDigest.summary, currentDigest.id)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                    title="Скопировать"
                  >
                    {copiedId === currentDigest.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Скопировать</span>
                  </button>

                  <button
                    onClick={() => handleSendToTelegram(currentDigest.id)}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Отправить в Telegram</span>
                  </button>
                </div>
              )}
            </div>

            {currentDigest ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs text-slate-400 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span>Чат: <strong className="text-white">{currentDigest.chatTitle}</strong></span>
                  <span>•</span>
                  <span>Период: <strong className="text-blue-400">{currentDigest.hoursBack || 24}ч</strong></span>
                  <span>•</span>
                  <span>Сформирован: <strong className="text-slate-300">{new Date(currentDigest.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                </div>

                <TelegramFormattedDigest text={currentDigest.summary} />
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500 space-y-3">
                <Sparkles className="w-12 h-12 mx-auto text-slate-700" />
                <p className="text-sm">Здесь отобразится текст дайджеста после запуска генерации</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: HISTORY */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">История сформированных дайджестов</h3>
            <span className="text-xs text-slate-400 font-mono">Всего: {history.length}</span>
          </div>

          {history.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 space-y-3">
              <History className="w-10 h-10 mx-auto text-slate-700" />
              <p className="text-sm">История дайджестов пуста</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map(item => {
                const isExpanded = expandedDigestId === item.id;
                return (
                  <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-all">
                    <div 
                      onClick={() => setExpandedDigestId(isExpanded ? null : item.id)}
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600/10 text-blue-400 rounded-lg">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{item.chatTitle}</span>
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
                            {new Date(item.createdAt).toLocaleString('ru-RU')} • {item.hoursBack || 24} ч
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(item.summary, item.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
                          title="Скопировать"
                        >
                          {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
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

                        <div className="text-slate-500 ml-2">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-5 pt-0 border-t border-slate-800/80 bg-slate-950/40">
                        <div className="mt-3">
                          <TelegramFormattedDigest text={item.summary} />
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

      {/* AI SETTINGS MODAL */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 p-6 relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Настройка ИИ и Ключей (Админка)</h3>
                  <p className="text-xs text-slate-400">Сохранение в базу данных без редактирования .env</p>
                </div>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Provider Tabs */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Провайдер ИИ
              </label>
              <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setAiForm({ ...aiForm, aiProvider: 'gemini' })}
                  className={`py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    aiForm.aiProvider === 'gemini' 
                      ? 'bg-blue-600 text-white shadow' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Google Gemini</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAiForm({ ...aiForm, aiProvider: 'openrouter' })}
                  className={`py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    aiForm.aiProvider === 'openrouter' 
                      ? 'bg-indigo-600 text-white shadow' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>OpenRouter</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAiForm({ ...aiForm, aiProvider: 'custom' })}
                  className={`py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    aiForm.aiProvider === 'custom' 
                      ? 'bg-purple-600 text-white shadow' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Custom Proxy</span>
                </button>
              </div>
            </div>

            {/* Fields based on provider */}
            {aiForm.aiProvider === 'gemini' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase">
                      Google Gemini API Key
                    </label>
                    <a 
                      href="https://aistudio.google.com/app/apikey" 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      Создать ключ бесплатно <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <input
                    type="password"
                    value={aiForm.geminiApiKey}
                    onChange={(e) => setAiForm({ ...aiForm, geminiApiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ключ сохраняется в защищенной базе Firestore и используется всеми фоновыми задачами.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                      Модель
                    </label>
                    <select
                      value={aiForm.geminiModel}
                      onChange={(e) => setAiForm({ ...aiForm, geminiModel: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="gemini-2.0-flash">⚡ gemini-2.0-flash (Рекомендуется: быстрая и стабильная)</option>
                      <option value="gemini-2.0-flash-lite">🚀 gemini-2.0-flash-lite (Минимальная задержка и высокая квота)</option>
                      <option value="gemini-1.5-flash">🛡️ gemini-1.5-flash (Проверенная базовая модель)</option>
                      <option value="gemini-1.5-pro">🧠 gemini-1.5-pro (Глубокий анализ контекста)</option>
                      <option value="gemini-2.5-pro">💎 gemini-2.5-pro (Флагманская модель)</option>
                      <option value="gemini-3.7-flash">✨ gemini-3.7-flash (Gemini 3.7 Flash)</option>
                      <option value="gemini-3.6-flash">✨ gemini-3.6-flash (Gemini 3.6 Flash)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                      Маршрутизация Gemini
                    </label>
                    <select
                      value={aiForm.geminiProxySource}
                      onChange={(e) => setAiForm({ ...aiForm, geminiProxySource: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="auto">⚡ Авто (Cloudflare Worker или кастомный прокси)</option>
                      <option value="cf_worker">☁️ Cloudflare Worker {geminiStatus?.detectedCfWorker ? `(${geminiStatus.detectedCfWorker})` : ''}</option>
                      <option value="custom">✏️ Кастомный Base URL / Прокси (ввести вручную)</option>
                      <option value="direct">⛔ Прямое подключение к Google (без прокси)</option>
                    </select>
                  </div>
                </div>

                {aiForm.geminiProxySource === 'custom' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                      Кастомный Base URL / Прокси
                    </label>
                    <input
                      type="text"
                      value={aiForm.geminiBaseUrl}
                      onChange={(e) => setAiForm({ ...aiForm, geminiBaseUrl: e.target.value })}
                      placeholder="https://your-worker.workers.dev"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                )}

                <div className="p-3 bg-blue-950/40 border border-blue-800/40 rounded-xl text-xs text-blue-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Активный маршрут:</span>
                  </span>
                  <span className="font-mono text-[11px] text-emerald-300 truncate max-w-[240px]">
                    {aiForm.geminiProxySource === 'direct' 
                      ? 'Прямое подключение к Google' 
                      : (aiForm.geminiBaseUrl || (geminiStatus?.detectedCfWorker ? geminiStatus.detectedCfWorker : 'Прямое подключение к Google'))}
                  </span>
                </div>
              </div>
            )}

            {aiForm.aiProvider === 'openrouter' && (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-200 flex items-start gap-2">
                  <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Решение ошибки «User location is not supported»:</strong> OpenRouter работает без региональных ограничений и дает доступ к Gemini 2.5 Flash, DeepSeek и Llama 3.3.
                    <div className="mt-1 text-slate-400">
                      💡 <em>При создании ключа на OpenRouter оставьте лимит пустым и создавайте ключ со стандартной политикой (Default, без ограничений по доменам).</em>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase">
                      OpenRouter API Key
                    </label>
                    <a 
                      href="https://openrouter.ai/keys" 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      Получить ключ на openrouter.ai <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <input
                    type="password"
                    value={aiForm.openRouterApiKey}
                    onChange={(e) => setAiForm({ ...aiForm, openRouterApiKey: e.target.value })}
                    placeholder="sk-or-v1-..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    Модель
                  </label>
                  <select
                    value={aiForm.openRouterModel}
                    onChange={(e) => setAiForm({ ...aiForm, openRouterModel: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
              </div>
            )}

            {aiForm.aiProvider === 'custom' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                    URL Эндпоинта (OpenAI Compatible)
                  </label>
                  <input
                    type="text"
                    value={aiForm.customAiEndpoint}
                    onChange={(e) => setAiForm({ ...aiForm, customAiEndpoint: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={aiForm.customAiApiKey}
                      onChange={(e) => setAiForm({ ...aiForm, customAiApiKey: e.target.value })}
                      placeholder="sk-..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                      Имя Модели
                    </label>
                    <input
                      type="text"
                      value={aiForm.customAiModel}
                      onChange={(e) => setAiForm({ ...aiForm, customAiModel: e.target.value })}
                      placeholder="gpt-4o-mini"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Test result feedback */}
            {testResult && (
              <div className={`p-3.5 rounded-xl text-xs border ${
                testResult.success 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-start gap-2.5">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold">{testResult.message || 'Результат проверки'}</p>
                    {testResult.error && (
                      <p className="font-mono text-[11px] text-rose-200 bg-black/40 p-2 rounded">
                        {testResult.error}
                      </p>
                    )}
                    {testResult.sample && (
                      <p className="text-slate-300 bg-black/30 p-2 rounded">
                        Ответ: «{testResult.sample}»
                      </p>
                    )}
                    {testResult.hint && (
                      <p className="text-amber-300 font-medium pt-1">
                        💡 {testResult.hint}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleTestAiConnection}
                disabled={isTestingAi}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-2 disabled:opacity-50"
              >
                {isTestingAi ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Cpu className="w-3.5 h-3.5" />
                )}
                <span>Проверить соединение</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  className="px-4 py-2.5 text-slate-400 hover:text-white text-xs font-medium"
                >
                  Отмена
                </button>

                <button
                  type="button"
                  onClick={handleSaveAiSettings}
                  disabled={isSavingAi}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-900/30 disabled:opacity-50"
                >
                  {isSavingAi ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Сохранить настройки</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

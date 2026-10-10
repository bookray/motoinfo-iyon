import React, { useState, useEffect } from 'react';
import { 
  Award, ThumbsUp, ThumbsDown, AlertTriangle, ShieldAlert, 
  Search, Filter, Plus, UserMinus, RotateCcw, Clock, 
  MessageSquare, User, CheckCircle2, ChevronRight, TrendingUp, TrendingDown, Sparkles,
  Bell, Send, RefreshCw, Settings as SettingsIcon, XCircle
} from 'lucide-react';
import { Chat, ReputationEntry, WarningEntry, FilterSettings } from '../types';

interface ReputationProps {
  chats: Chat[];
  filters: FilterSettings;
  onUpdateFilters?: (filters: FilterSettings) => void;
}

export const Reputation: React.FC<ReputationProps> = ({ chats, filters, onUpdateFilters }) => {
  const [reputations, setReputations] = useState<ReputationEntry[]>([]);
  const [warnings, setWarnings] = useState<WarningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChatFilter, setSelectedChatFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'LEADERBOARD' | 'WARNINGS' | 'HISTORY'>('LEADERBOARD');

  // Notification Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTestingRepNotify, setIsTestingRepNotify] = useState(false);
  const [repNotifyResult, setRepNotifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [localNotifyChatId, setLocalNotifyChatId] = useState(filters.reputationNotifyChatId || '');
  const [localNotifyInGroup, setLocalNotifyInGroup] = useState<boolean>((filters as any).reputationNotifyInGroup !== false && !(filters as any).muteReputationChangeMessages);
  const [localNotifyInAdminChat, setLocalNotifyInAdminChat] = useState<boolean>((filters as any).reputationNotifyInAdminChat !== false);
  const [localNotifyInDm, setLocalNotifyInDm] = useState<boolean>((filters as any).reputationNotifyInDm !== false);
  const [localMuteChangeMessages, setLocalMuteChangeMessages] = useState<boolean>(!!(filters as any).muteReputationChangeMessages);
  const [localDailyDigestEnabled, setLocalDailyDigestEnabled] = useState<boolean>((filters as any).reputationDailyDigestEnabled !== false);

  // Modals
  const [isWarnModalOpen, setIsWarnModalOpen] = useState(false);
  const [isRepModalOpen, setIsRepModalOpen] = useState(false);
  const [selectedUserHistory, setSelectedUserHistory] = useState<ReputationEntry | null>(null);

  // Form states
  const [targetUserId, setTargetUserId] = useState('');
  const [targetChatId, setTargetChatId] = useState(chats[0]?.id || '');
  const [warnReason, setWarnReason] = useState('');
  const [repDelta, setRepDelta] = useState(1);
  const [repReason, setRepReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const warnLimit = filters?.warnLimit || 3;
  const isReputationActive = filters?.reputationEnabled !== false;

  const handleToggleReputation = async () => {
    if (!onUpdateFilters) return;
    const newStatus = !isReputationActive;
    const updatedFilters = { ...filters, reputationEnabled: newStatus };
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/filters', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(updatedFilters)
      });
      onUpdateFilters(updatedFilters);
      setActionSuccess(newStatus ? 'Система репутации включена' : 'Система репутации временно отключена (режим тестирования)');
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err) {
      console.error('Failed to toggle reputation:', err);
    }
  };

  const handleTestNotification = async () => {
    setIsTestingRepNotify(true);
    setRepNotifyResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/reputation/test-notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          chatId: localNotifyChatId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRepNotifyResult({ success: true, message: `Уведомление успешно доставлено в чат ${data.targetChatId} (ID: ${data.messageId})` });
      } else {
        setRepNotifyResult({ success: false, message: data.error || 'Ошибка отправки уведомления' });
      }
    } catch (e: any) {
      setRepNotifyResult({ success: false, message: 'Ошибка сети: ' + (e.message || String(e)) });
    } finally {
      setIsTestingRepNotify(false);
    }
  };

  const handleSaveNotifySettings = async () => {
    if (!onUpdateFilters) return;
    const effectiveInGroup = localMuteChangeMessages ? false : localNotifyInGroup;
    const updated = {
      ...filters,
      reputationNotifyChatId: localNotifyChatId,
      reputationNotifyInGroup: effectiveInGroup,
      reputationNotifyInAdminChat: localNotifyInAdminChat,
      reputationNotifyInDm: localNotifyInDm,
      muteReputationChangeMessages: localMuteChangeMessages,
      reputationDailyDigestEnabled: localDailyDigestEnabled,
    };
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      await Promise.all([
        fetch('/api/filters', {
          method: 'PUT',
          headers,
          body: JSON.stringify(updated)
        }),
        fetch('/api/settings', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            reputationNotifyChatId: localNotifyChatId,
            reputationNotifyInGroup: effectiveInGroup,
            reputationNotifyInAdminChat: localNotifyInAdminChat,
            reputationNotifyInDm: localNotifyInDm,
            muteReputationChangeMessages: localMuteChangeMessages,
            reputationDailyDigestEnabled: localDailyDigestEnabled,
          })
        }).catch(() => {})
      ]);

      onUpdateFilters(updated);
      setActionSuccess('Настройки уведомлений и суммаризации репутации успешно сохранены');
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (e) {
      console.error('Failed to save reputation notify settings:', e);
    }
  };

  useEffect(() => {
    if (filters) {
      setLocalNotifyChatId(filters.reputationNotifyChatId || '');
      setLocalNotifyInGroup((filters as any).reputationNotifyInGroup !== false && !(filters as any).muteReputationChangeMessages);
      setLocalNotifyInAdminChat((filters as any).reputationNotifyInAdminChat !== false);
      setLocalNotifyInDm((filters as any).reputationNotifyInDm !== false);
      setLocalMuteChangeMessages(!!(filters as any).muteReputationChangeMessages);
      setLocalDailyDigestEnabled((filters as any).reputationDailyDigestEnabled !== false);
    }
  }, [filters]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

      const [repRes, warnRes] = await Promise.all([
        fetch('/api/reputation', { headers }),
        fetch('/api/warnings', { headers })
      ]);

      if (repRes.ok) {
        const data = await repRes.json();
        setReputations(data);
      }
      if (warnRes.ok) {
        const data = await warnRes.json();
        setWarnings(data);
      }
    } catch (err) {
      console.error('Failed to load reputation/warnings data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter reputation by chat & search
  const getFilteredReputations = () => {
    let list = [...reputations];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().replace('@', '');
      list = list.filter(r => 
        r.userId.toLowerCase().includes(q) ||
        (r.username && r.username.toLowerCase().includes(q)) ||
        (r.firstName && r.firstName.toLowerCase().includes(q)) ||
        (r.lastName && r.lastName.toLowerCase().includes(q))
      );
    }

    if (selectedChatFilter !== 'ALL') {
      // Calculate score specific to this chat
      list = list.map(r => ({
        ...r,
        score: (r.chatScores && r.chatScores[selectedChatFilter] !== undefined) 
          ? r.chatScores[selectedChatFilter] 
          : 0
      }));
    }

    return list;
  };

  const filteredList = getFilteredReputations();

  // Top 10 Positive Leaders
  const topPositive = [...filteredList]
    .sort((a, b) => b.score - a.score)
    .filter(r => r.score > 0)
    .slice(0, 10);

  // Top 10 Anti-Rating (Negative Leaders)
  const topNegative = [...filteredList]
    .sort((a, b) => a.score - b.score)
    .filter(r => r.score < 0)
    .slice(0, 10);

  interface UserWarningSummary {
    userId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    activeCount: number;
    totalCount: number;
    warnings: WarningEntry[];
  }

  // Group active warnings by user
  const userWarningsMap = warnings.reduce<Record<string, UserWarningSummary>>((acc, w) => {
    if (!acc[w.userId]) {
      acc[w.userId] = {
        userId: w.userId,
        username: w.username,
        firstName: w.firstName,
        lastName: w.lastName,
        activeCount: 0,
        totalCount: 0,
        warnings: []
      };
    }
    acc[w.userId].totalCount++;
    if (w.active) {
      acc[w.userId].activeCount++;
    }
    acc[w.userId].warnings.push(w);
    return acc;
  }, {});

  const topWarnedUsers: UserWarningSummary[] = Object.keys(userWarningsMap)
    .map(key => userWarningsMap[key])
    .filter(u => u.activeCount > 0)
    .sort((a, b) => b.activeCount - a.activeCount)
    .slice(0, 10);

  // Submit manual warning
  const handleCreateWarn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId) return;

    try {
      setActionLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/warnings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          userId: targetUserId,
          chatId: targetChatId,
          reason: warnReason || 'Предупреждение от администратора панели'
        })
      });

      if (res.ok) {
        setIsWarnModalOpen(false);
        setTargetUserId('');
        setWarnReason('');
        setActionSuccess('Предупреждение успешно выдано!');
        setTimeout(() => setActionSuccess(null), 4000);
        await loadData();
      } else {
        const err = await res.json();
        alert(`Ошибка: ${err.error || 'Не удалось выдать предупреждение'}`);
      }
    } catch (err) {
      alert('Ошибка при выполнении запроса');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit reputation adjustment
  const handleAdjustRep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId) return;

    try {
      setActionLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/reputation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          userId: targetUserId,
          delta: repDelta,
          reason: repReason || 'Ручная корректировка из панели',
          chatId: targetChatId
        })
      });

      if (res.ok) {
        setIsRepModalOpen(false);
        setTargetUserId('');
        setRepReason('');
        setActionSuccess('Репутация успешно обновлена!');
        setTimeout(() => setActionSuccess(null), 4000);
        await loadData();
      } else {
        const err = await res.json();
        alert(`Ошибка: ${err.error || 'Не удалось изменить репутацию'}`);
      }
    } catch (err) {
      alert('Ошибка при выполнении запроса');
    } finally {
      setActionLoading(false);
    }
  };

  // Revoke / unwarn
  const handleRevokeWarn = async (warnId: string) => {
    if (!confirm('Снять это предупреждение с пользователя?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/warnings/${warnId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (res.ok) {
        setActionSuccess('Предупреждение снято!');
        setTimeout(() => setActionSuccess(null), 3000);
        await loadData();
      }
    } catch (e) {
      console.error('Failed to revoke warning:', e);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Banner & Quick Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <Award className="w-8 h-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-white tracking-tight">Репутация и предупреждения</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Все чаты
                </span>
                {isReputationActive ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Активна
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Отключена (Тестирование)
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Глобальный рейтинг участников, благодарности («Спасибо» по цитате), реакции (👍/❤️ +1, 👎/🤡 -1) и система варнов ({warnLimit} варна до бана)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <button
              onClick={handleToggleReputation}
              className={`flex-1 sm:flex-initial px-4 py-2.5 text-sm font-semibold rounded-xl transition-all border flex items-center justify-center gap-2 ${
                isReputationActive 
                  ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-600/20'
              }`}
              title={isReputationActive ? 'Приостановить работу системы рейтинга' : 'Включить работу системы рейтинга'}
            >
              {isReputationActive ? (
                <>
                  <span>⏸️ Отключить рейтинг (Тест)</span>
                </>
              ) : (
                <>
                  <span>▶️ Включить систему рейтинга</span>
                </>
              )}
            </button>
            <button
              onClick={() => setIsRepModalOpen(true)}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Изменить репутацию</span>
            </button>
            <button
              onClick={() => setIsWarnModalOpen(true)}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Выдать варн</span>
            </button>
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`flex-1 sm:flex-initial px-4 py-2.5 text-sm font-semibold rounded-xl transition-all border flex items-center justify-center gap-2 cursor-pointer ${
                isSettingsOpen
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Настройки доставки уведомлений в Telegram"
            >
              <Bell className="w-4 h-4" />
              <span>Оповещения {isSettingsOpen ? '▲' : '▼'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Reputation Notifications Card */}
        {isSettingsOpen && (
          <div className="mt-4 p-5 bg-slate-950/80 rounded-2xl border border-amber-500/30 space-y-4 animate-in fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Доставка уведомлений об изменении репутации</h4>
                  <p className="text-xs text-slate-400">Куда и в каком виде бот отправляет карточки при изменении рейтинга пользователей</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSaveNotifySettings}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-900/30 cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Сохранить настройки</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  ID чата или канала для карточек репутации
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={localNotifyChatId}
                    onChange={(e) => setLocalNotifyChatId(e.target.value)}
                    placeholder="Например: -1004336455230 (по умолчанию инфо-чат)"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    disabled={isTestingRepNotify}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer shrink-0"
                    title="Отправить тестовую карточку изменения репутации в Telegram"
                  >
                    {isTestingRepNotify ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <Send className="w-3.5 h-3.5 text-amber-400" />}
                    <span>{isTestingRepNotify ? 'Отправка...' : 'Тест'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Если оставить пустым, используется общий системный инфо-чат (События чатов: -1004336455230).
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Каналы отправки
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label className={`flex items-center gap-2.5 p-2 rounded-xl border transition-colors cursor-pointer ${
                    localMuteChangeMessages
                      ? 'bg-slate-900/30 border-slate-800/40 opacity-50 cursor-not-allowed'
                      : 'bg-slate-900/60 rounded-xl border-slate-800/80 hover:border-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={localNotifyInGroup && !localMuteChangeMessages}
                      disabled={localMuteChangeMessages}
                      onChange={(e) => setLocalNotifyInGroup(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500 disabled:opacity-50"
                    />
                    <span className="text-xs text-slate-200">Ответное сообщение в группе («⭐️ Репутация повышена/снижена»)</span>
                  </label>
                  <label className="flex items-center gap-2.5 p-2 bg-slate-900/60 rounded-xl border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={localNotifyInAdminChat}
                      onChange={(e) => setLocalNotifyInAdminChat(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-xs text-slate-200">Подробная карточка в инфо-чат для администрации</span>
                  </label>
                  <label className="flex items-center gap-2.5 p-2 bg-slate-900/60 rounded-xl border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={localNotifyInDm}
                      onChange={(e) => setLocalNotifyInDm(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-xs text-slate-200">Личное уведомление пользователю в ЛС от бота</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Дополнительные настройки: Режим тишины и Суточная суммаризация */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <label className="block text-xs font-bold text-amber-400">
                Специальные настройки отображения и суммаризации
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. Не выводить сообщения об изменении репутации */}
                <label className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  localMuteChangeMessages
                    ? 'bg-amber-500/10 border-amber-500/40 text-white'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 text-slate-300'
                }`}>
                  <input
                    type="checkbox"
                    checked={localMuteChangeMessages}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setLocalMuteChangeMessages(checked);
                      if (checked) {
                        setLocalNotifyInGroup(false);
                      }
                    }}
                    className="mt-0.5 rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500 shrink-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">
                      1. Не выводить сообщения об изменении репутации
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5 leading-relaxed">
                      При включении бот начисляет баллы в фоновом режиме, но не отправляет ответные сообщения в чат («⭐️ Репутация повышена/снижена»).
                    </span>
                  </div>
                </label>

                {/* 2. Выводить информацию за день об изменении репутации пользователей в сообщение с суммаризацией за день */}
                <label className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  localDailyDigestEnabled
                    ? 'bg-amber-500/10 border-amber-500/40 text-white'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 text-slate-300'
                }`}>
                  <input
                    type="checkbox"
                    checked={localDailyDigestEnabled}
                    onChange={(e) => setLocalDailyDigestEnabled(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500 shrink-0"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">
                      2. Выводить информацию за день об изменении репутации пользователей в сообщение с суммаризацией за день
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5 leading-relaxed">
                      Добавляет в суточный дайджест (суммаризацию) блок «⭐️ Итоги репутации и благодарностей за день» со списком отмеченных участников и их динамикой.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {repNotifyResult && (
              <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in ${
                repNotifyResult.success 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                {repNotifyResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <XCircle className="w-4 h-4 shrink-0 text-rose-400" />}
                <span>{repNotifyResult.message}</span>
              </div>
            )}
          </div>
        )}

        {!isReputationActive && (
          <div className="mt-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <span className="text-base">⏸️</span>
              <span>
                <strong>Система рейтинга и «Спасибо» временно отключена.</strong> Бот не начисляет баллы в чатах при ответах «Спасибо» или реакциях, пока идет тестирование.
              </span>
            </div>
            <button
              onClick={handleToggleReputation}
              className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors"
            >
              Включить
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Filter Bar */}
        <div className="mt-6 pt-6 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full md:w-auto">
            <button
              onClick={() => setActiveTab('LEADERBOARD')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'LEADERBOARD' 
                  ? 'bg-amber-500 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🏆 Рейтинг и антирейтинг
            </button>
            <button
              onClick={() => setActiveTab('WARNINGS')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'WARNINGS' 
                  ? 'bg-rose-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚠️ Предупреждения ({warnings.filter(w => w.active).length})
            </button>
            <button
              onClick={() => setActiveTab('HISTORY')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'HISTORY' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📜 Все участники ({reputations.length})
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Chat Select Filter */}
            <div className="flex items-center gap-2 w-full sm:w-auto bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 text-sm">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={selectedChatFilter}
                onChange={(e) => setSelectedChatFilter(e.target.value)}
                className="bg-transparent text-slate-200 outline-none cursor-pointer pr-2"
              >
                <option value="ALL" className="bg-slate-900 text-white">🌐 Все чаты (Глобально)</option>
                {chats.map(chat => (
                  <option key={chat.id} value={chat.id} className="bg-slate-900 text-white">
                    💬 {chat.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Поиск по ID или @тегу..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-48 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400 mt-3">Загрузка статистики репутации...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: LEADERBOARDS */}
          {activeTab === 'LEADERBOARD' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* TOP 10 POSITIVE REPUTATION */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">Топ 10 по репутации</h3>
                      <p className="text-xs text-slate-400">Самые полезные и уважаемые участники</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                    +{topPositive.reduce((acc, u) => acc + u.score, 0)} очков
                  </span>
                </div>

                <div className="mt-4 divide-y divide-slate-800/60">
                  {topPositive.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      Пока нет пользователей с положительной репутацией.
                    </div>
                  ) : (
                    topPositive.map((user, idx) => (
                      <div 
                        key={user.userId} 
                        onClick={() => setSelectedUserHistory(user)}
                        className="py-3 px-2 flex items-center justify-between hover:bg-slate-800/40 rounded-xl transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span className={`w-6 text-center font-bold text-sm ${
                            idx === 0 ? 'text-amber-400 text-base' : 
                            idx === 1 ? 'text-slate-300 text-base' : 
                            idx === 2 ? 'text-amber-600 text-base' : 'text-slate-500'
                          }`}>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                          </span>
                          
                          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold border border-slate-700 shrink-0">
                            {user.firstName ? user.firstName.charAt(0).toUpperCase() : user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors truncate">
                                {user.firstName || user.username || `User ${user.userId}`}
                              </span>
                              {user.username && (
                                <span className="text-xs text-slate-500 truncate">@{user.username}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>ID: {user.userId}</span>
                              <span>•</span>
                              <span className="text-emerald-400/80">👍 +{user.positiveCount || 0}</span>
                              <span>•</span>
                              <span className="text-rose-400/80">👎 -{user.negativeCount || 0}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl font-bold text-sm">
                            +{user.score}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* TOP 10 ANTI-RATING (NEGATIVE REPUTATION) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl">
                      <TrendingDown className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">Антирейтинг репутации</h3>
                      <p className="text-xs text-slate-400">Участники с наибольшим числом дизлайков</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-rose-500/10 text-rose-400 rounded-full border border-rose-500/20">
                    Отрицательный баланс
                  </span>
                </div>

                <div className="mt-4 divide-y divide-slate-800/60">
                  {topNegative.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      Нет пользователей с отрицательной репутацией. В чатах дружелюбная атмосфера! 🎉
                    </div>
                  ) : (
                    topNegative.map((user, idx) => (
                      <div 
                        key={user.userId} 
                        onClick={() => setSelectedUserHistory(user)}
                        className="py-3 px-2 flex items-center justify-between hover:bg-slate-800/40 rounded-xl transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span className="w-6 text-center font-bold text-sm text-rose-400">
                            #{idx + 1}
                          </span>
                          
                          <div className="w-10 h-10 rounded-full bg-rose-950/40 flex items-center justify-center text-rose-300 font-bold border border-rose-900/50 shrink-0">
                            {user.firstName ? user.firstName.charAt(0).toUpperCase() : user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white group-hover:text-rose-400 transition-colors truncate">
                                {user.firstName || user.username || `User ${user.userId}`}
                              </span>
                              {user.username && (
                                <span className="text-xs text-slate-500 truncate">@{user.username}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>ID: {user.userId}</span>
                              <span>•</span>
                              <span className="text-emerald-400/80">👍 +{user.positiveCount || 0}</span>
                              <span>•</span>
                              <span className="text-rose-400/80">👎 -{user.negativeCount || 0}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="px-3 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl font-bold text-sm">
                            {user.score}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WARNINGS (VARNS) */}
          {activeTab === 'WARNINGS' && (
            <div className="space-y-6">
              {/* Warns Top Summary Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs text-slate-400 uppercase font-semibold">Активных предупреждений</span>
                  <div className="text-3xl font-extrabold text-white mt-1">
                    {warnings.filter(w => w.active).length}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Текущих нарушений в силе</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs text-slate-400 uppercase font-semibold">Лимит варнов до бана</span>
                  <div className="text-3xl font-extrabold text-rose-400 mt-1">
                    {warnLimit}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">При достижении выдается автобан</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <span className="text-xs text-slate-400 uppercase font-semibold">Всего зафиксировано</span>
                  <div className="text-3xl font-extrabold text-amber-400 mt-1">
                    {warnings.length}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Включая снятые варны</p>
                </div>
              </div>

              {/* Warnings Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h3 className="font-bold text-white text-lg mb-4 flex items-center justify-between">
                  <span>Список предупреждений (Варнов)</span>
                  <button
                    onClick={() => setIsWarnModalOpen(true)}
                    className="text-xs font-semibold px-3 py-1.5 bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 rounded-lg border border-rose-500/30 transition-colors"
                  >
                    + Выдать новый варн
                  </button>
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800 font-semibold">
                      <tr>
                        <th className="py-3.5 px-4">Пользователь</th>
                        <th className="py-3.5 px-4">Чат</th>
                        <th className="py-3.5 px-4">Причина</th>
                        <th className="py-3.5 px-4">Модератор</th>
                        <th className="py-3.5 px-4">Статус</th>
                        <th className="py-3.5 px-4">Дата</th>
                        <th className="py-3.5 px-4 text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {warnings.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-500">
                            Предупреждений пока нет.
                          </td>
                        </tr>
                      ) : (
                        warnings.map((warn) => (
                          <tr key={warn.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-white">
                                {warn.firstName || warn.username || `User ${warn.userId}`}
                              </div>
                              <div className="text-xs text-slate-500 font-mono">
                                {warn.username ? `@${warn.username}` : `ID: ${warn.userId}`}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-300">
                              {warn.chatTitle || warn.chatId}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="text-rose-300 bg-rose-950/40 border border-rose-900/50 px-2 py-1 rounded text-xs">
                                {warn.reason}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-400">
                              {warn.adminName || warn.adminId}
                            </td>
                            <td className="py-3.5 px-4">
                              {warn.active ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  Активен
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                  Снят
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                              {new Date(warn.createdAt).toLocaleString('ru-RU')}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {warn.active ? (
                                <button
                                  onClick={() => handleRevokeWarn(warn.id)}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                                  title="Снять предупреждение (/unwarn)"
                                >
                                  Снять
                                </button>
                              ) : (
                                <span className="text-xs text-slate-600">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ALL MEMBERS FULL REPUTATION LIST */}
          {activeTab === 'HISTORY' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h3 className="font-bold text-white text-lg mb-4">
                Все участники с историей репутации ({filteredList.length})
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800 font-semibold">
                    <tr>
                      <th className="py-3.5 px-4">Участник</th>
                      <th className="py-3.5 px-4">Очки репутации</th>
                      <th className="py-3.5 px-4">👍 Положительных</th>
                      <th className="py-3.5 px-4">👎 Отрицательных</th>
                      <th className="py-3.5 px-4">Последнее обновление</th>
                      <th className="py-3.5 px-4 text-right">Детали</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          Участники не найдены.
                        </td>
                      </tr>
                    ) : (
                      filteredList.map((entry) => (
                        <tr key={entry.userId} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white">
                              {entry.firstName || entry.username || `User ${entry.userId}`}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">
                              {entry.username ? `@${entry.username}` : `ID: ${entry.userId}`}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold ${
                              entry.score > 0 
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                : entry.score < 0 
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {entry.score > 0 ? `+${entry.score}` : entry.score}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-emerald-400 font-medium">
                            +{entry.positiveCount || 0}
                          </td>
                          <td className="py-3.5 px-4 text-rose-400 font-medium">
                            -{entry.negativeCount || 0}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                            {new Date(entry.updatedAt).toLocaleString('ru-RU')}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setSelectedUserHistory(entry)}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                            >
                              История
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: MANUAL WARN */}
      {isWarnModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <span>Выдать предупреждение (Варн)</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Пользователь получит предупреждение. При накоплении {warnLimit} активных варнов он будет автоматически заблокирован.
            </p>

            <form onSubmit={handleCreateWarn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Пользователь (ID или @username)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: @username или 123456789"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Чат
                </label>
                <select
                  value={targetChatId}
                  onChange={(e) => setTargetChatId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  {chats.map(chat => (
                    <option key={chat.id} value={chat.id}>
                      {chat.title} ({chat.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Причина нарушения
                </label>
                <input
                  type="text"
                  placeholder="Оффтоп, спам, мат..."
                  value={warnReason}
                  onChange={(e) => setWarnReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsWarnModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'Выдача...' : 'Выдать варн'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL REPUTATION ADJUSTMENT */}
      {isRepModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Корректировка репутации</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Измените рейтинг участника вручную (повышение или понижение).
            </p>

            <form onSubmit={handleAdjustRep} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Пользователь (ID или @username)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: @username или 123456789"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Чат
                </label>
                <select
                  value={targetChatId}
                  onChange={(e) => setTargetChatId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {chats.map(chat => (
                    <option key={chat.id} value={chat.id}>
                      {chat.title} ({chat.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Изменение очков
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 5, -1, -5].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRepDelta(val)}
                      className={`py-2 rounded-xl text-sm font-bold border transition-all ${
                        repDelta === val 
                          ? val > 0 
                            ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20' 
                            : 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/20'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {val > 0 ? `+${val}` : val}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Причина изменения
                </label>
                <input
                  type="text"
                  placeholder="Помощь сообществу, флуд..."
                  value={repReason}
                  onChange={(e) => setRepReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRepModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'Сохранение...' : 'Применить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: USER DETAILS & REPUTATION HISTORY */}
      {selectedUserHistory && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-lg">
                  {selectedUserHistory.firstName ? selectedUserHistory.firstName.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {selectedUserHistory.firstName || selectedUserHistory.username || `User ${selectedUserHistory.userId}`}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {selectedUserHistory.username ? `@${selectedUserHistory.username}` : `ID: ${selectedUserHistory.userId}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Баланс</span>
                <span className={`text-xl font-black ${selectedUserHistory.score >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {selectedUserHistory.score > 0 ? `+${selectedUserHistory.score}` : selectedUserHistory.score}
                </span>
              </div>
            </div>

            <div className="my-4 grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">👍 Положительных</span>
                <span className="text-base font-bold text-emerald-400">+{selectedUserHistory.positiveCount || 0}</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">👎 Отрицательных</span>
                <span className="text-base font-bold text-rose-400">-{selectedUserHistory.negativeCount || 0}</span>
              </div>
            </div>

            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">История начислений</h4>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-800/40">
              {(!selectedUserHistory.history || selectedUserHistory.history.length === 0) ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  История действий для этого пользователя пока пуста.
                </div>
              ) : (
                selectedUserHistory.history.map((h, i) => (
                  <div key={h.id || i} className="pt-2 pb-1 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-200">{h.reason}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        От: {h.fromName || h.fromUserId} • {h.chatTitle || h.chatId}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {new Date(h.timestamp).toLocaleString('ru-RU')}
                      </div>
                    </div>
                    <span className={`font-bold shrink-0 px-2 py-0.5 rounded ${
                      h.delta > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {h.delta > 0 ? `+${h.delta}` : h.delta}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 mt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedUserHistory(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

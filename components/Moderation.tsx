import React, { useState, useEffect } from 'react';
import { FilterSettings, ActiveMuteEntry } from '../types';
import { 
  ShieldAlert, Plus, X, Radio, Bell, Layers, RefreshCw, 
  CheckCircle2, AlertCircle, VolumeX, Volume2, Tv, AtSign, 
  Clock, UserX, Search, Sparkles
} from 'lucide-react';

interface ModerationProps {
  filters: FilterSettings;
  onUpdateFilters: (filters: FilterSettings) => void;
  authenticatedFetch?: (url: string, options?: RequestInit) => Promise<Response>;
}

export const Moderation: React.FC<ModerationProps> = ({ 
  filters, 
  onUpdateFilters,
  authenticatedFetch = fetch
}) => {
  const [newWord, setNewWord] = useState('');
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Active Mutes state
  const [activeMutes, setActiveMutes] = useState<ActiveMuteEntry[]>([]);
  const [isLoadingMutes, setIsLoadingMutes] = useState(false);
  const [muteSearchQuery, setMuteSearchQuery] = useState('');
  const [unmutingId, setUnmutingId] = useState<string | null>(null);

  const showStatus = (message: string, type: 'success' | 'error' = 'success') => {
    setStatusNotice({ message, type });
    setTimeout(() => setStatusNotice(null), 4000);
  };

  const fetchActiveMutes = async () => {
    setIsLoadingMutes(true);
    try {
      const res = await authenticatedFetch('/api/active-mutes');
      if (res.ok) {
        const data = await res.json();
        setActiveMutes(data);
      }
    } catch (err) {
      console.error('Failed to load active mutes:', err);
    } finally {
      setIsLoadingMutes(false);
    }
  };

  useEffect(() => {
    fetchActiveMutes();
    const interval = setInterval(fetchActiveMutes, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleUnmute = async (chatId: string, userId: string) => {
    setUnmutingId(`${chatId}_${userId}`);
    try {
      const res = await authenticatedFetch('/api/active-mutes/unmute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, userId })
      });
      if (res.ok) {
        showStatus('Мут успешно снят с пользователя');
        await fetchActiveMutes();
      } else {
        showStatus('Не удалось снять мут', 'error');
      }
    } catch (e: any) {
      showStatus(e.message || 'Ошибка сети', 'error');
    } finally {
      setUnmutingId(null);
    }
  };

  const handleAddWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (newWord && !filters.forbiddenWords.includes(newWord)) {
      onUpdateFilters({
        ...filters,
        forbiddenWords: [...filters.forbiddenWords, newWord]
      });
      setNewWord('');
    }
  };

  const handleRemoveWord = (word: string) => {
    onUpdateFilters({
      ...filters,
      forbiddenWords: filters.forbiddenWords.filter(w => w !== word)
    });
  };

  const handleBulkApply = async (fields?: string[] | 'all') => {
    setIsApplyingBulk(true);
    try {
      const res = await authenticatedFetch('/api/chats/bulk-apply-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      if (res.ok) {
        const data = await res.json();
        showStatus(`Глобальные настройки успешно применены к ${data.updatedCount || 'всем'} чатам!`);
      } else {
        showStatus('Не удалось применить настройки к чатам', 'error');
      }
    } catch (e: any) {
      showStatus(e.message || 'Ошибка сети', 'error');
    } finally {
      setIsApplyingBulk(false);
    }
  };

  const handleBulkReset = async () => {
    if (!window.confirm('Сбросить индивидуальные настройки всех чатов на значения по умолчанию из этого раздела?')) return;
    setIsApplyingBulk(true);
    try {
      const res = await authenticatedFetch('/api/chats/bulk-reset-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: 'all' })
      });
      if (res.ok) {
        const data = await res.json();
        showStatus(`Все чаты (${data.updatedCount}) переведены на динамическое наследование общих правил!`);
      } else {
        showStatus('Не удалось сбросить индивидуальные настройки', 'error');
      }
    } catch (e: any) {
      showStatus(e.message || 'Ошибка сети', 'error');
    } finally {
      setIsApplyingBulk(false);
    }
  };

  const filteredMutes = activeMutes.filter(m => {
    if (!muteSearchQuery.trim()) return true;
    const q = muteSearchQuery.toLowerCase();
    return (
      (m.userName && m.userName.toLowerCase().includes(q)) ||
      m.userId.includes(q) ||
      (m.chatTitle && m.chatTitle.toLowerCase().includes(q)) ||
      m.chatId.includes(q) ||
      m.reason.toLowerCase().includes(q)
    );
  });

  const formatRemainingTime = (unmuteAt: number) => {
    const diff = unmuteAt - Date.now();
    if (diff <= 0) return 'Истекает...';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours} ч ${mins} мин`;
    return `${mins} мин`;
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'channel_subscription_refusal':
        return { text: 'Отказ от подписки (24ч)', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      case 'channel_subscription_required':
        return { text: 'Требуется подписка', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'newcomer':
        return { text: 'Мут новичка', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
      case 'command':
        return { text: 'Команда админа', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
      case 'voting':
        return { text: 'Голосование чата', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' };
      default:
        return { text: reason, color: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500 space-y-6">
      
      {/* Toast Notification */}
      {statusNotice && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border shadow-lg animate-in slide-in-from-top-2 duration-300 ${
          statusNotice.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          {statusNotice.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span className="text-sm font-medium">{statusNotice.message}</span>
        </div>
      )}

      {/* Active Mutes List Card */}
      <div className="bg-slate-900 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/20 rounded-xl shadow-lg shadow-amber-900/10">
              <VolumeX className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-xl font-bold text-white tracking-tight">Активные муты и таймеры</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {activeMutes.length}
                </span>
              </div>
              <p className="text-xs text-slate-400">Участники с временными ограничениями и автоматическим размутом</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchActiveMutes}
              disabled={isLoadingMutes}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMutes ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>
          </div>
        </div>

        {activeMutes.length > 0 && (
          <div className="mb-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Поиск по имени, ID пользователя, чату или причине..."
                value={muteSearchQuery}
                onChange={e => setMuteSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>
        )}

        {filteredMutes.length === 0 ? (
          <div className="text-center py-8 bg-slate-950/50 rounded-xl border border-slate-800/60">
            <Volume2 className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
            <p className="text-slate-400 text-sm font-medium">
              {activeMutes.length === 0 ? 'Нет активных мутов' : 'Ничего не найдено по запросу'}
            </p>
            <p className="text-slate-600 text-xs mt-0.5">
              {activeMutes.length === 0 ? 'Все участники имеют полные права на отправку сообщений' : 'Попробуйте изменить поисковый запрос'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto pr-1">
            {filteredMutes.map(mute => {
              const reasonBadge = getReasonLabel(mute.reason);
              const isUnmuting = unmutingId === mute.id;
              return (
                <div key={mute.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/20 px-2 rounded-lg transition-colors">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-semibold">{mute.userName || `ID: ${mute.userId}`}</span>
                      <span className="text-slate-500 text-xs font-mono">({mute.userId})</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${reasonBadge.color}`}>
                        {reasonBadge.text}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                      <span>Чат: <strong className="text-slate-300">{mute.chatTitle || mute.chatId}</strong></span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-amber-400 font-medium">
                        <Clock className="w-3 h-3" />
                        Осталось: {formatRemainingTime(mute.unmuteAt)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleUnmute(mute.chatId, mute.userId)}
                    disabled={isUnmuting}
                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer self-start sm:self-center disabled:opacity-50"
                  >
                    {isUnmuting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>Снять мут</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Auto-Moderation Filters */}
      <div className="space-y-6">
        <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-500/20 rounded-xl shadow-lg shadow-orange-900/10">
                <ShieldAlert className="w-8 h-8 text-orange-400" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">Глобальные правила модерации</h3>
                <p className="text-sm text-slate-400">Настройки по умолчанию для всех подключенных чатов</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleBulkApply('all')}
                disabled={isApplyingBulk}
                className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md transition-all cursor-pointer"
                title="Принудительно скопировать все текущие правила в настройки каждого чата"
              >
                {isApplyingBulk ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                <span>Применить ко всем чатам</span>
              </button>
              <button
                onClick={handleBulkReset}
                disabled={isApplyingBulk}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all cursor-pointer"
                title="Сбросить индивидуальные переопределения в чатах, чтобы они динамически следовали этим общим правилам"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Сбросить на по умолчанию</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex flex-col">
                <span className="text-slate-200 font-medium">Блокировать ссылки</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">HTTP/HTTPS URLS</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.blockLinks} onChange={() => onUpdateFilters({...filters, blockLinks: !filters.blockLinks})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex flex-col">
                <span className="text-slate-200 font-medium">Блокировать ссылки Telegram</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">T.ME / TELEGRAM.ME</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.blockTelegramLinks} onChange={() => onUpdateFilters({...filters, blockTelegramLinks: !filters.blockTelegramLinks})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex flex-col">
                <span className="text-slate-200 font-medium">Блокировать медиафайлы</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">PHOTOS, VIDEOS, DOCS</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.blockMedia} onChange={() => onUpdateFilters({...filters, blockMedia: !filters.blockMedia})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex flex-col">
                <span className="text-slate-200 font-medium">Блокировать пересылки</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">FORWARDED MESSAGES</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.blockForwards} onChange={() => onUpdateFilters({...filters, blockForwards: !filters.blockForwards})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex flex-col">
                <span className="text-slate-200 font-medium">Удалять сервисные сообщения</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">JOIN / LEAVE NOTIFICATIONS</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.deleteSystemMessages} onChange={() => onUpdateFilters({...filters, deleteSystemMessages: !filters.deleteSystemMessages})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex flex-col">
                <span className="text-slate-200 font-medium">Удалять команды пользователей</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">HIDE BOT COMMANDS IN CHAT</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.deleteCommands} onChange={() => onUpdateFilters({...filters, deleteCommands: !filters.deleteCommands})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>
          </div>

          {/* Channel Subscription Gate */}
          <div className="mt-8 pt-8 border-t border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-white flex items-center gap-2">
                  <Tv className="w-5 h-5 text-indigo-400" />
                  Обязательная подписка на канал (OP-подписка)
                </span>
                <span className="text-xs text-slate-400">Требовать подписку на ваш Telegram-канал перед общением в группах</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={!!filters.requireChannelSubscription} 
                  onChange={() => onUpdateFilters({...filters, requireChannelSubscription: !filters.requireChannelSubscription})} 
                />
                <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {filters.requireChannelSubscription && (
              <div className="grid grid-cols-1 gap-5 animate-in slide-in-from-top-4 duration-500 bg-slate-950 p-6 rounded-2xl border border-indigo-900/30 shadow-inner">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between pb-3 border-b border-slate-800/80">
                  <span className="text-xs text-slate-400">
                    Бот отправляет кнопки «Подписаться» и «Я подписался» (а также «Отказаться» с мутом на 24ч).
                  </span>
                  <button
                    onClick={() => handleBulkApply(['requireChannelSubscription', 'channelSubscriptionTarget', 'channelSubscriptionMessage'])}
                    disabled={isApplyingBulk}
                    className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Применить к чатам</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    Канал для проверки подписки (@username или ссылка)
                  </label>
                  <input 
                    type="text" 
                    value={filters.channelSubscriptionTarget || ''}
                    onChange={(e) => onUpdateFilters({...filters, channelSubscriptionTarget: e.target.value})}
                    placeholder="Например: @MotoBlackList или https://t.me/my_channel"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Убедитесь, что бот добавлен в этот канал как администратор (для проверки подписок).
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    Свой текст приветствия и требования подписки (опционально)
                  </label>
                  <textarea 
                    value={filters.channelSubscriptionMessage || ''}
                    onChange={(e) => onUpdateFilters({...filters, channelSubscriptionMessage: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all min-h-[80px]"
                    placeholder="Оставьте пустым для стандартного стильного текста с кнопками"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Admin Tagger */}
          <div className="mt-8 pt-8 border-t border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-white flex items-center gap-2">
                  <AtSign className="w-5 h-5 text-sky-400" />
                  Вызов администрации (@admin / @админ / !admin)
                </span>
                <span className="text-xs text-slate-400">Уведомление администраторов чата при обращении участников</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={!!filters.tagAdminsEnabled} 
                  onChange={() => onUpdateFilters({...filters, tagAdminsEnabled: !filters.tagAdminsEnabled})} 
                />
                <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-sky-600"></div>
              </label>
            </div>

            {filters.tagAdminsEnabled && (
              <div className="grid grid-cols-1 gap-5 animate-in slide-in-from-top-4 duration-500 bg-slate-950 p-6 rounded-2xl border border-sky-900/30 shadow-inner">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    Свой текст уведомления (опционально)
                  </label>
                  <textarea 
                    value={filters.tagAdminsMessage || ''}
                    onChange={(e) => onUpdateFilters({...filters, tagAdminsMessage: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all min-h-[70px]"
                    placeholder="Например: 🚨 Внимание администрация! Требуется ваша помощь."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Newcomers Mute */}
          <div className="mt-8 pt-8 border-t border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-white">Мут новичков</span>
                <span className="text-xs text-slate-400">Ограничение на отправку сообщений для новых участников с автоматическим удалением и снятием</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.muteNewcomers} onChange={() => onUpdateFilters({...filters, muteNewcomers: !filters.muteNewcomers})} />
                <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            {filters.muteNewcomers && (
              <div className="grid grid-cols-1 gap-6 animate-in slide-in-from-top-4 duration-500 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between pb-3 border-b border-slate-800/80">
                  <span className="text-xs text-slate-400">
                    При попытке отправки сообщения новичком оно немедленно удаляется ботом, а участнику высылается временное уведомление.
                  </span>
                  <button
                    onClick={() => handleBulkApply(['muteNewcomers', 'muteDurationHours', 'muteMessage'])}
                    disabled={isApplyingBulk}
                    className="px-3 py-1.5 bg-orange-600/30 hover:bg-orange-600/50 text-orange-300 border border-orange-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Применить мут ко всем чатам</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Длительность мута (часы)</label>
                  <input 
                    type="number" 
                    value={filters.muteDurationHours || 1}
                    onChange={(e) => onUpdateFilters({...filters, muteDurationHours: Math.max(0.1, parseFloat(e.target.value) || 1)})}
                    step="0.5"
                    min="0.1"
                    className="w-full md:w-48 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    По истечении этого времени бот автоматически вернет полные права на отправку сообщений.
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Сообщение при муте</label>
                  <textarea 
                    value={filters.muteMessage}
                    onChange={(e) => onUpdateFilters({...filters, muteMessage: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all min-h-[90px]"
                    placeholder="Используйте {hours} для подстановки времени мута"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Captcha Settings */}
          <div className="mt-8 pt-8 border-t border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Вступление в чат и Каптча</h4>
              {filters.captchaEnabled && (
                <button
                  onClick={() => handleBulkApply(['captchaEnabled', 'captchaType', 'captchaQuestion', 'captchaAnswer', 'autoApprove'])}
                  disabled={isApplyingBulk}
                  className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Применить каптчу ко всем чатам</span>
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                <div className="flex flex-col">
                  <span className="text-slate-200 font-medium">Автопринятие заявок</span>
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">AUTO-APPROVE</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={filters.autoApprove} onChange={() => onUpdateFilters({...filters, autoApprove: !filters.autoApprove})} />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                <div className="flex flex-col">
                  <span className="text-slate-200 font-medium">Каптча на входе</span>
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">ENTRY CAPTCHA</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={filters.captchaEnabled} onChange={() => onUpdateFilters({...filters, captchaEnabled: !filters.captchaEnabled})} />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>
            </div>

            {filters.captchaEnabled && (
              <div className="animate-in slide-in-from-top-4 duration-500 bg-slate-950 p-6 rounded-2xl border border-blue-900/30 shadow-inner space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 ml-1">
                    Тип каптчи для защиты от ботов
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { id: 'random', title: '🎲 Случайный тип', desc: 'Автоматически чередует примеры и эмодзи' },
                      { id: 'math', title: '🧮 Математическая', desc: 'Примеры (14+19, 45-18) с кнопками вариантов' },
                      { id: 'emoji', title: '🎯 Эмодзи-загадка', desc: 'Выбор нужного предмета среди кнопок' },
                      { id: 'button', title: '🔘 Подтверждение', desc: 'Кнопка "Я человек" с антибот-ловушками' },
                      { id: 'custom', title: '✍️ Свой вопрос', desc: 'Ваш собственный вопрос и правильный ответ' },
                    ].map(t => {
                      const isSelected = (filters.captchaType || 'random') === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onUpdateFilters({ ...filters, captchaType: t.id as any })}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected 
                              ? 'bg-blue-950/60 border-blue-500 text-white shadow-md shadow-blue-950/50' 
                              : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                          }`}
                        >
                          <div className="font-bold text-xs flex items-center justify-between mb-1">
                            <span>{t.title}</span>
                            {isSelected && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>}
                          </div>
                          <p className="text-[11px] text-slate-400 leading-tight">{t.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {filters.captchaType === 'custom' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-slate-800/80 animate-in fade-in">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Вопрос каптчи</label>
                      <input 
                        type="text" 
                        value={filters.captchaQuestion}
                        onChange={(e) => onUpdateFilters({...filters, captchaQuestion: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="Напр: Сколько колес у мотоцикла?"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Ответ каптчи</label>
                      <input 
                        type="text" 
                        value={filters.captchaAnswer}
                        onChange={(e) => onUpdateFilters({...filters, captchaAnswer: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        placeholder="Напр: 2"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-slate-200 font-medium">Оповещать при добавлении в несколько чатов</span>
                  <span className="text-xs text-slate-500">Бот пришлет уведомление супер-админу, если пользователь вступит в указанное кол-во чатов</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={filters.notifyMultiChat} onChange={() => onUpdateFilters({...filters, notifyMultiChat: !filters.notifyMultiChat})} />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>

              {filters.notifyMultiChat && (
                <div className="animate-in slide-in-from-top-2 duration-300">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Порог количества чатов</label>
                  <input 
                    type="number" 
                    value={filters.multiChatThreshold}
                    onChange={(e) => onUpdateFilters({...filters, multiChatThreshold: parseInt(e.target.value) || 0})}
                    className="w-full md:w-32 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                    min="1"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-white">Система предупреждений (Варны)</span>
                <span className="text-xs text-slate-500">Автоматическое наказание при накоплении нарушений</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Количество варнов до бана (Warn Limit)
                </label>
                <input 
                  type="number" 
                  min="1"
                  max="20"
                  value={filters.warnLimit || 3}
                  onChange={(e) => onUpdateFilters({...filters, warnLimit: parseInt(e.target.value) || 3})}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  При получении {filters.warnLimit || 3}-го варна бот автоматически блокирует пользователя в чате.
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Действие при превышении лимита
                </label>
                <select
                  value={filters.warnAction || 'BAN'}
                  onChange={(e) => onUpdateFilters({...filters, warnAction: e.target.value as 'BAN' | 'MUTE'})}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all cursor-pointer"
                >
                  <option value="BAN">🚫 Блокировка (Ban) навсегда</option>
                  <option value="MUTE">🔇 Обеззвучивание (Mute) на 24 часа</option>
                </select>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Тип санкции, применяемый ботом после достижения лимита.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex flex-col">
                <span className="text-slate-200 font-medium">Система рейтинга и репутации</span>
                <span className="text-xs text-slate-500">Начисление +1 за «Спасибо»/реакции 👍❤️ и -1 за 👎🤡</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={filters.reputationEnabled !== false} 
                  onChange={() => onUpdateFilters({...filters, reputationEnabled: filters.reputationEnabled === false ? true : false})} 
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
          </div>

          {/* Telegram Commands Cheat Sheet */}
          <div className="mt-8 pt-8 border-t border-slate-800 space-y-4">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              📖 Справочник команд для администраторов в чатах Telegram
            </h4>
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-sm space-y-4">
              <p className="text-xs text-slate-400">
                Администраторы могут использовать команды прямо в чатах Telegram (с префиксом <code className="text-orange-400">/</code> или <code className="text-orange-400">!</code>, а также <code className="text-orange-400">un+</code> для отмены).
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80">
                  <span className="text-amber-400 font-bold block mb-1">🔇 Мут / Обеззвучивание</span>
                  <div className="text-slate-300 space-y-1">
                    <div><code>/mute 30m спам</code> (в ответ)</div>
                    <div><code>/mute @user 2d флуд</code></div>
                    <div><code>/unmute</code> (в ответ / @тег)</div>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80">
                  <span className="text-rose-400 font-bold block mb-1">🚫 Бан / Блокировка</span>
                  <div className="text-slate-300 space-y-1">
                    <div><code>/ban 7d реклама</code></div>
                    <div><code>/ban @user навсегда</code></div>
                    <div><code>/unban @user</code></div>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80">
                  <span className="text-yellow-400 font-bold block mb-1">⚠️ Варн / Предупреждение</span>
                  <div className="text-slate-300 space-y-1">
                    <div><code>/warn мат в чате</code></div>
                    <div><code>/warn @user оффтоп</code></div>
                    <div><code>/unwarn @user</code></div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-900 text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-semibold text-slate-300">Форматы времени:</span>
                <span><code className="text-orange-400">s</code> = секунды</span>
                <span><code className="text-orange-400">m</code> = минуты</span>
                <span><code className="text-orange-400">h</code> = часы</span>
                <span><code className="text-orange-400">d</code> = дни</span>
                <span><code className="text-orange-400">w</code> = недели</span>
                <span><code className="text-orange-400">M</code> = месяцы</span>
                <span><code className="text-orange-400">y</code> = годы</span>
                <span className="text-slate-500">(Мин: 30s, Макс: 356d)</span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-800">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Запрещенные слова (Regex)</h4>
            <form onSubmit={handleAddWord} className="flex gap-3 mb-6">
              <input 
                type="text" 
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                placeholder="Добавить слово или регулярное выражение..."
                value={newWord}
                onChange={e => setNewWord(e.target.value)}
              />
              <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl transition-all shadow-lg">
                <Plus className="w-6 h-6" />
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              {filters.forbiddenWords.map(word => (
                <span key={word} className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm">
                  {word}
                  <button onClick={() => handleRemoveWord(word)} className="hover:text-rose-200 transition-colors"><X className="w-4 h-4" /></button>
                </span>
              ))}
              {filters.forbiddenWords.length === 0 && <p className="text-slate-600 italic text-sm">Список пуст</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
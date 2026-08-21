import React, { useState, useEffect, useMemo } from 'react';
import { Pin, X, ExternalLink, Trash2, AlertCircle, RefreshCw, MessageSquare, Calendar, User, FileText, Image, Video, Music, HelpCircle, Check, Search, History, ShieldCheck, Filter } from 'lucide-react';
import { Chat, PinnedMessage } from '../types';

interface PinnedMessagesModalProps {
  chat: Chat;
  isOpen: boolean;
  onClose: () => void;
  authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export const PinnedMessagesModal: React.FC<PinnedMessagesModalProps> = ({
  chat,
  isOpen,
  onClose,
  authenticatedFetch
}) => {
  const [pinned, setPinned] = useState<PinnedMessage | null>(null);
  const [history, setHistory] = useState<PinnedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnpinning, setIsUnpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'unpinned'>('all');

  const fetchPinnedData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await authenticatedFetch(`/api/chats/${chat.id}/pinned`);
      if (res.ok) {
        const data = await res.json();
        setPinned(data.pinned || null);
        setHistory(data.history || (data.pinned ? [data.pinned] : []));
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Не удалось загрузить закрепленные сообщения');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка сети при обращении к серверу');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSuccessMessage(null);
      setSearchQuery('');
      setFilterTab('all');
      fetchPinnedData();
    }
  }, [isOpen, chat.id]);

  const handleUnpin = async (messageId?: number) => {
    const confirmText = messageId 
      ? `Открепить сообщение #${messageId} в чате «${chat.title}» через Telegram API?`
      : `Открепить закрепленное сообщение в чате «${chat.title}»?`;

    if (!window.confirm(confirmText)) return;

    try {
      setIsUnpinning(true);
      setError(null);
      setSuccessMessage(null);

      const res = await authenticatedFetch(`/api/chats/${chat.id}/unpin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
      });

      if (res.ok) {
        const resData = await res.json();
        if (resData.history) {
          setHistory(resData.history);
        } else {
          setHistory(prev => prev.map(item => 
            !messageId || item.messageId === messageId ? { ...item, unpinned: true } : item
          ));
        }
        if (!messageId || (pinned && pinned.messageId === messageId)) {
          setPinned(null);
        }
        setSuccessMessage(messageId ? `Сообщение #${messageId} откреплено через Telegram Bot API` : 'Закрепленное сообщение откреплено');
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Не удалось открепить сообщение');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка при вызове API');
    } finally {
      setIsUnpinning(false);
    }
  };

  const handleUnpinAll = async () => {
    if (!window.confirm(`Вы действительно хотите открепить ВСЕ закрепленные сообщения в чате «${chat.title}»?`)) {
      return;
    }

    try {
      setIsUnpinning(true);
      setError(null);
      setSuccessMessage(null);

      const res = await authenticatedFetch(`/api/chats/${chat.id}/unpin-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        const resData = await res.json();
        if (resData.history) {
          setHistory(resData.history);
        } else {
          setHistory(prev => prev.map(item => ({ ...item, unpinned: true })));
        }
        setPinned(null);
        setSuccessMessage('Все закрепленные сообщения в чате откреплены');
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Не удалось открепить сообщения');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка при вызове API');
    } finally {
      setIsUnpinning(false);
    }
  };

  const handleDeleteFromHistory = async (messageId: number) => {
    if (!window.confirm(`Удалить запись #${messageId} из базы данных истории закрепов?`)) {
      return;
    }

    try {
      const res = await authenticatedFetch(`/api/chats/${chat.id}/pinned/${messageId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setHistory(prev => prev.filter(item => item.messageId !== messageId));
        if (pinned && pinned.messageId === messageId) {
          setPinned(null);
        }
        setSuccessMessage(`Запись #${messageId} удалена из базы данных`);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Не удалось удалить запись');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка при удалении');
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Неизвестно';
    return new Date(timestamp * 1000).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderMediaIcon = (mediaType?: string) => {
    switch (mediaType) {
      case 'photo': return <Image className="w-3.5 h-3.5 text-emerald-400" />;
      case 'video': return <Video className="w-3.5 h-3.5 text-purple-400" />;
      case 'document': return <FileText className="w-3.5 h-3.5 text-amber-400" />;
      case 'audio':
      case 'voice': return <Music className="w-3.5 h-3.5 text-cyan-400" />;
      case 'poll': return <HelpCircle className="w-3.5 h-3.5 text-blue-400" />;
      default: return <MessageSquare className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      // Filter by tab
      const isCurrentlyActive = (pinned && pinned.messageId === item.messageId) || (!item.unpinned && history[0]?.messageId === item.messageId);
      if (filterTab === 'active' && item.unpinned) return false;
      if (filterTab === 'unpinned' && !item.unpinned && isCurrentlyActive) return false;

      // Filter by search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const textMatch = (item.text || item.caption || '').toLowerCase().includes(q);
      const userMatch = (
        (item.from?.firstName || '') + ' ' +
        (item.from?.lastName || '') + ' ' +
        (item.from?.username || '') + ' ' +
        (item.senderChat?.title || '')
      ).toLowerCase().includes(q);
      const idMatch = String(item.messageId).includes(q);

      return textMatch || userMatch || idMatch;
    });
  }, [history, pinned, filterTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Pin className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  История закрепленных сообщений
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold border border-blue-500/30">
                  {history.length} в базе
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span>Чат:</span>
                <span className="text-slate-200 font-medium">{chat.title}</span>
                <span className="text-slate-600">•</span>
                <span className="font-mono text-[11px] text-slate-500">{chat.id}</span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={fetchPinnedData}
              disabled={isLoading || isUnpinning}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Обновить"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="px-6 py-3 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по тексту, автору или #ID..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-md transition-all font-medium ${filterTab === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Все ({history.length})
            </button>
            <button
              onClick={() => setFilterTab('active')}
              className={`px-3 py-1 rounded-md transition-all font-medium ${filterTab === 'active' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Активные ({history.filter(h => !h.unpinned).length})
            </button>
            <button
              onClick={() => setFilterTab('unpinned')}
              className={`px-3 py-1 rounded-md transition-all font-medium ${filterTab === 'unpinned' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Открепленные ({history.filter(h => h.unpinned).length})
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <p className="font-medium">Ошибка</p>
                <p className="text-xs opacity-80 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-300 text-sm">
              <Check className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Cumulative notice */}
          <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-300">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Накопительное сохранение:</strong> Бот автоматически отслеживает все закрепляемые сообщения в чате и сохраняет их в базе данных. Вы можете просматривать полный архив и откреплять любое сообщение напрямую.
            </p>
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm">Загрузка закрепленных сообщений...</p>
            </div>
          ) : filteredHistory.length > 0 ? (
            <div className="space-y-4">
              {filteredHistory.map((item, idx) => {
                const isLatestActive = pinned && pinned.messageId === item.messageId;
                const isUnpinned = Boolean(item.unpinned);

                return (
                  <div
                    key={item.id || `${item.chatId}_${item.messageId}_${idx}`}
                    className={`bg-slate-800/70 border rounded-xl p-4 space-y-3.5 shadow-sm transition-all ${
                      isLatestActive 
                        ? 'border-emerald-500/50 bg-slate-800/90 ring-1 ring-emerald-500/20' 
                        : isUnpinned 
                          ? 'border-slate-800/80 opacity-85 hover:opacity-100 hover:border-slate-700' 
                          : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    {/* Meta details */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs border-b border-slate-700/50 pb-2.5">
                      <div className="flex flex-wrap items-center gap-2 text-slate-300">
                        <span className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-700 font-mono text-blue-400 text-xs">
                          #{item.messageId}
                        </span>

                        {isLatestActive ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Активный закреп (API)
                          </span>
                        ) : isUnpinned ? (
                          <span className="px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-400 text-[11px] border border-slate-600/30">
                            Откреплено
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 text-[11px] border border-blue-500/20">
                            В истории закрепов
                          </span>
                        )}

                        {item.from ? (
                          <span className="flex items-center gap-1.5 text-slate-300 ml-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-medium">
                              {item.from.firstName} {item.from.lastName || ''}
                            </span>
                            {item.from.username && (
                              <span className="text-slate-500 text-[11px]">(@{item.from.username})</span>
                            )}
                            {item.from.isBot && (
                              <span className="px-1 py-0.2 text-[9px] bg-blue-900/40 text-blue-300 border border-blue-700/50 rounded">
                                BOT
                              </span>
                            )}
                          </span>
                        ) : item.senderChat ? (
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            {item.senderChat.title}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-3 text-slate-400">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(item.date)}
                        </span>

                        {item.link && (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-medium hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            В Telegram
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Forward info */}
                    {item.forwardFrom && (
                      <div className="text-xs text-slate-400 bg-slate-900/50 px-2.5 py-1 rounded-md border border-slate-800 flex items-center gap-2">
                        <span className="text-slate-500">Переслано от:</span>
                        <span className="font-medium text-slate-300">{item.forwardFrom}</span>
                      </div>
                    )}

                    {/* Message Body */}
                    <div className="space-y-2">
                      {item.hasMedia && (
                        <div className="flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-md bg-slate-900/60 border border-slate-700/50 w-fit">
                          {renderMediaIcon(item.mediaType)}
                          <span className="capitalize text-slate-300">
                            Медиа: {item.mediaType === 'photo' ? 'Фото' : item.mediaType === 'video' ? 'Видео' : item.mediaType === 'document' ? 'Файл/Документ' : item.mediaType === 'audio' ? 'Аудио' : item.mediaType === 'voice' ? 'Голосовое' : item.mediaType === 'poll' ? 'Опрос' : 'Медиаконтент'}
                          </span>
                        </div>
                      )}

                      <div className="text-xs md:text-sm text-slate-100 whitespace-pre-wrap break-words leading-relaxed font-sans bg-slate-950/50 p-3 rounded-lg border border-slate-800/80">
                        {item.text || item.caption || (
                          <span className="text-slate-500 italic">
                            [Сообщение без текста или только медиавложение]
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/40">
                      <div className="text-[11px] text-slate-500">
                        {item.pinnedAt && (
                          <span>Зафиксировано: {new Date(item.pinnedAt).toLocaleDateString('ru-RU')}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteFromHistory(item.messageId)}
                          className="px-2.5 py-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg text-xs font-medium transition-colors"
                          title="Удалить только из локальной базы данных"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleUnpin(item.messageId)}
                          disabled={isUnpinning}
                          className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-rose-200 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
                        >
                          <Pin className="w-3.5 h-3.5 rotate-45" />
                          <span>Открепить в Telegram</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 bg-slate-800/30 rounded-xl border border-slate-800 p-8">
              <div className="p-4 bg-slate-800 rounded-full text-slate-500">
                <History className="w-8 h-8 opacity-40" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-300">
                  {searchQuery ? 'Ничего не найдено по вашему запросу' : 'История закрепов пуста'}
                </p>
                <p className="text-xs text-slate-500 max-w-sm">
                  {searchQuery 
                    ? 'Попробуйте изменить поисковый запрос или сбросить фильтры.' 
                    : 'Как только в чате будет закреплено сообщение ботом или администратором, оно автоматически появится в этом накопительном списке.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleUnpinAll}
            disabled={isUnpinning || isLoading}
            className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Открепить ВСЕ закрепы в чате (Telegram API)
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { FilterSettings } from '../types';
import { ShieldAlert, Plus, X } from 'lucide-react';

interface ModerationProps {
  filters: FilterSettings;
  onUpdateFilters: (filters: FilterSettings) => void;
}

export const Moderation: React.FC<ModerationProps> = ({ filters, onUpdateFilters }) => {
  const [newWord, setNewWord] = useState('');

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

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
      
      {/* Auto-Moderation Filters */}
      <div className="space-y-6">
        <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-orange-500/20 rounded-xl shadow-lg shadow-orange-900/10">
              <ShieldAlert className="w-8 h-8 text-orange-400" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Глобальные правила модерации</h3>
              <p className="text-sm text-slate-500">Настройки по умолчанию для всех подключенных чатов</p>
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
                <span className="text-slate-200 font-medium">Telegram-ссылки</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">t.me, @mentions</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.blockTelegramLinks} onChange={() => onUpdateFilters({...filters, blockTelegramLinks: !filters.blockTelegramLinks})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <span className="text-slate-200 font-medium">Блокировать медиа</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.blockMedia} onChange={() => onUpdateFilters({...filters, blockMedia: !filters.blockMedia})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <span className="text-slate-200 font-medium">Пересланные сообщения</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.blockForwards} onChange={() => onUpdateFilters({...filters, blockForwards: !filters.blockForwards})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <span className="text-slate-200 font-medium">Системные сообщения</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.deleteSystemMessages} onChange={() => onUpdateFilters({...filters, deleteSystemMessages: !filters.deleteSystemMessages})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
              <span className="text-slate-200 font-medium">Удалять команды</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.deleteCommands} onChange={() => onUpdateFilters({...filters, deleteCommands: !filters.deleteCommands})} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-white">Голосование за бан/мут</span>
                <span className="text-xs text-slate-500">Позволяет участникам чата инициировать бан/мут через /userban и /usermute</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.userVoteEnabled} onChange={() => onUpdateFilters({...filters, userVoteEnabled: !filters.userVoteEnabled})} />
                <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            {filters.userVoteEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in slide-in-from-top-4 duration-500 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Процент голосов (%)</label>
                  <input 
                    type="number" 
                    value={filters.userVotePercentage}
                    onChange={(e) => onUpdateFilters({...filters, userVotePercentage: parseInt(e.target.value) || 0})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Мин. голосов</label>
                  <input 
                    type="number" 
                    value={filters.userVoteMin}
                    onChange={(e) => onUpdateFilters({...filters, userVoteMin: parseInt(e.target.value) || 0})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Макс. голосов</label>
                  <input 
                    type="number" 
                    value={filters.userVoteMax}
                    onChange={(e) => onUpdateFilters({...filters, userVoteMax: parseInt(e.target.value) || 0})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Время (мин)</label>
                  <input 
                    type="number" 
                    value={filters.userVoteDuration}
                    onChange={(e) => onUpdateFilters({...filters, userVoteDuration: parseInt(e.target.value) || 0})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 pt-8 border-t border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-white">Мут новичков</span>
                <span className="text-xs text-slate-500">Ограничение на отправку сообщений для новых участников</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={filters.muteNewcomers} onChange={() => onUpdateFilters({...filters, muteNewcomers: !filters.muteNewcomers})} />
                <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            {filters.muteNewcomers && (
              <div className="grid grid-cols-1 gap-6 animate-in slide-in-from-top-4 duration-500 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Длительность мута (часы)</label>
                  <input 
                    type="number" 
                    value={filters.muteDurationHours}
                    onChange={(e) => onUpdateFilters({...filters, muteDurationHours: parseInt(e.target.value) || 0})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Сообщение при муте</label>
                  <textarea 
                    value={filters.muteMessage}
                    onChange={(e) => onUpdateFilters({...filters, muteMessage: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all min-h-[100px]"
                    placeholder="Используйте {hours} для подстановки времени"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 pt-8 border-t border-slate-800 space-y-6">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Вступление в чат</h4>
            
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

            {filters.captchaEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-500 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Вопрос каптчи</label>
                  <input 
                    type="text" 
                    value={filters.captchaQuestion}
                    onChange={(e) => onUpdateFilters({...filters, captchaQuestion: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    placeholder="Напр: Сколько будет 2+2?"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Ответ каптчи</label>
                  <input 
                    type="text" 
                    value={filters.captchaAnswer}
                    onChange={(e) => onUpdateFilters({...filters, captchaAnswer: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    placeholder="Напр: 4"
                  />
                </div>
              </div>
            )}
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
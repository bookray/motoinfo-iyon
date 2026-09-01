import React, { useState } from 'react';
import { LogEntry, Chat } from '../types';
import { Terminal, Clock, Filter, Download, MessageSquare } from 'lucide-react';
import { formatDateTime } from '../src/utils/dateUtils';

interface LogsProps {
  logs: LogEntry[];
  chats: Chat[];
}

export const Logs: React.FC<LogsProps> = ({ logs, chats }) => {
  const [filter, setFilter] = useState<string>('ALL');
  const [selectedChat, setSelectedChat] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'BAN': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
      case 'KICK': return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      case 'WARN': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'JOIN': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case 'LEAVE': return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
      case 'SYSTEM': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      case 'BROADCAST': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
      case 'SETTINGS': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      case 'AUTH': return 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20';
      case 'DIGEST': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
      case 'ERROR': return 'text-rose-500 bg-rose-500/10 border-rose-500/30';
      default: return 'text-slate-400';
    }
  };

  const getFriendlyChatName = (chatId: string) => {
    const chat = chats.find(c => c && c.id === chatId);
    return chat ? chat.title : chatId;
  };

  const filteredLogs = logs.filter(log => {
    if (!log) return false;
    const matchesFilter = filter === 'ALL' || log.type === filter;
    const matchesChat = selectedChat === 'ALL' || log.chat === selectedChat;
    const friendlyChat = getFriendlyChatName(log.chat);
    const matchesSearch = !search || 
      log.user.toLowerCase().includes(search.toLowerCase()) || 
      log.details.toLowerCase().includes(search.toLowerCase()) ||
      friendlyChat.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesChat && matchesSearch;
  });

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    
    // CSV Header
    const headers = ['Время', 'Тип', 'Пользователь', 'Детали', 'Чат (ID)'];
    
    // CSV Rows
    const rows = filteredLogs.map(log => [
      formatDateTime(log.timestamp),
      log.type,
      `@${log.user}`,
      log.details.replace(/"/g, '""'), // escape quotes
      `${getFriendlyChatName(log.chat)} (${log.chat})`
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `teleguard-logs-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const logTypes = ['ALL', 'DIGEST', 'ERROR', 'JOIN', 'LEAVE', 'BAN', 'KICK', 'WARN', 'MUTE', 'SYSTEM', 'BROADCAST', 'SETTINGS', 'AUTH', 'CHAT_UPDATE', 'TASK'];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-blue-500" /> События в реальном времени
            </h2>
            
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                {/* Chat Selector */}
                <div className="relative shrink-0">
                    <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <select 
                        value={selectedChat}
                        onChange={(e) => setSelectedChat(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-8 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none cursor-pointer"
                    >
                        <option value="ALL">Все чаты</option>
                        {chats.filter(c => c).map(chat => (
                          <option key={chat.id} value={chat.id}>{chat.title}</option>
                        ))}
                    </select>
                </div>

                {/* Log Type Filter */}
                <div className="relative shrink-0">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <select 
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-8 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none cursor-pointer"
                    >
                        {logTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                
                {/* Search Input */}
                <input 
                    type="text"
                    placeholder="Поиск по логам..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50 flex-1 md:flex-initial"
                />

                {/* Export Button */}
                <button
                  onClick={handleExportCSV}
                  disabled={filteredLogs.length === 0}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer shadow"
                  title="Экспортировать отфильтрованные логи в CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  Экспорт
                </button>
            </div>
        </div>
        
        <div className="flex-1 overflow-y-auto bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs p-4 space-y-2 shadow-inner custom-scrollbar">
            {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600">
                    <Clock className="w-8 h-8 mb-2 opacity-50" />
                    <p>{logs.length === 0 ? 'Логов пока нет...' : 'Ничего не найдено по фильтрам'}</p>
                </div>
            ) : (
                filteredLogs.map((log) => (
                    <div key={log.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-2 hover:bg-slate-900/40 rounded border-b border-slate-900/30 last:border-0 transition-colors group">
                        <span className="text-slate-500 whitespace-nowrap text-[10px] w-32 shrink-0">{formatDateTime(log.timestamp)}</span>
                        <span className={`px-2 py-0.5 rounded-[4px] text-[9px] border uppercase font-bold tracking-wider w-24 text-center shrink-0 ${getBadgeColor(log.type)}`}>
                            {log.type}
                        </span>
                        <div className="flex-1 flex gap-2 overflow-hidden">
                            <span className="text-blue-400 font-medium shrink-0">@{log.user}</span>
                            <span className="text-slate-300 truncate group-hover:whitespace-normal group-hover:overflow-visible">{log.details}</span>
                        </div>
                        <span className="text-slate-500 text-[10px] shrink-0 font-sans bg-slate-900/50 px-2 py-0.5 rounded border border-slate-800" title={`ID чата: ${log.chat}`}>
                            {getFriendlyChatName(log.chat)}
                        </span>
                    </div>
                ))
            )}
        </div>
    </div>
  );
};

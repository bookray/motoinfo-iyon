import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, Cell, Legend 
} from 'recharts';
import { 
  Users, MessageSquare, ShieldAlert, Activity, Filter, Check, Calendar, 
  Clock, Flame, Moon, Sun, TrendingUp, Sparkles, UserPlus, BarChart3 
} from 'lucide-react';

import { Stats, Chat, HourlyActivityPoint } from '../types';
import { formatDate } from '../src/utils/dateUtils';

interface DashboardProps {
  stats: Stats | null;
  chats: Chat[];
  selectedChatIds: string[];
  onToggleChatFilter: (id: string) => void;
  dateRange: { start: string; end: string };
  onDateRangeChange: (range: { start: string; end: string }) => void;
  onUpdateChat?: (chat: Chat) => void;
}

const StatCard = ({ title, value, sub, icon: Icon, color }: any) => (
  <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl flex items-start justify-between hover:border-slate-700 transition-all">
    <div>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">{title}</p>
      <h3 className="text-3xl font-bold text-white tracking-tight">{value}</h3>
      <p className={`text-[10px] font-bold mt-2 px-2 py-0.5 rounded-full inline-block ${sub.includes('+') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
        {sub} <span className="opacity-60 font-medium lowercase">vs prev period</span>
      </p>
    </div>
    <div className={`p-3 rounded-xl ${color} bg-opacity-20 shadow-lg`}>
      <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ 
  stats, 
  chats, 
  selectedChatIds, 
  onToggleChatFilter,
  dateRange,
  onDateRangeChange,
  onUpdateChat
}) => {
  const [showRetry, setShowRetry] = useState(false);
  const [hourlyMetric, setHourlyMetric] = useState<'msgs' | 'activeUsers' | 'joins' | 'all'>('msgs');
  const [hourlyChartType, setHourlyChartType] = useState<'bar' | 'area'>('bar');

  React.useEffect(() => {
    if (!stats) {
      const timer = setTimeout(() => setShowRetry(true), 4000);
      return () => clearTimeout(timer);
    } else {
      setShowRetry(false);
    }
  }, [stats]);

  const hourlyData: HourlyActivityPoint[] = useMemo(() => {
    if (stats?.hourlyActivity && stats.hourlyActivity.length === 24) {
      return stats.hourlyActivity;
    }
    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      time: `${i.toString().padStart(2, '0')}:00`,
      msgs: 0,
      activeUsers: 0,
      joins: 0
    }));
  }, [stats?.hourlyActivity]);

  const { totalHourlyMsgs, totalHourlyUsers, totalHourlyJoins, peakHour, quietHour, daytimePercent, nighttimePercent } = useMemo(() => {
    let totalMsgs = 0;
    let totalUsers = 0;
    let totalJoins = 0;
    let maxMsgs = -1;
    let minMsgs = Infinity;
    let peakH = hourlyData[0];
    let quietH = hourlyData[0];
    let dayMsgs = 0;

    hourlyData.forEach(h => {
      totalMsgs += h.msgs;
      totalUsers += h.activeUsers;
      totalJoins += h.joins;

      if (h.msgs > maxMsgs) {
        maxMsgs = h.msgs;
        peakH = h;
      }
      if (h.msgs < minMsgs) {
        minMsgs = h.msgs;
        quietH = h;
      }
      if (h.hour >= 8 && h.hour < 20) {
        dayMsgs += h.msgs;
      }
    });

    const dayPct = totalMsgs > 0 ? Math.round((dayMsgs / totalMsgs) * 100) : 70;
    const nightPct = 100 - dayPct;

    return {
      totalHourlyMsgs: totalMsgs,
      totalHourlyUsers: totalUsers,
      totalHourlyJoins: totalJoins,
      peakHour: peakH,
      quietHour: quietH,
      daytimePercent: dayPct,
      nighttimePercent: nightPct
    };
  }, [hourlyData]);

  const CustomHourlyTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload as HourlyActivityPoint;
      if (!data) return null;
      const nextHour = (data.hour + 1) % 24;
      const nextLabel = `${nextHour.toString().padStart(2, '0')}:00`;
      const sharePercent = totalHourlyMsgs > 0 ? ((data.msgs / totalHourlyMsgs) * 100).toFixed(1) : '0';
      const isPeak = peakHour && peakHour.hour === data.hour && peakHour.msgs > 0;

      return (
        <div className="bg-slate-950/95 border border-slate-700 rounded-xl p-3.5 shadow-2xl text-xs space-y-2 min-w-[210px] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-slate-200">
            <div className="flex items-center gap-1.5 font-bold">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{data.time} — {nextLabel}</span>
            </div>
            {isPeak ? (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded-full font-bold border border-amber-500/30">
                <Flame className="w-2.5 h-2.5" /> ПИК
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                {sharePercent}% суток
              </span>
            )}
          </div>
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between text-purple-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                Сообщений:
              </span>
              <span className="font-bold text-white text-xs">{data.msgs.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-blue-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                Активных участников:
              </span>
              <span className="font-bold text-white text-xs">{data.activeUsers.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-emerald-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                Вступлений:
              </span>
              <span className="font-bold text-white text-xs">{data.joins.toLocaleString()}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400">Загрузка статистики...</p>
        {showRetry && (
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition-all"
          >
            Обновить страницу
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {chats.length > 0 && chats.filter(c => c && c.active).length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 flex flex-col gap-6 text-amber-200">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-xl shrink-0">
              <ShieldAlert className="w-6 h-6 text-amber-500 animate-pulse" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h4 className="font-bold text-white text-base">Все чаты деактивированы ({chats.length} найдено)</h4>
              <p className="text-xs text-slate-400 mt-1">
                Бот находится в ваших группах, но они сейчас <strong className="text-amber-400">деактивированы</strong> в системе. Вы можете <strong className="text-emerald-400">активировать нужные чаты ниже в один клик</strong>, чтобы бот начал модерировать чаты и собирать по ним статистику!
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4 border-t border-amber-500/20">
            {chats.slice(0, 6).map((chat) => (
              <div key={chat.id} className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-amber-500/30 transition-all">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <img src={chat.avatarUrl} alt={chat.title} className="w-8 h-8 rounded-full border border-slate-800 shrink-0" />
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">{chat.title}</p>
                    <p className="text-[9px] text-slate-500 font-mono">ID: {chat.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => onUpdateChat && onUpdateChat({ ...chat, active: true })}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
                >
                  Активировать
                </button>
              </div>
            ))}
            {chats.length > 6 && (
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 text-center pt-1">
                <p className="text-[10px] text-slate-500">
                  Показаны первые 6 чатов. Вы можете активировать остальные {chats.length - 6} во вкладке «Управляемые чаты».
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {chats.length === 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-4 text-blue-200">
          <div className="p-3 bg-blue-500/20 rounded-xl">
            <Users className="w-6 h-6 text-blue-500" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h4 className="font-bold text-white text-base">Бот еще не добавлен ни в один чат</h4>
            <p className="text-xs text-slate-400 mt-1">
              Добавьте вашего бота <strong className="text-blue-400">@MotoInformBot</strong> в ваш Telegram-чат в качестве администратора, выдайте права на удаление сообщений, и отправьте любое сообщение в группу. Чат автоматически зарегистрируется в этой панели!
            </p>
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Filter className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Фильтр по чатам</h3>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Выберите чаты для анализа</p>
              </div>
            </div>
            {selectedChatIds.length > 0 && (
              <button 
                onClick={() => chats.forEach(c => c && selectedChatIds.includes(c.id) && onToggleChatFilter(c.id))}
                className="text-xs text-blue-400 hover:text-blue-300 font-bold uppercase tracking-widest flex items-center gap-1"
              >
                Сбросить фильтр
              </button>
            )}
          </div>
          
          <div className="max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {chats.filter(c => c && c.active).map(chat => (
                <button
                  key={chat.id}
                  onClick={() => onToggleChatFilter(chat.id)}
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                    selectedChatIds.includes(chat.id)
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-900/10'
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                  }`}
                >
                  <span className="truncate flex-1 text-left">{chat.title}</span>
                  {selectedChatIds.includes(chat.id) ? (
                    <div className="bg-blue-500 rounded-full p-0.5">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-slate-700" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Calendar className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Период</h3>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Выберите диапазон дат</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1.5 block">От</label>
              <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1.5 block">До</label>
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            {(dateRange.start || dateRange.end) && (
              <button 
                onClick={() => onDateRangeChange({ start: '', end: '' })}
                className="w-full py-2 text-xs text-rose-400 hover:text-rose-300 font-bold uppercase tracking-widest border border-rose-500/20 hover:border-rose-500/40 rounded-xl transition-all"
              >
                Сбросить даты
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Всего участников" 
          value={stats.totalMembers.toLocaleString()} 
          sub={stats.totalMembersTrend} 
          icon={Users} 
          color="bg-blue-500" 
        />
        <StatCard 
          title="Сообщений (24ч)" 
          value={stats.totalMessages24h.toLocaleString()} 
          sub={stats.messagesTrend} 
          icon={MessageSquare} 
          color="bg-purple-500" 
        />
        <StatCard 
          title="Действия модерации" 
          value={stats.modActions.toLocaleString()} 
          sub={stats.modActionsTrend} 
          icon={ShieldAlert} 
          color="bg-rose-500" 
        />
        <StatCard 
          title="Активные чаты" 
          value={stats.activeChats.toString()} 
          sub="+0" 
          icon={Activity} 
          color="bg-emerald-500" 
        />
      </div>

      {/* Hourly User Activity Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        {/* Header with Title and Mode Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Активность пользователей по часам</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-[11px] font-semibold border border-amber-500/20">
                  24 часа (00:00 — 23:00)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Почасовое распределение сообщений, уникальных участников и вступлений в чат {dateRange.start && dateRange.end ? `(за период ${formatDate(dateRange.start)} - ${formatDate(dateRange.end)})` : (dateRange.start || dateRange.end ? '' : '(за последние 7 дней)')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Switcher */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
              <button
                onClick={() => setHourlyMetric('msgs')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  hourlyMetric === 'msgs' ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Сообщения</span>
              </button>
              <button
                onClick={() => setHourlyMetric('activeUsers')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  hourlyMetric === 'activeUsers' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Участники</span>
              </button>
              <button
                onClick={() => setHourlyMetric('joins')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  hourlyMetric === 'joins' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Вступления</span>
              </button>
              <button
                onClick={() => setHourlyMetric('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  hourlyMetric === 'all' ? 'bg-amber-600 text-white shadow-md shadow-amber-900/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Все</span>
              </button>
            </div>

            {/* Chart Type Switcher */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
              <button
                onClick={() => setHourlyChartType('bar')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  hourlyChartType === 'bar' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Столбчатая диаграмма"
              >
                Столбцы
              </button>
              <button
                onClick={() => setHourlyChartType('area')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  hourlyChartType === 'area' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Плавная область"
              >
                Область
              </button>
            </div>
          </div>
        </div>

        {/* 4 Insight Stat Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">Пиковый час</p>
              <p className="text-sm font-bold text-white truncate">
                {peakHour ? `${peakHour.time} — ${((peakHour.hour + 1) % 24).toString().padStart(2, '0')}:00` : '—'}
              </p>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">В пиковый час</p>
              <p className="text-sm font-bold text-white truncate">
                {peakHour ? `${peakHour.msgs.toLocaleString()} сообщ.` : '0'}
              </p>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg shrink-0">
              <Sun className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">День (08:00–20:00)</p>
              <p className="text-sm font-bold text-amber-300 truncate">
                {daytimePercent}% активности
              </p>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg shrink-0">
              <Moon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">Ночь (20:00–08:00)</p>
              <p className="text-sm font-bold text-indigo-300 truncate">
                {nighttimePercent}% активности
              </p>
            </div>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="h-80 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {hourlyChartType === 'bar' ? (
              <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="hourlyMsgsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="hourlyUsersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="hourlyJoinsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="peakHighlightGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                    <stop offset="100%" stopColor="#d97706" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  interval={1}
                />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomHourlyTooltip />} />
                {hourlyMetric === 'msgs' && (
                  <Bar dataKey="msgs" radius={[4, 4, 0, 0]} name="Сообщения">
                    {hourlyData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={peakHour && entry.hour === peakHour.hour && peakHour.msgs > 0 ? 'url(#peakHighlightGrad)' : 'url(#hourlyMsgsGrad)'} 
                      />
                    ))}
                  </Bar>
                )}
                {hourlyMetric === 'activeUsers' && (
                  <Bar dataKey="activeUsers" fill="url(#hourlyUsersGrad)" radius={[4, 4, 0, 0]} name="Активные участники" />
                )}
                {hourlyMetric === 'joins' && (
                  <Bar dataKey="joins" fill="url(#hourlyJoinsGrad)" radius={[4, 4, 0, 0]} name="Вступления" />
                )}
                {hourlyMetric === 'all' && (
                  <>
                    <Bar dataKey="msgs" fill="url(#hourlyMsgsGrad)" radius={[3, 3, 0, 0]} name="Сообщения" />
                    <Bar dataKey="activeUsers" fill="url(#hourlyUsersGrad)" radius={[3, 3, 0, 0]} name="Активные участники" />
                    <Bar dataKey="joins" fill="url(#hourlyJoinsGrad)" radius={[3, 3, 0, 0]} name="Вступления" />
                  </>
                )}
              </BarChart>
            ) : (
              <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaMsgsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="areaUsersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="areaJoinsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  interval={1}
                />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomHourlyTooltip />} />
                {hourlyMetric === 'msgs' && (
                  <Area type="monotone" dataKey="msgs" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#areaMsgsGrad)" name="Сообщения" />
                )}
                {hourlyMetric === 'activeUsers' && (
                  <Area type="monotone" dataKey="activeUsers" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#areaUsersGrad)" name="Активные участники" />
                )}
                {hourlyMetric === 'joins' && (
                  <Area type="monotone" dataKey="joins" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#areaJoinsGrad)" name="Вступления" />
                )}
                {hourlyMetric === 'all' && (
                  <>
                    <Area type="monotone" dataKey="msgs" stroke="#8b5cf6" strokeWidth={2.5} fillOpacity={1} fill="url(#areaMsgsGrad)" name="Сообщения" />
                    <Area type="monotone" dataKey="activeUsers" stroke="#0ea5e9" strokeWidth={2.5} fillOpacity={1} fill="url(#areaUsersGrad)" name="Активные участники" />
                  </>
                )}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Informational Footer Note */}
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-slate-400">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-slate-300">Совет по расписанию: </span>
            {peakHour && peakHour.msgs > 0 ? (
              <span>
                Основной пик общения участников приходится на интервал <strong className="text-amber-300 font-medium">{peakHour.time} — {((peakHour.hour + 1) % 24).toString().padStart(2, '0')}:00</strong>. Это оптимальное время для запуска важных анонсов, рассылок и опросов с максимальным охватом.
              </span>
            ) : (
              <span>
                График автоматически агрегирует активность всех участников по часам суток на основе сообщений и системных событий из Telegram Bot API.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" />
            Присоединившиеся и вышедшие {dateRange.start && dateRange.end ? `(${formatDate(dateRange.start)} - ${formatDate(dateRange.end)})` : (dateRange.start || dateRange.end ? '' : '(за 7 дней)')}
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => formatDate(val)} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  labelFormatter={(val) => formatDate(val)}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', color: '#f1f5f9' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Bar dataKey="joins" fill="#10b981" radius={[4, 4, 0, 0]} name="Присоединились" />
                <Bar dataKey="leaves" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Вышли" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            Участники онлайн {dateRange.start && dateRange.end ? `(${formatDate(dateRange.start)} - ${formatDate(dateRange.end)})` : (dateRange.start || dateRange.end ? '' : '(за сутки)')}
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => formatDate(val)} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  labelFormatter={(val) => formatDate(val)}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', color: '#f1f5f9' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="onlineMembers" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#0f172a' }} activeDot={{ r: 8 }} name="Онлайн" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-500" />
            Всего участников {dateRange.start && dateRange.end ? `(${formatDate(dateRange.start)} - ${formatDate(dateRange.end)})` : (dateRange.start || dateRange.end ? '' : '(по дням)')}
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => formatDate(val)} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 100', 'auto']} />
                <Tooltip 
                  labelFormatter={(val) => formatDate(val)}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', color: '#f1f5f9' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="totalMembers" stroke="#8b5cf6" strokeWidth={4} dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#0f172a' }} activeDot={{ r: 8 }} name="Участники" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-purple-500" />
            Объем сообщений {dateRange.start && dateRange.end ? `(${formatDate(dateRange.start)} - ${formatDate(dateRange.end)})` : (dateRange.start || dateRange.end ? '' : '(за 7 дней)')}
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => formatDate(val)} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  labelFormatter={(val) => formatDate(val)}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', color: '#f1f5f9' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="msgs" stroke="#8b5cf6" strokeWidth={4} dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#0f172a' }} activeDot={{ r: 8 }} name="Сообщения" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Active Members & Admins Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            Топ активных участников
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Пользователь</th>
                  <th className="py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Чаты</th>
                  <th className="py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Сообщений</th>
                </tr>
              </thead>
              <tbody>
                {stats.topActiveMembers && stats.topActiveMembers.length > 0 ? (
                  stats.topActiveMembers.filter(u => u).map((user, idx) => (
                    <tr key={user.userId} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{user.firstName || 'Unknown'}</p>
                            <p className="text-[10px] text-slate-500">{user.username || 'No username'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {user.chats.filter((c: any) => c).map(chat => (
                            <span key={chat.id} className="px-1.5 py-0.5 bg-slate-800 text-[9px] text-slate-400 border border-slate-700 rounded uppercase font-bold">
                              {chat.title}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-xs font-bold">
                          {user.msgCount.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-slate-600 italic text-sm">
                      Нет данных об активности участников
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            Топ активных администраторов
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Администратор</th>
                  <th className="py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Чаты</th>
                  <th className="py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Сообщений</th>
                </tr>
              </thead>
              <tbody>
                {stats.topActiveAdmins && stats.topActiveAdmins.length > 0 ? (
                  stats.topActiveAdmins.filter(u => u).map((user, idx) => (
                    <tr key={user.userId} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 font-bold text-xs">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{user.firstName || 'Unknown'}</p>
                            <p className="text-[10px] text-slate-500">{user.username || 'No username'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {user.chats.filter((c: any) => c).map(chat => (
                            <span key={chat.id} className="px-1.5 py-0.5 bg-slate-800 text-[9px] text-slate-400 border border-slate-700 rounded uppercase font-bold">
                              {chat.title}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="px-3 py-1 bg-rose-500/10 text-rose-400 rounded-full text-xs font-bold">
                          {user.msgCount.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-slate-600 italic text-sm">
                      Нет данных об активности администраторов
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Top 10 Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <Top10Table 
          title="Топ 10 по участникам" 
          data={stats.topChatsByMembers} 
          icon={Users} 
          color="text-blue-500" 
          label="Участников" 
        />
        <Top10Table 
          title="Топ 10 по сообщениям (24ч)" 
          data={stats.topChatsByMessages24h} 
          icon={MessageSquare} 
          color="text-purple-500" 
          label="Сообщений" 
        />
        <Top10Table 
          title="Топ 10 по сообщениям (всего)" 
          data={stats.topChatsByTotalMessages} 
          icon={MessageSquare} 
          color="text-indigo-500" 
          label="Всего" 
        />
        <Top10Table 
          title="Топ 10 по активным (сегодня)" 
          data={stats.topChatsByActiveUsers} 
          icon={Activity} 
          color="text-emerald-500" 
          label="Активных" 
        />
        <Top10Table 
          title="Топ 10 по онлайн (сегодня)" 
          data={stats.topChatsByOnlineUsers} 
          icon={Activity} 
          color="text-blue-400" 
          label="Онлайн" 
        />
      </div>
    </div>
  );
};

interface Top10TableProps {
  title: string;
  data: { id: string; title: string; count: number }[];
  icon: React.ElementType;
  color: string;
  label: string;
}

const Top10Table: React.FC<Top10TableProps> = ({ title, data, icon: Icon, color, label }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col h-full hover:border-slate-700 transition-all">
    <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-slate-950 border border-slate-800`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
    </div>
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-950/50 text-slate-500 text-[9px] font-bold uppercase tracking-widest border-b border-slate-800">
            <th className="px-4 py-2 font-bold">Чат</th>
            <th className="px-4 py-2 text-right font-bold">{label}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {data && data.length > 0 ? (
            data.filter(item => item).map((item, idx) => (
              <tr key={item.id} className="hover:bg-slate-800/30 transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-slate-600 w-5">{idx + 1}.</span>
                    <span className="text-xs font-medium text-slate-300 truncate max-w-[140px] group-hover:text-white transition-colors">
                      {item.title}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-xs font-bold font-mono ${color}`}>
                    {item.count.toLocaleString()}
                  </span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={2} className="px-4 py-12 text-center text-slate-600 italic text-[10px]">
                Нет данных для отображения
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

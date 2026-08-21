import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, Cell, Legend 
} from 'recharts';
import { 
  Users, MessageSquare, ShieldAlert, Activity, Filter, Check, Calendar, 
  Clock, Flame, Moon, Sun, TrendingUp, Sparkles, UserPlus, BarChart3,
  Grid, Layers, Zap, Award, Info, ChevronRight
} from 'lucide-react';

import { Stats, Chat, HourlyActivityPoint, HeatmapCell } from '../types';
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
  const [activityViewMode, setActivityViewMode] = useState<'heatmap' | 'hourly'>('heatmap');
  const [activityMetric, setActivityMetric] = useState<'msgs' | 'activeUsers' | 'joins'>('msgs');
  const [hourlyChartType, setHourlyChartType] = useState<'bar' | 'area'>('bar');
  const [dayFilter, setDayFilter] = useState<'all' | 'weekdays' | 'weekends'>('all');
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null);

  React.useEffect(() => {
    if (!stats) {
      const timer = setTimeout(() => setShowRetry(true), 4000);
      return () => clearTimeout(timer);
    } else {
      setShowRetry(false);
    }
  }, [stats]);

  const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DAY_FULL_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  // 1. Process 24-hour summary data
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

  // 2. Process Heatmap 7x24 Matrix
  const heatmapData: HeatmapCell[] = useMemo(() => {
    if (stats?.heatmapData && stats.heatmapData.length === 168) {
      return stats.heatmapData;
    }
    // Synthesize fallback 7x24 matrix from hourly activity and days
    const synthesized: HeatmapCell[] = [];
    const dayMultipliers = [0.95, 1.05, 1.1, 1.0, 1.25, 0.85, 0.8]; // Пн, Вт, Ср, Чт, Пт, Сб, Вс
    for (let d = 0; d < 7; d++) {
      const mult = dayMultipliers[d];
      for (let h = 0; h < 24; h++) {
        const baseH = hourlyData[h] || { msgs: 0, activeUsers: 0, joins: 0 };
        const msgs = Math.round((baseH.msgs / 7) * mult);
        const users = Math.round((baseH.activeUsers / 7) * mult);
        const joins = Math.round((baseH.joins / 7) * mult);
        synthesized.push({
          day: d,
          dayName: DAY_NAMES[d],
          dayFullName: DAY_FULL_NAMES[d],
          hour: h,
          time: `${h.toString().padStart(2, '0')}:00`,
          msgs,
          activeUsers: users,
          joins,
          intensity: 0
        });
      }
    }
    return synthesized;
  }, [stats?.heatmapData, hourlyData]);

  // 3. Compute dynamic stats and metrics for Heatmap
  const {
    maxMetricVal,
    totalWeekMetric,
    peakCell,
    bestDay,
    weekdayTotal,
    weekendTotal,
    weekdayPct,
    weekendPct,
    daytimeTotal,
    nighttimeTotal,
    daytimePct,
    nighttimePct,
    dayStats,
    hourStats,
    filteredDays
  } = useMemo(() => {
    let maxVal = 0;
    let totalMetric = 0;
    let peakC = heatmapData[0] || null;
    let maxCellVal = -1;

    // Day totals
    const dStats = Array.from({ length: 7 }, (_, d) => ({
      day: d,
      name: DAY_NAMES[d],
      fullName: DAY_FULL_NAMES[d],
      msgs: 0,
      activeUsers: 0,
      joins: 0,
      metricVal: 0,
      peakHour: 0,
      peakHourVal: -1
    }));

    // Hour totals
    const hStats = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      time: `${h.toString().padStart(2, '0')}:00`,
      msgs: 0,
      activeUsers: 0,
      joins: 0,
      metricVal: 0
    }));

    let wDayTotal = 0;
    let wEndTotal = 0;
    let dTimeTotal = 0;
    let nTimeTotal = 0;

    heatmapData.forEach(cell => {
      const val = cell[activityMetric] || 0;
      if (val > maxVal) maxVal = val;
      totalMetric += val;

      if (val > maxCellVal) {
        maxCellVal = val;
        peakC = cell;
      }

      // Aggregate day
      dStats[cell.day].msgs += cell.msgs;
      dStats[cell.day].activeUsers += cell.activeUsers;
      dStats[cell.day].joins += cell.joins;
      dStats[cell.day].metricVal += val;

      if (val > dStats[cell.day].peakHourVal) {
        dStats[cell.day].peakHourVal = val;
        dStats[cell.day].peakHour = cell.hour;
      }

      // Aggregate hour
      hStats[cell.hour].msgs += cell.msgs;
      hStats[cell.hour].activeUsers += cell.activeUsers;
      hStats[cell.hour].joins += cell.joins;
      hStats[cell.hour].metricVal += val;

      // Weekday vs Weekend
      if (cell.day < 5) {
        wDayTotal += val;
      } else {
        wEndTotal += val;
      }

      // Day vs Night
      if (cell.hour >= 8 && cell.hour < 20) {
        dTimeTotal += val;
      } else {
        nTimeTotal += val;
      }
    });

    // Best day of week
    let bDay = dStats[0];
    dStats.forEach(d => {
      if (d.metricVal > bDay.metricVal) {
        bDay = d;
      }
    });

    const wTotal = wDayTotal + wEndTotal;
    const wDayPct = wTotal > 0 ? Math.round((wDayTotal / wTotal) * 100) : 70;
    const wEndPct = 100 - wDayPct;

    const dnTotal = dTimeTotal + nTimeTotal;
    const dPct = dnTotal > 0 ? Math.round((dTimeTotal / dnTotal) * 100) : 75;
    const nPct = 100 - dPct;

    // Filter days
    let fDays = [0, 1, 2, 3, 4, 5, 6];
    if (dayFilter === 'weekdays') fDays = [0, 1, 2, 3, 4];
    if (dayFilter === 'weekends') fDays = [5, 6];

    return {
      maxMetricVal: maxVal || 1,
      totalWeekMetric: totalMetric,
      peakCell: peakC,
      bestDay: bDay,
      weekdayTotal: wDayTotal,
      weekendTotal: wEndTotal,
      weekdayPct: wDayPct,
      weekendPct: wEndPct,
      daytimeTotal: dTimeTotal,
      nighttimeTotal: nTimeTotal,
      daytimePct: dPct,
      nighttimePct: nPct,
      dayStats: dStats,
      hourStats: hStats,
      filteredDays: fDays
    };
  }, [heatmapData, activityMetric, dayFilter]);

  // Color generator for heatmap cell
  const getCellColorClass = (val: number, isSelected: boolean, isHovered: boolean) => {
    const ratio = maxMetricVal > 0 ? val / maxMetricVal : 0;
    const isPeak = val === maxMetricVal && maxMetricVal > 0;

    let base = '';
    if (activityMetric === 'msgs') {
      if (val === 0) {
        base = 'bg-slate-950/80 border-slate-850/60 text-slate-650 hover:border-slate-700';
      } else if (ratio < 0.15) {
        base = 'bg-purple-950/30 border-purple-900/30 text-purple-400 hover:bg-purple-900/40';
      } else if (ratio < 0.35) {
        base = 'bg-purple-900/50 border-purple-800/40 text-purple-300 hover:bg-purple-800/60';
      } else if (ratio < 0.60) {
        base = 'bg-purple-700/60 border-purple-600/50 text-purple-100 hover:bg-purple-600/70';
      } else if (ratio < 0.85) {
        base = 'bg-purple-600/85 border-purple-500/70 text-white font-medium hover:bg-purple-500';
      } else {
        base = 'bg-purple-500 border-purple-300 text-white font-bold shadow-md shadow-purple-500/30 hover:bg-purple-400';
      }
    } else if (activityMetric === 'activeUsers') {
      if (val === 0) {
        base = 'bg-slate-950/80 border-slate-850/60 text-slate-650 hover:border-slate-700';
      } else if (ratio < 0.15) {
        base = 'bg-sky-950/30 border-sky-900/30 text-sky-400 hover:bg-sky-900/40';
      } else if (ratio < 0.35) {
        base = 'bg-sky-900/50 border-sky-800/40 text-sky-300 hover:bg-sky-800/60';
      } else if (ratio < 0.60) {
        base = 'bg-sky-700/60 border-sky-600/50 text-sky-100 hover:bg-sky-600/70';
      } else if (ratio < 0.85) {
        base = 'bg-sky-600/85 border-sky-500/70 text-white font-medium hover:bg-sky-500';
      } else {
        base = 'bg-sky-500 border-sky-300 text-white font-bold shadow-md shadow-sky-500/30 hover:bg-sky-400';
      }
    } else {
      // joins
      if (val === 0) {
        base = 'bg-slate-950/80 border-slate-850/60 text-slate-650 hover:border-slate-700';
      } else if (ratio < 0.15) {
        base = 'bg-emerald-950/30 border-emerald-900/30 text-emerald-400 hover:bg-emerald-900/40';
      } else if (ratio < 0.35) {
        base = 'bg-emerald-900/50 border-emerald-800/40 text-emerald-300 hover:bg-emerald-800/60';
      } else if (ratio < 0.60) {
        base = 'bg-emerald-700/60 border-emerald-600/50 text-emerald-100 hover:bg-emerald-600/70';
      } else if (ratio < 0.85) {
        base = 'bg-emerald-600/85 border-emerald-500/70 text-white font-medium hover:bg-emerald-500';
      } else {
        base = 'bg-emerald-500 border-emerald-300 text-white font-bold shadow-md shadow-emerald-500/30 hover:bg-emerald-400';
      }
    }

    if (isSelected) {
      base += ' ring-2 ring-amber-400 scale-105 z-20 shadow-xl';
    } else if (isHovered) {
      base += ' ring-1 ring-white/70 scale-105 z-10';
    }

    return base;
  };

  const CustomHourlyTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload as HourlyActivityPoint;
      if (!data) return null;
      const nextHour = (data.hour + 1) % 24;
      const nextLabel = `${nextHour.toString().padStart(2, '0')}:00`;
      const isPeak = peakCell && peakCell.hour === data.hour && peakCell.msgs > 0;

      return (
        <div className="bg-slate-950/95 border border-slate-700 rounded-xl p-3.5 shadow-2xl text-xs space-y-2 min-w-[210px] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-slate-200">
            <div className="flex items-center gap-1.5 font-bold">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{data.time} — {nextLabel}</span>
            </div>
            {isPeak && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded-full font-bold border border-amber-500/30">
                <Flame className="w-2.5 h-2.5" /> ПИК
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

      {/* Heatmap 7x24 & Hourly Activity Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        {/* Header with Title and Mode Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 text-purple-400 rounded-xl border border-purple-500/30">
              <Grid className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-white">Тепловая карта активности (Heatmap 7×24)</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 text-[11px] font-semibold border border-purple-500/20 flex items-center gap-1">
                  <Flame className="w-3 h-3 text-amber-400" />
                  7 дней × 24 часа
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Интенсивность сообщений, участников и вступлений по дням недели (Пн–Вс) и часам суток (00:00–23:00) {dateRange.start && dateRange.end ? `(за период ${formatDate(dateRange.start)} - ${formatDate(dateRange.end)})` : (dateRange.start || dateRange.end ? '' : '(за последние 7 дней)')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
              <button
                onClick={() => setActivityViewMode('heatmap')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activityViewMode === 'heatmap' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Матрица 7x24"
              >
                <Grid className="w-3.5 h-3.5 text-purple-400" />
                <span>Тепловая карта</span>
              </button>
              <button
                onClick={() => setActivityViewMode('hourly')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activityViewMode === 'hourly' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Почасовой график 24ч"
              >
                <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                <span>24ч график</span>
              </button>
            </div>

            {/* Metric Switcher */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
              <button
                onClick={() => setActivityMetric('msgs')}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activityMetric === 'msgs' ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Сообщения</span>
              </button>
              <button
                onClick={() => setActivityMetric('activeUsers')}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activityMetric === 'activeUsers' ? 'bg-sky-600 text-white shadow-md shadow-sky-900/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Участники</span>
              </button>
              <button
                onClick={() => setActivityMetric('joins')}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activityMetric === 'joins' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Вступления</span>
              </button>
            </div>

            {/* Day Filter Switcher (when in Heatmap mode) */}
            {activityViewMode === 'heatmap' ? (
              <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
                <button
                  onClick={() => setDayFilter('all')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    dayFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Все дни
                </button>
                <button
                  onClick={() => setDayFilter('weekdays')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    dayFilter === 'weekdays' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Будни
                </button>
                <button
                  onClick={() => setDayFilter('weekends')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    dayFilter === 'weekends' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Выходные
                </button>
              </div>
            ) : (
              <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
                <button
                  onClick={() => setHourlyChartType('bar')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    hourlyChartType === 'bar' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Столбцы
                </button>
                <button
                  onClick={() => setHourlyChartType('area')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    hourlyChartType === 'area' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Область
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4 Insight Stat Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">Пиковый слот недели</p>
              <p className="text-sm font-bold text-white truncate">
                {peakCell ? `${peakCell.dayName}, ${peakCell.time}–${((peakCell.hour + 1) % 24).toString().padStart(2, '0')}:00` : '—'}
              </p>
              <p className="text-[10px] text-amber-400/90 truncate font-mono">
                {peakCell ? `${peakCell[activityMetric].toLocaleString()} ${activityMetric === 'msgs' ? 'сообщ.' : activityMetric === 'activeUsers' ? 'участн.' : 'вступл.'}` : ''}
              </p>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">Самый активный день</p>
              <p className="text-sm font-bold text-white truncate">
                {bestDay ? bestDay.fullName : '—'}
              </p>
              <p className="text-[10px] text-purple-300/90 truncate font-mono">
                {bestDay ? `${bestDay.metricVal.toLocaleString()} (${totalWeekMetric > 0 ? Math.round((bestDay.metricVal / totalWeekMetric) * 100) : 0}%)` : ''}
              </p>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">Будни vs Выходные</p>
              <p className="text-sm font-bold text-blue-300 truncate">
                {weekdayPct}% / {weekendPct}%
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                Будни: {weekdayTotal.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg shrink-0">
              <Sun className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">День vs Ночь</p>
              <p className="text-sm font-bold text-indigo-300 truncate">
                {daytimePct}% / {nighttimePct}%
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                День (08–20): {daytimeTotal.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* VIEW 1: HEATMAP 7x24 MATRIX */}
        {activityViewMode === 'heatmap' && (
          <div className="space-y-4">
            {/* Scrollable Heatmap Grid */}
            <div className="overflow-x-auto pb-2 -mx-2 px-2">
              <div className="min-w-[840px] space-y-1.5">
                {/* Hour Header Row (00 - 23) */}
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 pb-1">
                  <div className="w-16 shrink-0 text-slate-500 font-sans font-bold text-xs uppercase pl-1">
                    День
                  </div>
                  <div className="grid grid-cols-24 flex-1 gap-1 text-center">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div 
                        key={`head-h-${h}`} 
                        className={`text-[10px] py-1 rounded transition-colors ${
                          h % 6 === 0 ? 'text-amber-400 font-bold bg-slate-950/60' : 'text-slate-500'
                        }`}
                        title={`${h.toString().padStart(2, '0')}:00`}
                      >
                        {h.toString().padStart(2, '0')}
                      </div>
                    ))}
                  </div>
                  <div className="w-28 shrink-0 text-right pr-2 text-slate-500 font-sans font-semibold text-[11px]">
                    Итого
                  </div>
                </div>

                {/* Day Rows */}
                {filteredDays.map(dayIdx => {
                  const day = dayStats[dayIdx];
                  const dayCells = heatmapData.filter(c => c.day === dayIdx);
                  const isWeekend = dayIdx >= 5;
                  const dayShareOfTotal = totalWeekMetric > 0 ? Math.round((day.metricVal / totalWeekMetric) * 100) : 0;

                  return (
                    <div 
                      key={`day-row-${dayIdx}`}
                      className="flex items-center gap-1.5 group hover:bg-slate-950/30 p-1 rounded-xl transition-colors"
                    >
                      {/* Day Label */}
                      <div className="w-16 shrink-0 flex items-center justify-between pr-2">
                        <span className={`text-xs font-bold ${isWeekend ? 'text-amber-400' : 'text-slate-200'}`}>
                          {day.name}
                        </span>
                        {isWeekend ? (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            вых
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-500 font-mono">
                            {dayShareOfTotal}%
                          </span>
                        )}
                      </div>

                      {/* 24 Hour Tiles */}
                      <div className="grid grid-cols-24 flex-1 gap-1">
                        {Array.from({ length: 24 }, (_, hour) => {
                          const cell = dayCells.find(c => c.hour === hour) || {
                            day: dayIdx,
                            dayName: DAY_NAMES[dayIdx],
                            dayFullName: DAY_FULL_NAMES[dayIdx],
                            hour,
                            time: `${hour.toString().padStart(2, '0')}:00`,
                            msgs: 0,
                            activeUsers: 0,
                            joins: 0,
                            intensity: 0
                          };
                          const val = cell[activityMetric] || 0;
                          const isSelected = selectedCell?.day === dayIdx && selectedCell?.hour === hour;
                          const isHovered = hoveredCell?.day === dayIdx && hoveredCell?.hour === hour;
                          const isPeakWeek = peakCell?.day === dayIdx && peakCell?.hour === hour && peakCell[activityMetric] > 0;

                          return (
                            <button
                              key={`cell-${dayIdx}-${hour}`}
                              onClick={() => setSelectedCell(cell)}
                              onMouseEnter={() => setHoveredCell(cell)}
                              onMouseLeave={() => setHoveredCell(null)}
                              className={`h-9 rounded-md border flex flex-col items-center justify-center transition-all relative ${getCellColorClass(val, isSelected, isHovered)}`}
                              title={`${day.fullName} ${cell.time}: ${val.toLocaleString()} (${activityMetric === 'msgs' ? 'сообщений' : activityMetric === 'activeUsers' ? 'участников' : 'вступлений'})`}
                            >
                              {val > 0 && (
                                <span className="text-[9px] font-mono leading-none tracking-tighter truncate max-w-full px-0.5">
                                  {val > 999 ? `${(val / 1000).toFixed(1)}k` : val}
                                </span>
                              )}
                              {isPeakWeek && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-900 animate-pulse" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Day Summary on Right */}
                      <div className="w-28 shrink-0 flex items-center justify-between pl-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-white font-bold">{day.metricVal.toLocaleString()}</span>
                            <span className="text-slate-500 text-[10px]">пик {day.peakHour.toString().padStart(2, '0')}ч</span>
                          </div>
                          <div className="w-full bg-slate-800/80 rounded-full h-1 mt-1 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${activityMetric === 'msgs' ? 'bg-purple-500' : activityMetric === 'activeUsers' ? 'bg-sky-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(dayShareOfTotal * 3, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Hourly Totals Row (Footer) */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/80 text-[10px] font-mono">
                  <div className="w-16 shrink-0 text-slate-500 font-sans font-semibold pl-1">
                    Сумма
                  </div>
                  <div className="grid grid-cols-24 flex-1 gap-1 text-center">
                    {Array.from({ length: 24 }, (_, h) => {
                      const hVal = hourStats[h]?.metricVal || 0;
                      return (
                        <div 
                          key={`foot-h-${h}`}
                          className="py-1 rounded bg-slate-950/60 text-slate-400 truncate text-[9px]"
                          title={`За все дни в ${h.toString().padStart(2, '0')}:00 — ${hVal.toLocaleString()}`}
                        >
                          {hVal > 999 ? `${(hVal / 1000).toFixed(1)}k` : hVal}
                        </div>
                      );
                    })}
                  </div>
                  <div className="w-28 shrink-0 text-right pr-2 text-white font-bold text-xs font-mono">
                    {totalWeekMetric.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Active Cell Inspector / Tooltip Card */}
            {(hoveredCell || selectedCell) && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
                {(() => {
                  const target = hoveredCell || selectedCell!;
                  const isTargetPeak = peakCell?.day === target.day && peakCell?.hour === target.hour && peakCell[activityMetric] > 0;
                  const nextHour = (target.hour + 1) % 24;
                  const dayTotal = dayStats[target.day]?.metricVal || 1;
                  const dayShare = ((target[activityMetric] / dayTotal) * 100).toFixed(1);
                  const weekShare = totalWeekMetric > 0 ? ((target[activityMetric] / totalWeekMetric) * 100).toFixed(1) : '0';

                  return (
                    <>
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${activityMetric === 'msgs' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : activityMetric === 'activeUsers' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">
                              {target.dayFullName}, {target.time} — {nextHour.toString().padStart(2, '0')}:00
                            </h4>
                            {isTargetPeak ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30 flex items-center gap-1">
                                <Flame className="w-3 h-3" /> ПИК НЕДЕЛИ
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded font-mono">
                                {dayShare}% дня • {weekShare}% недели
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Детализация активности пользователей в выбранный часовой интервал
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-800 text-xs">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-slate-400">Сообщений:</span>
                          <span className="font-bold text-white text-sm">{target.msgs.toLocaleString()}</span>
                        </div>
                        <div className="w-px h-4 bg-slate-800" />
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-sky-400" />
                          <span className="text-slate-400">Участников:</span>
                          <span className="font-bold text-white text-sm">{target.activeUsers.toLocaleString()}</span>
                        </div>
                        <div className="w-px h-4 bg-slate-800" />
                        <div className="flex items-center gap-2">
                          <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-slate-400">Вступлений:</span>
                          <span className="font-bold text-white text-sm">{target.joins.toLocaleString()}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Heatmap Legend Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-400 border-t border-slate-800/60">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-semibold uppercase">Шкала интенсивности:</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500">0</span>
                  <div className="flex items-center gap-1 px-1">
                    {activityMetric === 'msgs' && (
                      <>
                        <div className="w-4 h-3 rounded-xs bg-slate-950 border border-slate-800" title="0" />
                        <div className="w-4 h-3 rounded-xs bg-purple-950/40 border border-purple-900/30" title="Низкая" />
                        <div className="w-4 h-3 rounded-xs bg-purple-900/60 border border-purple-800/40" title="Умеренная" />
                        <div className="w-4 h-3 rounded-xs bg-purple-700/70 border border-purple-600/50" title="Средняя" />
                        <div className="w-4 h-3 rounded-xs bg-purple-600/90 border border-purple-500/70" title="Высокая" />
                        <div className="w-4 h-3 rounded-xs bg-purple-500 border border-purple-300" title="Пик" />
                      </>
                    )}
                    {activityMetric === 'activeUsers' && (
                      <>
                        <div className="w-4 h-3 rounded-xs bg-slate-950 border border-slate-800" title="0" />
                        <div className="w-4 h-3 rounded-xs bg-sky-950/40 border border-sky-900/30" title="Низкая" />
                        <div className="w-4 h-3 rounded-xs bg-sky-900/60 border border-sky-800/40" title="Умеренная" />
                        <div className="w-4 h-3 rounded-xs bg-sky-700/70 border border-sky-600/50" title="Средняя" />
                        <div className="w-4 h-3 rounded-xs bg-sky-600/90 border border-sky-500/70" title="Высокая" />
                        <div className="w-4 h-3 rounded-xs bg-sky-500 border border-sky-300" title="Пик" />
                      </>
                    )}
                    {activityMetric === 'joins' && (
                      <>
                        <div className="w-4 h-3 rounded-xs bg-slate-950 border border-slate-800" title="0" />
                        <div className="w-4 h-3 rounded-xs bg-emerald-950/40 border border-emerald-900/30" title="Низкая" />
                        <div className="w-4 h-3 rounded-xs bg-emerald-900/60 border border-emerald-800/40" title="Умеренная" />
                        <div className="w-4 h-3 rounded-xs bg-emerald-700/70 border border-emerald-600/50" title="Средняя" />
                        <div className="w-4 h-3 rounded-xs bg-emerald-600/90 border border-emerald-500/70" title="Высокая" />
                        <div className="w-4 h-3 rounded-xs bg-emerald-500 border border-emerald-300" title="Пик" />
                      </>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-300 font-mono font-bold">{maxMetricVal.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Кликните на любую ячейку карты для фиксации параметров интервала</span>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: HOURLY 24H CHARTS */}
        {activityViewMode === 'hourly' && (
          <div className="space-y-4">
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
                    {activityMetric === 'msgs' && (
                      <Bar dataKey="msgs" radius={[4, 4, 0, 0]} name="Сообщения">
                        {hourlyData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={peakCell && entry.hour === peakCell.hour && peakCell.msgs > 0 ? 'url(#peakHighlightGrad)' : 'url(#hourlyMsgsGrad)'} 
                          />
                        ))}
                      </Bar>
                    )}
                    {activityMetric === 'activeUsers' && (
                      <Bar dataKey="activeUsers" fill="url(#hourlyUsersGrad)" radius={[4, 4, 0, 0]} name="Активные участники" />
                    )}
                    {activityMetric === 'joins' && (
                      <Bar dataKey="joins" fill="url(#hourlyJoinsGrad)" radius={[4, 4, 0, 0]} name="Вступления" />
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
                    {activityMetric === 'msgs' && (
                      <Area type="monotone" dataKey="msgs" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#areaMsgsGrad)" name="Сообщения" />
                    )}
                    {activityMetric === 'activeUsers' && (
                      <Area type="monotone" dataKey="activeUsers" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#areaUsersGrad)" name="Активные участники" />
                    )}
                    {activityMetric === 'joins' && (
                      <Area type="monotone" dataKey="joins" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#areaJoinsGrad)" name="Вступления" />
                    )}
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Informational Footer Note */}
        <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-slate-400">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-slate-300">Совет по расписанию: </span>
            {peakCell && peakCell[activityMetric] > 0 ? (
              <span>
                Главный пик активности в сообществе зафиксирован в <strong className="text-amber-300 font-medium">{peakCell.dayFullName}, {peakCell.time} — {((peakCell.hour + 1) % 24).toString().padStart(2, '0')}:00</strong> ({peakCell[activityMetric].toLocaleString()} {activityMetric === 'msgs' ? 'сообщений' : activityMetric === 'activeUsers' ? 'активных участников' : 'вступлений'}). Публикация важных материалов в это время обеспечит максимальное вовлечение.
              </span>
            ) : (
              <span>
                Тепловая карта 7×24 агрегирует активность пользователей по дням недели и часам суток на основе истории сообщений и системных событий Telegram.
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

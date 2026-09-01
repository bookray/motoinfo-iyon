
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, MessageSquareText, Shield, 
  Calendar, Radio, ScrollText, Menu, X, LogOut, Database, Settings as SettingsIcon,
  Bot, UserPlus, Cloud, Network, Award, Sparkles, Smartphone, Layers
} from 'lucide-react';

import { Chat, ScheduledMessage, LogEntry, GlobalBan, FilterSettings, Tab, BotSettings, Stats, WhitelistEntry, MultiChatUser, LatestMember, ChatBan, User, UserRole, DatabaseType } from './types';
import { Dashboard } from './components/Dashboard';
import { ChatList } from './components/ChatList';
import { Summarization } from './components/Summarization';
import { Scheduler } from './components/Scheduler';
import { Logs } from './components/Logs';
import { Moderation } from './components/Moderation';
import { Reputation } from './components/Reputation';
import { AntiScam } from './components/AntiScam';
import { Broadcast } from './components/Broadcast';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { UserManagement } from './components/UserManagement';

// Если мы на одном сервере, используем относительный путь /api
const API_BASE_URL = '/api';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [activeTab, setActiveTab] = useState<Tab>(Tab.STATISTICS);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Telegram WebApp detection & state
  const [isTelegramWebApp, setIsTelegramWebApp] = useState<boolean>(false);
  const [telegramUser, setTelegramUser] = useState<any>(null);
  const [telegramAuthError, setTelegramAuthError] = useState<string | null>(null);

  // Trigger Telegram Haptic Feedback
  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'error' = 'selection') => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (!tg?.HapticFeedback) return;
      if (style === 'selection') {
        tg.HapticFeedback.selectionChanged();
      } else if (style === 'success' || style === 'error') {
        tg.HapticFeedback.notificationOccurred(style);
      } else {
        tg.HapticFeedback.impactOccurred(style);
      }
    } catch (e) {}
  };

  // Telegram WebApp initial detection and auto-login
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        if (tg.setHeaderColor) tg.setHeaderColor('#020617');
        if (tg.setBackgroundColor) tg.setBackgroundColor('#020617');
        if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
      } catch (e) {
        console.warn('TMA init error:', e);
      }

      if (tg.initData && tg.initData.trim() !== '') {
        setIsTelegramWebApp(true);
        if (tg.initDataUnsafe?.user) {
          setTelegramUser(tg.initDataUnsafe.user);
        }

        // If not already logged in or if running inside TMA, verify and login automatically
        const autoLoginTMA = async () => {
          try {
            const res = await fetch(`${API_BASE_URL}/telegram-webapp-auth`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ initData: tg.initData })
            });

            if (res.ok) {
              const data = await res.json();
              localStorage.setItem('token', data.token);
              localStorage.setItem('user', JSON.stringify(data.user));
              setToken(data.token);
              setCurrentUser(data.user);
              setTelegramAuthError(null);
              triggerHaptic('success');
            } else {
              const errData = await res.json().catch(() => ({}));
              console.warn('TMA auto-auth failed:', errData.error);
              setTelegramAuthError(errData.error || 'Ошибка входа через Telegram');
            }
          } catch (e: any) {
            console.error('TMA auto-login network error:', e);
          }
        };

        if (!token || !currentUser) {
          autoLoginTMA();
        }
      }
    }
  }, []);

  // Telegram BackButton binding
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    if (sidebarOpen) {
      tg.BackButton.show();
      const onBackSidebar = () => {
        triggerHaptic('light');
        setSidebarOpen(false);
      };
      tg.BackButton.onClick(onBackSidebar);
      return () => tg.BackButton.offClick(onBackSidebar);
    } else if (activeTab !== Tab.STATISTICS) {
      tg.BackButton.show();
      const onBackTab = () => {
        triggerHaptic('light');
        setActiveTab(Tab.STATISTICS);
      };
      tg.BackButton.onClick(onBackTab);
      return () => tg.BackButton.offClick(onBackTab);
    } else {
      tg.BackButton.hide();
    }
  }, [activeTab, sidebarOpen]);

  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const activeToken = localStorage.getItem('token') || token;
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {}),
      },
    });

    if (res.status === 401 || res.status === 403) {
      console.warn(`[Auth] Request to ${url} rejected with HTTP ${res.status}. Resetting session.`);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setCurrentUser(null);
    }
    return res;
  };
  const [isLoading, setIsLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<'online' | 'offline'>('online');
  const [botStatus, setBotStatus] = useState<'online' | 'offline'>('offline');
  const [cfStatus, setCfStatus] = useState<'online' | 'offline' | 'disabled'>('disabled');
  const [proxyStatus, setProxyStatus] = useState<'online' | 'offline' | 'disabled'>('disabled');
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [tasks, setTasks] = useState<ScheduledMessage[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [bans, setBans] = useState<GlobalBan[]>([]);
  const [filters, setFilters] = useState<FilterSettings>({
    blockLinks: false,
    blockTelegramLinks: false,
    blockMedia: false,
    blockForwards: false,
    forbiddenWords: [],
    autoApprove: false,
    captchaEnabled: false,
    captchaQuestion: 'Сколько будет 2+2?',
    captchaAnswer: '4',
    muteNewcomers: false,
    muteDurationHours: 24,
    muteMessage: 'Добро пожаловать! Вы временно в муте на {hours}ч. Пожалуйста, ознакомьтесь с правилами.',
    deleteSystemMessages: false,
    deleteCommands: false,
    userVoteEnabled: false,
    userVotePercentage: 10,
    userVoteMin: 5,
    userVoteMax: 50,
    userVoteDuration: 1440,
    notifyMultiChat: false,
    multiChatThreshold: 5,
    warnLimit: 3
  });
  const [settings, setSettings] = useState<BotSettings>({
    botToken: '',
    dbType: DatabaseType.FIREBASE,
    dbHost: 'localhost',
    dbPort: 3306,
    dbUser: 'root',
    dbPass: '',
    dbName: 'teleguard',
    maintenanceMode: false
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [multiChatUsers, setMultiChatUsers] = useState<MultiChatUser[]>([]);
  const [latestMembers, setLatestMembers] = useState<LatestMember[]>([]);
  const [chatBans, setChatBans] = useState<ChatBan[]>([]);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: ''
  });

  useEffect(() => {
    if (!token || !currentUser) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const initApp = async () => {
      try {
        setIsLoading(true);
        const healthCheck = await fetch(`${API_BASE_URL}/health`).catch(() => null);
        
        if (healthCheck?.ok) {
          const healthData = await healthCheck.json();
          if (!isMounted) return;
          setDbStatus('online');
          setBotStatus(healthData.botActive ? 'online' : 'offline');
          setCfStatus(healthData.cfStatus || 'disabled');
          setProxyStatus(healthData.proxyStatus || 'disabled');

          const statsQuery = new URLSearchParams({
            ...(selectedChatIds.length > 0 ? { chatIds: selectedChatIds.join(',') } : {}),
            ...(dateRange.start ? { startDate: dateRange.start } : {}),
            ...(dateRange.end ? { endDate: dateRange.end } : {})
          }).toString();

          const [chatsRes, bansRes, filtersRes, logsRes, settingsRes, tasksRes, whitelistRes, multiChatRes, latestMembersRes, statsRes, chatBansRes] = await Promise.all([
            authenticatedFetch(`${API_BASE_URL}/chats`),
            authenticatedFetch(`${API_BASE_URL}/bans`),
            authenticatedFetch(`${API_BASE_URL}/filters`),
            authenticatedFetch(`${API_BASE_URL}/logs`),
            authenticatedFetch(`${API_BASE_URL}/settings`),
            authenticatedFetch(`${API_BASE_URL}/tasks`),
            authenticatedFetch(`${API_BASE_URL}/whitelist`),
            authenticatedFetch(`${API_BASE_URL}/memberships/multi-chat`),
            authenticatedFetch(`${API_BASE_URL}/memberships/latest`),
            authenticatedFetch(`${API_BASE_URL}/stats?${statsQuery}`),
            authenticatedFetch(`${API_BASE_URL}/bans/chat`)
          ]);

          if (!isMounted) return;

          if (chatsRes.ok) setChats(await chatsRes.json());
          if (bansRes.ok) setBans(await bansRes.json());
          if (filtersRes.ok) setFilters(await filtersRes.json());
          if (logsRes.ok) setLogs(await logsRes.json());
          if (settingsRes.ok) setSettings(await settingsRes.json());
          if (tasksRes.ok) setTasks(await tasksRes.json());
          if (whitelistRes.ok) setWhitelist(await whitelistRes.json());
          if (multiChatRes.ok) setMultiChatUsers(await multiChatRes.json());
          if (latestMembersRes.ok) setLatestMembers(await latestMembersRes.json());
          if (statsRes.ok) setStats(await statsRes.json());
          if (chatBansRes.ok) setChatBans(await chatBansRes.json());
        } else {
          if (isMounted) setDbStatus('offline');
        }
      } catch (error) {
        console.error("Backend unreachable:", error);
        if (isMounted) setDbStatus('offline');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initApp();

    return () => {
      isMounted = false;
    };
  }, [token, currentUser]);

  // Health check to recover from offline status
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (res.ok) {
          const healthData = await res.json();
          setBotStatus(healthData.botActive ? 'online' : 'offline');
          setCfStatus(healthData.cfStatus || 'disabled');
          setProxyStatus(healthData.proxyStatus || 'disabled');
          setDbStatus('online');
          setPollingError(null);
        } else {
          setDbStatus('offline');
        }
      } catch (e: any) {
        setDbStatus('offline');
        setPollingError(`Backend connection failed: ${e.message}`);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, []);

  // Polling for real-time updates (chats and logs)
  useEffect(() => {
    if (!token || !currentUser) return;
    
    let isMounted = true;
    let controller = new AbortController();

    const pollData = async () => {
      try {
        // Reset controller for new request
        controller.abort();
        controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        const fetchOptions = { signal: controller.signal };

        const statsQuery = new URLSearchParams({
          ...(selectedChatIds.length > 0 ? { chatIds: selectedChatIds.join(',') } : {}),
          ...(dateRange.start ? { startDate: dateRange.start } : {}),
          ...(dateRange.end ? { endDate: dateRange.end } : {})
        }).toString();

        const [chatsRes, bansRes, whitelistRes, logsRes, statsRes, multiChatRes, latestMembersRes] = await Promise.all([
          authenticatedFetch(`${API_BASE_URL}/chats`, fetchOptions),
          authenticatedFetch(`${API_BASE_URL}/bans/chat`, fetchOptions),
          authenticatedFetch(`${API_BASE_URL}/whitelist`, fetchOptions),
          authenticatedFetch(`${API_BASE_URL}/logs`, fetchOptions),
          authenticatedFetch(`${API_BASE_URL}/stats?${statsQuery}`, fetchOptions),
          authenticatedFetch(`${API_BASE_URL}/memberships/multi-chat`, fetchOptions),
          authenticatedFetch(`${API_BASE_URL}/memberships/latest`, fetchOptions)
        ]);

        clearTimeout(timeoutId);

        if (!isMounted) return;

        if (chatsRes.ok) setChats(await chatsRes.json());
        if (bansRes.ok) setChatBans(await bansRes.json());
        if (whitelistRes.ok) setWhitelist(await whitelistRes.json());
        if (logsRes.ok) setLogs(await logsRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
        if (multiChatRes.ok) setMultiChatUsers(await multiChatRes.json());
        if (latestMembersRes.ok) setLatestMembers(await latestMembersRes.json());

        setPollingError(null);
        setDbStatus('online');
      } catch (e: any) {
        if (!isMounted) return;
        
        if (e.name === 'AbortError') {
          console.log('Poll aborted or timed out');
        } else {
          console.error('Polling error:', e);
          setPollingError(`Ошибка сети: ${e.message}. Проверьте соединение с сервером.`);
        }
      }
    };

    const interval = setInterval(() => pollData(), 10000);
    
    return () => {
      isMounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [token, currentUser, selectedChatIds, dateRange]);

  const handleUpdateChat = async (updatedChat: Chat) => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/chats/${updatedChat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedChat)
      });
      if (res.ok) setChats(chats.map(c => c && c.id === updatedChat.id ? updatedChat : c));
    } catch (e) { console.error(e); }
  };

  const handleRemoveChat = async (id: string) => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/chats/${id}`, { method: 'DELETE' });
      if (res.ok) setChats(chats.filter(c => c && c.id !== id));
    } catch (e) { console.error(e); }
  };

  const handleAddChat = async (id: string) => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title: 'Ожидает одобрения', members: 0 })
      });
      if (res.ok) {
        const newChat = await res.json();
        setChats([...chats, newChat]);
      }
    } catch (e) { console.error(e); }
  };

  const handleBan = async (userId: string, reason: string) => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/bans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason })
      });
      if (res.ok) setBans([...bans, await res.json()]);
    } catch (e) { console.error(e); }
  };

  const handleUnban = async (userId: string) => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/bans/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setBans(bans.filter(b => b && b.userId !== userId));
        // Refresh multi-chat users
        const multiChatRes = await authenticatedFetch(`${API_BASE_URL}/memberships/multi-chat`);
        if (multiChatRes.ok) setMultiChatUsers(await multiChatRes.json());
      }
    } catch (e) { console.error(e); }
  };

  const handleWhitelist = async (userId: string) => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, addedAt: new Date().toISOString() })
      });
      if (res.ok) {
        const entry = await res.json();
        setWhitelist([...whitelist, entry]);
        // Refresh multi-chat users
        const multiChatRes = await authenticatedFetch(`${API_BASE_URL}/memberships/multi-chat`);
        if (multiChatRes.ok) setMultiChatUsers(await multiChatRes.json());
      }
    } catch (e) { console.error(e); }
  };

  const handleRemoveFromWhitelist = async (userId: string) => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/whitelist/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setWhitelist(whitelist.filter(w => w.userId !== userId));
        // Refresh multi-chat users
        const multiChatRes = await authenticatedFetch(`${API_BASE_URL}/memberships/multi-chat`);
        if (multiChatRes.ok) setMultiChatUsers(await multiChatRes.json());
      }
    } catch (e) { console.error(e); }
  };

  const handleUnbanChat = async (id: string) => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/bans/chat/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setChatBans(chatBans.filter(b => b && b.id !== id));
      }
    } catch (e) { console.error(e); }
  };

  const handleUpdateSettings = async (newSettings: BotSettings) => {
    try {
      console.log('Sending settings update:', newSettings);
      const res = await authenticatedFetch(`${API_BASE_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        console.log('Settings updated successfully');
        setSettings(newSettings);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Failed to update settings:', errorData);
        throw new Error(errorData.error || 'Failed to update settings');
      }
    } catch (e) { 
      console.error('Update settings error:', e);
      throw e;
    }
  };

  const handleUpdateFilters = async (newFilters: FilterSettings) => {
    try {
      console.log('Sending filters update:', newFilters);
      const res = await authenticatedFetch(`${API_BASE_URL}/filters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFilters)
      });
      if (res.ok) {
        console.log('Filters updated successfully');
        setFilters(newFilters);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Failed to update filters:', errorData);
      }
    } catch (e) { console.error('Update filters error:', e); }
  };

  const handleAddTask = async (task: ScheduledMessage) => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      });
      if (res.ok) {
        const newTask = await res.json();
        setTasks([...tasks, newTask]);
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks/${id}`, { method: 'DELETE' });
      if (res.ok) setTasks(tasks.filter(t => t && t.id !== id));
    } catch (e) { console.error(e); }
  };

  const handleToggleTask = async (id: string) => {
    const task = tasks.find(t => t && t.id === id);
    if (!task) return;
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !task.active })
      });
      if (res.ok) setTasks(tasks.map(t => t && t.id === id ? { ...t, active: !task.active } : t));
    } catch (e) { console.error(e); }
  };

  const NavItem = ({ tab, icon: Icon, label }: { tab: Tab, icon: any, label: string }) => (
    <button
      onClick={() => { 
        triggerHaptic('selection');
        setActiveTab(tab); 
        setSidebarOpen(false); 
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer ${
        activeTab === tab 
          ? 'bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/20 shadow-sm shadow-blue-950/40' 
          : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 border border-transparent'
      }`}
    >
      <Icon className={`w-5 h-5 shrink-0 ${activeTab === tab ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
      <span className="truncate">{label}</span>
      {activeTab === tab && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></div>}
    </button>
  );

  const handleLogout = () => {
    triggerHaptic('medium');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setCurrentUser(null);
  };

  if (!token || !currentUser) {
    return <Login onLogin={(t, u) => { setToken(t); setCurrentUser(u); }} telegramError={telegramAuthError} />;
  }

  // Filter data based on assigned chats
  const filteredChats = (currentUser.role === UserRole.SUPER_ADMIN)
    ? chats 
    : chats.filter(c => c && currentUser.assignedChatIds?.includes(c.id));

  return (
    <div className="h-full min-h-[100dvh] bg-slate-950 flex text-slate-200 font-sans overflow-hidden">
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/70 z-40 md:hidden backdrop-blur-sm transition-opacity" 
          onClick={() => {
            triggerHaptic('light');
            setSidebarOpen(false);
          }} 
        />
      )}

      <aside className={`fixed md:sticky top-0 h-full h-[100dvh] max-h-[100dvh] w-72 bg-slate-900 border-r border-slate-800 z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'translate-x-0 shadow-2xl shadow-black/80' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-5 sm:p-6 flex items-center justify-between border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20 shrink-0">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">TeleGuard</h1>
              <p className="text-xs text-slate-500 font-medium">
                {isTelegramWebApp ? 'Telegram Mini App' : 'Админ-панель'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              setSidebarOpen(false);
            }}
            className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
            aria-label="Закрыть меню"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-4 py-4 space-y-1.5 flex-1 overflow-y-auto custom-scrollbar">
          <NavItem tab={Tab.STATISTICS} icon={LayoutDashboard} label="Статистика" />
          {currentUser.role !== UserRole.ADVERTISER && (
            <>
              <NavItem tab={Tab.CHATS} icon={MessageSquareText} label="Управление чатами" />
              <NavItem tab={Tab.AI_SUMMARY} icon={Sparkles} label="ИИ-Суммаризация" />
              <NavItem tab={Tab.REPUTATION} icon={Award} label="Репутация" />
              <NavItem tab={Tab.MODERATION} icon={Shield} label="Глобальные правила" />
              <NavItem tab={Tab.ANTI_SCAM} icon={Shield} label="Анти мошенники" />
              <NavItem tab={Tab.SCHEDULER} icon={Calendar} label="Планировщик" />
            </>
          )}
          <NavItem tab={Tab.BROADCAST} icon={Radio} label="Рассылка" />
          {currentUser.role !== UserRole.ADVERTISER && (
            <NavItem tab={Tab.LOGS} icon={ScrollText} label="Логи событий" />
          )}
          {currentUser.role === UserRole.SUPER_ADMIN && (
            <>
              <NavItem tab={Tab.USERS} icon={UserPlus} label="Пользователи" />
              <NavItem tab={Tab.SETTINGS} icon={SettingsIcon} label="Настройки" />
            </>
          )}
        </nav>

        {/* Sidebar Footer with current user & TMA badge */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400 shrink-0">
                {currentUser.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">@{currentUser.username}</p>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  {currentUser.role === UserRole.SUPER_ADMIN ? 'Супер-админ' : currentUser.role}
                </span>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
              title="Выйти"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-full h-[100dvh] max-h-[100dvh] overflow-y-auto overflow-x-hidden flex flex-col relative">
        <header className="sticky top-0 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-30 shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button 
              onClick={() => {
                triggerHaptic('light');
                setSidebarOpen(true);
              }} 
              className="md:hidden p-2 text-slate-300 hover:text-white bg-slate-900/90 active:bg-slate-800 border border-slate-800 rounded-xl transition-all shadow-sm active:scale-95 touch-manipulation cursor-pointer shrink-0"
              aria-label="Открыть меню"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                {activeTab.replace('_', ' ')}
              </h2>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {isLoading && <div className="text-xs text-blue-400 animate-pulse hidden sm:block">Синхронизация...</div>}
            
            {/* Telegram Mini App indicator badge */}
            {isTelegramWebApp && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-xs font-semibold">
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Telegram App</span>
                <span className="sm:hidden font-mono text-[11px]">TMA</span>
              </div>
            )}

            {currentUser.role !== UserRole.ADVERTISER && (
              <div className="hidden lg:flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-lg border border-slate-800">
                  <Database className={`w-3.5 h-3.5 ${dbStatus === 'online' ? 'text-emerald-500' : 'text-rose-500'}`} />
                  <span className="text-[10px] font-mono text-slate-400">{settings.dbType === DatabaseType.FIREBASE ? 'Firebase' : 'MySQL'}</span>
                  <div className={`h-1.5 w-1.5 rounded-full ${dbStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-rose-500 animate-pulse'}`}></div>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-lg border border-slate-800">
                  <Bot className={`w-3.5 h-3.5 ${botStatus === 'online' ? 'text-blue-500' : 'text-rose-500'}`} />
                  <span className="text-[10px] font-mono text-slate-400">Bot API</span>
                  <div className={`h-1.5 w-1.5 rounded-full ${botStatus === 'online' ? 'bg-blue-500 shadow-[0_0_6px_#3b82f6]' : 'bg-rose-500 animate-pulse'}`}></div>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-lg border border-slate-800">
                  <Cloud className={`w-3.5 h-3.5 ${
                    cfStatus === 'online' ? 'text-orange-500' : cfStatus === 'offline' ? 'text-rose-500' : 'text-slate-600'
                  }`} />
                  <span className="text-[10px] font-mono text-slate-400">Cloudflare</span>
                  <div className={`h-1.5 w-1.5 rounded-full ${
                    cfStatus === 'online' 
                      ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' 
                      : cfStatus === 'offline' 
                        ? 'bg-rose-500 animate-pulse' 
                        : 'bg-slate-700'
                  }`}></div>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-lg border border-slate-800">
                  <Network className={`w-3.5 h-3.5 ${
                    proxyStatus === 'online' ? 'text-purple-400' : proxyStatus === 'offline' ? 'text-rose-500' : 'text-slate-600'
                  }`} />
                  <span className="text-[10px] font-mono text-slate-400">TG Proxy</span>
                  <div className={`h-1.5 w-1.5 rounded-full ${
                    proxyStatus === 'online' 
                      ? 'bg-purple-500 shadow-[0_0_6px_#a855f7]' 
                      : proxyStatus === 'offline' 
                        ? 'bg-rose-500 animate-pulse' 
                        : 'bg-slate-700'
                  }`}></div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 sm:gap-3 border-l border-slate-800 pl-3 sm:pl-4">
              <button 
                onClick={handleLogout}
                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-800 transition-all cursor-pointer shadow-sm"
                title="Выйти"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full flex-1 pb-28 md:pb-8">
          {!isLoading && dbStatus === 'offline' && (
            <div className="mb-6 bg-rose-500/10 border border-rose-500/50 p-4 rounded-xl flex items-center gap-4 text-rose-200">
              <div className="p-2 bg-rose-500/20 rounded-lg"><X className="w-5 h-5" /></div>
              <div>
                <p className="font-bold">Бэкенд недоступен</p>
                <p className="text-xs opacity-70">{pollingError || `Убедитесь, что сервер запущен. Текущий адрес: ${API_BASE_URL}`}</p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
               <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-slate-400 animate-pulse">Синхронизация с базой данных...</p>
            </div>
          ) : (
            <>
              {activeTab === Tab.STATISTICS && (
          <Dashboard 
            stats={stats} 
            chats={filteredChats} 
            selectedChatIds={selectedChatIds}
            onToggleChatFilter={(id) => {
              setSelectedChatIds(prev => 
                prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
              );
            }}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            onUpdateChat={handleUpdateChat}
            timezoneOffset={settings.timezoneOffset}
          />
        )}
              {activeTab === Tab.CHATS && (
                <ChatList 
                  chats={filteredChats} 
                  filters={filters}
                  onUpdateChat={handleUpdateChat}
                  onRemoveChat={handleRemoveChat}
                  onAddChat={handleAddChat}
                  authenticatedFetch={authenticatedFetch}
                />
              )}
              {activeTab === Tab.AI_SUMMARY && (
                <Summarization 
                  chats={filteredChats}
                />
              )}
              {activeTab === Tab.REPUTATION && (
                <Reputation 
                  chats={filteredChats}
                  filters={filters}
                  onUpdateFilters={handleUpdateFilters}
                />
              )}
              {activeTab === Tab.MODERATION && (
                <Moderation 
                  filters={filters}
                  onUpdateFilters={handleUpdateFilters}
                  authenticatedFetch={authenticatedFetch}
                />
              )}
              {activeTab === Tab.ANTI_SCAM && (
                <AntiScam 
                  bans={bans}
                  chatBans={chatBans}
                  onBan={handleBan}
                  onUnban={handleUnban}
                  onUnbanChat={handleUnbanChat}
                  multiChatUsers={multiChatUsers}
                  latestMembers={latestMembers}
                  whitelist={whitelist}
                  onWhitelist={handleWhitelist}
                  onRemoveFromWhitelist={handleRemoveFromWhitelist}
                  chats={filteredChats}
                />
              )}
              {activeTab === Tab.SCHEDULER && (
                <Scheduler 
                  tasks={tasks}
                  chats={filteredChats}
                  onAddTask={handleAddTask}
                  onDeleteTask={handleDeleteTask}
                  onToggleTask={handleToggleTask}
                />
              )}
              {activeTab === Tab.BROADCAST && <Broadcast chats={filteredChats} currentUser={currentUser} />}
              {activeTab === Tab.LOGS && <Logs logs={logs} chats={filteredChats} />}
              {activeTab === Tab.USERS && <UserManagement chats={chats} />}
              {activeTab === Tab.SETTINGS && (
                <Settings 
                  settings={settings} 
                  onUpdateSettings={handleUpdateSettings} 
                />
              )}
            </>
          )}
        </div>

        {/* Mobile & Telegram Mini App Bottom Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl">
          <div className="grid grid-cols-5 gap-1 max-w-lg mx-auto">
            <button
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab(Tab.STATISTICS);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
                activeTab === Tab.STATISTICS ? 'text-blue-400 bg-blue-500/10 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">Статистика</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab(Tab.CHATS);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
                activeTab === Tab.CHATS ? 'text-blue-400 bg-blue-500/10 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquareText className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">Чаты</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab(Tab.AI_SUMMARY);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
                activeTab === Tab.AI_SUMMARY ? 'text-blue-400 bg-blue-500/10 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">ИИ-Сводка</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab(Tab.MODERATION);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
                activeTab === Tab.MODERATION ? 'text-blue-400 bg-blue-500/10 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">Защита</span>
            </button>

            <button
              onClick={() => {
                triggerHaptic('light');
                setSidebarOpen(true);
              }}
              className="flex flex-col items-center justify-center py-1.5 rounded-xl transition-all text-slate-400 hover:text-slate-200"
            >
              <Layers className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">Меню</span>
            </button>
          </div>
        </nav>
      </main>
    </div>
  );
};

export default App;

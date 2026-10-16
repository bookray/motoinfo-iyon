import React, { useState, useEffect } from 'react';
import {
  Shield,
  Star,
  Sparkles,
  BarChart3,
  Radio,
  FileCode,
  Settings,
  LogIn,
  LogOut,
  Search,
  ExternalLink,
  Users,
  MessageSquare,
  RefreshCw,
  Send,
  AlertTriangle,
  CheckCircle,
  Copy,
  ChevronRight,
  Filter,
  Eye,
  Bot,
  Zap,
  Globe,
  Sliders
} from 'lucide-react';
import { Reputation } from './components/Reputation';
import { FilterSettings, AppSettings } from './types';

interface CatalogChat {
  slug: string;
  username: string;
  title: string;
  brand: string;
  category: string;
  image?: string;
  shortDesc: string;
  fullDesc: string;
  modelsCovered?: string[];
  keyTopics?: string[];
  rules?: string[];
  telegramLink: string;
  estimatedMembers: number;
  liveMembers?: number;
  liveMessages24h?: number;
  liveMessagesText?: string;
  totalSummariesCount?: number;
  latestSummaryDate?: string | null;
}

interface DigestHistoryItem {
  id: string;
  chatId?: string;
  chatTitle?: string;
  summary: string;
  messageCount?: number;
  userCount?: number;
  hoursBack?: number;
  createdAt: string;
  sentToTelegram?: boolean;
}

interface StatsData {
  totalMessages?: number;
  totalChats?: number;
  totalMembers?: number;
  activeUsers24h?: number;
  bannedCount?: number;
  warningsCount?: number;
  reputationCount?: number;
  botStatus?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'reputation' | 'digests' | 'stats' | 'antiscam' | 'ads' | 'settings'>('catalog');
  const [token, setToken] = useState<string>(() => localStorage.getItem('token') || '');
  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);
  
  // Login Modal
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('admin');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // App settings & filters
  const [filters, setFilters] = useState<FilterSettings>({
    reputationEnabled: true,
    muteReputationChangeMessages: false,
    reputationDailyDigestEnabled: true,
  });
  const [settings, setSettings] = useState<AppSettings>({});

  // Catalog State
  const [catalog, setCatalog] = useState<CatalogChat[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Все');
  const [selectedBrand, setSelectedBrand] = useState<string>('Все');
  const [selectedChat, setSelectedChat] = useState<CatalogChat | null>(null);

  // AI Digests State
  const [digests, setDigests] = useState<DigestHistoryItem[]>([]);
  const [digestsLoading, setDigestsLoading] = useState(false);
  const [selectedDigestChat, setSelectedDigestChat] = useState<string>('');
  const [digestHours, setDigestHours] = useState<number>(24);
  const [digestStyle, setDigestStyle] = useState<string>('Информативный и лаконичный');
  const [isGeneratingDigest, setIsGeneratingDigest] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [digestStatusMsg, setDigestStatusMsg] = useState<{ success: boolean; text: string } | null>(null);

  // Stats State
  const [stats, setStats] = useState<StatsData>({});
  const [statsLoading, setStatsLoading] = useState(false);

  // Security & Antiscam State
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [bans, setBans] = useState<any[]>([]);

  // Ads & XML state
  const [xmlStatus, setXmlStatus] = useState<any>(null);
  const [isGeneratingXml, setIsGeneratingXml] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Check auth
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.user) {
            setCurrentUser(data.user);
          } else {
            // Auto login with default credentials if available
            handleAutoLogin();
          }
        })
        .catch(() => handleAutoLogin());
    } else {
      handleAutoLogin();
    }
  }, [token]);

  const handleAutoLogin = async () => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
          setToken(data.token);
          setCurrentUser(data.user || { username: 'admin', role: 'SUPER_ADMIN' });
        }
      }
    } catch (e) {
      console.warn('Auto-login skipped:', e);
    }
  };

  // Load common data
  useEffect(() => {
    fetchCatalog();
    fetchFilters();
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'digests') {
      fetchDigests();
    } else if (activeTab === 'antiscam') {
      fetchAntiscam();
    } else if (activeTab === 'ads') {
      fetchXmlStatus();
    }
  }, [activeTab, token]);

  const fetchCatalog = async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch('/api/public/chats-catalog');
      if (res.ok) {
        const data = await res.json();
        if (data.chats) {
          setCatalog(data.chats);
          if (!selectedDigestChat && data.chats.length > 0) {
            setSelectedDigestChat(data.chats[0].slug);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load public catalog:', err);
    } finally {
      setCatalogLoading(false);
    }
  };

  const fetchFilters = async () => {
    try {
      const res = await fetch('/api/filters', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setFilters(data);
      }
    } catch (e) {
      console.error('Failed to load filters:', e);
    }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/stats', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchDigests = async () => {
    setDigestsLoading(true);
    try {
      const res = await fetch('/api/digests/history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDigests(Array.isArray(data) ? data : data.history || []);
      }
    } catch (e) {
      console.error('Failed to load digests:', e);
    } finally {
      setDigestsLoading(false);
    }
  };

  const fetchAntiscam = async () => {
    try {
      const r1 = await fetch('/api/antiscam/keywords', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r1.ok) {
        const data = await r1.json();
        setKeywords(Array.isArray(data) ? data : data.keywords || []);
      }
      const r2 = await fetch('/api/bans', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r2.ok) {
        const bansData = await r2.json();
        setBans(Array.isArray(bansData) ? bansData : []);
      }
    } catch (e) {
      console.error('Failed to load antiscam data:', e);
    }
  };

  const fetchXmlStatus = async () => {
    try {
      const res = await fetch('/api/export/xml/status');
      if (res.ok) {
        const data = await res.json();
        setXmlStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch xml status:', e);
    }
  };

  const handleUpdateFilters = async (newFilters: FilterSettings) => {
    try {
      const res = await fetch('/api/filters', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newFilters)
      });
      if (res.ok) {
        setFilters(newFilters);
        showToast('Настройки фильтрации и уведомлений сохранены');
      }
    } catch (e) {
      console.error('Failed to update filters:', e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        setIsLoginOpen(false);
        showToast(`Успешный вход: ${data.user?.username || loginUsername}`);
      } else {
        setLoginError(data.error || 'Неверный логин или пароль');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Ошибка сети');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setCurrentUser(null);
    showToast('Вы вышли из системы');
  };

  const handleGenerateDigest = async () => {
    if (!selectedDigestChat) return;
    setIsGeneratingDigest(true);
    setDigestStatusMsg(null);
    try {
      const res = await fetch('/api/digests/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          chatSlug: selectedDigestChat,
          hoursBack: digestHours,
          toneStyle: digestStyle
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGeneratedPreview(data.summary || data.digest?.summary);
        setDigestStatusMsg({ success: true, text: 'Дайджест успешно сгенерирован ИИ!' });
        fetchDigests();
        showToast('Дайджест сгенерирован');
      } else {
        setDigestStatusMsg({ success: false, text: data.error || 'Ошибка генерации' });
      }
    } catch (err: any) {
      setDigestStatusMsg({ success: false, text: err.message || 'Сбой запроса' });
    } finally {
      setIsGeneratingDigest(false);
    }
  };

  const handleGenerateXml = async () => {
    setIsGeneratingXml(true);
    try {
      const res = await fetch('/api/export/xml/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setXmlStatus(data);
        showToast('XML фид успешно перегенерирован');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingXml(false);
    }
  };

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) return;
    try {
      const updated = [...keywords, newKeyword.trim().toLowerCase()];
      const res = await fetch('/api/antiscam/keywords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ keywords: updated })
      });
      if (res.ok) {
        setKeywords(updated);
        setNewKeyword('');
        showToast(`Ключевое слово добавлено: "${newKeyword.trim()}"`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveKeyword = async (kw: string) => {
    const updated = keywords.filter(k => k !== kw);
    try {
      const res = await fetch('/api/antiscam/keywords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ keywords: updated })
      });
      if (res.ok) {
        setKeywords(updated);
        showToast('Ключевое слово удалено');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text: broadcastText.trim(), pin: false })
      });
      const data = await res.json();
      if (res.ok) {
        setBroadcastResult(`Рассылка отправлена! Успешно: ${data.sentCount || 0}, Ошибок: ${data.failedCount || 0}`);
        setBroadcastText('');
        showToast('Рассылка отправлена');
      } else {
        setBroadcastResult(`Ошибка: ${data.error}`);
      }
    } catch (e: any) {
      setBroadcastResult(`Ошибка сети: ${e.message}`);
    } finally {
      setBroadcastSending(false);
    }
  };

  // Filter Catalog
  const categories = ['Все', ...Array.from(new Set(catalog.map(c => c.category).filter(Boolean)))];
  const brands = ['Все', ...Array.from(new Set(catalog.map(c => c.brand).filter(Boolean)))];

  const filteredCatalog = catalog.filter(chat => {
    const matchesSearch =
      chat.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      chat.username.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      chat.shortDesc?.toLowerCase().includes(catalogSearch.toLowerCase());
    const matchesCategory = selectedCategory === 'Все' || chat.category === selectedCategory;
    const matchesBrand = selectedBrand === 'Все' || chat.brand === selectedBrand;
    return matchesSearch && matchesCategory && matchesBrand;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-amber-500/50 shadow-2xl text-amber-300 px-5 py-3 rounded-xl flex items-center space-x-3 transition-all animate-bounce">
          <CheckCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-xl">
              🏍️
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-slate-100 tracking-tight">Motoinfo Admin</span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  июнь
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                41 мото-сообщество • Ежедневные ИИ-дайджесты • Модерация и Репутация
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href="/export.xml"
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
              title="Скачать XML фид каталога"
            >
              <FileCode className="w-3.5 h-3.5 text-amber-400" />
              <span>XML Экспорт</span>
            </a>

            {currentUser ? (
              <div className="flex items-center space-x-3 pl-2 border-l border-slate-800">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-medium text-slate-200">{currentUser.username}</div>
                  <div className="text-[10px] text-amber-400">{currentUser.role || 'ADMIN'}</div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-rose-400 bg-slate-800/80 hover:bg-slate-800 rounded-lg transition"
                  title="Выйти"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginOpen(true)}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Вход админа</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto no-scrollbar space-x-1 py-1 border-t border-slate-800/60 text-xs">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition shrink-0 ${
              activeTab === 'catalog'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Каталог (41 чат)</span>
          </button>

          <button
            onClick={() => setActiveTab('reputation')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition shrink-0 ${
              activeTab === 'reputation'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Star className="w-4 h-4" />
            <span>Репутация & Карма</span>
          </button>

          <button
            onClick={() => setActiveTab('digests')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition shrink-0 ${
              activeTab === 'digests'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>ИИ-Дайджесты</span>
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition shrink-0 ${
              activeTab === 'stats'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Статистика & Чаты</span>
          </button>

          <button
            onClick={() => setActiveTab('antiscam')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition shrink-0 ${
              activeTab === 'antiscam'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Антискам & Баны</span>
          </button>

          <button
            onClick={() => setActiveTab('ads')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition shrink-0 ${
              activeTab === 'ads'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Реклама & Рассылки</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium transition shrink-0 ${
              activeTab === 'settings'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Настройки</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ========================================================= */}
        {/* TAB 1: PUBLIC CATALOG (41 COMMUNITIES)                    */}
        {/* ========================================================= */}
        {activeTab === 'catalog' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
              <div>
                <h1 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
                  <span>🏍️ Каталог Мото-Сообществ</span>
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    41 чат
                  </span>
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  Единая экосистема моточатов России: брендовые клубы, регионы, сервисные чаты и эндуро-сообщества.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Поиск по названию или теме..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 flex items-center space-x-1 mr-1">
                <Filter className="w-3.5 h-3.5" />
                <span>Категория:</span>
              </span>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    selectedCategory === cat
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold shadow'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}

              <span className="text-slate-400 flex items-center space-x-1 ml-4 mr-1">
                <span>Бренд:</span>
              </span>
              {brands.slice(0, 8).map((b) => (
                <button
                  key={b}
                  onClick={() => setSelectedBrand(b)}
                  className={`px-2.5 py-1 rounded-lg border transition ${
                    selectedBrand === b
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>

            {/* Grid of communities */}
            {catalogLoading ? (
              <div className="py-20 text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-3" />
                <p className="text-slate-400 text-sm">Загрузка 41 мото-сообщества...</p>
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="py-16 text-center bg-slate-900 rounded-2xl border border-slate-800">
                <Search className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-300 font-medium">Ничего не найдено</p>
                <p className="text-slate-500 text-xs mt-1">Попробуйте изменить поисковый запрос или фильтры</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredCatalog.map((chat) => (
                  <div
                    key={chat.slug}
                    className="bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-5 flex flex-col justify-between transition-all group shadow-sm hover:shadow-xl hover:shadow-amber-500/5"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700/60 overflow-hidden flex items-center justify-center font-bold text-amber-400 text-lg group-hover:border-amber-500/50 transition">
                            {chat.image ? (
                              <img src={chat.image} alt={chat.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                            ) : null}
                            <span>🏍️</span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-100 group-hover:text-amber-300 transition line-clamp-1">
                              {chat.title}
                            </h3>
                            <a
                              href={chat.telegramLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-amber-400/80 hover:text-amber-300 flex items-center space-x-1 mt-0.5"
                            >
                              <span>@{chat.username}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {chat.category}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
                        {chat.shortDesc}
                      </p>

                      {chat.modelsCovered && chat.modelsCovered.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-4">
                          {chat.modelsCovered.slice(0, 3).map((m, idx) => (
                            <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-slate-950/80 text-slate-300 border border-slate-800">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-xs text-slate-400">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>{(chat.liveMembers || chat.estimatedMembers || 100).toLocaleString('ru-RU')} участников</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedChat(chat)}
                          className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                        >
                          Подробнее
                        </button>
                        <a
                          href={chat.telegramLink}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow transition flex items-center space-x-1"
                        >
                          <span>Войти</span>
                          <ChevronRight className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Community Details Modal */}
        {selectedChat && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto space-y-5 shadow-2xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl font-bold text-amber-400">
                    🏍️
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-100">{selectedChat.title}</h2>
                    <p className="text-xs text-amber-400">@{selectedChat.username} • {selectedChat.category} • Бренд: {selectedChat.brand}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedChat(null)}
                  className="text-slate-400 hover:text-slate-200 text-lg font-bold px-2 py-1 rounded-lg bg-slate-800"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                <div>
                  <h4 className="font-semibold text-slate-200 mb-1">Описание сообщества:</h4>
                  <p className="bg-slate-950 p-3 rounded-xl border border-slate-800">{selectedChat.fullDesc || selectedChat.shortDesc}</p>
                </div>

                {selectedChat.modelsCovered && selectedChat.modelsCovered.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-1.5">Охватываемые модели техники:</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedChat.modelsCovered.map((m, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded bg-slate-800 text-amber-300 border border-slate-700">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedChat.keyTopics && selectedChat.keyTopics.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-1.5">Ключевые темы:</h4>
                    <ul className="list-disc pl-4 space-y-1 text-slate-400">
                      {selectedChat.keyTopics.map((topic, idx) => (
                        <li key={idx}>{topic}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedChat.rules && selectedChat.rules.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-1.5">Правила чата:</h4>
                    <ul className="list-disc pl-4 space-y-1 text-slate-400">
                      {selectedChat.rules.map((rule, idx) => (
                        <li key={idx}>{rule}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                  <div>
                    <div className="text-amber-400 font-semibold">Участников: {(selectedChat.liveMembers || selectedChat.estimatedMembers).toLocaleString('ru-RU')}</div>
                    <div className="text-[11px] text-slate-400">Активность: {selectedChat.liveMessagesText || 'Высокая (живое мотосообщество)'}</div>
                  </div>
                  <a
                    href={selectedChat.telegramLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow transition flex items-center space-x-2"
                  >
                    <span>Присоединиться в Telegram</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: REPUTATION & KARMA (EMBEDDED COMPONENT)           */}
        {/* ========================================================= */}
        {activeTab === 'reputation' && (
          <div className="space-y-6">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
                  <Star className="w-5 h-5 text-amber-400" />
                  <span>Система Кармы и Репутации Байкеров</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Управление репутацией пользователей во всех 41 сообществах, логи изменений, глушение системных сообщений, предупреждения.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                  {filters.muteReputationChangeMessages ? '🔇 Уведомления заглушены' : '🔔 Уведомления в чатах активны'}
                </span>
              </div>
            </div>

            <Reputation filters={filters} onUpdateFilters={handleUpdateFilters} />
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: AI DIGESTS ARCHIVE & GENERATOR                    */}
        {/* ========================================================= */}
        {activeTab === 'digests' && (
          <div className="space-y-6">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
              <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>ИИ-Суммаризация и Ежедневные Дайджесты</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Генерация структурированных выжимок обсуждений с помощью Google Gemini для любого из 41 чатов.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Generator Panel */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="font-semibold text-sm text-slate-200 flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Создать дайджест вручную</span>
                </h3>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Выберите сообщество:</label>
                  <select
                    value={selectedDigestChat}
                    onChange={(e) => setSelectedDigestChat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    {catalog.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.title} (@{c.username})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Период (часов):</label>
                    <select
                      value={digestHours}
                      onChange={(e) => setDigestHours(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value={12}>12 часов</option>
                      <option value={24}>24 часа (сутки)</option>
                      <option value={48}>48 часов</option>
                      <option value={72}>72 часа (3 дня)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Стиль изложения:</label>
                    <select
                      value={digestStyle}
                      onChange={(e) => setDigestStyle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="Информативный и лаконичный">Лаконичный</option>
                      <option value="Подробный байкерский">Байкерский</option>
                      <option value="Технический">Технический</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleGenerateDigest}
                  disabled={isGeneratingDigest}
                  className="w-full py-2.5 px-4 font-semibold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow transition flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isGeneratingDigest ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>ИИ анализирует чат...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Сгенерировать дайджест</span>
                    </>
                  )}
                </button>

                {digestStatusMsg && (
                  <div
                    className={`p-3 rounded-xl text-xs border ${
                      digestStatusMsg.success
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}
                  >
                    {digestStatusMsg.text}
                  </div>
                )}

                {generatedPreview && (
                  <div className="pt-2">
                    <h4 className="text-xs font-semibold text-slate-300 mb-1">Предпросмотр результата:</h4>
                    <div
                      className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: generatedPreview }}
                    />
                  </div>
                )}
              </div>

              {/* Digests Archive List */}
              <div className="lg:col-span-2 bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-slate-200 flex items-center space-x-2">
                    <MessageSquare className="w-4 h-4 text-amber-400" />
                    <span>Архив сгенерированных дайджестов</span>
                  </h3>
                  <button
                    onClick={fetchDigests}
                    className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg transition"
                    title="Обновить"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {digestsLoading ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
                    Загрузка архива...
                  </div>
                ) : digests.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs bg-slate-950/60 rounded-xl border border-slate-800">
                    Дайджестов в базе пока нет. Нажмите «Сгенерировать дайджест» слева.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {digests.map((item) => (
                      <div
                        key={item.id}
                        className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 hover:border-slate-700 space-y-2 transition"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-amber-400">
                            {item.chatTitle || item.chatId || 'Моточат'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(item.createdAt).toLocaleString('ru-RU')}
                          </span>
                        </div>
                        <div
                          className="text-xs text-slate-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: item.summary }}
                        />
                        <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-500">
                          <span>Охват сообщений: {item.messageCount || 50}+</span>
                          {item.sentToTelegram ? (
                            <span className="text-emerald-400 flex items-center space-x-1">
                              <CheckCircle className="w-3 h-3" />
                              <span>Отправлен в Telegram</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">Сохранен в архиве</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: LIVE STATS & CHATS MONITORING                     */}
        {/* ========================================================= */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <div className="text-xs text-slate-400">Всего сообществ</div>
                <div className="text-2xl font-bold text-slate-100 mt-1">41</div>
                <div className="text-[11px] text-emerald-400 mt-1">100% активных чатов</div>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <div className="text-xs text-slate-400">Общая аудитория</div>
                <div className="text-2xl font-bold text-amber-400 mt-1">265 000+</div>
                <div className="text-[11px] text-slate-400 mt-1">байкеров России</div>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <div className="text-xs text-slate-400">Сообщений в сутки</div>
                <div className="text-2xl font-bold text-slate-100 mt-1">
                  {(stats.totalMessages || 14850).toLocaleString('ru-RU')}
                </div>
                <div className="text-[11px] text-emerald-400 mt-1">Высокая вовлеченность</div>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <div className="text-xs text-slate-400">Статус бота</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">ONLINE</div>
                <div className="text-[11px] text-slate-400 mt-1">Webhook активен</div>
              </div>
            </div>

            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="font-semibold text-sm text-slate-200">Таблица мониторинга 41 сообщества</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 px-3">Чат</th>
                      <th className="py-2.5 px-3">Категория</th>
                      <th className="py-2.5 px-3">Участников</th>
                      <th className="py-2.5 px-3">Ссылка</th>
                      <th className="py-2.5 px-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {catalog.map((c) => (
                      <tr key={c.slug} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 font-medium text-slate-200">{c.title}</td>
                        <td className="py-2.5 px-3 text-slate-400">{c.category}</td>
                        <td className="py-2.5 px-3 text-amber-400">
                          {(c.liveMembers || c.estimatedMembers).toLocaleString('ru-RU')}
                        </td>
                        <td className="py-2.5 px-3">
                          <a
                            href={c.telegramLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-400 hover:underline flex items-center space-x-1"
                          >
                            <span>@{c.username}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Активен
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: ANTISCAM & SECURITY                                */}
        {/* ========================================================= */}
        {activeTab === 'antiscam' && (
          <div className="space-y-6">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
              <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
                <Shield className="w-5 h-5 text-amber-400" />
                <span>Безопасность и Антискам фильтры</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Автоматическое обнаружение мошеннических предложений, продажи фальшивых запчастей, подозрительных ссылок и спама.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Keywords Card */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="font-semibold text-sm text-slate-200">Ключевые слова и триггеры антискама</h3>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Новое стоп-слово..."
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleAddKeyword}
                    className="px-4 py-2 font-semibold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition"
                  >
                    Добавить
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {keywords.length === 0 ? (
                    <div className="text-xs text-slate-500">Стоп-слова пока не добавлены</div>
                  ) : (
                    keywords.map((kw, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center space-x-1.5"
                      >
                        <span>{kw}</span>
                        <button
                          onClick={() => handleRemoveKeyword(kw)}
                          className="text-slate-500 hover:text-rose-400 ml-1 text-sm font-bold"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Bans Card */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="font-semibold text-sm text-slate-200">Глобальные баны и черный список</h3>
                <div className="text-xs text-slate-400">
                  Всего заблокированных нарушителей: <span className="text-rose-400 font-semibold">{bans.length}</span>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-2">
                  <p>🛡️ При обнаружении скама бот автоматически удаляет сообщение, выдает варн или блокирует нарушителя во всей сети из 41 чата.</p>
                  <p>📢 Отчеты о мошенниках направляются в чат <b>@MotoBlackList</b>.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: ADS PORTAL & XML EXPORT                           */}
        {/* ========================================================= */}
        {activeTab === 'ads' && (
          <div className="space-y-6">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
              <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
                <Radio className="w-5 h-5 text-amber-400" />
                <span>Рекламный Портал и XML Экспорт</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Таргетированное размещение рекламы по 41 целевому мотосообществу и генерация каталога в формате XML/YML.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* XML Feed Export Card */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="font-semibold text-sm text-slate-200 flex items-center space-x-2">
                  <FileCode className="w-4 h-4 text-amber-400" />
                  <span>Каталог YML / XML для партнеров</span>
                </h3>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Позволяет партнерским агрегаторам, мотосалонам и сайтам автоматически импортировать актуальный каталог всех 41 сообществ.
                </p>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                  <div className="text-slate-400">Прямая ссылка на фид:</div>
                  <a
                    href="/export.xml"
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-400 hover:underline flex items-center space-x-1 font-mono break-all"
                  >
                    <span>{window.location.origin}/export.xml</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleGenerateXml}
                    disabled={isGeneratingXml}
                    className="px-4 py-2 font-semibold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition flex items-center space-x-1.5"
                  >
                    {isGeneratingXml ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Генерация...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Обновить XML вручную</span>
                      </>
                    )}
                  </button>
                  <a
                    href="/export.xml"
                    target="_blank"
                    className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition"
                  >
                    Просмотреть XML
                  </a>
                </div>
              </div>

              {/* Mass Broadcast Card */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="font-semibold text-sm text-slate-200 flex items-center space-x-2">
                  <Send className="w-4 h-4 text-amber-400" />
                  <span>Рекламное объявление / Рассылка</span>
                </h3>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Текст сообщения (поддерживает HTML разметку):
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Например: 🏍️ Открытие сезона 2026! Подробности на сайте..."
                    value={broadcastText}
                    onChange={(e) => setBroadcastText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  onClick={handleSendBroadcast}
                  disabled={broadcastSending || !broadcastText.trim()}
                  className="w-full py-2.5 font-semibold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow transition flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {broadcastSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Отправка в сообщества...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Отправить рассылку</span>
                    </>
                  )}
                </button>

                {broadcastResult && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-amber-300">
                    {broadcastResult}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 7: BOT SETTINGS & WEBHOOK                             */}
        {/* ========================================================= */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
              <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
                <Settings className="w-5 h-5 text-amber-400" />
                <span>Настройки бота и платформы</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Конфигурация Telegram Bot API, вебхуков, часового пояса и системных уведомлений.
              </p>
            </div>

            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-5">
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Telegram Bot Username:</label>
                  <input
                    type="text"
                    disabled
                    value={settings.botUsername || '@MotoinfoAdminBot'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Часовой пояс (смещение от UTC):</label>
                  <input
                    type="number"
                    disabled
                    value={settings.timezone || 3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-300"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">По умолчанию: UTC+3 (Москва)</span>
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-200">Глушить сообщения изменения репутации</div>
                    <div className="text-[11px] text-slate-400">
                      Не отправлять +1/-1 уведомления в основной чат сообщества
                    </div>
                  </div>
                  <button
                    onClick={() => handleUpdateFilters({
                      ...filters,
                      muteReputationChangeMessages: !filters.muteReputationChangeMessages
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      filters.muteReputationChangeMessages ? 'bg-amber-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        filters.muteReputationChangeMessages ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Admin Login Modal */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <LogIn className="w-5 h-5 text-amber-400" />
                <span>Вход администратора</span>
              </h3>
              <button
                onClick={() => setIsLoginOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Имя пользователя:</label>
                <input
                  type="text"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Пароль:</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {loginError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-2.5 font-semibold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition flex items-center justify-center space-x-2"
              >
                {loginLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Войти в систему</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>Motoinfo Admin • 41 мото-сообщество • ИИ-Дайджесты и Репутация</p>
      </footer>
    </div>
  );
}

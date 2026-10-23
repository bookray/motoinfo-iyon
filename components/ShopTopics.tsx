import React, { useState, useEffect } from 'react';
import {
  Store,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  ShieldAlert,
  Info,
  Check,
  X,
  MessageSquare,
  Lock,
  Layers,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { ShopTopicConfig, ShopSeller, ShopPublication, Chat } from '../types';

interface ShopTopicsProps {
  token: string;
  chats: Chat[];
}

export function ShopTopics({ token, chats }: ShopTopicsProps) {
  const [configs, setConfigs] = useState<ShopTopicConfig[]>([]);
  const [sellers, setSellers] = useState<ShopSeller[]>([]);
  const [publications, setPublications] = useState<ShopPublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ success: boolean; text: string } | null>(null);

  // Selected chat for config editing
  const [selectedChatId, setSelectedChatId] = useState<string>('');
  const [currentConfig, setCurrentConfig] = useState<Partial<ShopTopicConfig>>({
    enabled: true,
    topicTitle: 'Объявления магазинов',
    topicId: undefined,
    topicLink: '',
    defaultWeeklyLimit: 5,
    defaultDurationDays: 30,
    autoDeleteUnauthorized: true,
    autoDeleteOverLimit: true,
    autoDeleteExpired: true
  });

  // Seller Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChatId, setFilterChatId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired'>('all');

  // Seller Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<ShopSeller | null>(null);
  const [sellerChatId, setSellerChatId] = useState<string>('');
  const [sellerUserId, setSellerUserId] = useState('');
  const [sellerUsername, setSellerUsername] = useState('');
  const [sellerShopName, setSellerShopName] = useState('');
  const [sellerContactInfo, setSellerContactInfo] = useState('');
  const [sellerNotes, setSellerNotes] = useState('');
  const [sellerWeeklyLimit, setSellerWeeklyLimit] = useState<number>(5);
  const [sellerAllowedUntil, setSellerAllowedUntil] = useState<string>('');
  const [sellerActive, setSellerActive] = useState<boolean>(true);
  const [savingSeller, setSavingSeller] = useState(false);

  // Auto-hide alert messages
  useEffect(() => {
    if (statusMsg) {
      const timer = setTimeout(() => setStatusMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMsg]);

  // Load all shop topics data
  const loadData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      const [configsRes, sellersRes, pubRes] = await Promise.all([
        fetch('/api/shop-topics/configs', { headers }),
        fetch('/api/shop-topics/sellers', { headers }),
        fetch('/api/shop-topics/publications', { headers })
      ]);

      if (configsRes.ok) {
        const configsData = await configsRes.json();
        setConfigs(configsData);
      }
      if (sellersRes.ok) {
        const sellersData = await sellersRes.json();
        setSellers(sellersData);
      }
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        setPublications(pubData);
      }
    } catch (err: any) {
      console.error('Failed to load shop topics data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update selected chat config editor when selectedChatId changes
  useEffect(() => {
    if (!selectedChatId && chats.length > 0) {
      setSelectedChatId(String(chats[0].id));
    }
  }, [chats]);

  useEffect(() => {
    if (!selectedChatId) return;
    const found = configs.find(c => String(c.chatId) === String(selectedChatId));
    if (found) {
      setCurrentConfig({
        chatId: found.chatId,
        chatTitle: found.chatTitle,
        enabled: found.enabled !== undefined ? found.enabled : true,
        topicId: found.topicId,
        topicTitle: found.topicTitle || 'Объявления магазинов',
        topicLink: found.topicLink || '',
        defaultWeeklyLimit: found.defaultWeeklyLimit || 5,
        defaultDurationDays: found.defaultDurationDays || 30,
        autoDeleteUnauthorized: found.autoDeleteUnauthorized !== false,
        autoDeleteOverLimit: found.autoDeleteOverLimit !== false,
        autoDeleteExpired: found.autoDeleteExpired !== false
      });
    } else {
      const chat = chats.find(c => String(c.id) === String(selectedChatId));
      setCurrentConfig({
        chatId: selectedChatId,
        chatTitle: chat?.title || `Чат ${selectedChatId}`,
        enabled: false,
        topicId: undefined,
        topicTitle: 'Объявления магазинов',
        topicLink: '',
        defaultWeeklyLimit: 5,
        defaultDurationDays: 30,
        autoDeleteUnauthorized: true,
        autoDeleteOverLimit: true,
        autoDeleteExpired: true
      });
    }
  }, [selectedChatId, configs]);

  // Auto-parse topic link when pasted into input
  const handleTopicLinkChange = (value: string) => {
    let parsedTopicId = currentConfig.topicId;
    const trimmed = value.trim();

    // Pattern: https://t.me/c/1234567890/42 or https://t.me/chat_user/42
    const linkMatch = trimmed.match(/\/(?:c\/\d+|\w+)\/(\d+)/);
    if (linkMatch && linkMatch[1]) {
      parsedTopicId = Number(linkMatch[1]);
    } else {
      const numOnly = parseInt(trimmed, 10);
      if (!isNaN(numOnly) && numOnly > 0 && /^\d+$/.test(trimmed)) {
        parsedTopicId = numOnly;
      }
    }

    setCurrentConfig(prev => ({
      ...prev,
      topicLink: value,
      topicId: parsedTopicId
    }));
  };

  // Save topic configuration for selected chat
  const handleSaveConfig = async () => {
    if (!selectedChatId) return;
    try {
      setSavingConfig(true);
      const res = await fetch('/api/shop-topics/configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...currentConfig,
          chatId: selectedChatId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось сохранить настройки темы');
      }

      setStatusMsg({ success: true, text: 'Настройки темы объявлений сохранены!' });
      await loadData();
    } catch (err: any) {
      setStatusMsg({ success: false, text: err.message || 'Ошибка сохранения' });
    } finally {
      setSavingConfig(false);
    }
  };

  // Open modal for adding/editing seller
  const handleOpenAddSeller = () => {
    setEditingSeller(null);
    setSellerChatId(selectedChatId || (chats[0]?.id ? String(chats[0].id) : 'all'));
    setSellerUserId('');
    setSellerUsername('');
    setSellerShopName('');
    setSellerContactInfo('');
    setSellerNotes('');
    setSellerWeeklyLimit(currentConfig.defaultWeeklyLimit || 5);
    
    // Default expiration: 30 days from now
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setSellerAllowedUntil(d.toISOString().split('T')[0]);
    setSellerActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditSeller = (seller: ShopSeller) => {
    setEditingSeller(seller);
    setSellerChatId(seller.chatId);
    setSellerUserId(seller.userId);
    setSellerUsername(seller.username || '');
    setSellerShopName(seller.shopName);
    setSellerContactInfo(seller.contactInfo || '');
    setSellerNotes(seller.notes || '');
    setSellerWeeklyLimit(seller.weeklyLimit || 5);
    setSellerAllowedUntil(seller.allowedUntil ? seller.allowedUntil.split('T')[0] : '');
    setSellerActive(seller.active !== false);
    setIsModalOpen(true);
  };

  // Quick preset buttons for duration
  const applyDurationPreset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setSellerAllowedUntil(d.toISOString().split('T')[0]);
  };

  // Save seller
  const handleSaveSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellerChatId || !sellerUserId.trim() || !sellerShopName.trim()) {
      setStatusMsg({ success: false, text: 'Пожалуйста, заполните ID/username и название магазина' });
      return;
    }

    try {
      setSavingSeller(true);
      const isoAllowedUntil = sellerAllowedUntil 
        ? new Date(sellerAllowedUntil + 'T23:59:59Z').toISOString() 
        : new Date(Date.now() + 30 * 86400 * 1000).toISOString();

      const res = await fetch('/api/shop-topics/sellers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          id: editingSeller?.id,
          chatId: sellerChatId,
          userId: sellerUserId.trim(),
          username: sellerUsername.trim() || undefined,
          shopName: sellerShopName.trim(),
          contactInfo: sellerContactInfo.trim() || undefined,
          notes: sellerNotes.trim() || undefined,
          weeklyLimit: Number(sellerWeeklyLimit) || 5,
          allowedUntil: isoAllowedUntil,
          active: sellerActive
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось сохранить магазин');
      }

      setStatusMsg({
        success: true,
        text: editingSeller ? 'Данные магазина обновлены!' : 'Магазин успешно добавлен и авторизован!'
      });
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setStatusMsg({ success: false, text: err.message || 'Ошибка сохранения' });
    } finally {
      setSavingSeller(false);
    }
  };

  // Delete seller
  const handleDeleteSeller = async (id: string, name: string) => {
    if (!confirm(`Удалить магазин «${name}» из списка разрешённых? Все его последующие сообщения в теме будут удаляться.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/shop-topics/sellers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setStatusMsg({ success: true, text: `Магазин «${name}» удален` });
        await loadData();
      }
    } catch (err: any) {
      setStatusMsg({ success: false, text: 'Ошибка удаления' });
    }
  };

  // Quick Renew (+30 days)
  const handleRenewSeller = async (id: string, days = 30) => {
    try {
      const res = await fetch(`/api/shop-topics/sellers/${id}/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ days })
      });
      if (res.ok) {
        setStatusMsg({ success: true, text: `Срок публикации успешно продлён на ${days} дней!` });
        await loadData();
      }
    } catch (err: any) {
      setStatusMsg({ success: false, text: 'Ошибка продления срока' });
    }
  };

  // Quick reset weekly counter
  const handleResetWeek = async (id: string) => {
    try {
      const res = await fetch(`/api/shop-topics/sellers/${id}/reset-week`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setStatusMsg({ success: true, text: 'Недельный счетчик сообщений сброшен!' });
        await loadData();
      }
    } catch (err: any) {
      setStatusMsg({ success: false, text: 'Ошибка сброса недели' });
    }
  };

  // Filter sellers
  const filteredSellers = sellers.filter(s => {
    if (filterChatId !== 'all' && s.chatId !== filterChatId && s.chatId !== 'all') {
      return false;
    }
    if (filterStatus === 'active' && (!s.active || s.isExpired)) {
      return false;
    }
    if (filterStatus === 'expired' && s.active && !s.isExpired) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = s.shopName.toLowerCase().includes(q);
      const matchUser = (s.username || '').toLowerCase().includes(q) || s.userId.toLowerCase().includes(q);
      const matchNotes = (s.notes || '').toLowerCase().includes(q);
      if (!matchName && !matchUser && !matchNotes) return false;
    }
    return true;
  });

  const activeConfigsCount = configs.filter(c => c.enabled && c.topicId).length;
  const activeSellersCount = sellers.filter(s => s.active && !s.isExpired).length;
  const totalWeeklyPublications = sellers.reduce((acc, s) => acc + (s.messagesThisWeek || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Overview */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950/40 p-5 rounded-2xl border border-amber-500/20 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Store className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">
              Объявления магазинов
            </h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Топики сообществ
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Автоматическая модерация выделенных коммерческих тем в чатах: публикация разрешена только авторизованным продавцам, лимит 5 сообщений в неделю, авто-удаление сообщений остальных пользователей и контроль срока активности.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg border border-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Обновить данные</span>
        </button>
      </div>

      {/* Status Alert Notification */}
      {statusMsg && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between transition ${
            statusMsg.success
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {statusMsg.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] text-slate-400">Подключено тем</div>
          <div className="text-lg font-bold text-amber-400 mt-0.5">{activeConfigsCount} / {chats.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">тем с активной защитой</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] text-slate-400">Разрешённых магазинов</div>
          <div className="text-lg font-bold text-emerald-400 mt-0.5">{activeSellersCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">активных подписок</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] text-slate-400">Постов за эту неделю</div>
          <div className="text-lg font-bold text-sky-400 mt-0.5">{totalWeeklyPublications}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">опубликовано в темах</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] text-slate-400">Лимит & Срок</div>
          <div className="text-lg font-bold text-purple-400 mt-0.5">5 / 30 дн.</div>
          <div className="text-[10px] text-slate-500 mt-0.5">по умолчанию</div>
        </div>
      </div>

      {/* SECTION 1: TOPIC CONNECTOR PER CHAT */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Настройка темы «Объявления магазинов» для чата</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Выберите чат, вставьте ссылку на тему форума или её ID, и сохраните настройки
            </p>
          </div>

          <div className="w-full sm:w-auto">
            <select
              value={selectedChatId}
              onChange={e => setSelectedChatId(e.target.value)}
              className="w-full sm:w-64 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              {chats.map(c => {
                const isCfgActive = configs.some(cfg => String(cfg.chatId) === String(c.id) && cfg.enabled && cfg.topicId);
                return (
                  <option key={c.id} value={c.id}>
                    {isCfgActive ? '🟢 ' : '⚪ '} {c.title}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Selected Chat Configuration Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {/* Status & Topic Link */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <div>
                <div className="text-xs font-medium text-slate-200">Модерация темы активна</div>
                <div className="text-[10px] text-slate-400">Удалять всё лишнее в этой теме</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!currentConfig.enabled}
                  onChange={e => setCurrentConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Ссылка на тему или ID топика
              </label>
              <input
                type="text"
                placeholder="https://t.me/c/1871635723/452 или 452"
                value={currentConfig.topicLink || (currentConfig.topicId ? String(currentConfig.topicId) : '')}
                onChange={e => handleTopicLinkChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 placeholder-slate-600"
              />
              <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                <span>
                  Распознанный ID топика:{' '}
                  <strong className="text-amber-400">
                    {currentConfig.topicId ? currentConfig.topicId : 'не указан'}
                  </strong>
                </span>
                {currentConfig.topicId && (
                  <span className="text-emerald-400 flex items-center space-x-1">
                    <Check className="w-3 h-3" />
                    <span>ID корректен</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Topic Title & Default Limits */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Название топика
              </label>
              <input
                type="text"
                value={currentConfig.topicTitle || 'Объявления магазинов'}
                onChange={e => setCurrentConfig(prev => ({ ...prev, topicTitle: e.target.value }))}
                placeholder="Объявления магазинов"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Лимит (сообщ./нед.)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={currentConfig.defaultWeeklyLimit || 5}
                  onChange={e => setCurrentConfig(prev => ({ ...prev, defaultWeeklyLimit: Number(e.target.value) || 5 }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Срок по умолч. (дней)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={currentConfig.defaultDurationDays || 30}
                  onChange={e => setCurrentConfig(prev => ({ ...prev, defaultDurationDays: Number(e.target.value) || 30 }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Rules & Save Button */}
          <div className="flex flex-col justify-between space-y-3">
            <div className="space-y-1.5 p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-[11px] text-slate-300">
              <div className="font-semibold text-slate-200 mb-1">Действия бота в теме:</div>
              <div className="flex items-center space-x-1.5 text-rose-400">
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Удалять сообщения неавторизованных</span>
              </div>
              <div className="flex items-center space-x-1.5 text-amber-400">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Удалять посты сверх 5/нед.</span>
              </div>
              <div className="flex items-center space-x-1.5 text-slate-400">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>Удалять посты после деактивации</span>
              </div>
            </div>

            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg shadow transition flex items-center justify-center space-x-2"
            >
              {savingConfig ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Сохранить настройки темы</span>
            </button>
          </div>
        </div>

        {/* How to Connect Topic Help Guide */}
        <div className="mt-3 p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs text-slate-400 flex items-start space-x-3">
          <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-medium text-slate-200">
              Как подключить тему для бота в каждом чате?
            </div>
            <p className="text-[11px] leading-relaxed">
              <strong>Способ 1 (через панель):</strong> Скопируйте ссылку на тему в Telegram (нажав правой кнопкой на тему &rarr; «Копировать ссылку») и вставьте в поле выше. Бот сам извлечёт ID топика.
            </p>
            <p className="text-[11px] leading-relaxed">
              <strong>Способ 2 (прямо в Telegram):</strong> Зайдите в нужную тему форума и отправьте сообщение с командой <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300 font-mono text-[10px]">/set_shop_topic</code>. Бот автоматически определит ID темы и привяжет её к этому чату!
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: AUTHORIZED SELLERS MANAGEMENT */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        {/* Controls Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center space-x-2">
              <Store className="w-4 h-4 text-emerald-400" />
              <span>Авторизованные магазины и продавцы</span>
              <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-300 rounded-full font-normal">
                {filteredSellers.length}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Пользователи, которым разрешено писать в тему объявлений в рамках заданного лимита и срока
            </p>
          </div>

          <button
            onClick={handleOpenAddSeller}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить магазин</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
          <div className="relative flex-1 w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Поиск по названию магазина, @username или ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 placeholder-slate-600"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <select
              value={filterChatId}
              onChange={e => setFilterChatId(e.target.value)}
              className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500 w-full sm:w-auto"
            >
              <option value="all">Все чаты</option>
              {chats.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500 shrink-0"
            >
              <option value="all">Все статусы</option>
              <option value="active">Только активные</option>
              <option value="expired">Истёкшие / Деактив.</option>
            </select>
          </div>
        </div>

        {/* Sellers Grid */}
        {filteredSellers.length === 0 ? (
          <div className="py-12 text-center bg-slate-950/40 rounded-xl border border-slate-800/60">
            <Store className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <div className="text-xs font-medium text-slate-300">
              {sellers.length === 0 ? 'Список магазинов пуст' : 'По заданным фильтрам ничего не найдено'}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
              Нажмите «Добавить магазин», чтобы разрешить пользователю публиковать объявления в выбранной теме.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredSellers.map(seller => {
              const weekLimit = seller.weeklyLimit || 5;
              const weekCount = seller.messagesThisWeek || 0;
              const isOverLimit = weekCount >= weekLimit;
              const isExp = seller.isExpired || !seller.active;
              const daysLeft = seller.daysRemaining !== undefined ? seller.daysRemaining : 0;

              return (
                <div
                  key={seller.id}
                  className={`bg-slate-950/80 border rounded-xl p-4 transition flex flex-col justify-between ${
                    isExp
                      ? 'border-rose-900/40 hover:border-rose-700/50'
                      : isOverLimit
                      ? 'border-amber-900/40 hover:border-amber-700/50'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    {/* Top row: Shop name & status badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-slate-100 flex items-center space-x-1.5">
                          <span>{seller.shopName}</span>
                        </div>
                        <div className="text-xs text-amber-400 font-mono mt-0.5">
                          {seller.username ? `@${seller.username}` : `ID: ${seller.userId}`}
                        </div>
                      </div>

                      <div>
                        {isExp ? (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Деактивирован
                          </span>
                        ) : isOverLimit ? (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Лимит недели
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Активен
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Chat Badge */}
                    <div className="mt-2 text-[11px] text-slate-400 flex items-center space-x-1">
                      <span className="text-slate-500">Чат:</span>
                      <span className="text-slate-300 font-medium truncate max-w-[200px]">
                        {seller.chatTitle || seller.chatId}
                      </span>
                    </div>

                    {/* Weekly Limit Meter */}
                    <div className="mt-3 bg-slate-900/90 rounded-lg p-2.5 border border-slate-800">
                      <div className="flex justify-between items-center text-[11px] mb-1">
                        <span className="text-slate-400">Сообщений за неделю:</span>
                        <span className={`font-bold font-mono ${isOverLimit ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {weekCount} / {weekLimit}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isOverLimit ? 'bg-rose-500' : weekCount > 0 ? 'bg-emerald-500' : 'bg-slate-700'
                          }`}
                          style={{ width: `${Math.min(100, (weekCount / weekLimit) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Expiration and validity */}
                    <div className="mt-2.5 text-[11px] flex items-center justify-between text-slate-400">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>До: {seller.allowedUntil ? seller.allowedUntil.split('T')[0] : 'не задано'}</span>
                      </span>
                      <span>
                        {daysLeft > 0 ? (
                          <strong className="text-emerald-400">{daysLeft} дн. ост.</strong>
                        ) : (
                          <strong className="text-rose-400">Истёк</strong>
                        )}
                      </span>
                    </div>

                    {seller.notes && (
                      <div className="mt-2 text-[10px] text-slate-500 bg-slate-900/50 p-1.5 rounded border border-slate-800/50 italic line-clamp-2">
                        {seller.notes}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleRenewSeller(seller.id, 30)}
                        title="Продлить ещё на 30 дней (1 месяц)"
                        className="px-2 py-1 text-[10px] font-medium bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30 rounded transition"
                      >
                        +1 месяц
                      </button>
                      <button
                        onClick={() => handleResetWeek(seller.id)}
                        title="Сбросить счетчик постов на этой неделе"
                        className="px-2 py-1 text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
                      >
                        Сброс
                      </button>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleOpenEditSeller(seller)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition"
                        title="Редактировать"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSeller(seller.id, seller.shopName)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 3: RECENT PUBLICATIONS LOG IN COMMERCIAL TOPICS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-sky-400" />
          <span>Журнал подтверждённых публикаций в темах</span>
        </h3>
        <p className="text-xs text-slate-400">
          Последние сообщения авторизованных магазинов, пропущенные ботом в темы объявлений
        </p>

        {publications.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/60">
            В темах объявлений пока не зафиксировано новых публикаций от магазинов.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
            {publications.slice(0, 20).map(pub => (
              <div key={pub.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-200">{pub.username ? `@${pub.username}` : `User ${pub.userId}`}</span>
                    <span className="text-slate-400 ml-1.5">в теме «{(pub as any).chatTitle || pub.chatId}»</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {new Date(pub.timestamp).toLocaleString('ru-RU')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: ADD / EDIT SELLER */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <Store className="w-5 h-5 text-amber-400" />
              <span>{editingSeller ? 'Редактирование магазина' : 'Авторизация нового магазина'}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Укажите Telegram ID или @username магазина, лимит постов в неделю и срок активности
            </p>

            <form onSubmit={handleSaveSeller} className="mt-4 space-y-4">
              {/* Target Chat */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Целевой чат <span className="text-rose-400">*</span>
                </label>
                <select
                  value={sellerChatId}
                  onChange={e => setSellerChatId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="all">🌐 Все чаты сообщества (Глобальный доступ)</option>
                  {chats.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Shop Name & Username/ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Название магазина / бренда <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Например: МотоЭкип Москва"
                    value={sellerShopName}
                    onChange={e => setSellerShopName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Telegram @username или ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="@moto_shop или 123456789"
                    value={sellerUserId}
                    onChange={e => setSellerUserId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Weekly Limit & Expiry Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Недельный лимит постов
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={sellerWeeklyLimit}
                    onChange={e => setSellerWeeklyLimit(Number(e.target.value) || 5)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5">По умолчанию: 5 постов в неделю</div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Разрешённый срок публикаций
                  </label>
                  <input
                    type="date"
                    required
                    value={sellerAllowedUntil}
                    onChange={e => setSellerAllowedUntil(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5">После срока продавец деактивируется</div>
                </div>
              </div>

              {/* Quick Preset Buttons for Date */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Быстрый выбор срока размещения:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyDurationPreset(7)}
                    className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                  >
                    +1 неделя
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDurationPreset(30)}
                    className="px-2.5 py-1 text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded border border-amber-500/40 font-medium transition"
                  >
                    +1 месяц (по умолчанию)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDurationPreset(90)}
                    className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                  >
                    +3 месяца
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDurationPreset(180)}
                    className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                  >
                    +6 месяцев
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDurationPreset(365)}
                    className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                  >
                    +1 год
                  </button>
                </div>
              </div>

              {/* Contact and Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Заметки / Контактное лицо (необязательно)
                </label>
                <input
                  type="text"
                  placeholder="Например: Оплачено до конца лета, контакт: @alexey"
                  value={sellerNotes}
                  onChange={e => setSellerNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div>
                  <div className="text-xs font-medium text-slate-200">Статус активности</div>
                  <div className="text-[10px] text-slate-400">При выключении сообщения магазина будут удаляться</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sellerActive}
                    onChange={e => setSellerActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={savingSeller}
                  className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow transition flex items-center space-x-1.5"
                >
                  {savingSeller && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingSeller ? 'Сохранить изменения' : 'Авторизовать магазин'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import {
  Store,
  Link2,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  CalendarPlus,
  RotateCcw,
  Search,
  Copy,
  Check,
  ShieldCheck,
  MessageSquare,
  ExternalLink,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Power,
  UserCheck,
  Edit3,
  X,
  FileText,
  Hash
} from 'lucide-react';
import { Chat, ShopTopicConfig, ShopVendor, ShopPublicationLog } from '../types';

interface ShopAnnouncementsProps {
  chats: Chat[];
  authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

function extractThreadIdFromInput(input: string): number | null {
  const raw = (input || '').trim();
  if (!raw) return null;

  const numMatch = raw.match(/^#?(\d+)$/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    return n > 0 ? n : null;
  }

  const queryMatch = raw.match(/[?&](?:thread|topic)=(\d+)/i);
  if (queryMatch) {
    const n = parseInt(queryMatch[1], 10);
    if (n > 0) return n;
  }

  const privateMatch = raw.match(/t\.me\/c\/(\d+)\/(\d+)(?:\/\d+)?/i);
  if (privateMatch) {
    const n = parseInt(privateMatch[2], 10);
    return n > 0 ? n : null;
  }

  const publicMatch = raw.match(/t\.me\/([a-zA-Z0-9_]+)\/(\d+)(?:\/\d+)?/i);
  if (publicMatch && publicMatch[1].toLowerCase() !== 'c') {
    const n = parseInt(publicMatch[2], 10);
    return n > 0 ? n : null;
  }

  return null;
}

export const ShopAnnouncements: React.FC<ShopAnnouncementsProps> = ({
  chats,
  authenticatedFetch
}) => {
  const [topics, setTopics] = useState<ShopTopicConfig[]>([]);
  const [vendors, setVendors] = useState<ShopVendor[]>([]);
  const [publications, setPublications] = useState<ShopPublicationLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedChatId, setSelectedChatId] = useState<string>('');
  const [chatSearch, setChatSearch] = useState<string>('');
  const [vendorSearch, setVendorSearch] = useState<string>('');
  const [showAllChatsVendors, setShowAllChatsVendors] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(true);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Topic binding form state for selectedChatId
  const [topicLinkInput, setTopicLinkInput] = useState<string>('');
  const [topicTitleInput, setTopicTitleInput] = useState<string>('Объявления магазинов');
  const [topicEnabledInput, setTopicEnabledInput] = useState<boolean>(true);
  const [notifyInTopicOnDelete, setNotifyInTopicOnDelete] = useState<boolean>(true);
  const [deleteWarningText, setDeleteWarningText] = useState<string>(
    '⚠️ <b>Внимание!</b> В этой теме публиковать объявления могут только одобренные магазины и продавцы.'
  );
  const [deleteWarningButtons, setDeleteWarningButtons] = useState<Array<{ text: string; url: string }>>([]);
  const [deleteWarningCooldownSec, setDeleteWarningCooldownSec] = useState<number>(300);
  const [deleteWarningAutoDeleteSec, setDeleteWarningAutoDeleteSec] = useState<number>(60);
  const [isSavingTopic, setIsSavingTopic] = useState<boolean>(false);
  const [topicFeedback, setTopicFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add vendor modal / form state
  const [isAddVendorOpen, setIsAddVendorOpen] = useState<boolean>(false);
  const [newShopName, setNewShopName] = useState<string>('');
  const [newUserIdentifier, setNewUserIdentifier] = useState<string>('');
  const [newContactInfo, setNewContactInfo] = useState<string>('');
  const [newWeeklyLimit, setNewWeeklyLimit] = useState<number>(5);
  const [newDurationDays, setNewDurationDays] = useState<number>(30);
  const [isAddingVendor, setIsAddingVendor] = useState<boolean>(false);
  const [vendorError, setVendorError] = useState<string | null>(null);

  // Edit vendor modal state
  const [editingVendor, setEditingVendor] = useState<ShopVendor | null>(null);
  const [editShopName, setEditShopName] = useState<string>('');
  const [editUserIdentifier, setEditUserIdentifier] = useState<string>('');
  const [editContactInfo, setEditContactInfo] = useState<string>('');
  const [editWeeklyLimit, setEditWeeklyLimit] = useState<number>(5);
  const [editExpiresDate, setEditExpiresDate] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  useEffect(() => {
    if (chats.length > 0 && !selectedChatId) {
      const firstActive = chats.find(c => c.active) || chats[0];
      setSelectedChatId(String(firstActive.id));
    }
  }, [chats, selectedChatId]);

  const loadShopData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await authenticatedFetch('/api/shop-topics');
      if (res.ok) {
        const data = await res.json();
        setTopics(Array.isArray(data.topics) ? data.topics : []);
        setVendors(Array.isArray(data.vendors) ? data.vendors : []);
        setPublications(Array.isArray(data.publications) ? data.publications : []);
      }
    } catch (e) {
      console.error('Failed to load shop topics:', e);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadShopData();
    const interval = setInterval(() => loadShopData(true), 15000);
    return () => clearInterval(interval);
  }, []);

  // Sync form fields when selectedChatId or topics change
  useEffect(() => {
    if (!selectedChatId) return;
    const currentConfig = topics.find(t => String(t.chatId) === String(selectedChatId));
    if (currentConfig) {
      setTopicLinkInput(
        currentConfig.topicLink ||
          (currentConfig.messageThreadId ? String(currentConfig.messageThreadId) : '')
      );
      setTopicTitleInput(currentConfig.topicTitle || 'Объявления магазинов');
      setTopicEnabledInput(currentConfig.enabled !== false);
      setNotifyInTopicOnDelete(currentConfig.notifyInTopicOnDelete !== false);
      setDeleteWarningText(
        currentConfig.deleteWarningText ||
          '⚠️ <b>Внимание!</b> В этой теме публиковать объявления могут только одобренные магазины и продавцы.'
      );
      setDeleteWarningButtons(
        Array.isArray(currentConfig.deleteWarningButtons) ? currentConfig.deleteWarningButtons : []
      );
      setDeleteWarningCooldownSec(
        currentConfig.deleteWarningCooldownSec !== undefined ? Number(currentConfig.deleteWarningCooldownSec) : 300
      );
      setDeleteWarningAutoDeleteSec(
        currentConfig.deleteWarningAutoDeleteSec !== undefined ? Number(currentConfig.deleteWarningAutoDeleteSec) : 60
      );
    } else {
      setTopicLinkInput('');
      setTopicTitleInput('Объявления магазинов');
      setTopicEnabledInput(true);
      setNotifyInTopicOnDelete(true);
      setDeleteWarningText(
        '⚠️ <b>Внимание!</b> В этой теме публиковать объявления могут только одобренные магазины и продавцы.'
      );
      setDeleteWarningButtons([]);
      setDeleteWarningCooldownSec(300);
      setDeleteWarningAutoDeleteSec(60);
    }
    setTopicFeedback(null);
  }, [selectedChatId, topics]);

  const selectedChat = useMemo(
    () => chats.find(c => String(c.id) === String(selectedChatId)),
    [chats, selectedChatId]
  );

  const currentTopicConfig = useMemo(
    () => topics.find(t => String(t.chatId) === String(selectedChatId)),
    [topics, selectedChatId]
  );

  const extractedThreadIdPreview = useMemo(
    () => extractThreadIdFromInput(topicLinkInput),
    [topicLinkInput]
  );

  const filteredChatsList = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    return chats.filter(c => {
      if (!q) return true;
      return (
        c.title?.toLowerCase().includes(q) ||
        String(c.id).toLowerCase().includes(q)
      );
    });
  }, [chats, chatSearch]);

  const displayedVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    return vendors.filter(v => {
      if (!showAllChatsVendors && selectedChatId && String(v.chatId) !== String(selectedChatId)) {
        return false;
      }
      if (!q) return true;
      return (
        v.shopName?.toLowerCase().includes(q) ||
        v.username?.toLowerCase().includes(q) ||
        v.userId?.toLowerCase().includes(q) ||
        v.contactInfo?.toLowerCase().includes(q) ||
        v.chatTitle?.toLowerCase().includes(q)
      );
    });
  }, [vendors, selectedChatId, showAllChatsVendors, vendorSearch]);

  const displayedPublications = useMemo(() => {
    return publications.filter(p => {
      if (!showAllChatsVendors && selectedChatId && String(p.chatId) !== String(selectedChatId)) {
        return false;
      }
      return true;
    });
  }, [publications, selectedChatId, showAllChatsVendors]);

  const handleCopyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const handleSaveTopicBinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChatId) return;

    setIsSavingTopic(true);
    setTopicFeedback(null);
    try {
      const res = await authenticatedFetch('/api/shop-topics/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: selectedChatId,
          topicLinkOrId: topicLinkInput.trim(),
          topicTitle: topicTitleInput.trim() || 'Объявления магазинов',
          enabled: topicEnabledInput,
          notifyInTopicOnDelete,
          deleteWarningText,
          deleteWarningButtons,
          deleteWarningCooldownSec,
          deleteWarningAutoDeleteSec
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.config?.chatId && String(data.config.chatId) !== String(selectedChatId)) {
          setSelectedChatId(String(data.config.chatId));
        }
        setTopicFeedback({
          type: 'success',
          text: `Привязка сохранена для чата «${data.config.chatTitle || selectedChatId}»! ID темы (message_thread_id): ${data.config.messageThreadId || 'не указан'}`
        });
        await loadShopData(true);
      } else {
        setTopicFeedback({
          type: 'error',
          text: data.error || 'Не удалось сохранить привязку темы'
        });
      }
    } catch (err: any) {
      setTopicFeedback({
        type: 'error',
        text: err.message || 'Ошибка соединения с сервером'
      });
    } finally {
      setIsSavingTopic(false);
    }
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChatId) return;
    if (!newUserIdentifier.trim()) {
      setVendorError('Укажите @username или числовой Telegram ID продавца');
      return;
    }

    setIsAddingVendor(true);
    setVendorError(null);
    try {
      const res = await authenticatedFetch('/api/shop-topics/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: selectedChatId,
          shopName: newShopName.trim() || newUserIdentifier.trim(),
          userIdentifier: newUserIdentifier.trim(),
          contactInfo: newContactInfo.trim(),
          weeklyLimit: newWeeklyLimit || 5,
          durationDays: newDurationDays || 30
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewShopName('');
        setNewUserIdentifier('');
        setNewContactInfo('');
        setNewWeeklyLimit(5);
        setNewDurationDays(30);
        setIsAddVendorOpen(false);
        await loadShopData(true);
      } else {
        setVendorError(data.error || 'Ошибка при добавлении продавца');
      }
    } catch (err: any) {
      setVendorError(err.message || 'Ошибка сети');
    } finally {
      setIsAddingVendor(false);
    }
  };

  const handleResetWeekCounter = async (vendorId: string) => {
    try {
      const res = await authenticatedFetch(`/api/shop-topics/vendors/${vendorId}/reset-week`, {
        method: 'POST'
      });
      if (res.ok) {
        await loadShopData(true);
      }
    } catch (e) {
      console.error('Failed to reset weekly counter:', e);
    }
  };

  const handleExtendVendor = async (vendorId: string, days = 30) => {
    try {
      const res = await authenticatedFetch(`/api/shop-topics/vendors/${vendorId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days })
      });
      if (res.ok) {
        await loadShopData(true);
      }
    } catch (e) {
      console.error('Failed to extend vendor:', e);
    }
  };

  const handleToggleVendorActive = async (vendor: ShopVendor) => {
    try {
      const res = await authenticatedFetch(`/api/shop-topics/vendors/${vendor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !vendor.active })
      });
      if (res.ok) {
        await loadShopData(true);
      }
    } catch (e) {
      console.error('Failed to toggle vendor status:', e);
    }
  };

  const handleDeleteVendor = async (vendorId: string) => {
    try {
      const res = await authenticatedFetch(`/api/shop-topics/vendors/${vendorId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setVendors(prev => prev.filter(v => v.id !== vendorId));
      }
    } catch (e) {
      console.error('Failed to delete vendor:', e);
    }
  };

  const openEditModal = (vendor: ShopVendor) => {
    setEditingVendor(vendor);
    setEditShopName(vendor.shopName);
    setEditUserIdentifier(vendor.username ? `@${vendor.username}` : (vendor.userId || ''));
    setEditContactInfo(vendor.contactInfo || '');
    setEditWeeklyLimit(vendor.weeklyLimit || 5);
    setEditExpiresDate(vendor.expiresAt ? vendor.expiresAt.split('T')[0] : '');
  };

  const handleSaveVendorEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor) return;
    setIsSavingEdit(true);
    try {
      const res = await authenticatedFetch(`/api/shop-topics/vendors/${editingVendor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: editShopName.trim(),
          userIdentifier: editUserIdentifier.trim(),
          contactInfo: editContactInfo.trim(),
          weeklyLimit: editWeeklyLimit,
          expiresAt: editExpiresDate ? new Date(`${editExpiresDate}T23:59:59`).toISOString() : editingVendor.expiresAt
        })
      });
      if (res.ok) {
        setEditingVendor(null);
        await loadShopData(true);
      }
    } catch (e) {
      console.error('Failed to update vendor:', e);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const getVendorDaysInfo = (vendor: ShopVendor) => {
    if (!vendor.expiresAt) {
      return { daysLeft: 30, isExpired: false, label: '30 дн.' };
    }
    const diffMs = new Date(vendor.expiresAt).getTime() - Date.now();
    const daysLeft = Math.ceil(diffMs / (24 * 3600 * 1000));
    const isExpired = diffMs <= 0;
    return {
      daysLeft: Math.max(0, daysLeft),
      isExpired,
      label: isExpired ? 'Срок истёк' : `Осталось ${daysLeft} дн.`
    };
  };

  const totalConfiguredTopics = topics.filter(t => t.enabled && t.messageThreadId).length;
  const totalActiveVendors = vendors.filter(
    v => v.active && (!v.expiresAt || new Date(v.expiresAt).getTime() > Date.now())
  ).length;

  return (
    <div className="space-y-6">
      {/* Header & Summary Stats */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-950/30">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Управление темой «Объявления магазинов»
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl">
                Модерация коммерческих веток в чатах с темами: белый список продавцов, контроль недельного лимита публикаций (по умолчанию 5 в неделю), автоматическое отключение через 1 месяц и удаление сообщений посторонних участников.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
              <Hash className="w-4 h-4 text-blue-400" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Активных тем</div>
                <div className="text-sm font-bold text-white">{totalConfiguredTopics} из {chats.length}</div>
              </div>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Продавцов</div>
                <div className="text-sm font-bold text-white">{totalActiveVendors} активных</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsGuideOpen(!isGuideOpen)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                isGuideOpen
                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span>Как подключить тему</span>
              {isGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Collapsible Connection Instructions */}
        {isGuideOpen && (
          <div className="mt-5 pt-5 border-t border-slate-800/80 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/90 border border-emerald-500/25 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4" />
                  Способ 1: Мгновенно через Telegram (Рекомендуемый)
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Самый быстрый
                </span>
              </div>
              <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>Перейдите в нужную тему (ветку) <b>«Объявления магазинов»</b> в вашем чате с темами.</li>
                <li>Отправьте прямо внутри этой темы команду:</li>
              </ol>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {[
                  { cmd: '/set_shop_topic', desc: 'Привязать текущую тему' },
                  { cmd: '/shop_status', desc: 'Проверить статус и лимиты' },
                  { cmd: '/unset_shop_topic', desc: 'Отключить модерацию' }
                ].map(item => (
                  <button
                    key={item.cmd}
                    type="button"
                    onClick={() => handleCopyCommand(item.cmd)}
                    className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-mono text-emerald-300 transition-all cursor-pointer"
                    title={item.desc}
                  >
                    <span>{item.cmd}</span>
                    {copiedCmd === item.cmd ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">
                Бот автоматически определит <code className="text-slate-300">message_thread_id</code> текущей ветки и активирует коммерческую модерацию. Администраторы чата могут писать в теме без ограничений.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/90 border border-blue-500/25 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 uppercase tracking-wider">
                  <Link2 className="w-4 h-4" />
                  Способ 2: Через веб-панель управления
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20">
                  По ссылке на тему
                </span>
              </div>
              <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>Выберите сообщество в списке слева.</li>
                <li>Скопируйте ссылку на тему в Telegram (правый клик / долгое нажатие на заголовок темы → «Скопировать ссылку на тему»).</li>
                <li>
                  Вставьте ссылку (например, <code className="text-blue-300">https://t.me/c/1887901789/42</code> или <code className="text-blue-300">https://t.me/my_moto_chat/42</code>) — панель автоматически извлечёт числовой ID треда (<code className="text-blue-300">42</code>).
                </li>
                <li>Нажмите <b>«Сохранить привязку»</b> и добавьте разрешённых продавцов.</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace Grid: Left Chat Selector + Right Config & Vendors */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Connected Chats List */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col max-h-[750px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span>Сообщества ({filteredChatsList.length})</span>
            </h3>
            <button
              type="button"
              onClick={() => loadShopData()}
              className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors cursor-pointer"
              title="Обновить данные"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>

          <div className="relative mb-3">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={chatSearch}
              onChange={e => setChatSearch(e.target.value)}
              placeholder="Поиск чата..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            {filteredChatsList.map(chat => {
              const isSelected = String(chat.id) === String(selectedChatId);
              const cfg = topics.find(t => String(t.chatId) === String(chat.id));
              const isConfigured = Boolean(cfg && cfg.enabled && cfg.messageThreadId);
              const chatVendorsCount = vendors.filter(
                v => String(v.chatId) === String(chat.id) && v.active && (!v.expiresAt || new Date(v.expiresAt).getTime() > Date.now())
              ).length;

              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => {
                    setSelectedChatId(String(chat.id));
                    setShowAllChatsVendors(false);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-blue-600/15 border-blue-500/40 text-white shadow-sm'
                      : 'bg-slate-950/60 hover:bg-slate-800/70 border-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">{chat.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {isConfigured ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          Thread #{cfg?.messageThreadId}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">Тема не привязана</span>
                      )}
                      {chatVendorsCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25 font-semibold">
                          {chatVendorsCount} магаз.
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Topic Binding + Vendors Management */}
        <div className="lg:col-span-8 space-y-6">
          {/* 1. Topic Binding Card for Selected Chat */}
          {selectedChat && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                      Привязка темы форума
                    </span>
                    {currentTopicConfig?.messageThreadId && currentTopicConfig.enabled ? (
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        Активна (ID #{currentTopicConfig.messageThreadId})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-800 text-slate-400">
                        Не привязана
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    {selectedChat.title}
                  </h3>
                </div>

                {currentTopicConfig?.topicLink && (
                  <a
                    href={currentTopicConfig.topicLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-xs font-semibold text-blue-400 border border-slate-800 transition-colors"
                  >
                    <span>Открыть тему в Telegram</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              <form onSubmit={handleSaveTopicBinding} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-7">
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      Ссылка на тему в Telegram или числовой message_thread_id
                    </label>
                    <input
                      type="text"
                      value={topicLinkInput}
                      onChange={e => setTopicLinkInput(e.target.value)}
                      placeholder="https://t.me/c/1887901789/42 или 42"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono"
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[11px]">
                      {topicLinkInput.trim() ? (
                        extractedThreadIdPreview ? (
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Распознан message_thread_id: <code className="font-mono font-bold">{extractedThreadIdPreview}</code>
                          </span>
                        ) : (
                          <span className="text-rose-400 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Укажите корректную ссылку на тему (вида t.me/.../42) или число
                          </span>
                        )
                      ) : (
                        <span className="text-slate-500">
                          Или отправьте <code className="text-slate-300">/set_shop_topic</code> прямо в нужной теме в Telegram
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-5">
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      Название темы (для логов)
                    </label>
                    <input
                      type="text"
                      value={topicTitleInput}
                      onChange={e => setTopicTitleInput(e.target.value)}
                      placeholder="Объявления магазинов"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                {/* Customizable Warning Message on Delete */}
                <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={notifyInTopicOnDelete}
                        onChange={e => setNotifyInTopicOnDelete(e.target.checked)}
                        className="w-4 h-4 rounded accent-blue-500"
                      />
                      <span className="text-xs font-bold text-white">
                        Отправлять уведомление в тему при удалении сообщения не из списка одобренных
                      </span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Защита от спама + автоудаление
                    </span>
                  </div>

                  {notifyInTopicOnDelete && (
                    <div className="space-y-3.5 pt-1 border-t border-slate-800/80">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 mb-1">
                          Текст уведомления в теме (поддерживается HTML: &lt;b&gt;, &lt;i&gt;, &lt;a href="..."&gt;)
                        </label>
                        <textarea
                          rows={2}
                          value={deleteWarningText}
                          onChange={e => setDeleteWarningText(e.target.value)}
                          placeholder="⚠️ Внимание! В этой теме могут писать только одобренные продавцы..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">
                            Повторять не чаще чем через (сек.) — защита от спама
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={86400}
                              value={deleteWarningCooldownSec}
                              onChange={e => setDeleteWarningCooldownSec(Math.max(0, parseInt(e.target.value, 10) || 0))}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            />
                            <span className="text-[11px] text-slate-400 shrink-0">
                              {deleteWarningCooldownSec > 0 ? `(${Math.round(deleteWarningCooldownSec / 60 * 10) / 10} мин.)` : '(всегда)'}
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-300 mb-1">
                            Удалять уведомление бота через (сек., 0 = не удалять)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={86400}
                              value={deleteWarningAutoDeleteSec}
                              onChange={e => setDeleteWarningAutoDeleteSec(Math.max(0, parseInt(e.target.value, 10) || 0))}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            />
                            <span className="text-[11px] text-slate-400 shrink-0">
                              {deleteWarningAutoDeleteSec > 0 ? 'сек.' : 'не удалять'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Inline Buttons Builder */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-300">
                            Кнопки под сообщением (например, связь с администратором / покупка размещения)
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteWarningButtons(prev => [...prev, { text: 'Связаться с админом', url: 'https://t.me/' }])
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-blue-400 flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Добавить кнопку</span>
                          </button>
                        </div>

                        {deleteWarningButtons.length > 0 && (
                          <div className="space-y-2">
                            {deleteWarningButtons.map((btn, idx) => (
                              <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <input
                                  type="text"
                                  value={btn.text}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setDeleteWarningButtons(prev =>
                                      prev.map((item, i) => (i === idx ? { ...item, text: val } : item))
                                    );
                                  }}
                                  placeholder="Текст кнопки (например: Купить размещение)"
                                  className="sm:w-5/12 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                />
                                <input
                                  type="text"
                                  value={btn.url}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setDeleteWarningButtons(prev =>
                                      prev.map((item, i) => (i === idx ? { ...item, url: val } : item))
                                    );
                                  }}
                                  placeholder="Ссылка (например: https://t.me/username)"
                                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteWarningButtons(prev => prev.filter((_, i) => i !== idx))
                                  }
                                  className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 cursor-pointer self-end sm:self-auto"
                                  title="Удалить кнопку"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={topicEnabledInput}
                      onChange={e => setTopicEnabledInput(e.target.checked)}
                      className="w-4 h-4 rounded accent-emerald-500"
                    />
                    <span className="text-xs font-medium text-slate-300">
                      Включить автоматическую фильтрацию и удаление чужих сообщений в этой теме
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={isSavingTopic}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-900/30 cursor-pointer flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSavingTopic ? 'Сохранение...' : 'Сохранить настройки темы'}</span>
                  </button>
                </div>

                {topicFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                      topicFeedback.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {topicFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{topicFeedback.text}</span>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* 2. Authorized Vendors Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-400" />
                  <span>
                    Разрешённые продавцы{' '}
                    {showAllChatsVendors ? '(Все чаты)' : selectedChat ? `— ${selectedChat.title}` : ''}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Только эти пользователи (и администраторы чата) могут публиковать объявления в теме. Остальные сообщения удаляются ботом.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAllChatsVendors(!showAllChatsVendors)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    showAllChatsVendors
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {showAllChatsVendors ? 'Показать только выбранный чат' : 'Показать все чаты'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsAddVendorOpen(!isAddVendorOpen);
                    setVendorError(null);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Добавить продавца</span>
                </button>
              </div>
            </div>

            {/* Add Vendor Form */}
            {isAddVendorOpen && (
              <form
                onSubmit={handleAddVendor}
                className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Добавление магазина в чат «{selectedChat?.title || selectedChatId}»
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsAddVendorOpen(false)}
                    className="text-slate-500 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      @username или Telegram ID *
                    </label>
                    <input
                      type="text"
                      required
                      value={newUserIdentifier}
                      onChange={e => setNewUserIdentifier(e.target.value)}
                      placeholder="@moto_shop или 123456789"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Название магазина
                    </label>
                    <input
                      type="text"
                      value={newShopName}
                      onChange={e => setNewShopName(e.target.value)}
                      placeholder="Например: MotoParts Pro"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Лимит сообщений в неделю
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={newWeeklyLimit}
                      onChange={e => setNewWeeklyLimit(Math.max(1, parseInt(e.target.value, 10) || 5))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Срок размещения
                    </label>
                    <select
                      value={newDurationDays}
                      onChange={e => setNewDurationDays(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    >
                      <option value={7}>7 дней (1 неделя)</option>
                      <option value={14}>14 дней (2 недели)</option>
                      <option value={30}>30 дней (1 месяц — по умолч.)</option>
                      <option value={60}>60 дней (2 месяца)</option>
                      <option value={90}>90 дней (3 месяца)</option>
                      <option value={180}>180 дней (6 месяцев)</option>
                      <option value={365}>365 дней (1 год)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Контакты / примечание администратора
                    </label>
                    <input
                      type="text"
                      value={newContactInfo}
                      onChange={e => setNewContactInfo(e.target.value)}
                      placeholder="Телефон, ссылка на сайт или комментарий по оплате..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>

                  <div className="sm:col-span-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddVendorOpen(false)}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-semibold border border-slate-800 cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={isAddingVendor}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950/50 cursor-pointer"
                    >
                      {isAddingVendor ? 'Добавление...' : 'Сохранить продавца'}
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  💡 Если указан только <code className="text-slate-300">@username</code>, бот автоматически свяжет его с числовым Telegram ID при первой же публикации продавца в теме.
                </p>

                {vendorError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                    {vendorError}
                  </div>
                )}
              </form>
            )}

            {/* Filter & Search Bar */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={vendorSearch}
                  onChange={e => setVendorSearch(e.target.value)}
                  placeholder="Поиск по названию магазина, @username, Telegram ID или контактам..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            {/* Vendors List */}
            {displayedVendors.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/50 border border-slate-800/80 rounded-2xl">
                <Store className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-300">
                  В этом чате пока нет добавленных продавцов
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Нажмите «Добавить продавца», чтобы разрешить магазину публиковать объявления в теме с недельным лимитом.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedVendors.map(vendor => {
                  const { daysLeft, isExpired, label: daysLabel } = getVendorDaysInfo(vendor);
                  const isEffectiveActive = vendor.active && !isExpired;
                  const used = vendor.currentWeekMessages || 0;
                  const limit = vendor.weeklyLimit || 5;
                  const ratio = Math.min(100, Math.round((used / limit) * 100));
                  const isLimitReached = used >= limit;

                  return (
                    <div
                      key={vendor.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isEffectiveActive
                          ? 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                          : 'bg-slate-950/40 border-rose-500/20 opacity-80'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-white">{vendor.shopName}</span>

                            {vendor.username && (
                              <span className="px-2 py-0.5 text-xs font-mono rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/25">
                                @{vendor.username}
                              </span>
                            )}

                            {vendor.userId ? (
                              <span className="px-2 py-0.5 text-[11px] font-mono rounded-md bg-slate-900 text-slate-400 border border-slate-800">
                                ID: {vendor.userId}
                              </span>
                            ) : (
                              <span
                                className="px-2 py-0.5 text-[10px] rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/25"
                                title="Telegram ID привяжется автоматически при первом сообщении продавца в теме"
                              >
                                Ожидает 1-го поста для привязки ID
                              </span>
                            )}

                            {isEffectiveActive ? (
                              <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                Активен
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                {isExpired ? 'Срок истёк' : 'Отключён'}
                              </span>
                            )}

                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md ${
                                isExpired
                                  ? 'bg-rose-500/10 text-rose-300'
                                  : daysLeft <= 5
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                    : 'bg-slate-900 text-slate-300 border border-slate-800'
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              <span>{daysLabel}</span>
                              {vendor.expiresAt && (
                                <span className="text-slate-500">
                                  (до {new Date(vendor.expiresAt).toLocaleDateString('ru-RU')})
                                </span>
                              )}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                            {showAllChatsVendors && (
                              <span className="text-indigo-300 font-medium">
                                Чат: {vendor.chatTitle || vendor.chatId}
                              </span>
                            )}
                            {vendor.contactInfo && <span>Контакты: {vendor.contactInfo}</span>}
                            <span>Всего публикаций: {vendor.totalPostsCount || 0}</span>
                            {vendor.lastPostAt && (
                              <span>
                                Последний пост: {new Date(vendor.lastPostAt).toLocaleString('ru-RU')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Weekly Limit Progress & Controls */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                          <div className="min-w-[170px] bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span className="text-slate-400 font-medium">За неделю (с Пн):</span>
                              <span
                                className={`font-mono font-bold ${
                                  isLimitReached ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {used} / {limit}
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  isLimitReached
                                    ? 'bg-rose-500'
                                    : ratio >= 80
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                }`}
                                style={{ width: `${ratio}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleResetWeekCounter(vendor.id)}
                              className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                              title="Сбросить недельный счётчик сообщений (0 / лимит)"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                              <span className="hidden xl:inline">Сброс</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleExtendVendor(vendor.id, 30)}
                              className="px-2.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                              title="Продлить срок публикаций на +1 месяц (30 дней) и активировать"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              <span>+1 мес.</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditModal(vendor)}
                              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors cursor-pointer"
                              title="Редактировать продавца и лимит"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleVendorActive(vendor)}
                              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                                vendor.active
                                  ? 'bg-slate-900 hover:bg-amber-500/15 text-slate-400 hover:text-amber-300 border-slate-800'
                                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              }`}
                              title={vendor.active ? 'Приостановить продавца' : 'Включить продавца'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteVendor(vendor.id)}
                              className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors cursor-pointer"
                              title="Удалить продавца"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Approved Publications Log */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span>Журнал одобренных публикаций ({displayedPublications.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  История всех прошедших модерацию объявлений продавцов в коммерческих темах
                </p>
              </div>
            </div>

            {displayedPublications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/60">
                Публикаций от авторизованных магазинов пока не зафиксировано.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {displayedPublications.slice(0, 50).map(pub => (
                  <div
                    key={pub.id}
                    className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-emerald-400">{pub.shopName}</span>
                        <span className="text-slate-400">
                          ({pub.username ? `@${pub.username}` : pub.authorName})
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 font-mono text-[10px] border border-slate-800">
                          Лимит: {pub.weekCountAfter}/{pub.weeklyLimit}
                        </span>
                        <span className="text-slate-500 text-[11px]">• {pub.chatTitle}</span>
                      </div>
                      <p className="text-slate-300 truncate">{pub.textPreview}</p>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 shrink-0">
                      {new Date(pub.timestamp).toLocaleString('ru-RU')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Vendor Modal */}
      {editingVendor && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Редактирование продавца</h3>
              <button
                type="button"
                onClick={() => setEditingVendor(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVendorEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Название магазина
                </label>
                <input
                  type="text"
                  required
                  value={editShopName}
                  onChange={e => setEditShopName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  @username или Telegram ID
                </label>
                <input
                  type="text"
                  required
                  value={editUserIdentifier}
                  onChange={e => setEditUserIdentifier(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Лимит в неделю
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={editWeeklyLimit}
                    onChange={e => setEditWeeklyLimit(Math.max(1, parseInt(e.target.value, 10) || 5))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Действует до
                  </label>
                  <input
                    type="date"
                    value={editExpiresDate}
                    onChange={e => setEditExpiresDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Контакты / примечание
                </label>
                <input
                  type="text"
                  value={editContactInfo}
                  onChange={e => setEditContactInfo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingVendor(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
                >
                  {isSavingEdit ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

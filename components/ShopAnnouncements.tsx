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
  Hash,
  ShoppingBag,
  Sparkles,
  Tag,
  Sliders,
  ShieldAlert,
  AlertTriangle,
  Ban
} from 'lucide-react';
import {
  Chat,
  ShopTopicConfig,
  ShopVendor,
  ShopPublicationLog,
  BuySellTopicConfig,
  BuySellGlobalConfig,
  BuySellCommercialAlert,
  TrackedBuySellSeller,
  DEFAULT_COMMERCIAL_MARKERS
} from '../types';

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
  const [isSavingTopic, setIsSavingTopic] = useState<boolean>(false);
  const [topicFeedback, setTopicFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Global Warning Settings for ALL chats at once
  const [globalNotifyInTopic, setGlobalNotifyInTopic] = useState<boolean>(true);
  const [globalWarningText, setGlobalWarningText] = useState<string>(
    '⚠️ <b>Внимание!</b> В этой теме публиковать объявления могут только одобренные магазины и продавцы.'
  );
  const [globalWarningButtons, setGlobalWarningButtons] = useState<Array<{ text: string; url: string }>>([]);
  const [globalWarningCooldownSec, setGlobalWarningCooldownSec] = useState<number>(300);
  const [globalWarningAutoDeleteSec, setGlobalWarningAutoDeleteSec] = useState<number>(60);
  const [isSavingGlobalWarning, setIsSavingGlobalWarning] = useState<boolean>(false);
  const [globalWarningFeedback, setGlobalWarningFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isGlobalWarningCardOpen, setIsGlobalWarningCardOpen] = useState<boolean>(true);

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

  // Active sub-tab switcher: Approved Shop Topics vs Buy/Sell Topics
  const [activeSubTab, setActiveSubTab] = useState<'SHOPS' | 'BUY_SELL'>('SHOPS');

  // Buy/Sell Topic state
  const [buySellTopics, setBuySellTopics] = useState<BuySellTopicConfig[]>([]);
  const [buySellAlerts, setBuySellAlerts] = useState<BuySellCommercialAlert[]>([]);
  const [buySellTopicLinkInput, setBuySellTopicLinkInput] = useState<string>('');
  const [buySellTopicTitleInput, setBuySellTopicTitleInput] = useState<string>('Купи / Продай');
  const [buySellTopicEnabledInput, setBuySellTopicEnabledInput] = useState<boolean>(true);
  const [isSavingBuySellTopic, setIsSavingBuySellTopic] = useState<boolean>(false);
  const [buySellTopicFeedback, setBuySellTopicFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Buy/Sell Global Settings & Marker Words
  const [globalBuySellEnabled, setGlobalBuySellEnabled] = useState<boolean>(true);
  const [globalBuySellMinConfidence, setGlobalBuySellMinConfidence] = useState<number>(70);
  const [globalMarkerWords, setGlobalMarkerWords] = useState<string[]>([...DEFAULT_COMMERCIAL_MARKERS]);
  const [newMarkerWordInput, setNewMarkerWordInput] = useState<string>('');
  const [isSavingGlobalBuySell, setIsSavingGlobalBuySell] = useState<boolean>(false);
  const [globalBuySellFeedback, setGlobalBuySellFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED'>('ALL');

  // Tracked Sellers in Buy/Sell Topics
  const [trackedSellers, setTrackedSellers] = useState<TrackedBuySellSeller[]>([]);
  const [newSellerIdentifier, setNewSellerIdentifier] = useState<string>('');
  const [newSellerNote, setNewSellerNote] = useState<string>('');
  const [isAddingTrackedSeller, setIsAddingTrackedSeller] = useState<boolean>(false);
  const [trackedSellerFeedback, setTrackedSellerFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
        if (data.globalWarningConfig) {
          setGlobalNotifyInTopic(data.globalWarningConfig.notifyInTopicOnDelete !== false);
          if (data.globalWarningConfig.deleteWarningText) {
            setGlobalWarningText(data.globalWarningConfig.deleteWarningText);
          }
          if (Array.isArray(data.globalWarningConfig.deleteWarningButtons)) {
            setGlobalWarningButtons(data.globalWarningConfig.deleteWarningButtons);
          }
          if (data.globalWarningConfig.deleteWarningCooldownSec !== undefined) {
            setGlobalWarningCooldownSec(Number(data.globalWarningConfig.deleteWarningCooldownSec));
          }
          if (data.globalWarningConfig.deleteWarningAutoDeleteSec !== undefined) {
            setGlobalWarningAutoDeleteSec(Number(data.globalWarningConfig.deleteWarningAutoDeleteSec));
          }
        }
        if (Array.isArray(data.buySellTopics)) {
          setBuySellTopics(data.buySellTopics);
        }
        if (data.buySellGlobalConfig) {
          setGlobalBuySellEnabled(data.buySellGlobalConfig.enabled !== false);
          setGlobalBuySellMinConfidence(data.buySellGlobalConfig.minConfidence ?? 70);
          if (Array.isArray(data.buySellGlobalConfig.markerWords)) {
            setGlobalMarkerWords(data.buySellGlobalConfig.markerWords);
          }
        }
        if (Array.isArray(data.buySellAlerts)) {
          setBuySellAlerts(data.buySellAlerts);
        }
        if (Array.isArray(data.trackedSellers)) {
          setTrackedSellers(data.trackedSellers);
        } else if (Array.isArray(data.buySellGlobalConfig?.trackedSellers)) {
          setTrackedSellers(data.buySellGlobalConfig.trackedSellers);
        }
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

  // Sync per-chat form fields when selectedChatId or topics change
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
    } else {
      setTopicLinkInput('');
      setTopicTitleInput('Объявления магазинов');
      setTopicEnabledInput(true);
    }
    setTopicFeedback(null);
  }, [selectedChatId, topics]);

  // Sync per-chat Buy/Sell fields
  useEffect(() => {
    if (!selectedChatId) return;
    const currentConfig = buySellTopics.find(t => String(t.chatId) === String(selectedChatId));
    if (currentConfig) {
      setBuySellTopicLinkInput(
        currentConfig.topicLink ||
          (currentConfig.messageThreadId ? String(currentConfig.messageThreadId) : '')
      );
      setBuySellTopicTitleInput(currentConfig.topicTitle || 'Купи / Продай');
      setBuySellTopicEnabledInput(currentConfig.enabled !== false);
    } else {
      setBuySellTopicLinkInput('');
      setBuySellTopicTitleInput('Купи / Продай');
      setBuySellTopicEnabledInput(true);
    }
    setBuySellTopicFeedback(null);
  }, [selectedChatId, buySellTopics]);

  const currentBuySellTopicConfig = useMemo(
    () => buySellTopics.find(t => String(t.chatId) === String(selectedChatId)),
    [buySellTopics, selectedChatId]
  );

  const extractedBuySellThreadIdPreview = useMemo(
    () => extractThreadIdFromInput(buySellTopicLinkInput),
    [buySellTopicLinkInput]
  );

  const handleSaveBuySellTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChatId) return;

    setIsSavingBuySellTopic(true);
    setBuySellTopicFeedback(null);
    try {
      const res = await authenticatedFetch('/api/buy-sell-topics/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: selectedChatId,
          topicLinkOrId: buySellTopicLinkInput.trim(),
          topicTitle: buySellTopicTitleInput.trim() || 'Купи / Продай',
          enabled: buySellTopicEnabledInput
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBuySellTopicFeedback({
          type: 'success',
          text: `Топик «${data.config.topicTitle}» успешно привязан!`
        });
        await loadShopData(true);
      } else {
        setBuySellTopicFeedback({
          type: 'error',
          text: data.error || 'Ошибка при сохранении привязки'
        });
      }
    } catch (err: any) {
      setBuySellTopicFeedback({
        type: 'error',
        text: err.message || 'Ошибка сети'
      });
    } finally {
      setIsSavingBuySellTopic(false);
    }
  };

  const handleDeleteBuySellTopic = async (chatIdToDelete: string) => {
    if (!window.confirm('Отвязать топик «Купи / Продай» для этого чата?')) return;
    try {
      const res = await authenticatedFetch(`/api/buy-sell-topics/config/${chatIdToDelete}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await loadShopData(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveGlobalBuySell = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGlobalBuySell(true);
    setGlobalBuySellFeedback(null);
    try {
      const res = await authenticatedFetch('/api/buy-sell-topics/global-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: globalBuySellEnabled,
          minConfidence: globalBuySellMinConfidence,
          markerWords: globalMarkerWords
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGlobalBuySellFeedback({
          type: 'success',
          text: 'Общие настройки и маркерные слова успешно сохранены!'
        });
        await loadShopData(true);
      } else {
        setGlobalBuySellFeedback({
          type: 'error',
          text: data.error || 'Ошибка сохранения'
        });
      }
    } catch (err: any) {
      setGlobalBuySellFeedback({
        type: 'error',
        text: err.message || 'Ошибка сети'
      });
    } finally {
      setIsSavingGlobalBuySell(false);
    }
  };

  const handleAddMarkerWord = () => {
    const raw = newMarkerWordInput.trim().toLowerCase();
    if (!raw) return;
    const wordsToAdd = raw.split(/[,;\n]+/).map(w => w.trim()).filter(Boolean);
    const updated = Array.from(new Set([...globalMarkerWords, ...wordsToAdd]));
    setGlobalMarkerWords(updated);
    setNewMarkerWordInput('');
  };

  const handleRemoveMarkerWord = (wordToRemove: string) => {
    setGlobalMarkerWords(prev => prev.filter(w => w !== wordToRemove));
  };

  const handleResetDefaultMarkers = () => {
    if (window.confirm('Восстановить рекомендуемый список маркерных слов по умолчанию?')) {
      setGlobalMarkerWords([...DEFAULT_COMMERCIAL_MARKERS]);
    }
  };

  const handleAlertAction = async (alertId: string, action: 'delete' | 'warn' | 'ban' | 'dismiss') => {
    setResolvingAlertId(alertId);
    try {
      const res = await authenticatedFetch(`/api/buy-sell-topics/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        await loadShopData(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setResolvingAlertId(null);
    }
  };

  const handleAddTrackedSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSellerIdentifier.trim()) return;
    setIsAddingTrackedSeller(true);
    setTrackedSellerFeedback(null);
    try {
      const res = await authenticatedFetch('/api/buy-sell-topics/tracked-sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIdentifier: newSellerIdentifier.trim(),
          note: newSellerNote.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTrackedSellers(Array.isArray(data.trackedSellers) ? data.trackedSellers : [...trackedSellers, data.seller]);
        setNewSellerIdentifier('');
        setNewSellerNote('');
        setTrackedSellerFeedback({ type: 'success', text: 'Продавец успешно добавлен в список отслеживания!' });
        setTimeout(() => setTrackedSellerFeedback(null), 3000);
      } else {
        setTrackedSellerFeedback({ type: 'error', text: data.error || 'Ошибка добавления продавца' });
      }
    } catch (err: any) {
      setTrackedSellerFeedback({ type: 'error', text: err.message || 'Ошибка сети' });
    } finally {
      setIsAddingTrackedSeller(false);
    }
  };

  const handleToggleTrackedSeller = async (seller: TrackedBuySellSeller) => {
    try {
      const res = await authenticatedFetch(`/api/buy-sell-topics/tracked-sellers/${seller.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !seller.active })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.trackedSellers)) setTrackedSellers(data.trackedSellers);
        else {
          setTrackedSellers(prev => prev.map(s => s.id === seller.id ? { ...s, active: !s.active } : s));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTrackedSeller = async (sellerId: string) => {
    if (!window.confirm('Удалить этого продавца из списка отслеживания?')) return;
    try {
      const res = await authenticatedFetch(`/api/buy-sell-topics/tracked-sellers/${sellerId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.trackedSellers)) setTrackedSellers(data.trackedSellers);
        else {
          setTrackedSellers(prev => prev.filter(s => s.id !== sellerId));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

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

  const handleSaveGlobalWarning = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGlobalWarning(true);
    setGlobalWarningFeedback(null);
    try {
      const res = await authenticatedFetch('/api/shop-topics/global-warning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifyInTopicOnDelete: globalNotifyInTopic,
          deleteWarningText: globalWarningText,
          deleteWarningButtons: globalWarningButtons,
          deleteWarningCooldownSec: globalWarningCooldownSec,
          deleteWarningAutoDeleteSec: globalWarningAutoDeleteSec
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGlobalWarningFeedback({
          type: 'success',
          text: 'Единые настройки уведомления сохранены и успешно применены ко всем чатам!'
        });
        await loadShopData(true);
      } else {
        setGlobalWarningFeedback({
          type: 'error',
          text: data.error || 'Ошибка при сохранении единых настроек'
        });
      }
    } catch (err: any) {
      setGlobalWarningFeedback({
        type: 'error',
        text: err.message || 'Ошибка сети при обращении к серверу'
      });
    } finally {
      setIsSavingGlobalWarning(false);
    }
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
          enabled: topicEnabledInput
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

        {/* Sub-tab navigation */}
        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSubTab('SHOPS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'SHOPS'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>🏪 Объявления магазинов ({totalConfiguredTopics})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('BUY_SELL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'BUY_SELL'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>🏷️ Топики «Купи / Продай» (ИИ-контроль) ({buySellTopics.length})</span>
            {buySellAlerts.filter(a => a.status === 'PENDING').length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                {buySellAlerts.filter(a => a.status === 'PENDING').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeSubTab === 'SHOPS' && (
        <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Единые настройки уведомления при удалении
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Для всех чатов сразу
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Настройте текст предупреждения, кнопки связи с админом и антиспам один раз — они автоматически действуют во всех темах «Объявления магазинов».
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsGlobalWarningCardOpen(!isGlobalWarningCardOpen)}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer self-start sm:self-auto"
            title={isGlobalWarningCardOpen ? 'Свернуть' : 'Развернуть'}
          >
            {isGlobalWarningCardOpen ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>

        {isGlobalWarningCardOpen && (
          <form onSubmit={handleSaveGlobalWarning} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={globalNotifyInTopic}
                  onChange={e => setGlobalNotifyInTopic(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-500"
                />
                <span className="text-xs font-bold text-white">
                  Отправлять уведомление в тему при удалении сообщения не из списка одобренных
                </span>
              </label>
              <span className="text-[11px] text-slate-400">
                Защита от спама + автоудаление бота
              </span>
            </div>

            {globalNotifyInTopic && (
              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Текст предупреждения в чате (поддерживается HTML: &lt;b&gt;, &lt;i&gt;, &lt;a href="..."&gt;)
                  </label>
                  <textarea
                    rows={3}
                    value={globalWarningText}
                    onChange={e => setGlobalWarningText(e.target.value)}
                    placeholder="⚠️ Внимание! В этой теме могут писать только одобренные магазины и продавцы..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Повторять не чаще чем через (сек.) — защита от спама
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Если несколько нарушителей пишут подряд, бот не будет забивать тему повторными уведомлениями.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={86400}
                        value={globalWarningCooldownSec}
                        onChange={e => setGlobalWarningCooldownSec(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                      <span className="text-xs text-slate-400 shrink-0 font-medium">
                        {globalWarningCooldownSec > 0 ? `(${Math.round(globalWarningCooldownSec / 60 * 10) / 10} мин.)` : '(всегда)'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Удалять уведомление бота через (сек., 0 = не удалять)
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Бот автоматически сотрет свое предупреждение через указанное время, чтобы тема оставалась чистой.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={86400}
                        value={globalWarningAutoDeleteSec}
                        onChange={e => setGlobalWarningAutoDeleteSec(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                      <span className="text-xs text-slate-400 shrink-0 font-medium">
                        {globalWarningAutoDeleteSec > 0 ? `${globalWarningAutoDeleteSec} сек.` : 'не удалять'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inline Buttons Builder */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-slate-300 block">
                        Кнопки под сообщением (для всех чатов)
                      </label>
                      <span className="text-[11px] text-slate-400">
                        Например, ссылка на связь с администратором или покупку размещения
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setGlobalWarningButtons(prev => [...prev, { text: 'Связаться с админом', url: 'https://t.me/' }])
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Добавить кнопку</span>
                    </button>
                  </div>

                  {globalWarningButtons.length > 0 ? (
                    <div className="space-y-2 pt-1">
                      {globalWarningButtons.map((btn, idx) => (
                        <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            value={btn.text}
                            onChange={e => {
                              const val = e.target.value;
                              setGlobalWarningButtons(prev =>
                                prev.map((item, i) => (i === idx ? { ...item, text: val } : item))
                              );
                            }}
                            placeholder="Текст кнопки (например: Купить размещение)"
                            className="sm:w-5/12 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                          <input
                            type="text"
                            value={btn.url}
                            onChange={e => {
                              const val = e.target.value;
                              setGlobalWarningButtons(prev =>
                                prev.map((item, i) => (i === idx ? { ...item, url: val } : item))
                              );
                            }}
                            placeholder="Ссылка (например: https://t.me/username)"
                            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setGlobalWarningButtons(prev => prev.filter((_, i) => i !== idx))
                            }
                            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 cursor-pointer self-end sm:self-auto transition-colors"
                            title="Удалить кнопку"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">
                      Кнопки не добавлены. Нажмите «Добавить кнопку», чтобы прикрепить ссылку на Telegram или сайт.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="text-xs text-slate-400">
                Сохранение сразу обновит правила уведомления во всех подключенных темах магазинов.
              </span>
              <button
                type="submit"
                disabled={isSavingGlobalWarning}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-amber-900/30 cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSavingGlobalWarning ? 'Сохранение...' : 'Сохранить для всех чатов'}</span>
              </button>
            </div>

            {globalWarningFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  globalWarningFeedback.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                }`}
              >
                {globalWarningFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{globalWarningFeedback.text}</span>
              </div>
            )}
          </form>
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

                {/* Unified Warning Message Notice */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        Единые настройки предупреждения в чате
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
                        Общие для всех чатов
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Текст предупреждения, кнопки связи с админом, защита от флуда ({globalWarningCooldownSec} сек.) и тайм-аут автоудаления ({globalWarningAutoDeleteSec} сек.) настроены единым блоком вверху страницы и автоматически действуют для этой темы.
                    </p>
                  </div>
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
    </div>
  )}

      {/* Buy / Sell Topics (Купи / Продай) AI Moderation Section */}
      {activeSubTab === 'BUY_SELL' && (
        <div className="space-y-6">
          {/* Global AI & Marker Words Settings Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>ИИ-анализ постов «Купи / Продай» и маркерные слова</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Gemini Flash
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Автоматическая классификация объявлений обычных пользователей: выявление коммерции, скрытых магазинов и оптовиков
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetDefaultMarkers}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                  title="Восстановить рекомендуемый список маркеров по умолчанию"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить маркеры</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveGlobalBuySell} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Enable AI Check Toggle */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-indigo-400" />
                        <span>Автоматический анализ объявлений</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        При публикации в привязанном топике нейросеть оценивает характер сообщения
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={globalBuySellEnabled}
                        onChange={e => setGlobalBuySellEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                </div>

                {/* Confidence Slider */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      <span>Порог уверенности ИИ для уведомления</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/30">
                      {globalBuySellMinConfidence}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={95}
                    step={5}
                    value={globalBuySellMinConfidence}
                    onChange={e => setGlobalBuySellMinConfidence(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>Чувствительный (30%)</span>
                    <span>Рекомендуемый (70%)</span>
                    <span>Строгий (95%)</span>
                  </div>
                </div>
              </div>

              {/* Marker Words Editor */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-emerald-400" />
                      <span>Список маркерных слов и фраз ({globalMarkerWords.length})</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Слова-триггеры, которые придают больший вес мнению ИИ о том, что объявление носит коммерческий характер
                    </p>
                  </div>
                </div>

                {/* Add new marker word form */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMarkerWordInput}
                    onChange={e => setNewMarkerWordInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMarkerWord();
                      }
                    }}
                    placeholder="Введите маркерное слово (например: оптом, гарантия, под заказ)..."
                    className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddMarkerWord}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Добавить</span>
                  </button>
                </div>

                {/* Chips of marker words */}
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  {globalMarkerWords.map((word, idx) => (
                    <span
                      key={`${word}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-700/50 text-indigo-200 text-xs font-mono"
                    >
                      <span>{word}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMarkerWord(word)}
                        className="text-indigo-400 hover:text-white cursor-pointer transition-colors"
                        title="Удалить маркер"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {globalMarkerWords.length === 0 && (
                    <span className="text-xs text-slate-500 italic p-1">
                      Маркерные слова не заданы. Нажмите «Сбросить маркеры» для загрузки рекомендуемого списка.
                    </span>
                  )}
                </div>
              </div>

              {globalBuySellFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    globalBuySellFeedback.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {globalBuySellFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{globalBuySellFeedback.text}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSavingGlobalBuySell}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-950/30 transition-all disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingGlobalBuySell ? 'Сохранение...' : 'Сохранить настройки анализа'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Topic Binding & Active Chats Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Chat Selector */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-indigo-400" />
                  <span>Чаты для привязки ({chats.length})</span>
                </h3>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Поиск по чатам..."
                  value={chatSearch}
                  onChange={e => setChatSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                {filteredChatsList.map(chat => {
                  const isSelected = String(chat.id) === String(selectedChatId);
                  const boundTopic = buySellTopics.find(t => String(t.chatId) === String(chat.id));
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => setSelectedChatId(String(chat.id))}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600/15 border-indigo-500/50 text-white'
                          : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{chat.title || `Чат ${chat.id}`}</div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">{chat.id}</div>
                      </div>
                      {boundTopic ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                          Привязан (#{boundTopic.messageThreadId || '?'})
                        </span>
                      ) : (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-500 text-[10px]">
                          Нет
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Configure Topic for Selected Chat */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-indigo-400" />
                    <span>Привязка топика «Купи / Продай»</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Чат: <span className="text-white font-semibold">{selectedChat?.title || selectedChatId || 'не выбран'}</span>
                  </p>
                </div>
                {currentBuySellTopicConfig && (
                  <button
                    type="button"
                    onClick={() => selectedChatId && handleDeleteBuySellTopic(selectedChatId)}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Отвязать топик</span>
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveBuySellTopic} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Ссылка на тему в Telegram или числовой ID треда (message_thread_id)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="https://t.me/c/1234567890/42 или число 42"
                      value={buySellTopicLinkInput}
                      onChange={e => setBuySellTopicLinkInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                    {extractedBuySellThreadIdPreview && (
                      <div className="absolute right-3 top-2.5">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono text-[11px] font-bold">
                          ✓ Тред ID: #{extractedBuySellThreadIdPreview}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Вставьте ссылку на топик в Telegram (правый клик по теме → «Скопировать ссылку на тему») или введите ID вручную.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Название ветки в системе
                    </label>
                    <input
                      type="text"
                      value={buySellTopicTitleInput}
                      onChange={e => setBuySellTopicTitleInput(e.target.value)}
                      placeholder="Купи / Продай"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Статус модерации
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={buySellTopicEnabledInput}
                        onChange={e => setBuySellTopicEnabledInput(e.target.checked)}
                        className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                      />
                      <span className="text-xs text-slate-300 font-medium">Активна (проверять посты)</span>
                    </label>
                  </div>
                </div>

                {buySellTopicFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      buySellTopicFeedback.type === 'success'
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {buySellTopicFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{buySellTopicFeedback.text}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isSavingBuySellTopic || !selectedChatId}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-950/30 transition-all disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingBuySellTopic ? 'Сохранение...' : 'Сохранить привязку топика'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Tracked Sellers Card: Известные продавцы для персонального контроля */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Отслеживаемые продавцы в топиках «Купи / Продай»</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                      {trackedSellers.length}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Если любой из этих пользователей опубликует объявление в теме «Купи / Продай», бот мгновенно уведомит вас в личные сообщения Telegram с прямой ссылкой на пост.
                  </p>
                </div>
              </div>
            </div>

            {/* Add seller form */}
            <form onSubmit={handleAddTrackedSeller} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-purple-400" />
                <span>Добавить продавца для отслеживания</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    required
                    placeholder="@username или числовой Telegram ID"
                    value={newSellerIdentifier}
                    onChange={e => setNewSellerIdentifier(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    placeholder="Заметка (например: Продавец экипа, перекуп запчастей, разборка)"
                    value={newSellerNote}
                    onChange={e => setNewSellerNote(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={isAddingTrackedSeller || !newSellerIdentifier.trim()}
                    className="w-full h-full min-h-[36px] px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-purple-950/30 transition-all disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddingTrackedSeller ? '...' : 'Добавить'}</span>
                  </button>
                </div>
              </div>

              {trackedSellerFeedback && (
                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                    trackedSellerFeedback.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {trackedSellerFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{trackedSellerFeedback.text}</span>
                </div>
              )}
            </form>

            {/* List of tracked sellers */}
            {trackedSellers.length === 0 ? (
              <div className="text-center py-6 px-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-slate-500 text-xs">
                Список отслеживаемых продавцов пуст. Добавьте @username или Telegram ID продавца выше.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                {trackedSellers.map(seller => (
                  <div
                    key={seller.id}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      seller.active
                        ? 'bg-slate-950/80 border-purple-500/30'
                        : 'bg-slate-950/40 border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white truncate">
                          {seller.userIdentifier.startsWith('@') || /^\d+$/.test(seller.userIdentifier) ? seller.userIdentifier : `@${seller.userIdentifier}`}
                        </span>
                        {seller.userId && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            (ID: {seller.userId})
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            seller.active
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {seller.active ? 'Активен' : 'Отключен'}
                        </span>
                      </div>
                      {seller.note && (
                        <p className="text-[11px] text-purple-300/90 truncate mt-0.5">
                          {seller.note}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                        <span>Срабатываний: <b className="text-slate-300 font-mono">{seller.totalAlertsTriggered || 0}</b></span>
                        {seller.lastAlertAt && (
                          <span>Посл. сигнал: {new Date(seller.lastAlertAt).toLocaleDateString('ru-RU')}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleTrackedSeller(seller)}
                        className={`p-1.5 rounded-lg border cursor-pointer transition-all ${
                          seller.active
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                        title={seller.active ? 'Приостановить отслеживание' : 'Включить отслеживание'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTrackedSeller(seller.id)}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 cursor-pointer transition-all"
                        title="Удалить продавца"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Commercial Alerts Journal */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Оповещения о коммерческих объявлениях</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 font-mono">
                      {buySellAlerts.length}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Посты из веток «Купи / Продай», классифицированные нейросетью как коммерция. Уведомление с кнопками также дублируется в ЛС администратору.
                  </p>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setAlertFilter('ALL')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    alertFilter === 'ALL'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Все ({buySellAlerts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAlertFilter('PENDING')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    alertFilter === 'PENDING'
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Ожидают ({buySellAlerts.filter(a => a.status === 'PENDING').length})
                </button>
                <button
                  type="button"
                  onClick={() => setAlertFilter('RESOLVED')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                    alertFilter === 'RESOLVED'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Обработаны ({buySellAlerts.filter(a => a.status !== 'PENDING').length})
                </button>
              </div>
            </div>

            {/* Alerts List */}
            {buySellAlerts.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <Sparkles className="w-8 h-8 text-indigo-400/50 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-300">
                  Коммерческих объявлений пока не зафиксировано
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Как только пользователь опубликует объявление с признаками магазина или оптовой торговли в привязанном топике «Купи / Продай», бот пришлёт уведомление в личные сообщения и сохранит карточку здесь.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {buySellAlerts
                  .filter(a => {
                    if (alertFilter === 'PENDING') return a.status === 'PENDING';
                    if (alertFilter === 'RESOLVED') return a.status !== 'PENDING';
                    return true;
                  })
                  .slice(0, 50)
                  .map(alert => {
                    const isPending = alert.status === 'PENDING';
                    const isResolving = resolvingAlertId === alert.id;
                    const confidenceColor =
                      alert.confidence >= 80
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : alert.confidence >= 60
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';

                    return (
                      <div
                        key={alert.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isPending
                            ? 'bg-slate-950/90 border-amber-500/30'
                            : 'bg-slate-950/50 border-slate-800/80 opacity-80'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                          <div className="space-y-2 flex-1 min-w-0">
                            {/* Author & Meta */}
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-bold text-white">
                                {alert.authorName || 'Пользователь'}
                              </span>
                              {alert.username && (
                                <span className="text-indigo-400 font-mono">
                                  @{alert.username}
                                </span>
                              )}
                              <span className="text-slate-500 font-mono text-[11px]">
                                (ID: {alert.userId})
                              </span>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-400 font-medium">
                                {alert.chatTitle}
                              </span>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-500 text-[11px]">
                                {new Date(alert.timestamp).toLocaleString('ru-RU')}
                              </span>
                               {alert.isKnownSeller ? (
                                <span className="px-2 py-0.5 rounded-full font-mono font-bold text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                                  <UserCheck className="w-3 h-3" />
                                  <span>Отслеживаемый продавец</span>
                                  {alert.sellerNote && <span className="text-purple-200">({alert.sellerNote})</span>}
                                </span>
                              ) : (
                                <span className={`px-2 py-0.5 rounded-full font-mono font-bold text-[10px] border ${confidenceColor}`}>
                                  {alert.confidence}% коммерция
                                </span>
                              )}
                              {(alert.status === 'DELETED' || alert.status === 'RESOLVED_DELETED') && (
                                <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                                  Удалено
                                </span>
                              )}
                              {(alert.status === 'WARNED' || alert.status === 'RESOLVED_WARNED') && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                                  Варн выдан
                                </span>
                              )}
                              {(alert.status === 'BANNED' || alert.status === 'RESOLVED_BANNED') && (
                                <span className="px-2 py-0.5 rounded-full bg-red-600/20 text-red-300 border border-red-500/40 text-[10px] font-bold">
                                  Забанен
                                </span>
                              )}
                              {alert.status === 'DISMISSED' && (
                                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold">
                                  Отклонено (частное)
                                </span>
                              )}
                            </div>

                            {/* Matched Markers */}
                            {Array.isArray(alert.matchedMarkers) && alert.matchedMarkers.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-[11px] text-slate-500 font-medium">Маркеры:</span>
                                {alert.matchedMarkers.map((m, mIdx) => (
                                  <span
                                    key={mIdx}
                                    className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-mono"
                                  >
                                    «{m}»
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* AI Reason */}
                            {alert.reason && (
                              <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-900/40 text-xs text-indigo-200/90 flex items-start gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold text-indigo-300">Обоснование ИИ: </span>
                                  <span>{alert.reason}</span>
                                </div>
                              </div>
                            )}

                            {/* Message Preview Quote */}
                            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                              {alert.messageText || alert.textSnippet || '(Текст сообщения отсутствует)'}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-wrap lg:flex-col items-stretch gap-2 shrink-0 pt-2 lg:pt-0">
                            {(alert.messageUrl || alert.messageLink) && (
                              <a
                                href={alert.messageUrl || alert.messageLink}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>В Telegram</span>
                              </a>
                            )}
                            {isPending && (
                              <>
                                <button
                                  type="button"
                                  disabled={isResolving}
                                  onClick={() => handleAlertAction(alert.id, 'delete')}
                                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                                  title="Удалить сообщение из чата"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Удалить пост</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isResolving}
                                  onClick={() => handleAlertAction(alert.id, 'warn')}
                                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                                  title="Удалить сообщение и выдать предупреждение"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>Варн</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isResolving}
                                  onClick={() => handleAlertAction(alert.id, 'ban')}
                                  className="px-3 py-1.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                                  title="Забанить пользователя и удалить пост"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Бан</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isResolving}
                                  onClick={() => handleAlertAction(alert.id, 'dismiss')}
                                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                                  title="Считать объявление частным"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Частное</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

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

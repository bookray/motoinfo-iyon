export interface Chat {
  id: string;
  title: string;
  members: number;
  muteNewcomers?: boolean;
  muteDurationHours?: number;
  muteDurationMinutes?: number;
  muteMessage?: string;
  autoApprove?: boolean;
  captchaEnabled?: boolean;
  captchaType?: 'math' | 'emoji' | 'button' | 'custom' | 'random';
  captchaQuestion?: string;
  captchaAnswer?: string;
  blockLinks?: boolean;
  blockTelegramLinks?: boolean;
  blockMedia?: boolean;
  blockForwards?: boolean;
  forbiddenWords?: string[];
  msgCount: number;
  avatarUrl: string;
  active: boolean;
  deleteSystemMessages?: boolean;
  deleteCommands?: boolean;
  userVoteEnabled?: boolean;
  userVotePercentage?: number;
  userVoteMin?: number;
  userVoteMax?: number;
  userVoteDuration?: number;
  notifyMultiChat?: boolean;
  multiChatThreshold?: number;
  requireChannelSubscription?: boolean;
  channelSubscriptionTarget?: string;
  channelSubscriptionMessage?: string;
  tagAdminsEnabled?: boolean;
  tagAdminsMessage?: string;
}

export interface ScheduledMessage {
  id: string;
  text: string;
  chatIds: string[];
  intervalDays: number;
  time: string;
  active: boolean;
  lastRun?: string;
  imageUrl?: string;
  buttons?: { text: string; url: string }[];
  pin?: boolean;
  deleteAfterDays?: number;
  deleteAfterHours?: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'JOIN' | 'LEAVE' | 'BAN' | 'KICK' | 'WARN' | 'MUTE' | 'SYSTEM' | 'BROADCAST' | 'SETTINGS' | 'AUTH' | 'CHAT_UPDATE' | 'TASK';
  user: string;
  chat: string;
  details: string;
}

export interface GlobalBan {
  id: string;
  userId: string; // Can be ID or @username
  reason: string;
  date: string;
}

export interface WhitelistEntry {
  id: string;
  userId: string; // Can be ID or @username
  addedAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  chatId: string;
  joinedAt: string;
  lastSeen?: string;
  msgCount?: number;
  isAdmin?: boolean;
}

export interface MultiChatUser {
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  chatIds: string[];
  chatCount: number;
}

export interface FilterSettings {
  blockLinks: boolean;
  blockTelegramLinks: boolean;
  blockMedia: boolean;
  blockForwards: boolean;
  forbiddenWords: string[];
  autoApprove: boolean;
  captchaEnabled: boolean;
  captchaType?: 'math' | 'emoji' | 'button' | 'custom' | 'random';
  captchaQuestion: string;
  captchaAnswer: string;
  muteNewcomers: boolean;
  muteDurationHours: number;
  muteDurationMinutes?: number;
  muteMessage: string;
  deleteSystemMessages: boolean;
  deleteCommands: boolean;
  userVoteEnabled: boolean;
  userVotePercentage: number;
  userVoteMin: number;
  userVoteMax: number;
  userVoteDuration: number;
  notifyMultiChat: boolean;
  multiChatThreshold: number;
  warnLimit: number;
  warnAction?: 'BAN' | 'MUTE';
  reputationEnabled?: boolean;
  requireChannelSubscription?: boolean;
  channelSubscriptionTarget?: string;
  channelSubscriptionMessage?: string;
  tagAdminsEnabled?: boolean;
  tagAdminsMessage?: string;
}

export interface ActiveMuteEntry {
  id: string; // `${chatId}_${userId}`
  userId: string;
  chatId: string;
  userMention?: string;
  userName?: string;
  mutedAt: string;
  unmuteAt: number; // Unix timestamp in ms
  durationHours: number;
  reason: 'newcomer' | 'channel_subscription_refusal' | 'channel_subscription_required' | 'command' | 'voting';
}

export interface ReputationHistoryItem {
  id: string;
  fromUserId: string;
  fromName: string;
  chatId: string;
  chatTitle: string;
  delta: number;
  reason: string;
  timestamp: string;
}

export interface ReputationEntry {
  id: string;
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  score: number;
  positiveCount: number;
  negativeCount: number;
  chatScores: { [chatId: string]: number };
  history?: ReputationHistoryItem[];
  updatedAt: string;
}

export interface WarningEntry {
  id: string;
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  chatId: string;
  chatTitle: string;
  reason: string;
  adminId: string;
  adminName: string;
  createdAt: string;
  active: boolean;
}

export interface UserWarnSummary {
  userId: string;
  username?: string;
  firstName?: string;
  activeWarns: number;
  totalWarns: number;
  chatWarns: { [chatId: string]: number };
  lastWarnAt?: string;
  lastWarnReason?: string;
  warnings: WarningEntry[];
}

export const DatabaseType = {
  FIREBASE: 'FIREBASE',
  MYSQL: 'MYSQL'
} as const;
export type DatabaseType = 'FIREBASE' | 'MYSQL';

export const UserRole = {
  ADMIN: 'ADMIN',
  ADVERTISER: 'ADVERTISER',
  SUPER_ADMIN: 'SUPER_ADMIN'
} as const;
export type UserRole = 'ADMIN' | 'ADVERTISER' | 'SUPER_ADMIN';

export interface User {
  id: string;
  username: string;
  email: string;
  password?: string;
  role: UserRole;
  assignedChatIds: string[];
  // Advertiser specific
  maxMessages?: number;
  messagesSent?: number;
  accessPeriodDays?: number;
  canPin?: boolean;
  createdAt: string;
  expiresAt?: string;
}

export interface BotSettings {
  botToken: string;
  adminPassword?: string;
  recoveryEmail?: string;
  dbType: DatabaseType;
  dbHost: string;
  dbUser: string;
  dbPass: string;
  dbName: string;
  dbPort: number;
  maintenanceMode: boolean;
  cfWorkerUrl?: string;
  disableCloudflare?: boolean;
  adminTelegramUsername?: string;
  telegramApiRoot?: string;
  // AI Provider & API Key Settings
  aiProvider?: 'gemini' | 'openrouter' | 'custom';
  geminiApiKey?: string;
  geminiModel?: string;
  geminiBaseUrl?: string;
  geminiUseProxy?: boolean;
  geminiProxySource?: 'auto' | 'tg_proxy' | 'cf_worker' | 'custom' | 'direct';
  openRouterApiKey?: string;
  openRouterModel?: string;
  customAiEndpoint?: string;
  customAiApiKey?: string;
  customAiModel?: string;
  reputationEnabled?: boolean;
}

export interface ChatBan {
  id: string;
  userId: string;
  chatId: string;
  chatTitle: string;
  reason: string;
  type: 'BAN' | 'MUTE';
  untilDate: string;
  addedAt: string;
}

export interface LatestMember extends Membership {
  chatTitle: string;
}

export interface HourlyActivityPoint {
  hour: number;
  time: string;
  msgs: number;
  activeUsers: number;
  joins: number;
}

export interface HeatmapCell {
  day: number; // 0 = Пн, 6 = Вс
  dayName: string; // "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"
  dayFullName: string; // "Понедельник", ...
  hour: number; // 0..23
  time: string; // "00:00"
  msgs: number;
  activeUsers: number;
  joins: number;
  intensity?: number; // 0..100
}

export interface Stats {
  totalMembers: number;
  totalMembersTrend: string;
  totalMessages24h: number;
  messagesTrend: string;
  modActions: number;
  modActionsTrend: string;
  activeChats: number;
  chartData: { 
    name: string; 
    joins: number; 
    leaves: number; 
    msgs: number;
    activeMembers: number;
    onlineMembers: number;
    totalMembers: number;
  }[];
  hourlyActivity?: HourlyActivityPoint[];
  heatmapData?: HeatmapCell[];
  topActiveMembers: {
    userId: string;
    username?: string;
    firstName?: string;
    msgCount: number;
    chats: { id: string; title: string }[];
  }[];
  topActiveAdmins: {
    userId: string;
    username?: string;
    firstName?: string;
    msgCount: number;
    chats: { id: string; title: string }[];
  }[];
  topChatsByMembers: { id: string; title: string; count: number }[];
  topChatsByMessages24h: { id: string; title: string; count: number }[];
  topChatsByTotalMessages: { id: string; title: string; count: number }[];
  topChatsByActiveUsers: { id: string; title: string; count: number }[];
  topChatsByOnlineUsers: { id: string; title: string; count: number }[];
}

export interface BroadcastHistory {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: string;
  chatIds: string[];
  messageIds: { chatId: string; messageId: number }[];
  pin: boolean;
  pinResults?: { [chatId: string]: { success: boolean, error?: string } };
  pinTime?: number;
  imageUrl?: string;
  buttons?: { text: string; url: string }[];
  source: 'ADMIN' | 'BOT';
}

export type DigestToneStyle = 'default' | 'debaucher' | 'troll' | 'sycophant' | 'chaos' | 'motobat' | 'dushevny';

export interface ToneStyleInfo {
  id: DigestToneStyle;
  label: string;
  icon: string;
  description: string;
}

export const TONE_STYLES: Record<DigestToneStyle, ToneStyleInfo> = {
  default: {
    id: 'default',
    label: 'По-умолчанию',
    icon: '🤖',
    description: 'Тот же стиль речи, что используют участники чата.'
  },
  motobat: {
    id: 'motobat',
    label: 'Мотобат',
    icon: '👮‍♂️',
    description: 'Доклад сотрудника ГИБДД (мотобата) своему начальнику о событиях в чате с байкерами. Строгий, служебный тон, с характерным профессиональным сленгом, где сотрудник иногда прямо отмечает, что байкеры — те ещё подонки и нарушители.'
  },
  dushevny: {
    id: 'dushevny',
    label: 'Душевный',
    icon: '🫂',
    description: 'Тёплое, родное, дружелюбное и почти отцовское повествование о происходящем в чате. В речи частые душевные обращения: «друзья», «братья», «родные», уютная и поддерживающая атмосфера.'
  },
  debaucher: {
    id: 'debaucher',
    label: 'Дебошир',
    icon: '🤬',
    description: 'Будто после трёх бокалов — дерзкий, язвительный, может материться и стебать участников обсуждения. И даже искажать факты. Для чата друзей, которые не обижаются на иронию и сарказм.'
  },
  troll: {
    id: 'troll',
    label: 'Тролль',
    icon: '😈',
    description: 'Язвительный, колкий стиль без перехода границ. По духу это всё тот же дебошир — с подколами и провокациями - стебать участников обсуждения, но без мата. Для тех, кто ценит дерзкий юмор, но хотят обойтись без ненормативной лексики.'
  },
  sycophant: {
    id: 'sycophant',
    label: 'Подхалим',
    icon: '😍',
    description: 'Умеет мастерски льстить, подчеркивая ум и значимость участников, при этом добавляя лёгкую иронию. Для тех, кто любят лесть и похвалу.'
  },
  chaos: {
    id: 'chaos',
    label: 'Солнечный Хаос',
    icon: '☀️',
    description: 'Добрый, весёлый и слегка безумный стиль, где обычный чат превращается в ситком, реалити-шоу и приключенческий сериал одновременно. Много тёплого юмора, лёгкого абсурда, неожиданных выводов и театральных преувеличений с редкими вспышками очаровательного творческого безумия.'
  }
};

export const TONE_STYLE_LIST: ToneStyleInfo[] = Object.values(TONE_STYLES);

export interface ChatDigestConfig {
  chatId: string;
  chatTitle?: string;
  enabled: boolean;
  scheduleTime: string; // "HH:mm" e.g. "21:00"
  targetChatId?: string;
  hoursBack?: number;
  includeTopics?: boolean;
  includeStats?: boolean;
  customPrompt?: string;
  toneStyle?: DigestToneStyle;
  autoSendTelegram?: boolean;
  lastGeneratedAt?: string;
  lastSentAt?: string;
  status?: 'idle' | 'generating' | 'success' | 'error';
  lastError?: string;
}

export interface ChatDigestEntry {
  id: string;
  chatId: string;
  chatTitle: string;
  summary: string;
  periodStart: string;
  periodEnd: string;
  messageCount: number;
  userCount: number;
  hoursBack?: number;
  toneStyle?: DigestToneStyle;
  createdAt: string;
  sentToTelegram?: boolean;
  sentAt?: string;
  sentError?: string;
  status?: 'generated' | 'sent' | 'failed';
}

export interface ChatMessageRecord {
  id: string;
  chatId: string;
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  text: string;
  timestamp: string;
}

export interface PinnedMessage {
  id?: string;
  messageId: number;
  chatId: string;
  text?: string;
  caption?: string;
  date: number;
  pinnedAt?: string;
  unpinned?: boolean;
  unpinnedAt?: string;
  from?: {
    id: number;
    firstName?: string;
    lastName?: string;
    username?: string;
    isBot?: boolean;
  };
  senderChat?: {
    id: number;
    title?: string;
    username?: string;
  };
  hasMedia?: boolean;
  mediaType?: 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'poll' | 'other';
  forwardFrom?: string;
  link?: string;
}

export const Tab = {
  STATISTICS: 'STATISTICS',
  CHATS: 'CHATS',
  AI_SUMMARY: 'AI_SUMMARY',
  MODERATION: 'MODERATION',
  REPUTATION: 'REPUTATION',
  ANTI_SCAM: 'ANTI_SCAM',
  SCHEDULER: 'SCHEDULER',
  BROADCAST: 'BROADCAST',
  LOGS: 'LOGS',
  USERS: 'USERS',
  SETTINGS: 'SETTINGS',
} as const;
export type Tab = 'STATISTICS' | 'CHATS' | 'AI_SUMMARY' | 'MODERATION' | 'REPUTATION' | 'ANTI_SCAM' | 'SCHEDULER' | 'BROADCAST' | 'LOGS' | 'USERS' | 'SETTINGS';

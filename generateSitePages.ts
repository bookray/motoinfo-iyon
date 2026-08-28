// Generator for dedicated chat HTML pages and static files
import * as fs from 'fs';
import * as path from 'path';
import { CHATS_CATALOG, ChatCatalogItem, getChatSummaries, ChatDailySummary } from './chatsCatalog';

export function renderChatHtmlPage(chat: ChatCatalogItem, summaries: ChatDailySummary[], siteBase: string = ''): string {
  const latestSummary = summaries[0];
  const totalSummariesCount = summaries.length;
  const username = chat.username.replace('@', '');

  // Related chats from same brand or category
  const relatedChats = CHATS_CATALOG
    .filter(c => c.slug !== chat.slug && (c.brand === chat.brand || c.category === chat.category))
    .slice(0, 4);

  const summariesHtml = summaries.map((s, idx) => {
    const isFirst = idx === 0;
    const topicsPills = s.topics.map(t => `<span class="topic-pill">${t.emoji} ${t.title}</span>`).join(' ');
    
    const topicsDetailed = s.topics.map(t => `
      <div class="summary-topic-item">
        <div class="summary-topic-header">
          <span class="topic-emoji">${t.emoji}</span>
          <span class="topic-title">${t.title}</span>
        </div>
        <div class="summary-topic-body">
          <p>${t.description}</p>
        </div>
      </div>
    `).join('');

    return `
      <article class="summary-card ${isFirst ? 'is-latest' : ''}" id="day-${s.date}">
        <div class="summary-header">
          <div class="summary-meta-left">
            <span class="summary-date-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              ${s.dayLabel}
            </span>
            ${isFirst ? '<span class="latest-tag">Свежий выпуск</span>' : ''}
          </div>
          <div class="summary-stats-badges">
            <span class="stat-badge" title="Сообщений за сутки">💬 ${s.messageCount} сообщ.</span>
            <span class="stat-badge" title="Активных участников">👥 ${s.activeUsersCount} чел.</span>
          </div>
        </div>

        <div class="summary-topics-preview">
          ${topicsPills}
        </div>

        <details class="summary-details-block" ${isFirst ? 'open' : ''}>
          <summary class="summary-toggle-btn">
            <span class="toggle-text-closed">Показать полный дайджест дня</span>
            <span class="toggle-text-open">Свернуть дайджест</span>
            <svg class="toggle-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </summary>
          
          <div class="summary-content-body">
            <div class="summary-topics-list">
              ${topicsDetailed}
            </div>

            <div class="summary-atmosphere-box">
              <strong>👥 Атмосфера и итоги:</strong>
              <p>В чате активно обсуждались технические нюансы, участники делились рекомендациями по запчастям и планировали совместные выезды. Темы были структурированы и обезличены нейросетью.</p>
            </div>
          </div>
        </details>
      </article>
    `;
  }).join('\n');

  const modelsHtml = chat.modelsCovered.map(m => `<span class="tag-model">${m}</span>`).join(' ');
  const topicsHtml = chat.keyTopics.map(t => `<li class="topic-item"><span class="bullet">✓</span> ${t}</li>`).join('\n');
  const rulesHtml = chat.rules.map((r, i) => `<li class="rule-item"><span class="rule-num">${i + 1}</span> ${r}</li>`).join('\n');

  const relatedHtml = relatedChats.map(r => `
    <a href="${r.slug}.html" class="related-chat-card">
      <img src="${siteBase}${r.image}" alt="${r.title}" class="related-chat-img" onerror="this.src='${siteBase}assets/img/c23f0286-8e57-4dd1-8e07-7b56b5b93810-5550045.jpeg'">
      <div class="related-chat-info">
        <h4>${r.title}</h4>
        <span class="related-chat-sub">@${r.username} • ${r.brand}</span>
      </div>
      <span class="related-chat-arrow">→</span>
    </a>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${chat.title} (@${username}) — Описание, статистика и дайджесты 30 дней | MOTOTG</title>
  <meta name="description" content="Полная информация о чате ${chat.title} в Telegram: описание сообщества, статистика участников, популярные темы и ежедневные AI-дайджесты за последние 30 дней.">
  <meta name="keywords" content="${chat.title}, ${chat.brand}, ${chat.modelsCovered.join(', ')}, моточат, телеграм чат, дайджест, ремонт мотоцикла">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${chat.title} — Чат и дайджесты | MOTOTG">
  <meta property="og:description" content="${chat.shortDesc}">
  <meta property="og:image" content="${siteBase}${chat.image}">
  <meta property="og:url" content="https://mototg.ru/chats/${chat.slug}.html">
  <meta property="og:type" content="website">

  <!-- Favicon -->
  <link rel="icon" href="${siteBase}assets/img/c23f0286-8e57-4dd1-8e07-7b56b5b93810-5550045.jpeg" type="image/jpeg">

  <!-- Remote Admin API Config (Connects to http://155.212.162.1:3000) -->
  <script src="${siteBase}config.js"></script>

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-dark: #0f1117;
      --bg-card: #181b24;
      --bg-card-hover: #1f2330;
      --bg-elevated: #242938;
      --primary: #f59e0b;
      --primary-hover: #d97706;
      --accent-blue: #38bdf8;
      --accent-green: #22c55e;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
      --border-color: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(245, 158, 11, 0.4);
      --radius-lg: 16px;
      --radius-md: 12px;
      --radius-sm: 8px;
      --shadow-card: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-dark);
      color: var(--text-main);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      padding-bottom: 60px;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    /* Container */
    .container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Header Nav */
    .site-header {
      background: rgba(15, 17, 23, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 70px;
    }

    .logo-link {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: 'Montserrat', sans-serif;
      font-weight: 900;
      font-size: 22px;
      letter-spacing: -0.5px;
      color: #fff;
    }

    .logo-badge {
      background: linear-gradient(135deg, #f59e0b, #ef4444);
      color: #000;
      font-weight: 900;
      font-size: 13px;
      padding: 4px 8px;
      border-radius: 6px;
      text-transform: uppercase;
    }

    .header-nav-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .btn-back {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 8px 16px;
      border-radius: var(--radius-md);
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .btn-back:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateX(-2px);
    }

    /* Hero Section */
    .chat-hero {
      padding: 40px 0 24px;
    }

    .hero-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-card);
      display: grid;
      grid-template-columns: 360px 1fr;
      position: relative;
    }

    @media (max-width: 900px) {
      .hero-card {
        grid-template-columns: 1fr;
      }
    }

    .hero-img-wrap {
      position: relative;
      background: #000;
      min-height: 280px;
    }

    .hero-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      opacity: 0.9;
    }

    .hero-category-tag {
      position: absolute;
      top: 16px;
      left: 16px;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      color: #fbbf24;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .hero-body {
      padding: 32px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .hero-badges-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .brand-pill {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      font-weight: 700;
      font-size: 13px;
      padding: 4px 10px;
      border-radius: 6px;
    }

    .username-pill {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: #38bdf8;
      font-weight: 600;
      font-size: 13px;
      padding: 4px 10px;
      border-radius: 6px;
    }

    .hero-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 28px;
      font-weight: 800;
      color: #fff;
      line-height: 1.25;
      margin-bottom: 12px;
    }

    .hero-short-desc {
      color: var(--text-muted);
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 24px;
    }

    /* Live Stats Row */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }

    @media (max-width: 640px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .stat-box {
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      padding: 12px 14px;
      border-radius: var(--radius-md);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-label {
      font-size: 11px;
      color: var(--text-dim);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-value {
      font-size: 18px;
      font-weight: 800;
      color: #fff;
    }

    .stat-value.highlight-gold {
      color: #fbbf24;
    }

    .stat-value.highlight-blue {
      color: #38bdf8;
    }

    .stat-value.highlight-green {
      color: #4ade80;
    }

    /* Hero CTA Row */
    .hero-cta-row {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    .btn-join-tg {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: linear-gradient(135deg, #0088cc, #006699);
      color: #fff;
      font-weight: 700;
      font-size: 16px;
      padding: 14px 28px;
      border-radius: var(--radius-md);
      box-shadow: 0 4px 15px rgba(0, 136, 204, 0.4);
      transition: all 0.2s ease;
      flex: 1;
      min-width: 220px;
    }

    .btn-join-tg:hover {
      background: linear-gradient(135deg, #0099e6, #0077b3);
      box-shadow: 0 6px 20px rgba(0, 136, 204, 0.6);
      transform: translateY(-2px);
    }

    .btn-copy-link {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 14px 18px;
      border-radius: var(--radius-md);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }

    .btn-copy-link:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    /* Main Grid Layout */
    .content-layout {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 32px;
      margin-top: 32px;
    }

    @media (max-width: 960px) {
      .content-layout {
        grid-template-columns: 1fr;
      }
    }

    /* Section Headings */
    .section-head {
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 12px;
    }

    .section-head h2 {
      font-family: 'Montserrat', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .section-counter-badge {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      font-size: 13px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 20px;
    }

    /* Summaries List */
    .summaries-container {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .summary-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 20px;
      transition: all 0.25s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .summary-card:hover {
      border-color: rgba(255, 255, 255, 0.18);
      background: var(--bg-card-hover);
    }

    .summary-card.is-latest {
      border-color: rgba(245, 158, 11, 0.4);
      background: linear-gradient(180deg, rgba(245, 158, 11, 0.05) 0%, var(--bg-card) 100%);
    }

    .summary-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      flex-wrap: wrap;
      gap: 10px;
    }

    .summary-meta-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .summary-date-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      font-size: 15px;
      color: #fff;
    }

    .latest-tag {
      background: linear-gradient(135deg, #f59e0b, #ef4444);
      color: #000;
      font-weight: 800;
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .summary-stats-badges {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .stat-badge {
      background: var(--bg-elevated);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .summary-topics-preview {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }

    .topic-pill {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      font-size: 13px;
      padding: 5px 10px;
      border-radius: 20px;
    }

    /* Details block */
    .summary-details-block {
      margin-top: 10px;
    }

    .summary-toggle-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-color);
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      color: var(--primary);
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      user-select: none;
      transition: background 0.2s;
      list-style: none;
    }

    .summary-toggle-btn::-webkit-details-marker {
      display: none;
    }

    .summary-toggle-btn:hover {
      background: rgba(245, 158, 11, 0.1);
    }

    .toggle-chevron {
      transition: transform 0.25s ease;
    }

    details[open] .toggle-chevron {
      transform: rotate(180deg);
    }

    details[open] .toggle-text-closed {
      display: none;
    }

    details:not([open]) .toggle-text-open {
      display: none;
    }

    .summary-content-body {
      padding-top: 16px;
      border-top: 1px dashed var(--border-color);
      margin-top: 12px;
    }

    .summary-topics-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .summary-topic-item {
      background: var(--bg-elevated);
      border-left: 3px solid var(--primary);
      padding: 12px 16px;
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    }

    .summary-topic-header {
      font-weight: 700;
      font-size: 14px;
      color: #fff;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .summary-topic-body p {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    .summary-atmosphere-box {
      margin-top: 14px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      color: var(--text-muted);
    }

    .summary-atmosphere-box strong {
      color: #fff;
      display: block;
      margin-bottom: 4px;
    }

    /* Sidebar info cards */
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .sidebar-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: var(--shadow-card);
    }

    .sidebar-card h3 {
      font-family: 'Montserrat', sans-serif;
      font-size: 16px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sidebar-desc-text {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.65;
    }

    .tags-cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 12px;
    }

    .tag-model {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-color);
      color: #e5e7eb;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 6px;
    }

    .topics-checklist, .rules-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .topic-item, .rule-item {
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      align-items: flex-start;
      gap: 8px;
      line-height: 1.5;
    }

    .bullet {
      color: var(--accent-green);
      font-weight: bold;
    }

    .rule-num {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      font-size: 10px;
      font-weight: bold;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }

    /* Related Chats */
    .related-chats-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .related-chat-card {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      padding: 10px;
      border-radius: var(--radius-md);
      transition: all 0.2s;
    }

    .related-chat-card:hover {
      background: var(--bg-card-hover);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateX(4px);
    }

    .related-chat-img {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-sm);
      object-fit: cover;
    }

    .related-chat-info {
      flex: 1;
      min-width: 0;
    }

    .related-chat-info h4 {
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .related-chat-sub {
      font-size: 11px;
      color: var(--text-dim);
    }

    .related-chat-arrow {
      color: var(--primary);
      font-weight: bold;
      font-size: 16px;
    }

    /* Footer */
    .site-footer {
      margin-top: 60px;
      border-top: 1px solid var(--border-color);
      padding: 30px 0;
      text-align: center;
      color: var(--text-dim);
      font-size: 13px;
    }

    .footer-links {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .footer-links a:hover {
      color: var(--primary);
    }
  </style>
</head>
<body>

  <!-- Top Navigation Header -->
  <header class="site-header">
    <div class="container header-inner">
      <a href="${siteBase}index.html" class="logo-link">
        <span>MOTOTG</span>
        <span class="logo-badge">Каталог</span>
      </a>

      <div class="header-nav-actions">
        <a href="${siteBase}index.html" class="btn-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          Все моточаты
        </a>
        <a href="${chat.telegramLink}" target="_blank" rel="noopener noreferrer" class="btn-back" style="background: rgba(0, 136, 204, 0.2); border-color: rgba(0, 136, 204, 0.4); color: #38bdf8;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
          Войти в Telegram
        </a>
      </div>
    </div>
  </header>

  <main class="container">
    <!-- Chat Hero Header Card -->
    <section class="chat-hero">
      <div class="hero-card">
        <div class="hero-img-wrap">
          <img src="${siteBase}${chat.image}" alt="${chat.title}" class="hero-img" onerror="this.src='${siteBase}assets/img/c23f0286-8e57-4dd1-8e07-7b56b5b93810-5550045.jpeg'">
          <span class="hero-category-tag">${chat.category}</span>
        </div>

        <div class="hero-body">
          <div>
            <div class="hero-badges-row">
              <span class="brand-pill">${chat.brand}</span>
              <span class="username-pill">@${username}</span>
            </div>

            <h1 class="hero-title">${chat.title}</h1>
            <p class="hero-short-desc">${chat.shortDesc}</p>
          </div>

          <!-- Dynamic Live Statistics Grid -->
          <div>
            <div class="stats-grid">
              <div class="stat-box">
                <span class="stat-label">Участников</span>
                <span class="stat-value highlight-gold" id="live-members-count">${chat.estimatedMembers.toLocaleString('ru-RU')}</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">За 24 часа</span>
                <span class="stat-value highlight-blue" id="live-24h-count">${latestSummary?.messageCount || 65} сообщ.</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">Архив дайджестов</span>
                <span class="stat-value highlight-green">${totalSummariesCount} дней</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">Модерация</span>
                <span class="stat-value">24/7 Бот</span>
              </div>
            </div>

            <div class="hero-cta-row">
              <a href="${chat.telegramLink}" target="_blank" rel="noopener noreferrer" class="btn-join-tg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
                Присоединиться к чату
              </a>

              <button class="btn-copy-link" onclick="navigator.clipboard.writeText('${chat.telegramLink}'); alert('Ссылка на чат скопирована в буфер обмена!');">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Копировать ссылку
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Main Content Layout -->
    <div class="content-layout">
      <!-- Left Column: 30-Day Summaries Archive -->
      <section>
        <div class="section-head">
          <h2>
            <span>⚡ Ежедневные суммаризации чата</span>
          </h2>
          <span class="section-counter-badge">Последние 30 дней</span>
        </div>

        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
          Нейросеть ежедневно анализирует сообщения участников, структурирует темы, выжимки технических советов и публикует готовый дайджест без личных данных. Сохраняются последние 30 дней обсуждений.
        </p>

        <div class="summaries-container" id="summaries-archive">
          ${summariesHtml}
        </div>
      </section>

      <!-- Right Column: Chat Info, Models, Rules, Related -->
      <aside class="sidebar">
        <!-- About Chat Card -->
        <div class="sidebar-card">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            О сообществе
          </h3>
          <p class="sidebar-desc-text">${chat.fullDesc}</p>
        </div>

        <!-- Models Covered -->
        <div class="sidebar-card">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.9 2 11.2 2 11.5V16c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><path d="M9 17h6"></path><circle cx="17" cy="17" r="2"></circle></svg>
            Техника в чате
          </h3>
          <div class="tags-cloud">
            ${modelsHtml}
          </div>
        </div>

        <!-- Key Topics -->
        <div class="sidebar-card">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            Что обсуждают
          </h3>
          <ul class="topics-checklist">
            ${topicsHtml}
          </ul>
        </div>

        <!-- Rules -->
        <div class="sidebar-card">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            Правила чата
          </h3>
          <ul class="rules-list">
            ${rulesHtml}
          </ul>
        </div>

        <!-- Related Chats -->
        ${relatedChats.length > 0 ? `
        <div class="sidebar-card">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            Смотрите также
          </h3>
          <div class="related-chats-list">
            ${relatedHtml}
          </div>
        </div>
        ` : ''}
      </aside>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container">
      <div class="footer-links">
        <a href="${siteBase}index.html">Все чаты MOTOTG</a>
        <a href="https://t.me/BikersRus" target="_blank">Моточат Россия</a>
        <a href="https://t.me/MotoBlackList" target="_blank">MotoBlackList</a>
        <a href="https://t.me/bookray" target="_blank">Поддержка и реклама</a>
      </div>
      <p>© 2026 MOTOTG.RU — Каталог мотосообществ и ежедневные AI-дайджесты.</p>
    </div>
  </footer>

  <!-- Live Stats & Real Digests Auto-Updater Script (Connects to Remote Admin API) -->
  <script>
    (async function() {
      try {
        const getApiUrl = function(endpoint) {
          if (typeof window.getMotoTgApiUrl === 'function') {
            return window.getMotoTgApiUrl(endpoint);
          }
          const base = window.MOTOTG_API_BASE || (window.MOTOTG_CONFIG && window.MOTOTG_CONFIG.apiBase) || 'http://155.212.162.1:3000';
          return base + endpoint;
        };

        const targetSlug = '${chat.slug}';
        const apiUrl = getApiUrl('/api/public/chat/' + encodeURIComponent(targetSlug));
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          mode: 'cors'
        });

        if (response.ok) {
          const data = await response.json();
          if (data && data.success && data.chat) {
            // 1. Update live member counters
            const liveChat = data.chat;
            const memberCount = liveChat.liveMembers || liveChat.members;
            if (memberCount) {
              const memEl = document.getElementById('live-members-count');
              if (memEl) memEl.textContent = Number(memberCount).toLocaleString('ru-RU');
            }

            const msgText = liveChat.liveMessagesText || liveChat.messagesText;
            if (msgText) {
              const msgEl = document.getElementById('live-24h-count');
              if (msgEl) {
                msgEl.textContent = msgText === 'Нет данных' ? 'Нет данных' : (msgText.includes('сообщ') ? msgText : msgText + ' сообщ.');
              }
            }

            // 2. If real digests are loaded from database, update the archive dynamically
            if (Array.isArray(data.summaries) && data.summaries.length > 0) {
              const hasReal = data.summaries.some(function(s) { return s.isReal === true; });
              if (hasReal) {
                const archiveContainer = document.getElementById('summaries-archive');
                if (archiveContainer) {
                  const freshCardsHtml = data.summaries.map(function(s, idx) {
                    const isFirst = idx === 0;
                    const isRealTag = s.isReal ? '<span style="background: #10b981; color: #000; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; margin-left: 6px; display: inline-flex; align-items: center; gap: 4px;">✓ ИИ Дайджест</span>' : '';
                    
                    const topicsPills = (s.topics || []).map(function(t) {
                      const title = typeof t === 'string' ? t : (t.title || '');
                      return '<span class="topic-pill">' + title + '</span>';
                    }).join('');

                    const topicsDetailed = (s.topics || []).map(function(t) {
                      const title = typeof t === 'string' ? t : (t.title || '');
                      const summary = typeof t === 'string' ? '' : (t.summary || '');
                      const icon = (typeof t === 'object' && t.icon) ? t.icon : '📌';
                      return '<div class="topic-detail-card">' +
                        '<h4><span class="topic-icon">' + icon + '</span> ' + title + '</h4>' +
                        (summary ? '<p class="topic-summary-text">' + summary + '</p>' : '') +
                      '</div>';
                    }).join('');

                    return '<article class="summary-card ' + (isFirst ? 'is-latest' : '') + '" id="day-' + s.date + '">' +
                      '<div class="summary-header">' +
                        '<div class="summary-meta-left">' +
                          '<span class="summary-date-badge">' +
                            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' +
                            (s.dayLabel || s.date) +
                          '</span>' +
                          (isFirst ? '<span class="latest-tag">Свежий выпуск</span>' : '') +
                          isRealTag +
                        '</div>' +
                        '<div class="summary-stats-badges">' +
                          '<span class="stat-badge" title="Сообщений за сутки">💬 ' + (s.messageCount || 0) + ' сообщ.</span>' +
                          '<span class="stat-badge" title="Активных участников">👥 ' + (s.activeUsersCount || 0) + ' чел.</span>' +
                        '</div>' +
                      '</div>' +
                      '<div class="summary-topics-preview">' + topicsPills + '</div>' +
                      '<details class="summary-details-block" ' + (isFirst ? 'open' : '') + '>' +
                        '<summary class="summary-toggle-btn">' +
                          '<span class="toggle-text-closed">Показать полный дайджест дня</span>' +
                          '<span class="toggle-text-open">Свернуть дайджест</span>' +
                          '<svg class="toggle-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
                        '</summary>' +
                        '<div class="summary-content-body">' +
                          '<div class="summary-topics-list">' + topicsDetailed + '</div>' +
                          (s.summary ? '<div class="summary-atmosphere-box"><strong>👥 Итоги и выжимка:</strong><p>' + s.summary + '</p></div>' : '') +
                        '</div>' +
                      '</details>' +
                    '</article>';
                  }).join('\n');

                  archiveContainer.innerHTML = freshCardsHtml;
                }
              }
            }
          }
        }
      } catch (e) {
        console.log('[MOTOTG] Данные загружены из встроенного статического кэша');
      }
    })();
  </script>
</body>
</html>`;
}

export function renderMainIndexHtmlPage(siteBase: string = ''): string {
  // Generate chat cards HTML
  const chatCardsHtml = CHATS_CATALOG.map((chat) => {
    const modelsTags = chat.modelsCovered.map(m => `<span class="card-model-tag" onclick="filterByModel('${m.replace(/'/g, "\\'")}')">${m}</span>`).join('');
    const username = chat.username.replace('@', '');

    return `
      <div class="chat-card" data-brand="${chat.brand}" data-category="${chat.category}" data-slug="${chat.slug}" data-username="${username}" data-keywords="${chat.title} ${chat.brand} ${chat.modelsCovered.join(' ')} ${chat.keyTopics.join(' ')} ${chat.shortDesc}">
        <div class="card-top">
          <div class="card-tags-row">
            <span class="card-brand-pill">${chat.brand}</span>
            <span class="card-cat-pill">${chat.category}</span>
          </div>
          <div class="card-header-main">
            <img src="${siteBase}${chat.image}" alt="${chat.title}" class="card-thumb" onerror="this.src='${siteBase}assets/img/c23f0286-8e57-4dd1-8e07-7b56b5b93810-5550045.jpeg'">
            <div class="card-title-group">
              <h3 class="card-title">${chat.title}</h3>
              <a href="${chat.telegramLink}" target="_blank" class="card-username">@${username}</a>
            </div>
          </div>
        </div>

        <p class="card-desc">${chat.shortDesc}</p>

        <!-- Live Stats Badge -->
        <div class="card-stats-box" id="stats-${chat.slug}">
          <div class="stat-line">
            <span class="stat-lbl">👥 Участников:</span>
            <strong class="stat-val live-mem" data-username="${username}">${chat.estimatedMembers.toLocaleString('ru-RU')} чел.</strong>
          </div>
          <div class="stat-line">
            <span class="stat-lbl">💬 За 24 часа:</span>
            <strong class="stat-val live-msg" data-username="${username}">Активен</strong>
          </div>
        </div>

        <!-- Models covered tags -->
        <div class="card-models-wrap">
          ${modelsTags}
        </div>

        <!-- Action Buttons -->
        <div class="card-actions-grid">
          <a href="${siteBase}chats/${chat.slug}.html" class="btn-card-details">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            Дайджесты и инфо (30 дн.)
          </a>
          <a href="${chat.telegramLink}" target="_blank" class="btn-card-tg">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Вступить в чат
          </a>
        </div>
      </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Каталог мото-чатов Telegram и архив AI-дайджестов 30 дней | MOTOTG</title>
  <meta name="description" content="Крупнейший каталог моточатов Telegram: BMW GS, Honda CBR/VTX, Yamaha R1/Fazer, Kawasaki Ninja, KTM, Suzuki, питбайки, снегоходы и региональные клубы. Ежедневные AI-дайджесты за 30 дней и живая статистика.">
  <meta name="keywords" content="моточат, мото чаты telegram, чаты мотоциклистов, каталог моточатов, дайджест моточата, bmw gs клуб, honda cbr чат, yamaha r1 чат, мото черных список">
  
  <!-- Open Graph -->
  <meta property="og:title" content="Каталог мото-чатов Telegram | MOTOTG">
  <meta property="og:description" content="40+ активных мото-сообществ по маркам и регионам. Ежедневные AI-дайджесты за 30 дней, поиск запчастей и живое общение.">
  <meta property="og:image" content="${siteBase}assets/img/c23f0286-8e57-4dd1-8e07-7b56b5b93810-5550045.jpeg">
  <meta property="og:url" content="https://mototg.ru">
  <meta property="og:type" content="website">

  <!-- Favicon -->
  <link rel="icon" href="${siteBase}assets/img/c23f0286-8e57-4dd1-8e07-7b56b5b93810-5550045.jpeg" type="image/jpeg">

  <!-- Remote Admin API Config (Connects to http://155.212.162.1:3000) -->
  <script src="${siteBase}config.js"></script>

  <!-- Top.Mail.Ru counter -->
  <script type="text/javascript">
    var _tmr = window._tmr || (window._tmr = []);
    _tmr.push({id: "3648019", type: "pageView", start: (new Date()).getTime()});
    (function (d, w, id) {
      if (d.getElementById(id)) return;
      var ts = d.createElement("script"); ts.type = "text/javascript"; ts.async = true; ts.id = id;
      ts.src = "https://top-fwz1.mail.ru/js/code.js";
      var f = function () {var s = d.getElementsByTagName("script")[0]; s.parentNode.insertBefore(ts, s);};
      if (w.opera == "[object Opera]") { d.addEventListener("DOMContentLoaded", f, false); } else { f(); }
    })(document, window, "tmr-code");
  </script>
  <noscript><div><img src="https://top-fwz1.mail.ru/counter?id=3648019;js=na" style="position:absolute;left:-9999px;" alt="Top.Mail.Ru"></div></noscript>

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-dark: #0f1117;
      --bg-card: #181b24;
      --bg-card-hover: #1f2330;
      --bg-elevated: #242938;
      --primary: #f59e0b;
      --primary-hover: #d97706;
      --primary-glow: rgba(245, 158, 11, 0.25);
      --accent-blue: #38bdf8;
      --accent-green: #22c55e;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
      --border-color: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(245, 158, 11, 0.4);
      --radius-lg: 16px;
      --radius-md: 12px;
      --radius-sm: 8px;
      --shadow-card: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-dark);
      color: var(--text-main);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      padding-bottom: 60px;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .container {
      max-width: 1240px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Site Header */
    .site-header {
      background: rgba(15, 17, 23, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 100;
      padding: 14px 0;
    }

    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .logo-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .logo-link {
      font-family: 'Montserrat', sans-serif;
      font-weight: 900;
      font-size: 1.35rem;
      letter-spacing: -0.5px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .logo-badge {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      font-size: 0.72rem;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .nav-links-desktop {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .nav-link-item {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-muted);
      transition: color 0.2s ease;
    }

    .nav-link-item:hover, .nav-link-item.active {
      color: var(--primary);
    }

    .header-right-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .btn-ad-nav {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      font-weight: 700;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: var(--primary);
      transition: all 0.2s ease;
    }

    .btn-ad-nav:hover {
      background: var(--primary);
      color: #000;
      box-shadow: 0 2px 12px rgba(245, 158, 11, 0.4);
    }

    .btn-tg-contact {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      font-weight: 600;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: #fff;
      transition: all 0.2s ease;
    }

    .btn-tg-contact:hover {
      background: var(--bg-elevated);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Hero Section */
    .catalog-hero {
      position: relative;
      padding: 56px 0 36px;
      background: radial-gradient(circle at 50% 15%, rgba(245, 158, 11, 0.12) 0%, rgba(15, 17, 23, 0) 70%);
      border-bottom: 1px solid var(--border-color);
      overflow: hidden;
    }

    .hero-pretitle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 5px 12px;
      border-radius: 9999px;
      color: var(--primary);
      font-size: 0.82rem;
      font-weight: 700;
      margin-bottom: 18px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .hero-main-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 2.85rem;
      font-weight: 900;
      line-height: 1.15;
      letter-spacing: -0.5px;
      margin-bottom: 16px;
      color: #fff;
      max-width: 900px;
    }

    .hero-main-title span {
      background: linear-gradient(135deg, #f59e0b, #fbbf24, #f3f4f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero-lead-text {
      font-size: 1.15rem;
      color: var(--text-muted);
      max-width: 820px;
      margin-bottom: 28px;
      line-height: 1.6;
    }

    /* Metrics Chips Row */
    .metrics-chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 36px;
    }

    .metric-chip {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.9rem;
    }

    .metric-chip strong {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--primary);
    }

    .metric-chip span {
      color: var(--text-muted);
    }

    /* Live Search & Filter Bar */
    .search-filter-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: var(--shadow-card);
      margin-top: 10px;
    }

    .search-input-wrapper {
      position: relative;
      margin-bottom: 18px;
    }

    .search-input-wrapper svg {
      position: absolute;
      left: 18px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-dim);
      pointer-events: none;
    }

    .catalog-search-input {
      width: 100%;
      padding: 16px 20px 16px 52px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      color: #fff;
      font-size: 1.05rem;
      outline: none;
      transition: all 0.2s ease;
    }

    .catalog-search-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
      background: #1c212e;
    }

    .catalog-search-input::placeholder {
      color: var(--text-dim);
      font-size: 0.95rem;
    }

    /* Brand Filter Pills */
    .brand-filter-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .filter-pill-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
    }

    .filter-pill-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.2);
    }

    .filter-pill-btn.active {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      border-color: transparent;
      font-weight: 800;
      box-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);
    }

    .filter-results-status {
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      color: var(--text-dim);
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .filter-results-status strong {
      color: var(--primary);
    }

    /* Partner Slider Showcase */
    .partner-section {
      padding: 36px 0 20px;
      border-bottom: 1px solid var(--border-color);
      background: rgba(24, 27, 36, 0.25);
    }

    .partner-label {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-dim);
      margin-bottom: 14px;
      text-align: center;
    }

    .partner-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
    }

    .partner-card-link {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-muted);
      transition: all 0.2s ease;
      min-height: 48px;
    }

    .partner-card-link:hover {
      background: var(--bg-elevated);
      color: var(--primary);
      border-color: rgba(245, 158, 11, 0.4);
      transform: translateY(-1px);
    }

    /* Chats Grid Section */
    .catalog-section {
      padding: 48px 0;
    }

    .chats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 22px;
    }

    /* Individual Chat Card */
    .chat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 22px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      transition: all 0.25s ease;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }

    .chat-card:hover {
      background: var(--bg-card-hover);
      border-color: rgba(245, 158, 11, 0.35);
      transform: translateY(-3px);
      box-shadow: var(--shadow-card);
    }

    .card-top {
      margin-bottom: 12px;
    }

    .card-tags-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 12px;
    }

    .card-brand-pill {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: var(--primary);
      font-size: 0.72rem;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .card-cat-pill {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-color);
      color: var(--text-dim);
      font-size: 0.72rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .card-header-main {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .card-thumb {
      width: 54px;
      height: 54px;
      border-radius: 12px;
      object-fit: cover;
      border: 1px solid var(--border-color);
      background: #000;
      flex-shrink: 0;
    }

    .card-title-group {
      min-width: 0;
      flex: 1;
    }

    .card-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.15rem;
      font-weight: 800;
      color: #fff;
      line-height: 1.3;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-username {
      font-size: 0.85rem;
      color: var(--accent-blue);
      font-weight: 600;
    }

    .card-username:hover {
      text-decoration: underline;
    }

    .card-desc {
      font-size: 0.9rem;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 14px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: 40px;
    }

    /* Card Stats Box */
    .card-stats-box {
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 8px 12px;
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.8rem;
    }

    .stat-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .stat-lbl {
      color: var(--text-dim);
    }

    .stat-val {
      font-weight: 700;
      color: #ffdd2d;
    }

    .stat-val.live-msg {
      color: var(--accent-green);
    }

    /* Model Pills in Card */
    .card-models-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 16px;
      max-height: 52px;
      overflow: hidden;
    }

    .card-model-tag {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--text-muted);
      font-size: 0.72rem;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .card-model-tag:hover {
      background: rgba(245, 158, 11, 0.15);
      border-color: var(--primary);
      color: #fff;
    }

    /* Card Action Buttons */
    .card-actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: auto;
    }

    .btn-card-details {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 9px 10px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: var(--radius-sm);
      font-size: 0.8rem;
      font-weight: 700;
      color: #fff;
      text-align: center;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .btn-card-details:hover {
      background: rgba(255, 255, 255, 0.18);
      border-color: var(--primary);
      color: var(--primary);
    }

    .btn-card-tg {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 9px 10px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      border-radius: var(--radius-sm);
      font-size: 0.8rem;
      font-weight: 800;
      color: #000;
      text-align: center;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .btn-card-tg:hover {
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
      box-shadow: 0 3px 12px rgba(245, 158, 11, 0.4);
      transform: translateY(-1px);
    }

    /* Benefits Section */
    .features-section {
      padding: 60px 0;
      background: rgba(24, 27, 36, 0.4);
      border-top: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 20px;
    }

    .feature-point-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 24px;
      transition: all 0.2s ease;
    }

    .feature-point-card:hover {
      border-color: rgba(245, 158, 11, 0.35);
      transform: translateY(-2px);
    }

    .feature-point-icon {
      font-size: 2rem;
      margin-bottom: 12px;
      color: var(--primary);
    }

    .feature-point-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.15rem;
      font-weight: 800;
      color: #fff;
      margin-bottom: 8px;
    }

    .feature-point-text {
      font-size: 0.9rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* Big Ad Banner Section */
    .ad-banner-section {
      padding: 60px 0;
    }

    .ad-promo-card {
      background: radial-gradient(circle at 70% 30%, rgba(245, 158, 11, 0.16) 0%, rgba(24, 27, 36, 0.9) 70%);
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: var(--radius-lg);
      padding: 42px 36px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      box-shadow: var(--shadow-card);
    }

    .ad-promo-left {
      max-width: 680px;
    }

    .ad-promo-badge {
      display: inline-block;
      background: rgba(245, 158, 11, 0.2);
      border: 1px solid var(--primary);
      color: var(--primary);
      font-size: 0.8rem;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 9999px;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .ad-promo-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.85rem;
      font-weight: 900;
      color: #fff;
      line-height: 1.25;
      margin-bottom: 10px;
    }

    .ad-promo-desc {
      font-size: 1.05rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .ad-promo-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 220px;
    }

    .btn-ad-main {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      font-family: 'Montserrat', sans-serif;
      font-size: 1rem;
      font-weight: 800;
      padding: 14px 24px;
      border-radius: var(--radius-md);
      transition: all 0.2s ease;
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
    }

    .btn-ad-main:hover {
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.5);
    }

    .btn-ad-tg {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      font-size: 0.9rem;
      font-weight: 600;
      padding: 10px 16px;
      border-radius: var(--radius-md);
      transition: all 0.2s ease;
    }

    .btn-ad-tg:hover {
      background: var(--bg-elevated);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Footer */
    .site-footer {
      border-top: 1px solid var(--border-color);
      padding: 36px 0;
      margin-top: 40px;
      text-align: center;
      color: var(--text-dim);
      font-size: 0.875rem;
    }

    .footer-links {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }

    .footer-links a {
      color: var(--text-muted);
      transition: color 0.2s ease;
    }

    .footer-links a:hover {
      color: var(--primary);
    }

    /* Responsive */
    @media (max-width: 768px) {
      .hero-main-title {
        font-size: 2.1rem;
      }
      .nav-links-desktop {
        display: none;
      }
      .chats-grid {
        grid-template-columns: 1fr;
      }
      .ad-promo-card {
        padding: 24px;
      }
      .card-actions-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>

  <!-- Site Header -->
  <header class="site-header">
    <div class="container">
      <div class="header-inner">
        <div class="logo-group">
          <a href="${siteBase}" class="logo-link">
            <span>🏍️ MOTOTG</span>
            <span class="logo-badge">Каталог 2026</span>
          </a>
        </div>

        <nav class="nav-links-desktop">
          <a href="#catalog" class="nav-link-item active">Все чаты</a>
          <a href="javascript:void(0)" onclick="filterByBrand('BMW')" class="nav-link-item">BMW</a>
          <a href="javascript:void(0)" onclick="filterByBrand('Honda')" class="nav-link-item">Honda</a>
          <a href="javascript:void(0)" onclick="filterByBrand('Kawasaki')" class="nav-link-item">Kawasaki</a>
          <a href="javascript:void(0)" onclick="filterByBrand('Yamaha')" class="nav-link-item">Yamaha</a>
          <a href="javascript:void(0)" onclick="filterByBrand('Suzuki')" class="nav-link-item">Suzuki</a>
          <a href="javascript:void(0)" onclick="filterByBrand('Регионы')" class="nav-link-item">Регионы</a>
          <a href="javascript:void(0)" onclick="filterByBrand('Снегоходы')" class="nav-link-item">Снегоходы</a>
          <a href="${siteBase}reklama/" class="nav-link-item" style="color: #ffdd2d;">Реклама</a>
        </nav>

        <div class="header-right-actions">
          <a href="${siteBase}reklama/" class="btn-ad-nav">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Реклама в чатах
          </a>
          <a href="https://t.me/bookray" target="_blank" class="btn-tg-contact">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            @bookray
          </a>
        </div>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="catalog-hero">
    <div class="container">
      <div class="hero-pretitle">
        ⚡ 41 активное мотосообщество в Telegram
      </div>

      <h1 class="hero-main-title">
        Каталог мото-чатов и <span>AI-дайджестов</span> за 30 дней
      </h1>

      <p class="hero-lead-text">
        Специализированные Telegram-группы по маркам мотоциклов, моделям, регионам и снегоходам. Ежедневные выжимки полезных советов по ремонту, поиск запчастей, защита от мошенников и живое общение райдеров.
      </p>

      <!-- Metrics Chips -->
      <div class="metrics-chips-row">
        <div class="metric-chip">
          <strong>41</strong>
          <span>Тематический чат</span>
        </div>
        <div class="metric-chip">
          <strong>> 20 000</strong>
          <span>Мотоциклистов</span>
        </div>
        <div class="metric-chip">
          <strong>30 дней</strong>
          <span>Архив AI-дайджестов</span>
        </div>
        <div class="metric-chip">
          <strong>100%</strong>
          <span>Антиспам и модерация</span>
        </div>
      </div>

      <!-- Search & Filter Card -->
      <div class="search-filter-card" id="catalog">
        <div class="search-input-wrapper">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="catalogSearch" class="catalog-search-input" placeholder="Поиск по марке, модели (GS, R1, VTX, CBR, Ninja, Duke...), городу или теме... (нажмите / для поиска)">
        </div>

        <div class="brand-filter-pills">
          <button class="filter-pill-btn active" data-filter="all" onclick="filterByBrand('all')">Все чаты (41)</button>
          <button class="filter-pill-btn" data-filter="BMW" onclick="filterByBrand('BMW')">BMW (2)</button>
          <button class="filter-pill-btn" data-filter="Honda" onclick="filterByBrand('Honda')">Honda (8)</button>
          <button class="filter-pill-btn" data-filter="Kawasaki" onclick="filterByBrand('Kawasaki')">Kawasaki (4)</button>
          <button class="filter-pill-btn" data-filter="Yamaha" onclick="filterByBrand('Yamaha')">Yamaha (8)</button>
          <button class="filter-pill-btn" data-filter="Suzuki" onclick="filterByBrand('Suzuki')">Suzuki (5)</button>
          <button class="filter-pill-btn" data-filter="KTM" onclick="filterByBrand('KTM')">KTM & Кросс (3)</button>
          <button class="filter-pill-btn" data-filter="Китай" onclick="filterByBrand('Китай')">BSE / CFMOTO (3)</button>
          <button class="filter-pill-btn" data-filter="Регионы" onclick="filterByBrand('Регионы')">Регионы & РФ (5)</button>
          <button class="filter-pill-btn" data-filter="Сервисные" onclick="filterByBrand('Сервисные')">Чёрный список (1)</button>
          <button class="filter-pill-btn" data-filter="Снегоходы" onclick="filterByBrand('Снегоходы')">Снегоходы (3)</button>
        </div>

        <div class="filter-results-status">
          <span>Отображается: <strong id="visibleCount">41</strong> из 41 чата</span>
          <span id="activeFilterLabel">Фильтр: Все категории</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Partner Banner Slider -->
  <section class="partner-section">
    <div class="container">
      <div class="partner-label">Партнеры и проверенная мотопродукция</div>
      <div class="partner-cards-grid">
        <a href="http://www.healtech.ru/" target="_blank" class="partner-card-link">⚡ Healtech — Электроника и квикшифтеры</a>
        <a href="http://bmcmoto.ru/" target="_blank" class="partner-card-link">🌪️ BMC — Воздушные фильтры</a>
        <a href="http://www.tormoznyekolodki.ru/" target="_blank" class="partner-card-link">🛑 Тормозные колодки и диски</a>
        <a href="http://www.aliantpower.ru/" target="_blank" class="partner-card-link">🔋 Aliant Power — Литиевые АКБ</a>
        <a href="http://www.robbymoto.ru/" target="_blank" class="partner-card-link">🛠️ Robby Moto — Тюнинг и клипоны</a>
      </div>
    </div>
  </section>

  <!-- Main Chats Grid Section -->
  <section class="catalog-section">
    <div class="container">
      <div class="chats-grid" id="chatsGrid">
        ${chatCardsHtml}
      </div>

      <div id="noResultsBlock" style="display:none; text-align:center; padding: 60px 20px;">
        <div style="font-size: 3rem; margin-bottom: 12px;">🔍</div>
        <h3 style="font-family:'Montserrat',sans-serif; font-size: 1.4rem; color: #fff; margin-bottom: 8px;">Ничего не найдено</h3>
        <p style="color: var(--text-muted); margin-bottom: 20px;">Попробуйте изменить поисковый запрос или сбросить фильтры.</p>
        <button onclick="resetFilters()" style="background:var(--primary); color:#000; font-weight:700; padding:10px 20px; border-radius:8px; cursor:pointer;">Сбросить фильтры</button>
      </div>
    </div>
  </section>

  <!-- Why Choose Section -->
  <section class="features-section">
    <div class="container">
      <div style="text-align: center; margin-bottom: 36px;">
        <span style="color: var(--primary); font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Преимущества сети</span>
        <h2 style="font-family: 'Montserrat', sans-serif; font-size: 2rem; font-weight: 800; color: #fff; margin-top: 6px;">Почему выбирают сообщества MOTOTG</h2>
      </div>

      <div class="features-grid">
        <div class="feature-point-card">
          <div class="feature-point-icon">🎯</div>
          <h3 class="feature-point-title">Узкая специализация</h3>
          <p class="feature-point-text">Отдельные чаты по каждой модели мотоцикла. Конкретные ответы по болячкам, мануалам и артикулам деталей без флуда.</p>
        </div>

        <div class="feature-point-card">
          <div class="feature-point-icon">🤖</div>
          <h3 class="feature-point-title">AI-дайджесты за 30 дней</h3>
          <p class="feature-point-text">Нейросеть каждый день анализирует сотни сообщений и формирует краткие выжимки по темам, сохраняя архив за 30 дней.</p>
        </div>

        <div class="feature-point-card">
          <div class="feature-point-icon">🛡️</div>
          <h3 class="feature-point-title">Защита от мошенников</h3>
          <p class="feature-point-text">Специализированный чат «Чёрный список мото-продавцов», база недобросовестных сервисов и строгая модерация.</p>
        </div>

        <div class="feature-point-card">
          <div class="feature-point-icon">🤝</div>
          <h3 class="feature-point-title">Взаимовыручка на дорогах</h3>
          <p class="feature-point-text">Быстрый поиск помощи при поломках, эвакуаторы, совместные прохваты и планирование дальних мотопутешествий.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Promo Ad Banner -->
  <section class="ad-banner-section">
    <div class="container">
      <div class="ad-promo-card">
        <div class="ad-promo-left">
          <span class="ad-promo-badge">Реклама в Telegram</span>
          <h2 class="ad-promo-title">Хотите заявить о своем мотосервисе или магазине?</h2>
          <p class="ad-promo-desc">
            Разместите рекламу сразу во всех 36 мото-чатах с охватом более 20 000 активных райдеров. Закрепленный пост с уведомлением всем участникам!
          </p>
        </div>

        <div class="ad-promo-actions">
          <a href="${siteBase}reklama/" class="btn-ad-main">
            Тарифы и условия рекламы →
          </a>
          <a href="https://t.me/bookray" target="_blank" class="btn-ad-tg">
            Написать в Telegram @bookray
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="site-footer">
    <div class="container">
      <div class="footer-links">
        <a href="#catalog">Каталог моточатов</a>
        <a href="${siteBase}reklama/">Условия рекламы</a>
        <a href="https://t.me/bookray" target="_blank">Администрация: @bookray</a>
        <a href="https://mototg.ru/max">Приложение MAX</a>
      </div>
      <p>&copy; 2026 MOTOTG.RU — Каталог тематических мото-сообществ России и стран СНГ. Все права защищены.</p>
    </div>
  </footer>

  <!-- Live Stats and Filtering Engine -->
  <script>
    let currentBrandFilter = 'all';

    function filterByBrand(brand) {
      currentBrandFilter = brand;
      
      // Update pills UI
      document.querySelectorAll('.filter-pill-btn').forEach(btn => {
        if (btn.getAttribute('data-filter') === brand) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      const labelEl = document.getElementById('activeFilterLabel');
      if (labelEl) {
        labelEl.textContent = 'Фильтр: ' + (brand === 'all' ? 'Все категории' : brand);
      }

      applyFilters();
    }

    function filterByModel(modelName) {
      const searchInput = document.getElementById('catalogSearch');
      if (searchInput) {
        searchInput.value = modelName;
        applyFilters();
        const catalogEl = document.getElementById('catalog');
        if (catalogEl) catalogEl.scrollIntoView({ behavior: 'smooth' });
      }
    }

    function resetFilters() {
      const searchInput = document.getElementById('catalogSearch');
      if (searchInput) searchInput.value = '';
      filterByBrand('all');
    }

    function applyFilters() {
      const query = (document.getElementById('catalogSearch')?.value || '').toLowerCase().trim();
      const cards = document.querySelectorAll('.chat-card');
      let visibleCount = 0;

      cards.forEach(card => {
        const brand = card.getAttribute('data-brand') || '';
        const category = card.getAttribute('data-category') || '';
        const keywords = (card.getAttribute('data-keywords') || '').toLowerCase();

        let matchesBrand = true;
        if (currentBrandFilter !== 'all') {
          if (currentBrandFilter === 'Китай') {
            matchesBrand = brand.includes('BSE') || brand.includes('CFMOTO') || brand.includes('KAYO') || category.includes('Китай');
          } else if (currentBrandFilter === 'KTM') {
            matchesBrand = brand.includes('KTM') || brand.includes('KAYO') || brand.includes('BSE');
          } else if (currentBrandFilter === 'Регионы') {
            matchesBrand = category === 'Регионы' || brand === 'Всероссийский' || brand === 'Кострома' || brand === 'Иваново' || brand === 'Нижний Новгород' || brand === 'Ярославль';
          } else if (currentBrandFilter === 'Сервисные') {
            matchesBrand = category === 'Сервисные' || brand === 'Безопасность';
          } else if (currentBrandFilter === 'Снегоходы') {
            matchesBrand = category === 'Снегоходы' || brand === 'BRP' || brand === 'Polaris' || brand === 'Stels';
          } else {
            matchesBrand = brand.toLowerCase().includes(currentBrandFilter.toLowerCase()) || category.toLowerCase().includes(currentBrandFilter.toLowerCase());
          }
        }

        let matchesQuery = true;
        if (query) {
          matchesQuery = keywords.includes(query);
        }

        if (matchesBrand && matchesQuery) {
          card.style.display = 'flex';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      const countEl = document.getElementById('visibleCount');
      if (countEl) countEl.textContent = visibleCount;

      const noResults = document.getElementById('noResultsBlock');
      if (noResults) {
        noResults.style.display = visibleCount === 0 ? 'block' : 'none';
      }
    }

    // Live search event
    document.getElementById('catalogSearch')?.addEventListener('input', applyFilters);

    // Keyboard shortcut '/'
    document.addEventListener('keydown', function(e) {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        const input = document.getElementById('catalogSearch');
        if (input) {
          input.focus();
          input.select();
        }
      }
    });

    // Auto-update live stats from API (Connects to Remote Admin API)
    (async function fetchLiveStats() {
      try {
        const getApiUrl = function(endpoint) {
          if (typeof window.getMotoTgApiUrl === 'function') {
            return window.getMotoTgApiUrl(endpoint);
          }
          const base = window.MOTOTG_API_BASE || (window.MOTOTG_CONFIG && window.MOTOTG_CONFIG.apiBase) || 'http://155.212.162.1:3000';
          return base + endpoint;
        };

        const apiUrl = getApiUrl('/api/public/chats-stats');
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          mode: 'cors'
        });

        if (response.ok) {
          const data = await response.json();
          if (data && data.chats) {
            const map = new Map();
            data.chats.forEach(c => {
              if (c.username) map.set(c.username.toLowerCase(), c);
              if (c.slug) map.set(c.slug.toLowerCase(), c);
            });

            document.querySelectorAll('.live-mem').forEach(el => {
              const u = (el.getAttribute('data-username') || '').toLowerCase();
              const chatData = map.get(u);
              if (chatData && chatData.members) {
                el.textContent = chatData.members.toLocaleString('ru-RU') + ' чел.';
              }
            });

            document.querySelectorAll('.live-msg').forEach(el => {
              const u = (el.getAttribute('data-username') || '').toLowerCase();
              const chatData = map.get(u);
              if (chatData) {
                if (typeof chatData.messages24h === 'number') {
                  el.textContent = chatData.messages24h >= 10 ? chatData.messages24h.toLocaleString('ru-RU') + ' сообщ.' : 'Нет данных';
                } else if (chatData.messagesText) {
                  el.textContent = chatData.messagesText;
                }
              }
            });
          }
        }
      } catch (e) {
        console.log('[MOTOTG] Live stats loaded from static catalog');
      }
    })();
  </script>
</body>
</html>`;
}

export function renderReklamaHtmlPage(siteBase: string = ''): string {
  // Return the complete modern advertising page
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Реклама в тематических Telegram-чатах для мотоциклистов | MOTOTG</title>
  <meta name="description" content="Эффективная реклама в 36+ активных мото-чатах Telegram и на сайте mototg.ru. Охват более 20 000 мотоциклистов, закрепленные посты с PUSH-уведомлением, баннеры и нативная реклама.">
  <meta name="keywords" content="реклама в моточатах, реклама мотоциклы, telegram реклама байкеры, реклама мотосервис, реклама экипировка, баннер mototg">
  
  <!-- Open Graph -->
  <meta property="og:title" content="Реклама в 36+ моточатах Telegram | MOTOTG">
  <meta property="og:description" content="Прямой охват целевой аудитории мотоциклистов по всей России. Закрепленные посты с уведомлением во всех чатах.">
  <meta property="og:image" content="${siteBase}assets/img/c23f0286-8e57-4dd1-8e07-7b56b5b93810-5550045.jpeg">
  <meta property="og:type" content="website">

  <!-- Favicon -->
  <link rel="icon" href="${siteBase}assets/img/c23f0286-8e57-4dd1-8e07-7b56b5b93810-5550045.jpeg" type="image/jpeg">

  <!-- Remote Admin API Config (Connects to http://155.212.162.1:3000) -->
  <script src="${siteBase}config.js"></script>

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@700;800;900&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-dark: #0f1117;
      --bg-card: #181b24;
      --bg-card-hover: #1f2330;
      --bg-elevated: #242938;
      --primary: #f59e0b;
      --primary-hover: #d97706;
      --primary-glow: rgba(245, 158, 11, 0.25);
      --accent-blue: #38bdf8;
      --accent-green: #22c55e;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
      --border-color: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(245, 158, 11, 0.4);
      --radius-lg: 16px;
      --radius-md: 12px;
      --radius-sm: 8px;
      --shadow-card: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-dark);
      color: var(--text-main);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      padding-bottom: 60px;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Top Navigation Header */
    .site-header {
      background: rgba(15, 17, 23, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 100;
      padding: 14px 0;
    }

    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .logo-link {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: 'Montserrat', sans-serif;
      font-weight: 900;
      font-size: 1.25rem;
      letter-spacing: -0.5px;
      color: #fff;
    }

    .logo-badge {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      font-size: 0.75rem;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .nav-btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-weight: 600;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      transition: all 0.2s ease;
    }

    .nav-btn-secondary:hover {
      background: var(--bg-elevated);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .nav-btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 18px;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-weight: 700;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      transition: all 0.2s ease;
      box-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);
    }

    .nav-btn-primary:hover {
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
    }

    /* Hero Section */
    .promo-hero {
      position: relative;
      padding: 60px 0 40px;
      background: radial-gradient(circle at 50% 20%, rgba(245, 158, 11, 0.12) 0%, rgba(15, 17, 23, 0) 70%);
      border-bottom: 1px solid var(--border-color);
      overflow: hidden;
    }

    .hero-tagline {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 6px 14px;
      border-radius: 9999px;
      color: var(--primary);
      font-size: 0.85rem;
      font-weight: 700;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .hero-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 2.75rem;
      font-weight: 900;
      line-height: 1.15;
      letter-spacing: -0.5px;
      margin-bottom: 18px;
      color: #fff;
    }

    .hero-title span {
      background: linear-gradient(135deg, #f59e0b, #fbbf24, #f3f4f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero-desc {
      font-size: 1.15rem;
      color: var(--text-muted);
      max-width: 780px;
      margin-bottom: 32px;
      line-height: 1.6;
    }

    /* Key Stats Bar */
    .stats-grid-hero {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-top: 30px;
    }

    .stat-hero-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 20px;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .stat-hero-card:hover {
      transform: translateY(-2px);
      border-color: rgba(245, 158, 11, 0.4);
    }

    .stat-hero-number {
      font-family: 'Montserrat', sans-serif;
      font-size: 2rem;
      font-weight: 800;
      color: var(--primary);
      line-height: 1;
      margin-bottom: 6px;
    }

    .stat-hero-label {
      font-size: 0.9rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .stat-hero-footnote {
      font-size: 0.75rem;
      color: var(--text-dim);
      margin-top: 4px;
    }

    /* Section Layout */
    .section {
      padding: 60px 0;
    }

    .section-header {
      margin-bottom: 36px;
      text-align: left;
    }

    .section-badge {
      display: inline-block;
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--primary);
      margin-bottom: 8px;
    }

    .section-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 2rem;
      font-weight: 800;
      color: #fff;
      margin-bottom: 12px;
      line-height: 1.25;
    }

    .section-subtitle {
      font-size: 1.05rem;
      color: var(--text-muted);
      max-width: 720px;
    }

    /* Cards Grid */
    .cards-grid-5 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }

    .feature-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
      overflow: hidden;
      transition: all 0.25s ease;
    }

    .feature-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: transparent;
      transition: background 0.25s ease;
    }

    .feature-card:hover {
      background: var(--bg-card-hover);
      border-color: rgba(245, 158, 11, 0.3);
      transform: translateY(-3px);
      box-shadow: var(--shadow-card);
    }

    .feature-card:hover::before {
      background: var(--primary);
    }

    .feature-icon-box {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      color: var(--primary);
      margin-bottom: 4px;
    }

    .feature-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.2rem;
      font-weight: 700;
      color: #fff;
    }

    .feature-text {
      font-size: 0.95rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* Benefits 3-column Grid */
    .benefits-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 24px;
    }

    .benefit-box {
      background: linear-gradient(180deg, var(--bg-card) 0%, rgba(24, 27, 36, 0.6) 100%);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 32px 24px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      transition: all 0.25s ease;
    }

    .benefit-box:hover {
      border-color: var(--accent-blue);
      transform: translateY(-4px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
    }

    .benefit-img-wrapper {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      color: var(--accent-blue);
    }

    .benefit-box:nth-child(2) .benefit-img-wrapper {
      background: rgba(34, 197, 94, 0.12);
      border-color: rgba(34, 197, 94, 0.3);
      color: var(--accent-green);
    }

    .benefit-box:nth-child(3) .benefit-img-wrapper {
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.3);
      color: var(--primary);
    }

    .benefit-heading {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.3rem;
      font-weight: 800;
      color: #fff;
    }

    .benefit-desc {
      font-size: 0.95rem;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* Pricing Section */
    .pricing-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 36px;
      margin-bottom: 40px;
      box-shadow: var(--shadow-card);
    }

    .pricing-header-box {
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .pricing-main-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.5rem;
      font-weight: 800;
      color: #fff;
    }

    .pricing-badge-accent {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid var(--primary);
      color: var(--primary);
      font-size: 0.85rem;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 9999px;
    }

    .pricing-desc-text {
      font-size: 0.95rem;
      color: var(--text-muted);
      margin-bottom: 28px;
      line-height: 1.5;
    }

    .pricing-cards-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 18px;
    }

    .price-tile {
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      transition: all 0.2s ease;
    }

    .price-tile.highlight {
      border-color: var(--primary);
      background: linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, var(--bg-elevated) 100%);
      box-shadow: 0 0 20px rgba(245, 158, 11, 0.15);
    }

    .price-tile:hover {
      transform: translateY(-3px);
      border-color: rgba(245, 158, 11, 0.4);
    }

    .price-popular-pill {
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 10px;
      border-radius: 9999px;
      white-space: nowrap;
    }

    .price-period {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 8px;
    }

    .price-sum {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.75rem;
      font-weight: 900;
      color: #fff;
      margin-bottom: 12px;
    }

    .price-sum span {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    .price-tile.highlight .price-sum {
      color: var(--primary);
    }

    .price-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fff;
      transition: all 0.2s ease;
      margin-top: 10px;
    }

    .price-tile.highlight .price-btn,
    .price-btn:hover {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      border-color: transparent;
      color: #000;
    }

    /* Extra Services Grid */
    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .service-row-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 18px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      transition: border-color 0.2s ease, background 0.2s ease;
    }

    .service-row-card:hover {
      background: var(--bg-card-hover);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .service-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .service-price-tag {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--primary);
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.25);
      padding: 4px 10px;
      border-radius: 6px;
      white-space: nowrap;
    }

    /* Banner Ad Box */
    .banner-ad-box {
      background: linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(24, 27, 36, 0.9) 100%);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: var(--radius-lg);
      padding: 36px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      align-items: center;
      margin-bottom: 40px;
    }

    .banner-ad-left h3 {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.6rem;
      font-weight: 800;
      color: #fff;
      margin-bottom: 12px;
    }

    .banner-ad-left p {
      font-size: 1rem;
      color: var(--text-muted);
      line-height: 1.6;
    }

    .banner-pricing-tiles {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .banner-price-card {
      flex: 1;
      min-width: 160px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 20px;
      text-align: center;
    }

    .banner-price-card .term {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .banner-price-card .cost {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--accent-blue);
    }

    /* Steps */
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }

    .step-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 28px 24px;
      position: relative;
    }

    .step-badge {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      font-family: 'Montserrat', sans-serif;
      font-size: 1.1rem;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }

    .step-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.15rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
    }

    .step-text {
      font-size: 0.95rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* Final CTA */
    .final-cta-section {
      background: radial-gradient(circle at 50% 50%, rgba(245, 158, 11, 0.18) 0%, rgba(24, 27, 36, 0.9) 80%);
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: var(--radius-lg);
      padding: 48px 32px;
      text-align: center;
      box-shadow: var(--shadow-card);
      margin-top: 40px;
    }

    .cta-headline {
      font-family: 'Montserrat', sans-serif;
      font-size: 2.2rem;
      font-weight: 900;
      color: #fff;
      margin-bottom: 14px;
      line-height: 1.2;
    }

    .cta-subtext {
      font-size: 1.15rem;
      color: var(--text-muted);
      max-width: 680px;
      margin: 0 auto 30px;
      line-height: 1.6;
    }

    .cta-buttons-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .big-tg-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      font-family: 'Montserrat', sans-serif;
      font-size: 1.05rem;
      font-weight: 800;
      padding: 16px 32px;
      border-radius: var(--radius-md);
      transition: all 0.25s ease;
      box-shadow: 0 4px 20px rgba(245, 158, 11, 0.4);
    }

    .big-tg-btn:hover {
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(245, 158, 11, 0.5);
    }

    .big-catalog-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      font-size: 1.05rem;
      font-weight: 600;
      padding: 16px 28px;
      border-radius: var(--radius-md);
      transition: all 0.2s ease;
    }

    .big-catalog-btn:hover {
      background: var(--bg-elevated);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Footer */
    .site-footer {
      border-top: 1px solid var(--border-color);
      padding: 30px 0;
      margin-top: 60px;
      text-align: center;
      color: var(--text-dim);
      font-size: 0.875rem;
    }

    .footer-links {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .footer-links a {
      color: var(--text-muted);
      transition: color 0.2s ease;
    }

    .footer-links a:hover {
      color: var(--primary);
    }

    /* Responsive */
    @media (max-width: 768px) {
      .hero-title {
        font-size: 2rem;
      }
      .banner-ad-box {
        grid-template-columns: 1fr;
        padding: 24px;
      }
      .pricing-container {
        padding: 24px 16px;
      }
      .cta-headline {
        font-size: 1.6rem;
      }
    }
  </style>
</head>
<body>

  <!-- Site Header -->
  <header class="site-header">
    <div class="container">
      <div class="header-inner">
        <a href="${siteBase}" class="logo-link">
          <span>🏍️ MOTOTG</span>
          <span class="logo-badge">Реклама</span>
        </a>

        <div class="nav-actions">
          <a href="${siteBase}" class="nav-btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
            Каталог чатов
          </a>
          <a href="https://t.me/bookray" target="_blank" class="nav-btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Связаться (@bookray)
          </a>
        </div>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="promo-hero">
    <div class="container">
      <div class="hero-tagline">
        ⚡ Мощный канал продаж для мотобизнеса
      </div>
      
      <h1 class="hero-title">
        Реклама в тематических <span>Telegram-чатах</span> для мотоциклистов
      </h1>
      
      <p class="hero-desc">
        Прямой доступ к самой лояльной аудитории байкеров, сервисов, дилеров и магазинов экипировки. Размещение с гарантированным закрепом и уведомлением участников по всей сети сообществ.
      </p>

      <!-- Key Stats Bar -->
      <div class="stats-grid-hero">
        <div class="stat-hero-card">
          <div class="stat-hero-number">36</div>
          <div class="stat-hero-label">Активных Telegram-чатов</div>
          <div class="stat-hero-footnote">Широкий охват мотосообщества</div>
        </div>

        <div class="stat-hero-card">
          <div class="stat-hero-number">> 20 000*</div>
          <div class="stat-hero-label">Живых участников</div>
          <div class="stat-hero-footnote">*на январь 2026г.</div>
        </div>

        <div class="stat-hero-card">
          <div class="stat-hero-number">100%</div>
          <div class="stat-hero-label">Закреп с PUSH-оповещением</div>
          <div class="stat-hero-footnote">Гарантия видимости объявления</div>
        </div>

        <div class="stat-hero-card">
          <div class="stat-hero-number">20 000</div>
          <div class="stat-hero-label">Уникальных визитов сайта/год</div>
          <div class="stat-hero-footnote">Возможность баннерного размещения</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Section 1: Почему это работает? -->
  <section class="section">
    <div class="container">
      <div class="section-header">
        <span class="section-badge">Преимущества формата</span>
        <h2 class="section-title">Почему это работает?</h2>
        <p class="section-subtitle">
          Telegram-сообщества мотоциклистов — это пространство доверительного общения, где каждое объявление воспринимается как рекомендация.
        </p>
      </div>

      <div class="cards-grid-5">
        <div class="feature-card">
          <div class="feature-icon-box">💬</div>
          <h3 class="feature-title">36 активных чатов</h3>
          <p class="feature-text">Охватываем широкую аудиторию мотосообщества во всех ключевых категориях и марках мотоциклов.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box">👥</div>
          <h3 class="feature-title">Более 20 000* пользователей</h3>
          <p class="feature-text">Ваше сообщение увидят только заинтересованные люди — владельцы мототехники, ищущие запчасти и услуги.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box">📌</div>
          <h3 class="feature-title">Реклама всегда на виду</h3>
          <p class="feature-text">Ваше объявление будет закреплено в каждом чате и об этом всем пользователям придет сообщение, что гарантирует его видимость для всех участников.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box">🎯</div>
          <h3 class="feature-title">Целевая аудитория</h3>
          <p class="feature-text">Все участники чатов увлечены мотоциклами, запчастями, экипировкой и всем, что связано с мототематикой.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box">🔥</div>
          <h3 class="feature-title">Живое общение</h3>
          <p class="feature-text">Чаты активны, пользователи постоянно обсуждают новости, делятся опытом и ищут полезные предложения.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Section 2: Преимущества рекламы в наших чатах -->
  <section class="section" style="background: rgba(24, 27, 36, 0.4); border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">
    <div class="container">
      <div class="section-header" style="text-align: center;">
        <span class="section-badge">Результат для бизнеса</span>
        <h2 class="section-title">Преимущества рекламы в наших чатах</h2>
        <p class="section-subtitle" style="margin: 0 auto;">
          Получайте прямые заявки и звонки от платежеспособных владельцев мототехники.
        </p>
      </div>

      <div class="benefits-grid">
        <div class="benefit-box">
          <div class="benefit-img-wrapper">⚡</div>
          <h3 class="benefit-heading">Высокая вовлеченность</h3>
          <p class="benefit-desc">Аудитория активно взаимодействует с контентом, комментирует и переходит по контактам рекламодателя.</p>
        </div>

        <div class="benefit-box">
          <div class="benefit-img-wrapper">🤝</div>
          <h3 class="benefit-heading">Доверие и лояльность</h3>
          <p class="benefit-desc">Пользователи доверяют рекомендациям из проверенных чатов с долгой историей и строгой модерацией.</p>
        </div>

        <div class="benefit-box">
          <div class="benefit-img-wrapper">🎯</div>
          <h3 class="benefit-heading">Гибкость и доступность</h3>
          <p class="benefit-desc">Размещение сразу во всех 36 чатах сети для максимального охвата или выборочно по конкретным моделям.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Section 3: Тарифы во ВСЕХ 36 чатах -->
  <section class="section">
    <div class="container">
      <div class="pricing-container">
        <div class="pricing-header-box">
          <div>
            <span class="section-badge">Максимальный охват</span>
            <h2 class="pricing-main-title">Стоимость размещения рекламы в 36 мото Telegram-чатах</h2>
          </div>
          <span class="pricing-badge-accent">Сеть из 36 чатов</span>
        </div>

        <p class="pricing-desc-text">
          Реклама — это пост с закреплением во всех чатах. Во время оплаченного периода вы можете поменять пост раз в месяц (по договоренности чаще).
        </p>

        <div class="pricing-cards-row">
          <div class="price-tile">
            <div>
              <div class="price-period">1 неделя</div>
              <div class="price-sum">8 000 <span>₽</span></div>
            </div>
            <a href="https://t.me/bookray?text=Здравствуйте!%20Хочу%20заказать%20рекламу%20во%20всех%2036%20чатах%20на%201%20неделю" target="_blank" class="price-btn">Заказать</a>
          </div>

          <div class="price-tile highlight">
            <div class="price-popular-pill">Хит продаж</div>
            <div>
              <div class="price-period">1 месяц</div>
              <div class="price-sum">21 000 <span>₽</span></div>
            </div>
            <a href="https://t.me/bookray?text=Здравствуйте!%20Хочу%20заказать%20рекламу%20во%20всех%2036%20чатах%20на%201%20месяц" target="_blank" class="price-btn">Заказать</a>
          </div>

          <div class="price-tile">
            <div>
              <div class="price-period">6 месяцев</div>
              <div class="price-sum">62 000 <span>₽</span></div>
            </div>
            <a href="https://t.me/bookray?text=Здравствуйте!%20Хочу%20заказать%20рекламу%20во%20всех%2036%20чатах%20на%206%20месяцев" target="_blank" class="price-btn">Заказать</a>
          </div>

          <div class="price-tile">
            <div>
              <div class="price-period">1 год</div>
              <div class="price-sum">120 000 <span>₽</span></div>
            </div>
            <a href="https://t.me/bookray?text=Здравствуйте!%20Хочу%20заказать%20рекламу%20во%20всех%2036%20чатах%20на%201%20год" target="_blank" class="price-btn">Заказать</a>
          </div>
        </div>
      </div>

      <!-- Section 4: Тарифы в 1 чате -->
      <div class="pricing-container">
        <div class="pricing-header-box">
          <div>
            <span class="section-badge">Точечный таргетинг</span>
            <h2 class="pricing-main-title">Стоимость размещения рекламы в 1 мото Telegram-чате</h2>
          </div>
          <span class="pricing-badge-accent" style="border-color: var(--accent-blue); color: var(--accent-blue); background: rgba(56, 189, 248, 0.15);">1 выбранный чат</span>
        </div>

        <p class="pricing-desc-text">
          Пост с закреплением в выбранном чате. Во время оплаченного периода вы можете поменять пост раз в месяц.
        </p>

        <div class="pricing-cards-row">
          <div class="price-tile">
            <div>
              <div class="price-period">1 неделя</div>
              <div class="price-sum">2 000 <span>₽</span></div>
            </div>
            <a href="https://t.me/bookray?text=Здравствуйте!%20Хочу%20заказать%20рекламу%20в%201%20чате%20на%201%20неделю" target="_blank" class="price-btn">Заказать</a>
          </div>

          <div class="price-tile highlight">
            <div class="price-popular-pill">Популярно</div>
            <div>
              <div class="price-period">1 месяц</div>
              <div class="price-sum">4 000 <span>₽</span></div>
            </div>
            <a href="https://t.me/bookray?text=Здравствуйте!%20Хочу%20заказать%20рекламу%20в%201%20чате%20на%201%20месяц" target="_blank" class="price-btn">Заказать</a>
          </div>

          <div class="price-tile">
            <div>
              <div class="price-period">6 месяцев</div>
              <div class="price-sum">12 000 <span>₽</span></div>
            </div>
            <a href="https://t.me/bookray?text=Здравствуйте!%20Хочу%20заказать%20рекламу%20в%201%20чате%20на%206%20месяцев" target="_blank" class="price-btn">Заказать</a>
          </div>

          <div class="price-tile">
            <div>
              <div class="price-period">1 год</div>
              <div class="price-sum">20 000 <span>₽</span></div>
            </div>
            <a href="https://t.me/bookray?text=Здравствуйте!%20Хочу%20заказать%20рекламу%20в%201%20чате%20на%201%20год" target="_blank" class="price-btn">Заказать</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Section 5: Дополнительные услуги рекламы -->
  <section class="section" style="padding-top: 0;">
    <div class="container">
      <div class="section-header">
        <span class="section-badge">Опции и спецформаты</span>
        <h2 class="section-title">Дополнительные услуги рекламы</h2>
        <p class="section-subtitle">
          Услуги, которые вы можете приобрести в дополнение к основному размещению рекламы в чате:
        </p>
      </div>

      <div class="services-grid">
        <div class="service-row-card">
          <div class="service-title">
            <span>🔄</span> Обновление рекламного поста каждую неделю
          </div>
          <span class="service-price-tag">по договоренности</span>
        </div>

        <div class="service-row-card">
          <div class="service-title">
            <span>🛡️</span> Без маркировки рекламы
          </div>
          <span class="service-price-tag">по договоренности</span>
        </div>

        <div class="service-row-card">
          <div class="service-title">
            <span>📌</span> Дополнительный пост/закреп
          </div>
          <span class="service-price-tag">по договоренности</span>
        </div>

        <div class="service-row-card">
          <div class="service-title">
            <span>📝</span> Нативная реклама
          </div>
          <span class="service-price-tag">по договоренности</span>
        </div>

        <div class="service-row-card">
          <div class="service-title">
            <span>💼</span> Право ведения рекламной деятельности в чате
          </div>
          <span class="service-price-tag">по договоренности</span>
        </div>

        <div class="service-row-card">
          <div class="service-title">
            <span>🏷️</span> Собственная тема в чате (при наличии тем)
          </div>
          <span class="service-price-tag">по договоренности</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Section 6: Баннерная реклама на сайте -->
  <section class="section" style="padding-top: 20px;">
    <div class="container">
      <div class="banner-ad-box">
        <div class="banner-ad-left">
          <span class="section-badge" style="color: var(--accent-blue);">Трафик на сайте</span>
          <h3>Дополнительная возможность: баннерная реклама на сайте</h3>
          <p>
            Мы также предлагаем размещение баннерной рекламы на нашем тематическом сайте <strong>mototg.ru</strong>, который ежегодно посещает <strong>20 000 уникальных пользователей</strong>.
          </p>
        </div>

        <div class="banner-pricing-tiles">
          <div class="banner-price-card">
            <div class="term">Период: 6 месяцев</div>
            <div class="cost">15 000 ₽</div>
            <a href="https://t.me/bookray?text=Здравствуйте!%20Хочу%20заказать%20баннерную%20рекламу%20на%20сайте%20mototg.ru%20на%206%20месяцев" target="_blank" class="price-btn" style="margin-top: 12px;">Заказать</a>
          </div>

          <div class="banner-price-card" style="border-color: rgba(56, 189, 248, 0.4);">
            <div class="term">Период: 1 год</div>
            <div class="cost">25 000 ₽</div>
            <a href="https://t.me/bookray?text=Здравствуйте!%20Хочу%20заказать%20баннерную%20рекламу%20на%20сайте%20mototg.ru%20на%201%20год" target="_blank" class="price-btn" style="margin-top: 12px; background: linear-gradient(135deg, #38bdf8, #0284c7); color: #000;">Заказать</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Section 7: Как это работает? -->
  <section class="section" style="background: rgba(24, 27, 36, 0.4); border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">
    <div class="container">
      <div class="section-header" style="text-align: center;">
        <span class="section-badge">Простой процесс</span>
        <h2 class="section-title">Как это работает?</h2>
        <p class="section-subtitle" style="margin: 0 auto;">
          Запуск вашей рекламной кампании всего за 3 простых шага:
        </p>
      </div>

      <div class="steps-grid">
        <div class="step-card">
          <div class="step-badge">1</div>
          <h3 class="step-title">Выбор формата</h3>
          <p class="step-text">Вы выбираете формат рекламы (Telegram-чаты, баннер на сайте или комбинированный вариант).</p>
        </div>

        <div class="step-card">
          <div class="step-badge">2</div>
          <h3 class="step-title">Подготовка и публикация</h3>
          <p class="step-text">Мы готовим и публикуем ваше рекламное сообщение или баннер. Закрепляем сообщение в чате.</p>
        </div>

        <div class="step-card">
          <div class="step-badge">3</div>
          <h3 class="step-title">Оповещение и охват</h3>
          <p class="step-text">О закрепленном сообщении приходит оповещение всем пользователям. Ваше предложение видят тысячи заинтересованных пользователей.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Section 8: Final CTA -->
  <section class="section">
    <div class="container">
      <div class="final-cta-section">
        <h2 class="cta-headline">Ваша реклама – в центре внимания мотосообщества!</h2>
        <p class="cta-subtext">
          Не упустите шанс привлечь новых клиентов и увеличить продажи! Свяжитесь с нами, чтобы обсудить детали и начать продвижение уже сегодня.
        </p>
        <div class="cta-buttons-wrap">
          <a href="https://t.me/bookray" target="_blank" class="big-tg-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Обсудить размещение с @bookray
          </a>
          <a href="${siteBase}" class="big-catalog-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
            Каталог сообществ
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="site-footer">
    <div class="container">
      <div class="footer-links">
        <a href="${siteBase}">Каталог чатов</a>
        <a href="https://t.me/bookray" target="_blank">Связь с администрацией: @bookray</a>
        <a href="https://mototg.ru/max">MAX приложение</a>
      </div>
      <p>&copy; 2026 MOTOTG — Каталог мото-сообществ России и стран СНГ. Все права защищены.</p>
    </div>
  </footer>

</body>
</html>`;
}

export function generateAllStaticPages(outputDir: string) {
  const chatsDir = path.join(outputDir, 'chats');
  if (!fs.existsSync(chatsDir)) {
    fs.mkdirSync(chatsDir, { recursive: true });
  }

  const reklamaDir = path.join(outputDir, 'reklama');
  if (!fs.existsSync(reklamaDir)) {
    fs.mkdirSync(reklamaDir, { recursive: true });
  }

  console.log(`[SiteGen] Generating individual HTML pages for ${CHATS_CATALOG.length} chats in ${chatsDir}...`);

  for (const chat of CHATS_CATALOG) {
    const summaries = getChatSummaries(chat.slug);
    const html = renderChatHtmlPage(chat, summaries, '../');
    const filePath = path.join(chatsDir, `${chat.slug}.html`);
    fs.writeFileSync(filePath, html, 'utf8');
    
    // Also write with username as filename if different
    if (chat.username.toLowerCase() !== chat.slug.toLowerCase()) {
      const usernamePath = path.join(chatsDir, `${chat.username.toLowerCase()}.html`);
      fs.writeFileSync(usernamePath, html, 'utf8');
    }
  }

  // 1. Generate Main Index page (site/index.html)
  const mainIndexHtml = renderMainIndexHtmlPage('');
  fs.writeFileSync(path.join(outputDir, 'index.html'), mainIndexHtml, 'utf8');

  // 2. Generate Advertising page (site/reklama/index.html and site/reklama.html)
  const reklamaHtml = renderReklamaHtmlPage('../');
  fs.writeFileSync(path.join(reklamaDir, 'index.html'), reklamaHtml, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'reklama.html'), renderReklamaHtmlPage(''), 'utf8');

  // 3. Create universal dynamic template /site/chat.html that accepts ?slug=... or ?id=...
  const dynamicTemplateHtml = renderUniversalDynamicTemplate();
  fs.writeFileSync(path.join(outputDir, 'chat.html'), dynamicTemplateHtml, 'utf8');

  console.log(`[SiteGen] ✅ Generated all 41 chat pages, main index page, and reklama page in ${outputDir}.`);
}

function renderUniversalDynamicTemplate(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Загрузка чата... | MOTOTG</title>
  <meta name="robots" content="noindex,follow">
  <link rel="icon" href="assets/img/c23f0286-8e57-4dd1-8e07-7b56b5b93810-5550045.jpeg" type="image/jpeg">
  <script>
    // Universal router for chat.html?slug=... or ?id=... or ?username=...
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug') || urlParams.get('id') || urlParams.get('username') || urlParams.get('chat');
    if (slug) {
      const cleanSlug = slug.toLowerCase().replace('@', '');
      window.location.replace('chats/' + cleanSlug + '.html');
    } else {
      window.location.replace('index.html');
    }
  </script>
</head>
<body style="background:#0f1117;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
  <p>Загрузка страницы чата...</p>
</body>
</html>`;
}


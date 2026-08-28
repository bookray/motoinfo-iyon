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

  <!-- Live Stats Auto-Updater Script -->
  <script>
    // Live update stats from public API
    (async function() {
      try {
        const response = await fetch('/api/public/chats-stats');
        if (response.ok) {
          const data = await response.json();
          if (data && data.chats) {
            const currentChat = data.chats.find(c => 
              (c.username && c.username.toLowerCase() === '${username}'.toLowerCase()) ||
              (c.id && String(c.id).includes('${username}'))
            );
            if (currentChat) {
              if (currentChat.members) {
                const memEl = document.getElementById('live-members-count');
                if (memEl) memEl.textContent = currentChat.members.toLocaleString('ru-RU');
              }
              if (currentChat.messagesText) {
                const msgEl = document.getElementById('live-24h-count');
                if (msgEl) {
                  msgEl.textContent = currentChat.messagesText === 'Нет данных' ? 'Нет данных' : currentChat.messagesText + ' сообщ.';
                }
              }
            }
          }
        }
      } catch (e) {
        console.log('Stats loaded from static bundle');
      }
    })();
  </script>
</body>
</html>`;
}

export function generateAllStaticPages(outputDir: string) {
  const chatsDir = path.join(outputDir, 'chats');
  if (!fs.existsSync(chatsDir)) {
    fs.mkdirSync(chatsDir, { recursive: true });
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

  // Also create a universal dynamic template /site/chat.html that accepts ?slug=... or ?id=...
  const dynamicTemplateHtml = renderUniversalDynamicTemplate();
  fs.writeFileSync(path.join(outputDir, 'chat.html'), dynamicTemplateHtml, 'utf8');

  console.log(`[SiteGen] ✅ Generated ${CHATS_CATALOG.length} chat pages and universal dynamic template.`);
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

/**
 * Скрипт автоматического обновления статистики и ссылок на отдельные страницы чатов mototg.ru
 * 1. Выводит количество участников (человек) в чате
 * 2. Выводит активность за последние сутки (если < 10 — "Нет данных")
 * 3. Добавляет кнопку перехода на отдельную страницу чата с описанием и архивом дайджестов (30 дней)
 * 4. Кэширует данные в localStorage на 24 часа.
 */
(function () {
  function getApiUrl() {
    if (typeof window.getMotoTgApiUrl === 'function') {
      return window.getMotoTgApiUrl('/api/public/chats-stats');
    }
    const base = window.MOTOTG_API_BASE || (window.MOTOTG_CONFIG && window.MOTOTG_CONFIG.apiBase) || 'http://155.212.162.1:3000';
    return `${base}/api/public/chats-stats`;
  }

  const CACHE_KEY = 'mototg_chats_stats_v2';
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 час для актуальности данных

  // Маппинг username -> slug страницы
  const SLUG_MAP = {
    'motoblacklist': 'motoblacklist',
    'bikersrus': 'bikersrus',
    'motokostroma': 'motokostroma',
    'motoivanovo': 'motoivanovo',
    'motonnchat': 'motonnchat',
    'motoyar': 'motoyar',
    'bmwgsclub': 'bmwgsclub',
    'bmwtourclub': 'bmwtourclub',
    'bserus': 'bserus',
    'cfmotorus': 'cfmotorus',
    'hondacbrus': 'hondacbrus',
    'hondacbrrus': 'hondacbrrus',
    'hondaglrus': 'hondaglrus',
    'steedrus': 'steedrus',
    'hondarebelcmx1100': 'hondarebel',
    'varaderorus': 'varaderorus',
    'hondavfrclub': 'hondavfrclub',
    'honda_vtx': 'hondavtx',
    'er6club': 'er6club',
    'kleclub': 'kleclub',
    'zzrrus': 'zzrrus',
    'ridersvulcan': 'ridersvulcan',
    'dukerus': 'dukerus',
    'kayoclub': 'kayoclub',
    'gsfclub': 'gsfclub',
    'djebelrus': 'djebelrus',
    'gsxrclub': 'gsxrclub',
    'boulevardrus': 'boulevardrus',
    'skywaveclub': 'skywaveclub',
    'vstromrus': 'vstromrus',
    'yamahastarrus': 'yamahastarrus',
    'yamahafazerclub': 'yamahafazerclub',
    'r1r6club': 'r1r6club',
    'tenereclub': 'tenereclub',
    'yamahatdmrus': 'yamahatdmrus',
    'vmaxrus': 'vmaxrus',
    'clubxjr': 'clubxjr',
    'diversion_club': 'diversionclub',
    'brpsnow': 'brpsnow',
    'polarissnow': 'polarissnow',
    'stelscaptain': 'stelscaptain'
  };

  function formatNumber(num) {
    if (typeof num !== 'number' || isNaN(num)) return num;
    return num.toLocaleString('ru-RU');
  }

  function getCachedStats() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const now = Date.now();
      if (data && data.timestamp && (now - data.timestamp < CACHE_TTL_MS)) {
        return data.stats;
      }
    } catch (e) {
      console.warn('[MotoTG Stats] Ошибка чтения кэша:', e);
    }
    return null;
  }

  function setCachedStats(stats) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        stats: stats
      }));
    } catch (e) {
      console.warn('[MotoTG Stats] Ошибка записи в кэш:', e);
    }
  }

  function applyStatsToPage(statsData) {
    if (!statsData || !statsData.chats) return;

    // Создаем быстрый индекс по юзернейму и ссылке
    const chatMap = new Map();
    statsData.chats.forEach(chat => {
      if (chat.username) {
        chatMap.set(chat.username.toLowerCase().replace('@', ''), chat);
      }
      if (chat.link) {
        const linkClean = chat.link.toLowerCase().replace(/\/$/, '');
        chatMap.set(linkClean, chat);
      }
      if (chat.title) {
        chatMap.set(chat.title.toLowerCase().trim(), chat);
      }
    });

    // Находим все карточки чатов на странице
    const cardButtons = document.querySelectorAll('a[href*="t.me/"], a[href*="max.ru/join/"]');
    
    cardButtons.forEach(btn => {
      const href = btn.getAttribute('href') || '';
      let username = '';
      if (href.includes('t.me/')) {
        const parts = href.split('t.me/');
        if (parts[1]) {
          username = parts[1].split('/')[0].split('?')[0].toLowerCase();
        }
      }

      // Пропускаем не относящиеся к чатам кнопки (например, личные контакты)
      if (username === 'bookray') return;

      // Находим родительский контейнер карточки
      const cardWrapper = btn.closest('.s-advantages-blocks-type-5__content') || 
                          btn.closest('.s-advantages-blocks-type-5__wrapper') || 
                          btn.parentElement;
      if (!cardWrapper) return;

      const titleEl = cardWrapper.querySelector('.sb-font-h5, .sb-font-title, h3, h2');
      const titleText = titleEl ? titleEl.textContent.toLowerCase().trim() : '';

      let chatInfo = null;
      if (username && chatMap.has(username)) {
        chatInfo = chatMap.get(username);
      } else if (chatMap.has(href.toLowerCase().replace(/\/$/, ''))) {
        chatInfo = chatMap.get(href.toLowerCase().replace(/\/$/, ''));
      } else if (titleText && chatMap.has(titleText)) {
        chatInfo = chatMap.get(titleText);
      }

      const slug = SLUG_MAP[username] || username;
      const chatDetailUrl = slug ? `chats/${slug}.html` : null;

      // 1. Блок статистики
      let statsBadge = cardWrapper.querySelector('.mototg-chat-stats');
      if (!statsBadge) {
        statsBadge = document.createElement('div');
        statsBadge.className = 'mototg-chat-stats';
        statsBadge.style.cssText = `
          margin-top: 10px;
          margin-bottom: 12px;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.4;
          color: #ffffff;
          display: flex;
          flex-direction: column;
          gap: 4px;
          user-select: none;
          text-align: left;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        `;

        const textWrapper = cardWrapper.querySelector('.s-advantages-blocks-type-5__text') || cardWrapper.querySelector('.sb-font-p3');
        if (textWrapper) {
          textWrapper.appendChild(statsBadge);
        } else {
          btn.parentNode.insertBefore(statsBadge, btn);
        }
      }

      let membersCount = '—';
      let messagesCountText = 'Нет данных';

      if (chatInfo) {
        membersCount = typeof chatInfo.members === 'number' ? `${formatNumber(chatInfo.members)} чел.` : (chatInfo.members || '—');
        if (typeof chatInfo.messages24h === 'number') {
          messagesCountText = chatInfo.messages24h >= 10 ? `${formatNumber(chatInfo.messages24h)} сообщ.` : 'Нет данных';
        } else if (chatInfo.messagesText) {
          messagesCountText = chatInfo.messagesText;
        }
      } else {
        membersCount = 'Активен';
      }

      statsBadge.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span style="opacity: 0.85; font-size: 12px;">👥 Участников:</span>
          <strong style="font-weight: 700; color: #ffdd2d;">${membersCount}</strong>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px;">
          <span style="opacity: 0.85; font-size: 12px;">💬 За 24 часа:</span>
          <strong style="font-weight: 700; color: ${messagesCountText === 'Нет данных' ? 'rgba(255,255,255,0.7)' : '#00e676'};">${messagesCountText}</strong>
        </div>
      `;

      // 2. Кнопка "О чате и дайджесты (30 дней)"
      if (chatDetailUrl && !cardWrapper.querySelector('.mototg-details-btn')) {
        const detailsBtn = document.createElement('a');
        detailsBtn.className = 'mototg-details-btn';
        detailsBtn.href = chatDetailUrl;
        detailsBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align: -2px; margin-right: 5px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          О чате и дайджесты (30 дн.)
        `;
        detailsBtn.style.cssText = `
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          margin-top: 8px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s ease;
          text-align: center;
        `;
        detailsBtn.onmouseover = function () {
          this.style.background = 'rgba(255, 255, 255, 0.28)';
          this.style.borderColor = '#ffdd2d';
          this.style.color = '#ffdd2d';
        };
        detailsBtn.onmouseout = function () {
          this.style.background = 'rgba(255, 255, 255, 0.15)';
          this.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          this.style.color = '#ffffff';
        };

        btn.parentNode.insertBefore(detailsBtn, btn.nextSibling);
      }
    });
  }

  async function fetchStatsAndRender() {
    // 1. Сначала пробуем отобразить из кэша (мгновенно без мигания)
    const cached = getCachedStats();
    if (cached) {
      applyStatsToPage(cached);
    }

    // 2. Запрашиваем свежие данные с сервера
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const freshData = await response.json();
      if (freshData && freshData.success) {
        applyStatsToPage(freshData);
        setCachedStats(freshData);
      }
    } catch (err) {
      console.log('[MotoTG Stats] Работаем в офлайн/кэшированном режиме');
      if (!cached) {
        applyStatsToPage({
          chats: Object.keys(SLUG_MAP).map(u => ({ username: u, members: 'Активен', messages24h: 45 }))
        });
      }
    }
  }

  // Запуск при готовности DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchStatsAndRender);
  } else {
    fetchStatsAndRender();
  }
})();

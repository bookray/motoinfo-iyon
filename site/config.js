/**
 * MOTOTG.RU — Конфигурация удаленного подключения к серверу админки бота
 * 
 * Если сайт mototg.ru размещен на отдельном сервере (например, Nginx / Apache),
 * этот файл указывает адрес панели управления ботом для получения онлайн-статистики
 * и свежих ИИ-дайджестов из базы данных.
 */
(function() {
  var DEFAULT_API_BASE = 'http://155.212.162.1:3000';

  // Если сайт открыт на том же хосте, используем относительный путь, иначе — IP админки
  var currentHost = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
  var isSameHost = (currentHost === '155.212.162.1' || currentHost === 'localhost' || currentHost === '127.0.0.1');

  window.MOTOTG_CONFIG = {
    // Базовый URL админки бота (с портом 3000)
    apiBase: isSameHost ? '' : DEFAULT_API_BASE,
    
    // Эндпоинты API
    statsEndpoint: '/api/public/chats-stats',
    catalogEndpoint: '/api/public/chats-catalog',
    chatEndpoint: '/api/public/chat',
    
    // Контакты для рекламы и поддержки
    adminTelegram: 'https://t.me/bookray',
    botUsername: 'teleguard_bot'
  };

  window.MOTOTG_API_BASE = window.MOTOTG_CONFIG.apiBase;

  // Вспомогательная функция для получения полного URL эндпоинта
  window.getMotoTgApiUrl = function(endpoint) {
    var base = window.MOTOTG_CONFIG.apiBase || '';
    if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;
    return base + endpoint;
  };
})();

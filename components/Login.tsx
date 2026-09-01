
import React, { useState, useEffect } from 'react';
import { Shield, Lock, User, AlertCircle, Loader2, Send } from 'lucide-react';
import { User as UserType } from '../types';

interface LoginProps {
  onLogin: (token: string, user: UserType) => void;
  telegramError?: string | null;
}

export const Login: React.FC<LoginProps> = ({ onLogin, telegramError }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(telegramError || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTelegramLoading, setIsTelegramLoading] = useState(false);
  const [tgUser, setTgUser] = useState<any>(null);
  const [hasTgInitData, setHasTgInitData] = useState(false);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData && tg.initData.trim() !== '') {
      setHasTgInitData(true);
      if (tg.initDataUnsafe?.user) {
        setTgUser(tg.initDataUnsafe.user);
      }
    }
  }, []);

  const handleTelegramAuth = async () => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.initData) return;

    setError(null);
    setIsTelegramLoading(true);
    try {
      const response = await fetch('/api/telegram-webapp-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData }),
      });

      const data = await response.json().catch(() => ({ error: 'Некорректный ответ сервера' }));

      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        try {
          tg.HapticFeedback?.notificationOccurred('success');
        } catch (e) {}
        onLogin(data.token, data.user);
      } else {
        setError(data.error || 'Ошибка авторизации через Telegram.');
        try {
          tg.HapticFeedback?.notificationOccurred('error');
        } catch (e) {}
      }
    } catch (err) {
      setError('Не удалось подключиться к серверу.');
    } finally {
      setIsTelegramLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => ({ error: 'Некорректный ответ сервера' }));

      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        onLogin(data.token, data.user);
      } else {
        setError(data.error || 'Ошибка входа. Проверьте данные.');
      }
    } catch (err) {
      setError('Не удалось подключиться к серверу.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-900/40 mb-4">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">TeleGuard</h1>
          <p className="text-slate-400 mt-2">Панель управления модерацией</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
          {hasTgInitData && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shrink-0">
                  <Send className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-blue-400 font-bold uppercase tracking-wider">Telegram Mini App</p>
                  <p className="text-sm font-semibold text-white truncate">
                    {tgUser ? `${tgUser.first_name || ''} ${tgUser.last_name || ''} (@${tgUser.username || tgUser.id})` : 'Пользователь Telegram'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTelegramAuth}
                disabled={isTelegramLoading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white py-2.5 rounded-xl font-semibold transition-all text-sm shadow-lg shadow-blue-900/30 cursor-pointer"
              >
                {isTelegramLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Проверка доступа Telegram...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Войти как @{tgUser?.username || 'Telegram'}
                  </>
                )}
              </button>
            </div>
          )}

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/50 p-3 rounded-lg flex items-center gap-3 text-rose-200 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {hasTgInitData ? 'или логин и пароль' : 'Авторизация'}
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Логин</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-sm"
                  placeholder="Введите ваш логин"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Пароль</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-white py-3 rounded-xl font-semibold transition-all border border-slate-700 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Вход...
                </>
              ) : (
                'Войти по логину'
              )}
            </button>

            <div className="text-center pt-1">
              <span className="text-xs text-slate-500">
                По умолчанию: <code className="text-blue-400 bg-slate-950 px-1.5 py-0.5 rounded">admin</code> / <code className="text-blue-400 bg-slate-950 px-1.5 py-0.5 rounded">admin123</code>
              </span>
            </div>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-8">
          &copy; 2026 TeleGuard Security Systems. Все права защищены.
        </p>
      </div>
    </div>
  );
};

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus, LogIn, Loader2, ArrowLeft, User, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';

const SCHEMATI_URL = import.meta.env.VITE_SCHEMATI_URL || 'https://schemati.test';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export function Navbar() {
  const location = useLocation();
  const { user, isLoading, isAuthenticated, loginUrl } = useAuth();
  const [userMenu, setUserMenu] = useState(false);
  const queryClient = useQueryClient();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <div className="h-14 border-b border-white/5 bg-[#0a0a0a] flex items-center justify-between px-4 z-50 relative select-none">
      {/* Left: Logo + nav */}
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 group focus:outline-none">
          <div className="relative w-7 h-7 flex items-center justify-center">
            <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <svg viewBox="0 0 100 100" fill="none" className="w-full h-full relative z-10">
              <rect x="24" y="24" width="16" height="16" rx="4" className="fill-neutral-800" />
              <rect x="24" y="48" width="16" height="16" rx="4" className="fill-neutral-800" />
              <rect x="48" y="24" width="16" height="16" rx="4" className="fill-neutral-800" />
              <rect x="72" y="24" width="16" height="16" rx="4" className="fill-green-500/20 stroke-green-500" strokeWidth="1.5" />
              <path d="M40 32 H48 M64 32 H72 M40 56 H48 M32 40 V48" className="stroke-neutral-700" strokeWidth="2" />
            </svg>
          </div>
          <span className="text-sm font-medium transition-colors">
            <span className="text-neutral-500 group-hover:text-neutral-400">schemat.io</span>
            <span className="text-neutral-600 mx-0.5">/</span>
            <span className="text-white group-hover:text-green-400">flow</span>
          </span>
        </Link>

        <div className="h-5 w-px bg-white/10" />

        <div className="flex items-center gap-1">
          <Link
            to="/"
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              isActive('/') ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Flows
          </Link>
          <Link
            to="/modules"
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              isActive('/modules') ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Modules
          </Link>
          <Link
            to="/editor"
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              isActive('/editor') || isActive('/flow') ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Editor
          </Link>

          <div className="h-4 w-px bg-white/5 mx-1" />

          <a
            href={SCHEMATI_URL}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-300 hover:bg-white/5 rounded-md transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Main site
          </a>
        </div>
      </div>

      {/* Right: Auth + actions */}
      <div className="flex items-center gap-3">
        <Link
          to="/editor"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Flow
        </Link>

        <div className="h-5 w-px bg-white/10" />

        {isLoading ? (
          <Loader2 className="w-4 h-4 text-neutral-600 animate-spin" />
        ) : isAuthenticated && user ? (
          <div className="relative">
            <button
              onClick={() => setUserMenu(!userMenu)}
              className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/5 transition-colors group"
            >
              {user.avatar && (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-6 h-6 rounded ring-1 ring-white/10 group-hover:ring-green-500/30 transition-all"
                />
              )}
              <span className="text-xs text-neutral-400 group-hover:text-white transition-colors hidden sm:block">
                {user.username}
              </span>
              <ChevronDown className={`w-3 h-3 text-neutral-600 transition-transform ${userMenu ? 'rotate-180' : ''}`} />
            </button>

            {userMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                <div className="absolute right-0 top-9 z-50 w-48 bg-[#0c0c10] border border-neutral-800/60 rounded-lg shadow-2xl shadow-black/50 py-1 animate-scale-in">
                  <div className="px-3 py-2 border-b border-neutral-800/40">
                    <div className="text-xs font-medium text-white">{user.username}</div>
                    <div className="text-[10px] text-neutral-600 font-mono truncate">{user.uuid}</div>
                  </div>
                  <a
                    href={`${SCHEMATI_URL}/users/${user.uuid}`}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-neutral-300 hover:bg-white/5 transition-colors"
                  >
                    <User className="w-3 h-3 text-neutral-500" />
                    Profile
                  </a>
                  <div className="border-t border-neutral-800/40 my-1" />
                  <button
                    onClick={() => {
                      // POST to Fortify logout via hidden form
                      const form = document.createElement('form');
                      form.method = 'POST';
                      form.action = `${SCHEMATI_URL}/logout`;
                      // CSRF token from cookie
                      const csrfToken = document.cookie
                        .split('; ')
                        .find(c => c.startsWith('XSRF-TOKEN='))
                        ?.split('=')[1];
                      if (csrfToken) {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = '_token';
                        input.value = decodeURIComponent(csrfToken);
                        form.appendChild(input);
                      }
                      document.body.appendChild(form);
                      form.submit();
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-red-400/80 hover:bg-red-500/5 transition-colors"
                  >
                    <LogOut className="w-3 h-3" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <a
            href={loginUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign in
          </a>
        )}
      </div>
    </div>
  );
}

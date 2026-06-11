import { useQuery } from '@tanstack/react-query';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const SCHEMATI_URL = import.meta.env.VITE_SCHEMATI_URL || 'https://schemati.test';

interface User {
  uuid: string;
  username: string;
  avatar: string | null;
  isAdmin: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginUrl: string;
}

export function useAuth(): AuthState {
  const { data, isLoading } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/user`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json.authenticated) return null;
      return json.user as User;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  return {
    user: data ?? null,
    isLoading,
    isAuthenticated: !!data,
    loginUrl: `${SCHEMATI_URL}/login?redirect=${encodeURIComponent(currentUrl)}`,
  };
}

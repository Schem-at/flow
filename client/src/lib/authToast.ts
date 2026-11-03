/**
 * Which toast (if any) a failed request should raise. Used by the global
 * fetch interceptor in App.tsx so signed-out actions aren't silent failures.
 */

export interface AuthNotice {
  message: string;
  /** Offer a "Sign in" link. */
  signIn: boolean;
}

export function authFailureNotice(status: number, url: string): AuthNotice | null {
  // The auth PROBE itself (`/api/user`) legitimately 401s when signed out.
  if (url.includes('/api/user')) return null;
  // 401: not signed in (or the session expired).
  if (status === 401) {
    return { message: 'You are signed out. Sign in to use this.', signIn: true };
  }
  // 403: signed in, but this account may not do it (e.g. the flow belongs to
  // someone else). Asking to sign in again would be misleading.
  if (status === 403) {
    return {
      message: "You don't have permission to do that. If this flow belongs to someone else, use File > Save a Copy.",
      signIn: false,
    };
  }
  return null;
}

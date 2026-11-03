import { getOrCreateUser } from './auth';

const SESSION_KEY = 'shopi.sessionId';

// Each browser gets a stable session id, and each browser also gets a persistent user profile
// for cart persistence and personalization. This keeps data stable while still remaining simple.
export function getSessionId(): string {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, created);
  return created;
}

export function getCurrentUserId(): string {
  return getOrCreateUser().userId;
}

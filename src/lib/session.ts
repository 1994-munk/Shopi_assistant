const SESSION_KEY = 'shopi.sessionId';

// Shopi has no accounts, so each browser gets a random id that ties its basket and turn logs together.
export function getSessionId(): string {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, created);
  return created;
}

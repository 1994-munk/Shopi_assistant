const USER_KEY = 'shopi.user';

export interface ShopiUserProfile {
  userId: string;
  email?: string;
  favoriteCategories: string[];
  dietaryPreferences: string[];
}

export function getOrCreateUser(): ShopiUserProfile {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return {
      userId: 'local-only-user',
      favoriteCategories: ['produce', 'dairy'],
      dietaryPreferences: ['vegan', 'vegetarian'],
    };
  }

  const existing = localStorage.getItem(USER_KEY);
  if (existing) {
    try {
      return JSON.parse(existing) as ShopiUserProfile;
    } catch {
      // Ignore malformed local values and regenerate a clean profile.
    }
  }

  const nextUser: ShopiUserProfile = {
    userId: crypto.randomUUID(),
    favoriteCategories: ['produce', 'dairy'],
    dietaryPreferences: ['vegan', 'vegetarian'],
  };

  localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  return nextUser;
}

export function getCurrentUserId(): string {
  return getOrCreateUser().userId;
}

export function saveUserProfile(profile: Partial<ShopiUserProfile>): ShopiUserProfile {
  const current = getOrCreateUser();
  const next = {
    ...current,
    ...profile,
  };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  return next;
}

export function getUserCartKey(userId: string): string {
  return `shopi.cart.${userId}`;
}

export function loadUserCart(userId: string): Array<{ productId: string; quantity: number }> {
  const raw = localStorage.getItem(getUserCartKey(userId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Array<{ productId: string; quantity: number }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserCart(
  userId: string,
  cart: Array<{ productId: string; quantity: number }>,
): Array<{ productId: string; quantity: number }> {
  localStorage.setItem(getUserCartKey(userId), JSON.stringify(cart));
  return cart;
}

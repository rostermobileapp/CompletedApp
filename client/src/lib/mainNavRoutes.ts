import type { LucideIcon } from 'lucide-react';
import { Users, MessageCircle, User, DollarSign } from 'lucide-react';

/**
 * Single source of truth for the 5 primary tabs of the authenticated app
 * shell. Used by both the mobile BottomNavigation and the new
 * DesktopAppShell so the two surfaces never drift.
 *
 * Note: SwipeableMainScreens (mobile) and DesktopAppShell (desktop) both
 * also need to MAP each main route to its page COMPONENT for direct
 * rendering. That mapping is intentionally kept inside each shell because
 * eagerly importing the page components from this file would defeat
 * code-splitting for routes that aren't currently visible.
 */

export type MainScreenId = 'home' | 'teams' | 'messages' | 'payments' | 'profile';

export interface MainNavItem {
  id: MainScreenId;
  label: string;
  /** Wouter route path. */
  route: string;
  /** lucide-react icon used by the mobile bottom nav AND the desktop sidebar. */
  icon: LucideIcon | null;
}

/**
 * Order matters — this is the rendered order for both nav surfaces.
 * The Home item sets `icon: null` because both shells render the Roster
 * brand image (Home_Logo_*.png) instead of a lucide icon for that tab.
 */
export const MAIN_NAV_ITEMS: readonly MainNavItem[] = [
  { id: 'home', label: 'Home', route: '/', icon: null },
  { id: 'teams', label: 'My Team', route: '/teams', icon: Users },
  { id: 'messages', label: 'Messages', route: '/messages', icon: MessageCircle },
  { id: 'payments', label: 'Payments', route: '/payment-requests', icon: DollarSign },
  { id: 'profile', label: 'Profile', route: '/profile', icon: User },
];

/**
 * Maps the current pathname to the active primary tab (or '' for none).
 * Mirrors the active-state logic used by BottomNavigation so both surfaces
 * highlight the same tab for the same URL.
 *
 * `primaryTeamId` is needed for the `/team/:id` -> teams tab fallback used
 * by the existing mobile bottom nav.
 */
export function getActiveMainScreen(
  pathname: string,
  primaryTeamId: string | null,
): MainScreenId | '' {
  if (pathname === '/') return 'home';
  if (
    pathname.startsWith('/teams') ||
    pathname.startsWith('/tournament-teams') ||
    (pathname.startsWith('/team/') &&
      primaryTeamId &&
      pathname.includes(primaryTeamId))
  ) {
    return 'teams';
  }
  if (pathname.startsWith('/messages')) return 'messages';
  if (pathname.startsWith('/profile') || pathname.startsWith('/subscription')) {
    return 'profile';
  }
  if (
    pathname.startsWith('/payment-requests') ||
    pathname.startsWith('/create-payment-request')
  ) {
    return 'payments';
  }
  return '';
}

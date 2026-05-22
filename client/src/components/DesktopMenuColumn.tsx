import { useState } from 'react';
import { useLocation } from 'wouter';
import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import {
  Calendar,
  Settings,
  Plus,
  Crown,
  Users,
  UserPlus,
  Trophy,
  Target,
  Lock,
  Search,
  MessageSquare,
} from 'lucide-react';
import { PremiumFeatureAlert } from '@/components/PremiumFeatureAlert';
import FeedbackModal from '@/components/FeedbackModal';

/**
 * Permanent vertical menu column shown on desktop between the left primary
 * sidebar and the main content. Replaces the hamburger-triggered SlideOutMenu
 * on desktop; the SlideOutMenu is still used on mobile/native shells.
 *
 * Item list, permission gating, and locked-item handling are kept in sync
 * with SlideOutMenu. The "Desktop Recommended" warning that SlideOutMenu
 * shows for /tournaments is intentionally omitted here since this column
 * only renders on desktop in the first place.
 */
export function DesktopMenuColumn() {
  const [, navigate] = useLocation();
  const [showPremiumAlert, setShowPremiumAlert] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const {
    canAccessPremiumFeatures,
    canManageLeague,
    hasStatManagerAccess,
    isCoCommissionerOfAnyLeague,
    isLoading,
  } = usePermissions();

  const isCommissioner = canManageLeague();
  const isPlayerPro = canAccessPremiumFeatures();
  const proItemsLocked = isLoading || (!isPlayerPro && !isCommissioner);
  const commissionerItemsLocked = isLoading || !isCommissioner;
  const leagueManagementLocked = isLoading || !isCoCommissionerOfAnyLeague();
  const scorekeeperLocked = isLoading || !hasStatManagerAccess();

  const menuItems = [
    {
      icon: Calendar,
      label: 'Schedule Scrimmage',
      path: '/create-scrimmage',
      locked: proItemsLocked,
      bgColor: 'bg-blue-500/20',
      iconColor: 'text-blue-500',
    },
    {
      icon: UserPlus,
      label: 'Invite Groups',
      path: '/invite-groups',
      locked: proItemsLocked,
      bgColor: 'bg-teal-500/20',
      iconColor: 'text-teal-500',
    },
    {
      icon: Settings,
      label: 'Scrimmage Management',
      path: '/scrimmage-management',
      locked: proItemsLocked,
      bgColor: 'bg-purple-500/20',
      iconColor: 'text-purple-500',
    },
    {
      icon: Users,
      label: 'Create a Team',
      path: '/create-team',
      locked: proItemsLocked,
      bgColor: 'bg-cyan-500/20',
      iconColor: 'text-cyan-500',
    },
    {
      icon: Plus,
      label: 'Create a League',
      path: '/create-league',
      locked: commissionerItemsLocked,
      bgColor: 'bg-green-500/20',
      iconColor: 'text-green-500',
    },
    {
      icon: Crown,
      label: 'League Management',
      path: '/league-list',
      locked: leagueManagementLocked,
      bgColor: 'bg-amber-500/20',
      iconColor: 'text-amber-500',
    },
    {
      icon: Trophy,
      label: 'Tournaments',
      path: '/tournaments',
      locked: commissionerItemsLocked,
      bgColor: 'bg-orange-500/20',
      iconColor: 'text-orange-500',
    },
    {
      icon: Target,
      label: 'Scorekeeper',
      path: '/scorekeeper',
      locked: scorekeeperLocked,
      bgColor: 'bg-red-500/20',
      iconColor: 'text-red-500',
    },
    {
      icon: Search,
      label: 'Find a League / Tournament',
      path: '/league-tournament-search',
      locked: false,
      bgColor: 'bg-sky-500/20',
      iconColor: 'text-sky-500',
    },
    {
      icon: Users,
      label: 'Find a Team',
      path: '/team-search',
      locked: false,
      bgColor: 'bg-indigo-500/20',
      iconColor: 'text-indigo-500',
    },
  ];

  const handleNavigate = (path: string, locked: boolean) => {
    if (isLoading) return;
    if (locked) {
      setShowPremiumAlert(true);
      return;
    }
    // Note: the "Desktop Recommended" warning that SlideOutMenu shows for
    // /tournaments is intentionally omitted here — this column only renders
    // on desktop, so the warning would be nonsensical.
    setPageTransitionDirection('up');
    navigate(path);
  };

  return (
    <>
      <aside
        className="flex flex-col h-full w-full bg-[#f5f5f5cc]"
        data-testid="desktop-menu-column"
      >
        <div className="px-5 pt-6 pb-3 flex items-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-900">Menu</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-2">
          {menuItems.map((item) => {
            const showLock = item.locked;
            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path, item.locked)}
                disabled={isLoading}
                className={`w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-3 flex items-center justify-between transition-all hover:bg-white/90 dark:hover:bg-black/80 hover:border-primary/50 ${
                  showLock ? 'opacity-50' : ''
                } ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
                data-testid={`desktop-menu-item-${item.path.replace(/\//g, '-')}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2.5 rounded-xl flex-shrink-0 ${item.bgColor}`}>
                    <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                  </div>
                  <span className="text-sm font-semibold text-left text-gray-900 dark:text-white truncate">
                    {item.label}
                  </span>
                </div>
                {showLock && (
                  <Lock className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2" />
                )}
              </button>
            );
          })}
          <button
            onClick={() => setShowFeedbackModal(true)}
            className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg p-3 flex items-center gap-3 transition-all hover:bg-white/90 dark:hover:bg-black/80 hover:border-primary/50"
            data-testid="desktop-menu-item-feedback"
          >
            <div className="p-2.5 rounded-xl flex-shrink-0 bg-pink-500/20">
              <MessageSquare className="w-5 h-5 text-pink-500" />
            </div>
            <span className="text-sm font-semibold text-left text-gray-900 dark:text-white truncate">
              Send Feedback
            </span>
          </button>
        </div>
      </aside>

      <FeedbackModal isOpen={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} />
      <PremiumFeatureAlert
        open={showPremiumAlert}
        onOpenChange={setShowPremiumAlert}
      />
    </>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Menu, Calendar, Settings, Plus, Crown, Users, X, UserPlus, Trophy, Target, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { PremiumFeatureAlert } from '@/components/PremiumFeatureAlert';

export function SlideOutMenu() {
  const [open, setOpen] = useState(false);
  const [showPremiumAlert, setShowPremiumAlert] = useState(false);
  const [location, navigate] = useLocation();
  const pendingPathRef = useRef<string | null>(null);
  const { canAccessPremiumFeatures, canManageLeague, hasStatManagerAccess, isCoCommissionerOfAnyLeague, isLoading } = usePermissions();

  // Only show hamburger menu on home and profile screens
  const shouldShowHamburger = location === '/' || location === '/profile';

  // Permission checks:
  // Free tier: Only Scorekeeper (if assigned by commissioner)
  // Player Pro: Schedule Scrimmage, Invite Groups, Scrimmage Management, Create a Team
  // Commissioner: All menu items
  const isCommissioner = canManageLeague();
  const isPlayerPro = canAccessPremiumFeatures();
  
  // Lock logic: While loading, show locks. After loading, check actual permissions.
  // This prevents briefly showing unlocked items before permissions are checked.
  
  // PRO items: locked if user is NOT player_pro AND NOT commissioner
  const proItemsLocked = isLoading || (!isPlayerPro && !isCommissioner);
  
  // Commissioner items: locked if user is NOT commissioner
  const commissionerItemsLocked = isLoading || !isCommissioner;
  
  // League Management: locked if user is NOT a co-commissioner of any league
  const leagueManagementLocked = isLoading || !isCoCommissionerOfAnyLeague();
  
  // Scorekeeper: locked if user doesn't have stat manager access
  const scorekeeperLocked = isLoading || !hasStatManagerAccess();
  
  console.log('[SlideOutMenu] Permissions:', { isLoading, isCommissioner, isPlayerPro, proItemsLocked, commissionerItemsLocked });

  const menuItems = [
    {
      icon: Calendar,
      label: 'Schedule Scrimmage',
      path: '/create-scrimmage',
      locked: proItemsLocked,
      requiredTier: 'PRO',
      bgColor: 'bg-blue-500/20',
      iconColor: 'text-blue-500',
    },
    {
      icon: UserPlus,
      label: 'Invite Groups',
      path: '/invite-groups',
      locked: proItemsLocked,
      requiredTier: 'PRO',
      bgColor: 'bg-teal-500/20',
      iconColor: 'text-teal-500',
    },
    {
      icon: Settings,
      label: 'Scrimmage Management',
      path: '/scrimmage-management',
      locked: proItemsLocked,
      requiredTier: 'PRO',
      bgColor: 'bg-purple-500/20',
      iconColor: 'text-purple-500',
    },
    {
      icon: Users,
      label: 'Create a Team',
      path: '/create-team',
      locked: proItemsLocked,
      requiredTier: 'PRO',
      bgColor: 'bg-cyan-500/20',
      iconColor: 'text-cyan-500',
    },
    {
      icon: Plus,
      label: 'Create a League',
      path: '/create-league',
      locked: commissionerItemsLocked,
      requiredTier: 'COMMISSIONER',
      bgColor: 'bg-green-500/20',
      iconColor: 'text-green-500',
    },
    {
      icon: Crown,
      label: 'League Management',
      path: '/league-list',
      locked: leagueManagementLocked,
      requiredTier: 'COMMISSIONER',
      bgColor: 'bg-amber-500/20',
      iconColor: 'text-amber-500',
    },
    {
      icon: Trophy,
      label: 'Tournaments',
      path: '/tournaments',
      locked: commissionerItemsLocked,
      requiredTier: 'COMMISSIONER',
      bgColor: 'bg-orange-500/20',
      iconColor: 'text-orange-500',
    },
    {
      icon: Target,
      label: 'Scorekeeper',
      path: '/scorekeeper',
      locked: scorekeeperLocked,
      requiredTier: 'SCOREKEEPER',
      bgColor: 'bg-red-500/20',
      iconColor: 'text-red-500',
    },
  ];

  // Handle navigation after sheet closes
  useEffect(() => {
    if (!open && pendingPathRef.current) {
      const path = pendingPathRef.current;
      pendingPathRef.current = null;
      // Navigate after the sheet animation completes
      const timer = setTimeout(() => {
        navigate(path);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [open, navigate]);

  const handleNavigate = (path: string, locked: boolean) => {
    // Block navigation while permissions are loading
    if (isLoading) {
      return;
    }
    
    if (locked) {
      setShowPremiumAlert(true);
      return;
    }
    
    setPageTransitionDirection('up');
    pendingPathRef.current = path;
    setOpen(false);
  };

  // Always render the Sheet component to ensure proper cleanup
  // Just hide the trigger button when not on allowed screens
  return (
    <>
      {/* Fixed header bar with menu icon - only visible on allowed screens */}
      {shouldShowHamburger && (
        <div className="fixed top-[32px] right-6 z-50 flex items-center gap-2">
          <button
            onClick={() => setOpen(true)}
            className="w-8 h-8 flex items-center justify-center hover:bg-card/50 rounded-lg transition-colors"
            data-testid="button-hamburger-menu"
          >
            <Menu className="w-8 h-8 text-foreground" />
          </button>
        </div>
      )}
      
      {/* Sheet is always rendered to ensure proper overlay cleanup */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent 
          side="right" 
          className="w-[85%] sm:w-[400px] h-screen border-l border-border bg-background flex flex-col [&>button]:hidden"
        >
          <SheetHeader className="flex-shrink-0 px-6 pt-[4px] pb-[4px]">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-2xl font-bold">Menu</SheetTitle>
              <SheetClose asChild>
                <button
                  className="w-10 h-10 bg-red-600 hover:bg-red-700 rounded flex items-center justify-center transition-colors"
                  data-testid="button-close-menu"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </SheetClose>
            </div>
          </SheetHeader>
          
          <div className="flex-1 flex flex-col justify-evenly px-6 pb-6">
            {menuItems.map((item) => {
              const showLock = item.locked;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path, item.locked)}
                  disabled={isLoading}
                  className={`w-full bg-card border border-border rounded-lg p-3 flex items-center justify-between transition-all hover:bg-card/80 hover:border-primary/50 ${showLock ? 'opacity-50' : ''} ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
                  data-testid={`menu-item-${item.path.replace(/\//g, '-')}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${item.bgColor}`}>
                      <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                    </div>
                    <span className="text-base font-semibold text-left text-foreground">
                      {item.label}
                    </span>
                  </div>
                  {showLock ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-500">LOCKED</span>
                      <Lock className="w-4 h-4 text-red-500" />
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-base">→</div>
                  )}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
      
      <PremiumFeatureAlert 
        open={showPremiumAlert} 
        onOpenChange={setShowPremiumAlert} 
      />
    </>
  );
}

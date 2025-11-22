import { useState } from 'react';
import { useLocation } from 'wouter';
import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Menu, Calendar, Settings, Plus, Crown, Users, X, UserPlus, Trophy, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { PremiumFeatureAlert } from '@/components/PremiumFeatureAlert';

export function SlideOutMenu() {
  const [open, setOpen] = useState(false);
  const [showPremiumAlert, setShowPremiumAlert] = useState(false);
  const [location, navigate] = useLocation();
  const { canAccessPremiumFeatures, canManageLeague, hasRole } = usePermissions();

  // Only show hamburger menu on home and profile screens
  const shouldShowHamburger = location === '/' || location === '/profile';

  const menuItems = [
    {
      icon: Search,
      label: 'Find Tournament',
      path: '/tournament-search',
      locked: false,
      requiredTier: null,
      bgColor: 'bg-indigo-500/20',
      iconColor: 'text-indigo-500',
    },
    {
      icon: Calendar,
      label: 'Schedule Scrimmage',
      path: '/create-scrimmage',
      locked: false,
      requiredTier: null,
      bgColor: 'bg-blue-500/20',
      iconColor: 'text-blue-500',
    },
    {
      icon: UserPlus,
      label: 'Invite Groups',
      path: '/invite-groups',
      locked: false,
      requiredTier: null,
      bgColor: 'bg-teal-500/20',
      iconColor: 'text-teal-500',
    },
    {
      icon: Settings,
      label: 'Scrimmage Management',
      path: '/scrimmage-management',
      locked: !canAccessPremiumFeatures(),
      requiredTier: 'PRO',
      bgColor: 'bg-purple-500/20',
      iconColor: 'text-purple-500',
    },
    {
      icon: Users,
      label: 'Create a Team',
      path: '/create-team',
      locked: false,
      requiredTier: null,
      bgColor: 'bg-cyan-500/20',
      iconColor: 'text-cyan-500',
    },
    {
      icon: Plus,
      label: 'Create a League',
      path: '/create-league',
      locked: !canManageLeague(),
      requiredTier: 'COMMISSIONER',
      bgColor: 'bg-green-500/20',
      iconColor: 'text-green-500',
    },
    {
      icon: Trophy,
      label: 'Tournaments',
      path: '/tournaments',
      locked: !hasRole('secondary_commissioner'),
      requiredTier: 'COMMISSIONER',
      bgColor: 'bg-orange-500/20',
      iconColor: 'text-orange-500',
    },
    {
      icon: Crown,
      label: 'League Management',
      path: '/league-list',
      locked: !hasRole('secondary_commissioner'),
      requiredTier: 'COMMISSIONER',
      bgColor: 'bg-amber-500/20',
      iconColor: 'text-amber-500',
    },
  ];

  const handleNavigate = (path: string, locked: boolean) => {
    if (locked) {
      setShowPremiumAlert(true);
      return;
    }
    
    setPageTransitionDirection('up');
    navigate(path);
    setOpen(false);
  };

  // Don't render if not on allowed screens
  if (!shouldShowHamburger) {
    return null;
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            className="fixed top-[32px] right-6 z-50 w-8 h-8 flex items-center justify-center hover:bg-card/50 rounded-lg transition-colors"
            data-testid="button-hamburger-menu"
          >
            <Menu className="w-8 h-8 text-foreground" />
          </button>
        </SheetTrigger>
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
            {menuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path, item.locked)}
                className="w-full bg-card border border-border rounded-lg p-3 flex items-center justify-between transition-all hover:bg-card/80 hover:border-primary/50"
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
                <div className="text-muted-foreground text-base">→</div>
              </button>
            ))}
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

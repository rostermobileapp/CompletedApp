import { useState } from 'react';
import { useLocation } from 'wouter';
import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Menu, Calendar, Settings, Plus, Crown, DollarSign, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export function SlideOutMenu() {
  const [open, setOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { canAccessPremiumFeatures, canManageLeague, hasRole } = usePermissions();

  // Only show hamburger menu on home and profile screens
  const shouldShowHamburger = location === '/' || location === '/profile';

  const menuItems = [
    {
      icon: Calendar,
      label: 'Schedule Scrimmage',
      path: '/create-scrimmage',
      locked: !canAccessPremiumFeatures(),
      requiredTier: 'PRO',
      bgColor: 'bg-blue-500/20',
      iconColor: 'text-blue-500',
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
      icon: Plus,
      label: 'Create a League',
      path: '/create-league',
      locked: !canManageLeague(),
      requiredTier: 'COMMISSIONER',
      bgColor: 'bg-green-500/20',
      iconColor: 'text-green-500',
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
    {
      icon: DollarSign,
      label: 'Payments',
      path: '/payment-requests',
      locked: false,
      requiredTier: null,
      bgColor: 'bg-emerald-500/20',
      iconColor: 'text-emerald-500',
    },
  ];

  const handleNavigate = (path: string, locked: boolean) => {
    if (locked) return;
    
    setPageTransitionDirection('up');
    navigate(path);
    setOpen(false);
  };

  // Don't render if not on allowed screens
  if (!shouldShowHamburger) {
    return null;
  }

  return (
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
        className="w-[85%] sm:w-[400px] bg-background border-l border-border"
      >
        <SheetHeader className="mb-8">
          <SheetTitle className="text-2xl font-bold">Menu</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-3">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path, item.locked)}
              disabled={item.locked}
              className={`w-full bg-card border border-border rounded-lg p-4 flex items-center justify-between transition-all ${
                item.locked 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:bg-card/80 hover:border-primary/50'
              }`}
              data-testid={`menu-item-${item.path.replace(/\//g, '-')}`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${item.locked ? 'bg-muted' : item.bgColor}`}>
                  <item.icon className={`w-6 h-6 ${item.locked ? 'text-muted-foreground' : item.iconColor}`} />
                </div>
                <span className={`text-lg font-semibold ${item.locked ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {item.label}
                </span>
              </div>
              {item.locked ? (
                <div className="text-muted-foreground text-lg">🔒</div>
              ) : (
                <div className="text-muted-foreground text-lg">→</div>
              )}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

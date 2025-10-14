import { useState } from 'react';
import { useLocation } from 'wouter';
import { usePermissions } from '@/context/SubscriptionContext';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Menu, Calendar, Settings, Plus, Crown, DollarSign, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export function SlideOutMenu() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { canAccessPremiumFeatures, canManageLeague, hasRole } = usePermissions();

  const menuItems = [
    {
      icon: Calendar,
      label: 'Schedule Scrimmage',
      path: '/create-scrimmage',
      locked: !canAccessPremiumFeatures(),
      requiredTier: 'PRO',
    },
    {
      icon: Settings,
      label: 'Scrimmage Management',
      path: '/scrimmage-management',
      locked: !canAccessPremiumFeatures(),
      requiredTier: 'PRO',
    },
    {
      icon: Plus,
      label: 'Create a League',
      path: '/create-league',
      locked: !canManageLeague(),
      requiredTier: 'COMMISSIONER',
    },
    {
      icon: Crown,
      label: 'League Management',
      path: '/league-list',
      locked: !hasRole('secondary_commissioner'),
      requiredTier: 'COMMISSIONER',
    },
    {
      icon: DollarSign,
      label: 'Payments',
      path: '/payment-requests',
      locked: false,
      requiredTier: null,
    },
  ];

  const handleNavigate = (path: string, locked: boolean) => {
    if (locked) return;
    
    setPageTransitionDirection('up');
    navigate(path);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="fixed top-6 right-6 z-50 w-16 h-16 flex items-center justify-center hover:bg-card/50 rounded-lg transition-colors"
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
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 ${item.locked ? 'text-muted-foreground' : 'text-primary'}`} />
                <span className={`font-medium ${item.locked ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {item.label}
                </span>
                {item.requiredTier && (
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                    item.requiredTier === 'COMMISSIONER' 
                      ? 'bg-warning text-black' 
                      : 'bg-primary text-primary-foreground'
                  }`}>
                    {item.requiredTier}
                  </span>
                )}
              </div>
              {item.locked ? (
                <div className="text-muted-foreground text-sm">🔒</div>
              ) : (
                <div className="text-muted-foreground">→</div>
              )}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

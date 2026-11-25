import { motion, LayoutGroup } from 'framer-motion';
import homeLogo from '@assets/Home_Logo_1768323157245.png';
import { cn } from '@/lib/utils';
import { MAIN_NAV_ITEMS, type MainScreenId } from '@/lib/mainNavRoutes';

export interface BottomNavigationViewProps {
  activeId: MainScreenId | '';
  onNavigate: (id: MainScreenId) => void;
  unreadMessages?: number;
  unpaidPayments?: number;
}

export function BottomNavigationView({
  activeId,
  onNavigate,
  unreadMessages = 0,
  unpaidPayments = 0,
}: BottomNavigationViewProps) {
  const navItemsById = new Map(MAIN_NAV_ITEMS.map((item) => [item.id, item]));
  const shortcuts = (['teams', 'messages', 'home', 'payments', 'profile'] as MainScreenId[])
    .map((id) => {
      const config = navItemsById.get(id);
      return { id, icon: config?.icon ?? null, label: config?.label ?? '' };
    });

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-[100]"
      data-testid="bottom-navigation"
      style={{
        paddingBottom: 'var(--native-inset-bottom, env(safe-area-inset-bottom, 0px))',
        minHeight: '60px',
      }}
    >
      <LayoutGroup>
        <div className="grid py-2 grid-cols-5 bg-[#e2e2e2] dark:bg-[#212121] pt-[2px] pb-[2px]">
          {shortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            const isActive = activeId === shortcut.id;
            const badge =
              shortcut.id === 'messages' && unreadMessages > 0 ? (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold" data-testid="message-badge">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </div>
              ) : shortcut.id === 'payments' && unpaidPayments > 0 ? (
                <div className="absolute -top-1 -right-4 bg-red-500 text-white text-[10px] rounded-full w-[17px] h-[17px] flex items-center justify-center font-bold" data-testid="payment-badge">
                  {unpaidPayments > 99 ? '99+' : unpaidPayments}
                </div>
              ) : null;

            return (
              <button
                key={shortcut.id}
                onClick={() => onNavigate(shortcut.id)}
                className={cn(
                  'flex flex-col items-center py-2 w-full transition-colors',
                  isActive ? 'text-primary' : 'text-[#212121]/70 dark:text-muted-foreground',
                )}
                data-testid={`nav-${shortcut.id}`}
              >
                <div className="relative h-[35px] w-full flex items-center justify-center mb-1">
                  {isActive ? (
                    <motion.div
                      layoutId="active-nav-pill"
                      className="absolute -top-6 w-12 h-12 rounded-full bg-[#e2e2e2] dark:bg-[#212121] hairline elev-lift flex items-center justify-center"
                      style={{ left: '50%', marginLeft: '-24px' }}
                      transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.9 }}
                    >
                      <motion.div
                        key={shortcut.id}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 600,
                          damping: 28,
                          mass: 0.6,
                          delay: 0.05,
                        }}
                        className="relative flex items-center justify-center"
                      >
                        {shortcut.id === 'home' ? (
                          <img src={homeLogo} alt="Home" className="w-7 h-7" />
                        ) : Icon ? (
                          <div className="relative">
                            <Icon className="w-6 h-6" />
                            {badge}
                          </div>
                        ) : null}
                      </motion.div>
                    </motion.div>
                  ) : shortcut.id === 'home' ? (
                    <img src={homeLogo} alt="Home" className="w-[35px] h-[35px] -mt-[10px]" />
                  ) : Icon ? (
                    <div className="relative">
                      <Icon className="w-[25px] h-[25px]" />
                      {badge}
                    </div>
                  ) : null}
                </div>
                <span className={cn('text-xs', isActive ? 'font-bold' : 'font-medium')}>
                  {shortcut.label}
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
    </nav>
  );
}

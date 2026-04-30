import { useAuth } from '@/hooks/useAuth';

export function AdSenseBanner() {
  const { user } = useAuth();

  // Only show for free tier users
  if (!user || user.role !== 'free_tier') {
    return null;
  }

  return (
    <div 
      className="left-0 right-0 flex items-center justify-center bg-muted/50 border-t border-border"
      style={{ position: 'fixed', bottom: '82px', height: '50px', zIndex: 40 }}
      data-testid="adsense-banner-container"
    >
      <div 
        className="adsense-banner flex items-center justify-center bg-background border border-[hsl(var(--hairline))] shadow-[var(--elev-inset)] rounded"
        style={{ width: '320px', height: '50px' }}
        data-testid="adsense-banner"
      >
        {/* Placeholder for Google AdSense code */}
        <p className="text-xs text-muted-foreground">Ad Space - Insert AdSense Code Here</p>
      </div>
    </div>
  );
}

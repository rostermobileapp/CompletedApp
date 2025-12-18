import { usePermissions } from '@/context/SubscriptionContext';
import hpibBannerImage from '@assets/HPIB-Red2_1765832928238.png';

interface HPIBBannerProps {
  placement: 'bottom-nav' | 'profile-header';
}

export function HPIBBanner({ placement }: HPIBBannerProps) {
  const { role, isLoading } = usePermissions();

  // Don't render while loading to prevent flash
  if (isLoading) {
    return null;
  }

  const isFreeUser = role === 'free_tier';
  const isPaidUser = role === 'player_pro' || role === 'commissioner' || role === 'secondary_commissioner';

  if (placement === 'bottom-nav') {
    // Only show for free tier users
    if (!isFreeUser) {
      return null;
    }

    return (
      <a
        href="https://hockeyplayersinbusiness.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed left-0 right-0 flex items-center justify-center bg-transparent cursor-pointer"
        style={{ bottom: '82px', height: '50px', zIndex: 40 }}
        data-testid="hpib-banner-bottom"
      >
        <img
          src={hpibBannerImage}
          alt="Hockey Players in Business - Join for only $50/yr"
          className="w-full h-full object-cover"
        />
      </a>
    );
  }

  if (placement === 'profile-header') {
    // Only show for paid tier users on their profile
    if (!isPaidUser) {
      return null;
    }

    return (
      <a
        href="https://hockeyplayersinbusiness.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-full cursor-pointer my-3"
        data-testid="hpib-banner-profile"
      >
        <img
          src={hpibBannerImage}
          alt="Hockey Players in Business - Join for only $50/yr"
          className="w-full max-w-md h-auto object-contain rounded-lg"
          style={{ maxHeight: '60px' }}
        />
      </a>
    );
  }

  return null;
}

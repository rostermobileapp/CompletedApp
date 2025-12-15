import { useAuth } from '@/hooks/useAuth';
import hpibBannerImage from '@assets/HPIB-Red2_1765832928238.png';

interface HPIBBannerProps {
  placement: 'bottom-nav' | 'profile-header';
}

export function HPIBBanner({ placement }: HPIBBannerProps) {
  const { user } = useAuth();

  const isPaidUser = user?.role === 'player_pro' || user?.role === 'commissioner';

  if (placement === 'bottom-nav') {
    if (!user || isPaidUser) {
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
          className="h-full w-auto max-w-full object-contain"
          style={{ maxHeight: '50px' }}
        />
      </a>
    );
  }

  if (placement === 'profile-header') {
    if (!user || !isPaidUser) {
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

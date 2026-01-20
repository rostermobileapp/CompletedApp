import hpibBannerImage from "@assets/HPIB-Red2_(1)_1768339929994.png";
import { usePermissions } from "@/context/SubscriptionContext";

interface HPIBBannerProps {
  placement: 'bottom-nav' | 'profile-header';
}

export function HPIBBanner({ placement }: HPIBBannerProps) {
  const { hasRole } = usePermissions();
  const isPaidUser = hasRole('player_pro');

  const handleClick = () => {
    window.open('https://hockeyplayersinbusiness.org/', '_blank');
  };

  if (placement === 'bottom-nav') {
    if (isPaidUser) return null;
    
    return (
      <div 
        className="fixed bottom-16 left-0 right-0 z-40 cursor-pointer flex justify-center"
        onClick={handleClick}
      >
        <img 
          src={hpibBannerImage} 
          alt="Hockey Players In Business - Join for only $50/yr"
          className="w-full max-w-2xl h-auto max-h-32 object-cover"
        />
      </div>
    );
  }

  if (placement === 'profile-header') {
    if (!isPaidUser) return null;
    
    return (
      <div 
        className="w-full cursor-pointer mb-4"
        onClick={handleClick}
      >
        <img 
          src={hpibBannerImage} 
          alt="Hockey Players In Business - Join for only $50/yr"
          className="w-full h-auto object-cover rounded-lg"
        />
      </div>
    );
  }

  return null;
}

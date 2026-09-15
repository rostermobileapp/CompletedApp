import { useEffect, useState } from "react";
import { usePermissions } from "@/context/SubscriptionContext";
import { useLocation } from "wouter";
import {
  getPartnerBannerForHour,
  getUtcHourSlot,
  HOUR_IN_MILLISECONDS,
} from "@/config/partnerBanners";

interface HPIBBannerProps {
  placement: 'bottom-nav' | 'profile-header';
}

export function HPIBBanner({ placement }: HPIBBannerProps) {
  const { hasRole } = usePermissions();
  const isPaidUser = hasRole('player_pro');
  const [location] = useLocation();
  const [utcHourSlot, setUtcHourSlot] = useState(() => getUtcHourSlot());
  const partnerBanner = getPartnerBannerForHour(utcHourSlot);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextHour = () => {
      const millisecondsIntoHour = Date.now() % HOUR_IN_MILLISECONDS;
      const millisecondsUntilNextHour = HOUR_IN_MILLISECONDS - millisecondsIntoHour + 50;

      timeoutId = setTimeout(() => {
        setUtcHourSlot(getUtcHourSlot());
        scheduleNextHour();
      }, millisecondsUntilNextHour);
    };

    scheduleNextHour();
    return () => clearTimeout(timeoutId);
  }, []);

  const handleClick = () => {
    window.open(partnerBanner.href, '_blank');
  };

  if (placement === 'bottom-nav') {
    if (isPaidUser) return null;
    
    if (location.startsWith('/messages')) return null;
    if (location.startsWith('/subscription')) return null;
    
    return (
      <div 
        className="fixed bottom-20 left-0 right-0 z-40 cursor-pointer flex justify-center"
        onClick={handleClick}
      >
        <img 
          src={partnerBanner.image}
          alt={partnerBanner.alt}
          className="w-full max-w-2xl h-auto max-h-32 object-cover"
        />
      </div>
    );
  }

  if (placement === 'profile-header') {
    if (!isPaidUser) return null;
    
    return (
      <div 
        className="cursor-pointer mb-4 flex justify-center"
        onClick={handleClick}
      >
        <img 
          src={partnerBanner.image}
          alt={partnerBanner.alt}
          className="max-w-full h-auto rounded-lg"
          style={{ width: 'auto', maxWidth: '100%' }}
        />
      </div>
    );
  }

  return null;
}

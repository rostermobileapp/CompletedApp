import { useEffect } from 'react';
import { useLocation } from 'wouter';

// Old magic-link auth route — redirect to login for any stale links
export default function ReferralPortalAuth() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation('/referral-program/portal/login');
  }, [setLocation]);
  return null;
}

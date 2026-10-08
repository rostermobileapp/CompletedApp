import { useEffect } from 'react';

export function useMarketingVisit() {
  useEffect(() => {
    async function recordVisit() {
      try {
        const resp = await fetch('https://ipapi.co/json/');
        if (!resp.ok) return;
        const geo = await resp.json();
        const country = geo.country_code as string;
        if (country !== 'US' && country !== 'CA') return;
        const ip: string = geo.ip;
        const encoder = new TextEncoder();
        const data = encoder.encode(ip);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const ipHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        await fetch('/api/visitor-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ipHash,
            lat: geo.latitude,
            lng: geo.longitude,
            city: geo.city || null,
            country,
          }),
        });
      } catch {
        // silently ignore any errors
      }
    }
    recordVisit();
  }, []);


}

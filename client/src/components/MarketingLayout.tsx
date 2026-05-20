import { useEffect, ReactNode, useState } from 'react';
import { useIsIosDevice } from '@/hooks/useIosPlatform';
import { Link, useLocation } from 'wouter';
import { SiAppstore, SiGoogleplay } from 'react-icons/si';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import rosterLightLogo from "@assets/Light_Mode_Logo_1768322748282.png";

interface MarketingLayoutProps {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  canonical?: string;
  children: ReactNode;
}

const OG_IMAGE = '/roster-logo.png';

export function MarketingLayout({ title, description, ogTitle, ogDescription, canonical, children }: MarketingLayoutProps) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isIos = useIsIosDevice();
  const { isAuthenticated } = useAuth();

  // Always scroll to top when this component mounts
  useEffect(() => {
    window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    document.title = title;

    const resolvedCanonical = canonical ?? (window.location.origin + location);
    const resolvedOgTitle = ogTitle ?? title;
    const resolvedOgDesc = ogDescription ?? description;
    const ogImageUrl = window.location.origin + OG_IMAGE;

    const setMeta = (name: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const setCanonical = (href: string) => {
      let el = document.querySelector('link[rel="canonical"]');
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    setMeta('description', description);
    setMeta('og:title', resolvedOgTitle, true);
    setMeta('og:description', resolvedOgDesc, true);
    setMeta('og:type', 'website', true);
    setMeta('og:image', ogImageUrl, true);
    setMeta('og:url', resolvedCanonical, true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', resolvedOgTitle);
    setMeta('twitter:description', resolvedOgDesc);
    setMeta('twitter:image', ogImageUrl);
    setCanonical(resolvedCanonical);

    return () => {
      document.title = 'Roster — Hockey Team Management App';
      const clearMeta = (name: string, property = false) => {
        const attr = property ? 'property' : 'name';
        const el = document.querySelector(`meta[${attr}="${name}"]`);
        if (el) el.setAttribute('content', '');
      };
      clearMeta('description');
      clearMeta('og:title', true);
      clearMeta('og:description', true);
      clearMeta('og:image', true);
      clearMeta('og:url', true);
      clearMeta('twitter:title');
      clearMeta('twitter:description');
      clearMeta('twitter:image');
      const canonicalEl = document.querySelector('link[rel="canonical"]');
      if (canonicalEl) canonicalEl.setAttribute('href', '');
    };
  }, [title, description, ogTitle, ogDescription, canonical, location]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {!isAuthenticated && (
        <>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-[70] bg-white/90 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-0 flex justify-between items-center">
          <nav className="hidden md:flex items-center gap-1 text-sm whitespace-nowrap">
            <Link href="/" className="px-3 py-2 rounded-lg text-gray-500 hover:text-[#3c82f4] hover:bg-[#3c82f4]/8 transition-colors font-medium">Home</Link>
            <Link href="/features" className="px-3 py-2 rounded-lg text-gray-500 hover:text-[#3c82f4] hover:bg-[#3c82f4]/8 transition-colors font-medium">Features</Link>
            <Link href="/pricing" className="px-3 py-2 rounded-lg text-gray-500 hover:text-[#3c82f4] hover:bg-[#3c82f4]/8 transition-colors font-medium">Pricing</Link>
            <Link href="/about" className="px-3 py-2 rounded-lg text-gray-500 hover:text-[#3c82f4] hover:bg-[#3c82f4]/8 transition-colors font-medium">About</Link>
            <Link href="/referral-program" className="px-3 py-2 rounded-lg text-gray-500 hover:text-[#3c82f4] hover:bg-[#3c82f4]/8 transition-colors font-medium">Partners</Link>
          </nav>
          <Link href="/">
            <img src={rosterLightLogo} alt="Roster" className="h-10 object-contain cursor-pointer" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation('/login')}
              className="hidden md:block text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium"
            >
              Log In
            </button>
            <button
              onClick={() => setLocation('/get-started')}
              className="px-4 py-2 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-xs sm:text-sm"
            >
              Get Started
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-6 py-4 space-y-3">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">Home</Link>
              <Link href="/features" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">Features</Link>
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</Link>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">About</Link>
              <Link href="/referral-program" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">Partners</Link>
            </div>
          </div>
        )}
      </header>
        </>
      )}

      {/* Page content */}
      <main style={isAuthenticated ? undefined : { paddingTop: '64px' }}>
        {children}
      </main>

      {!isAuthenticated && (
      <footer className="border-t border-gray-200 py-12 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row gap-8 justify-between mb-8">
            <div>
              <img src={rosterLightLogo} alt="Roster" className="h-8 object-contain mb-3" />
              <p className="text-sm text-gray-400 max-w-xs">Built for hockey players, by hockey players. No ads. Ever.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-sm">
              <div>
                <p className="font-semibold text-gray-900 mb-3">Product</p>
                <ul className="space-y-2 text-gray-500">
                  <li><Link href="/#features" className="hover:text-gray-900 transition-colors">Features</Link></li>
                  <li><Link href="/pricing" className="hover:text-gray-900 transition-colors">Pricing</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-3">Company</p>
                <ul className="space-y-2 text-gray-500">
                  <li><Link href="/about" className="hover:text-gray-900 transition-colors">About</Link></li>
                  <li><Link href="/support" className="hover:text-gray-900 transition-colors">Support</Link></li>
                  <li><Link href="/referral-program" className="hover:text-gray-900 transition-colors">Partner Program</Link></li>
                  <li><Link href="/privacy-policy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link></li>
                  <li><Link href="/terms-of-service" className="hover:text-gray-900 transition-colors">Terms of Service</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-3">Download</p>
                <div className="flex flex-col gap-2">
                  <a href="https://apps.apple.com/us/app/roster-hockey/id6756852981" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                    <SiAppstore className="w-4 h-4" />
                    App Store
                  </a>
                  {!isIos && (
                    <a href="https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively&utm_source=na_Med" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                      <SiGoogleplay className="w-4 h-4" />
                      Google Play
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-6 text-center">
            <p className="text-sm text-gray-400 flex items-center justify-center gap-2">© 2025 <img src={rosterLightLogo} alt="Roster" className="h-4 object-contain" />. Built for teams, by team players. No ads. Ever.</p>
          </div>
        </div>
      </footer>
      )}
    </div>
  );
}

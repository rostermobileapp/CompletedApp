import { useEffect, ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { SiAppstore, SiGoogleplay } from 'react-icons/si';
import { Menu, X } from 'lucide-react';
import rosterLightLogo from "@assets/Light_Mode_Logo_1768322748282.png";

interface MarketingLayoutProps {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  children: ReactNode;
}

export function MarketingLayout({ title, description, ogTitle, ogDescription, children }: MarketingLayoutProps) {
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Always scroll to top when this component mounts
  useEffect(() => {
    window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    document.title = title;

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

    setMeta('description', description);
    setMeta('og:title', ogTitle ?? title, true);
    setMeta('og:description', ogDescription ?? description, true);
    setMeta('og:type', 'website', true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', ogTitle ?? title);
    setMeta('twitter:description', ogDescription ?? description);

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
      clearMeta('twitter:title');
      clearMeta('twitter:description');
    };
  }, [title, description, ogTitle, ogDescription]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Launch banner */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-[#3c82f4] text-white text-center py-2.5 px-4 text-sm font-semibold tracking-wide">
        🚀 Launching May 1, 2026 — <button onClick={() => setLocation('/waitlist')} className="underline underline-offset-2 hover:no-underline font-bold">Join the waitlist for early access</button>
      </div>

      {/* Header */}
      <header className="fixed top-[44px] left-0 right-0 z-[70] bg-white/90 backdrop-blur-xl border-b border-gray-200 -mt-2">
        <div className="max-w-7xl mx-auto px-6 py-0 flex justify-between items-center">
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors">Home</Link>
            <Link href="/pricing" className="text-gray-500 hover:text-gray-900 transition-colors">Pricing</Link>
            <Link href="/about" className="text-gray-500 hover:text-gray-900 transition-colors">About</Link>
          </nav>
          <Link href="/">
            <img src={rosterLightLogo} alt="Roster" className="h-10 object-contain cursor-pointer" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              className="hidden md:block text-sm text-gray-400 cursor-not-allowed font-medium"
              title="Come back May 1st"
            >
              Log In
            </button>
            <button
              onClick={() => setLocation('/waitlist')}
              className="px-4 py-2 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-xs sm:text-sm"
            >
              Join Waitlist
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
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</Link>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">About</Link>
            </div>
          </div>
        )}
      </header>

      {/* Page content */}
      <main style={{ paddingTop: 'calc(44px + 40px)' }}>
        {children}
      </main>

      {/* Footer */}
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
                  <li><Link href="/waitlist" className="hover:text-gray-900 transition-colors">Join Waitlist</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-3">Company</p>
                <ul className="space-y-2 text-gray-500">
                  <li><Link href="/about" className="hover:text-gray-900 transition-colors">About</Link></li>
                  <li><Link href="/support" className="hover:text-gray-900 transition-colors">Support</Link></li>
                  <li><Link href="/privacy-policy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link></li>
                  <li><Link href="/terms-of-service" className="hover:text-gray-900 transition-colors">Terms of Service</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-3">Download</p>
                <div className="flex flex-col gap-2">
                  <a href="https://apps.apple.com/us/app/roster-app/id6741723004" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                    <SiAppstore className="w-4 h-4" />
                    App Store
                  </a>
                  <a href="https://play.google.com/store/search?q=roster+team+management&c=apps" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
                    <SiGoogleplay className="w-4 h-4" />
                    Google Play
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-6 text-center">
            <p className="text-sm text-gray-400 flex items-center justify-center gap-2">© 2025 <img src={rosterLightLogo} alt="Roster" className="h-4 object-contain" />. Built for teams, by team players. No ads. Ever.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

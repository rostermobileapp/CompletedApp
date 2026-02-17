import { Users, Calendar, MessageCircle, Check } from 'lucide-react';
import appPreviewImage from "@assets/previewed_1768341988878.png";
import rosterDarkLogo from "@assets/Dark_Mode_Logo_1770738054930.png";
import { useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';

function AnimatedCounter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    if (value === 0) return;
    const start = prevValue.current;
    const end = value;
    const duration = 1500;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplayValue(current);
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevValue.current = end;
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return (<span className="tabular-nums text-[20px] font-extrabold">{displayValue.toLocaleString()}</span>);
}

export default function Landing() {
  const [scrollY, setScrollY] = useState(0);
  const [, setLocation] = useLocation();

  const { data: userCountData } = useQuery<{ count: number }>({
    queryKey: ['/api/user-count'],
    refetchInterval: 30000,
  });

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white" data-testid="landing-page">
      {userCountData && userCountData.count > 0 && (
        <div className="fixed top-20 left-4 z-40 backdrop-blur-sm border border-gray-700/50 rounded-xl px-4 py-2.5 shadow-lg shadow-black/30 bg-[#3c82f4]">
          <div className="flex flex-col items-center text-center">
            <span className="font-medium text-[16px] text-[#ffffff] leading-tight">Players</span>
            <span className="font-medium text-[16px] text-[#ffffff] leading-tight">Using</span>
            <span className="font-medium text-[16px] text-[#ffffff] leading-tight">Roster:</span>
            <span className="text-sm font-bold text-white mt-0.5">
              <AnimatedCounter value={userCountData.count} />
            </span>
          </div>
        </div>
      )}
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="w-24"></div>
          <img 
            src={rosterDarkLogo}
            alt="Roster"
            className="h-10 object-contain"
            data-testid="logo-image"
          />
          <div className="w-24"></div>
        </div>
      </header>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div 
          className="absolute inset-0 bg-gradient-to-b from-[#3c82f4]/5 via-transparent to-transparent"
          style={{ transform: `translateY(${scrollY * 0.5}px)` }}
        />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <button
            onClick={() => setLocation('/waitlist')}
            className="px-8 py-3 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-lg mb-8"
            data-testid="button-join-waitlist"
          >
            Join the Waitlist
          </button>
          <h1 
            className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 leading-tight tracking-tight text-white"
            data-testid="text-hero-title"
          >
            Your Rec League Team,
            <br />
            <span className="text-[#3c82f4]">Organized</span>
          </h1>
          <div className="flex flex-col md:flex-row gap-8 items-start justify-center mb-12">
            <div 
              className="w-full md:w-1/2 max-w-[336px] flex items-center justify-center"
              data-testid="image-hero"
            >
              <img 
                src={appPreviewImage} 
                alt="Roster app preview" 
                className="w-full h-auto rounded-3xl shadow-2xl"
              />
            </div>
            <div 
              className="text-base md:text-lg leading-relaxed text-[#ffffff] md:w-1/2 max-w-md md:mt-16"
              data-testid="text-hero-body"
            >
              <p className="mb-1 text-[24px] pt-[20px] pb-[20px]">Every rec league team falls apart the exact same way.</p>
              <p className="mb-6 text-[24px] pt-[20px] pb-[20px]">Nobody knows who's playing, nobody knows when the game is—and half the team just doesn't show up.</p>
              
              <p className="text-xl md:text-2xl mb-6 font-normal pt-[10px] pb-[10px]">Group texts, half-baked spreadsheets, email chains...</p>
              
              <p className="text-[40px] pt-[10px] pb-[10px] mt-[30px] mb-[30px] text-[#3c83f6] font-black">Total Disaster</p>
              <p className="text-[24px]">Roster fixes all of it.  One app, built by frustrated players, for players.   
              Your schedule, your lineup, your team—organized. Finally.</p>
            </div>
          </div>
        </div>
      </section>
      {/* Highlights Bar */}
      <section className="py-16 px-6 border-y border-gray-800/50 bg-gray-900/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-10 text-white" data-testid="text-highlights-heading">Running on spreadsheets / Emails / Text Threads?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex items-center justify-center gap-3" data-testid="highlight-0">
              <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0" />
              <span className="font-medium text-white">Upload & watch your season populate</span>
            </div>
            <div className="flex items-center justify-center gap-3" data-testid="highlight-1">
              <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0" />
              <span className="font-medium text-white">Get notifications of everything in your league</span>
            </div>
            <div className="flex items-center justify-center gap-3" data-testid="highlight-2">
              <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0" />
              <span className="font-medium text-white">Enjoy how it was meant to be</span>
            </div>
          </div>
        </div>
      </section>
      {/* Features Section - Comparison Table */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold mb-4 text-white" data-testid="text-features-heading">
              Everything you need.
              <br />
              <span className="text-[#3c82f4]">All in one place.</span>
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-gray-900/50 backdrop-blur-sm rounded-xl" data-testid="comparison-table">
              <thead>
                <tr className="border-b border-gray-800/50">
                  <th className="text-left p-4 font-bold text-white">Feature</th>
                  <th className="text-center p-4 font-bold bg-[#3c82f4]/10 text-white">Roster</th>
                  <th className="text-center p-4 font-bold text-white">BenchApp</th>
                  <th className="text-center p-4 font-bold text-white">TeamSnap</th>
                  <th className="text-center p-4 font-bold text-white">SportsEngine HQ</th>
                  <th className="text-center p-4 font-bold text-white">Crossbar</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 font-medium text-white">Price</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10 font-bold text-white">$6.49 / Month</td>
                  <td className="text-center p-4 text-white">$9 / Month</td>
                  <td className="text-center p-4 text-white">$16 / Month</td>
                  <td className="text-center p-4 text-white">$1,299 / Year</td>
                  <td className="text-center p-4 text-white">$995 / Year</td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Annoying Ads</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10 font-bold text-white">NEVER</td>
                  <td className="text-center p-4 text-white">MULTIPLE</td>
                  <td className="text-center p-4 text-white">TONS</td>
                  <td className="text-center p-4 text-white">ALWAYS</td>
                  <td className="text-center p-4 text-white">No</td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Team Scheduling</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Roster Management</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Player/Attendance Tracking</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">In App Messaging</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">RSVP Alerts</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Player Substitution System</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Polls/Bulletins</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Facility Event Calendar</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Fee & Payment Tracking</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Links to Venmo/CashApp</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Team Expense Tracking</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Mobile App</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Website Portal</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Multi-Team/Org Management</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Registration Notices</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Volunteer/Role Assignment</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
                <tr className="border-b border-gray-800/50">
                  <td className="p-4 text-white">Custom Awards</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                </tr>
                <tr>
                  <td className="p-4 text-white">Tournaments Mode</td>
                  <td className="text-center p-4 bg-[#3c82f4]/10"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                  <td className="text-center p-4 text-white"><Check className="w-5 h-5 text-[#3c82f4] inline" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
      {/* Pricing Section */}
      <section className="py-24 px-6 bg-gray-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold mb-4" data-testid="text-pricing-heading">
              Simple pricing.
              <br />
              <span className="text-gray-400">No surprises.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
            {/* Free Tier */}
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-3xl p-8 border border-gray-800/50" data-testid="card-pricing-free">
              <h3 className="text-2xl font-bold mb-2" data-testid="text-tier-free">FREE</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold" data-testid="text-price-free">$0</span>
                <span className="text-gray-400"> / Month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3" data-testid="feature-free-0">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">Join Leagues / Teams</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-free-1">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">Scheduling</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-free-2">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">RSVP Function</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-free-3">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">Team Only Stats</span>
                </li>
              </ul>
              <button 
                onClick={() => setLocation('/login')}
                className="w-full py-3 px-6 rounded-full border-2 border-gray-800 hover:border-[#3c82f4] transition-colors font-semibold"
                data-testid="button-pricing-free"
              >
                Get Started
              </button>
            </div>

            {/* Player Pro Tier */}
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-3xl p-8 border-2 border-[#3c82f4] relative" data-testid="card-pricing-player">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#3c82f4] text-white text-sm font-semibold px-4 py-1 rounded-full" data-testid="badge-popular">
                Most Popular
              </div>
              <h3 className="text-2xl font-bold mb-2" data-testid="text-tier-player">PLAYER PRO</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold" data-testid="text-price-player">$6.49</span>
                <span className="text-gray-400"> / Month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3" data-testid="feature-player-0">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">Everything in FREE +</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-1">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">Team Management</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-2">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">In-App Messaging</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-3">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">In-App Payments</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-4">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">Team Scheduling</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-5">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">League Stats</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-6">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">League Standings</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-7">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">League Announcements</span>
                </li>
              </ul>
              <button 
                onClick={() => setLocation('/login')}
                className="w-full py-3 px-6 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold"
                data-testid="button-pricing-player"
              >
                Get Started
              </button>
            </div>

            {/* Commissioner Tier */}
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-3xl p-8 border border-gray-800/50" data-testid="card-pricing-commissioner">
              <h3 className="text-2xl font-bold mb-2" data-testid="text-tier-commissioner">COMMISSIONER</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold" data-testid="text-price-commissioner">$12</span>
                <span className="text-gray-400"> / Month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3" data-testid="feature-commissioner-0">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">FREE & PLAYER PRO +</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-1">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">League Scheduling</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-2">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">Scorekeeping</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-3">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">Player Management</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-4">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">League Wide Posts</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-5">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">Awards & Records*</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-6">
                  <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white">Bracket Management*</span>
                </li>
              </ul>
              <button 
                onClick={() => setLocation('/login')}
                className="w-full py-3 px-6 rounded-full border-2 border-gray-800 hover:border-[#3c82f4] transition-colors font-semibold"
                data-testid="button-pricing-commissioner"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </section>
      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-12 px-6" data-testid="footer">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-sm text-gray-400" data-testid="text-footer">
              © 2025 Rosters. Built for teams, by team players.
            </p>
            <div className="flex items-center gap-6">
              <Link 
                href="/privacy-policy" 
                className="text-sm text-gray-400 hover:text-white transition-colors"
                data-testid="link-privacy-policy"
              >
                Privacy Policy
              </Link>
              <Link 
                href="/terms-of-service" 
                className="text-sm text-gray-400 hover:text-white transition-colors"
                data-testid="link-terms-of-service"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

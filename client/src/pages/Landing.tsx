import { Users, Calendar, Trophy, MessageCircle, ArrowRight, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import logoWhite from '@assets/Roster Logo White_1759233840726.png';
import heroVideo from '@assets/out (online-video-cutter.com)_1759852289677.mp4';

export default function Landing() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const features = [
    {
      icon: Users,
      title: 'Team Management',
      description: 'Build and manage your roster with comprehensive player profiles, stats tracking, and team messaging in one place.',
    },
    {
      icon: Calendar,
      title: 'Smart Scheduling',
      description: 'Coordinate games, practices, and ice time effortlessly. Automated reminders keep everyone in sync.',
    },
    {
      icon: Trophy,
      title: 'League Statistics',
      description: 'Track performance with detailed analytics. View rankings, standings, and individual player statistics.',
    },
    {
      icon: MessageCircle,
      title: 'Real-time Communication',
      description: 'Stay connected with team and league-wide chat. Share updates, photos, and coordinate on the fly.',
    },
  ];

  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <img 
            src={logoWhite} 
            alt="Roster Logo" 
            className="h-8 invert dark:invert-0"
            data-testid="logo-image"
          />
          <button 
            onClick={() => window.location.href = '/api/login'}
            className="text-sm font-medium hover:text-primary transition-colors"
            data-testid="button-sign-in"
          >
            Sign In
          </button>
        </div>
      </header>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div 
          className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent"
          style={{ transform: `translateY(${scrollY * 0.5}px)` }}
        />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <h1 
            className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 leading-tight tracking-tight"
            data-testid="text-hero-title"
          >
            Your Rec League Team,
            <br />
            <span className="text-primary">Organized</span>
          </h1>
          <div className="flex flex-col md:flex-row gap-8 items-start justify-center mb-12">
            <video 
              src={heroVideo}
              autoPlay
              muted
              playsInline
              className="w-full md:w-1/2 max-w-[336px] rounded-lg shadow-2xl"
              data-testid="video-hero"
            />
            <div 
              className="text-base md:text-lg leading-relaxed text-[#ffffff] md:w-1/2 max-w-md md:mt-16"
              data-testid="text-hero-body"
            >
              <p className="mb-1 text-[24px] pt-[20px] pb-[20px]">Every rec league team falls apart the exact same way.</p>
              <p className="mb-6 text-[24px] pt-[20px] pb-[20px]">Nobody knows who’s playing, nobody knows when the game is—and half the team just doesn’t show up.</p>
              
              <p className="text-xl md:text-2xl mb-6 font-normal pt-[10px] pb-[10px]">Group texts, half-baked spreadsheets, email chains...</p>
              
              <p className="text-[40px] pt-[10px] pb-[10px] mt-[30px] mb-[30px] text-[#3c83f6] font-black">Total Disaster</p>
              <p className="text-[24px]">Roster fixes all of it.  One app, built by frustrated players, for players.   
              Your schedule, your lineup, your team—organized. Finally.</p>
            </div>
          </div>
        </div>
      </section>
      {/* Highlights Bar */}
      <section className="py-16 px-6 border-y border-border/50 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-10" data-testid="text-highlights-heading">
            Running on spreadsheets?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex items-center justify-center gap-3" data-testid="highlight-0">
              <Check className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="font-medium">Upload your roster & schedule</span>
            </div>
            <div className="flex items-center justify-center gap-3" data-testid="highlight-1">
              <Check className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="font-medium">Roster populates your whole season in seconds</span>
            </div>
            <div className="flex items-center justify-center gap-3" data-testid="highlight-2">
              <Check className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="font-medium">Enjoy how it was meant to be</span>
            </div>
          </div>
        </div>
      </section>
      {/* Features Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold mb-4" data-testid="text-features-heading">
              Everything you need.
              <br />
              <span className="text-[#3c82f4]">All in one place.</span>
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-card/50 backdrop-blur-sm rounded-xl" data-testid="comparison-table">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-4 font-bold">Feature</th>
                  <th className="text-center p-4 font-bold bg-primary/10">Roster</th>
                  <th className="text-center p-4 font-bold">BenchApp</th>
                  <th className="text-center p-4 font-bold">TeamSnap</th>
                  <th className="text-center p-4 font-bold">SportsEngine HQ</th>
                  <th className="text-center p-4 font-bold">Crossbar</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="p-4 font-medium">Price</td>
                  <td className="text-center p-4 bg-primary/10 font-bold">$8 / Month</td>
                  <td className="text-center p-4">$9 / Month</td>
                  <td className="text-center p-4">$16 / Month</td>
                  <td className="text-center p-4">$1,299 / Year</td>
                  <td className="text-center p-4">$995 / Year</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Team Scheduling</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Roster Management</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Player/Attendance Tracking</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">In App Messaging</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">RSVP Alerts</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Player Substitution System</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Polls/Bulletins</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Facility Event Calendar</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Fee & Payment Tracking</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Links to Venmo/CashApp</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Team Expense Tracking</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Mobile App</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Website Portal</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Multi-Team/Org Management</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Registration System</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Volunteer/Role Assignment</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="p-4">Custom Awards</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                </tr>
                <tr>
                  <td className="p-4">Tournaments Mode</td>
                  <td className="text-center p-4 bg-primary/10"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><span className="text-destructive text-2xl">✕</span></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                  <td className="text-center p-4"><Check className="w-5 h-5 text-primary inline" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
      {/* Pricing Section */}
      <section className="py-24 px-6 bg-card/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold mb-4" data-testid="text-pricing-heading">
              Simple pricing.
              <br />
              <span className="text-muted-foreground">No surprises.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
            {/* Free Tier */}
            <div className="bg-card/50 backdrop-blur-sm rounded-3xl p-8 border border-border/50" data-testid="card-pricing-free">
              <h3 className="text-2xl font-bold mb-2" data-testid="text-tier-free">FREE</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold" data-testid="text-price-free">$0</span>
                <span className="text-muted-foreground"> / Month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3" data-testid="feature-free-0">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Join Leagues / Teams</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-free-1">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Scheduling</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-free-2">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">RSVP Function</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-free-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Team Only Stats</span>
                </li>
              </ul>
              <button 
                onClick={() => window.location.href = '/api/login'}
                className="w-full py-3 px-6 rounded-full border-2 border-border hover:border-primary transition-colors font-semibold"
                data-testid="button-pricing-free"
              >
                Get Started
              </button>
            </div>

            {/* Player Pro Tier */}
            <div className="bg-card/50 backdrop-blur-sm rounded-3xl p-8 border-2 border-primary relative" data-testid="card-pricing-player">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-1 rounded-full" data-testid="badge-popular">
                Most Popular
              </div>
              <h3 className="text-2xl font-bold mb-2" data-testid="text-tier-player">PLAYER PRO</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold" data-testid="text-price-player">$8</span>
                <span className="text-muted-foreground"> / Month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3" data-testid="feature-player-0">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">FREE +</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-1">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Team Management</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-2">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">In-App Messaging</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">In-App Payments</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-4">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Team Scheduling</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-5">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">League Stats</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-6">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">League Standings</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-7">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">League Announcements</span>
                </li>
              </ul>
              <button 
                onClick={() => window.location.href = '/api/login'}
                className="w-full py-3 px-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-semibold"
                data-testid="button-pricing-player"
              >
                Get Started
              </button>
            </div>

            {/* Commissioner Tier */}
            <div className="bg-card/50 backdrop-blur-sm rounded-3xl p-8 border border-border/50" data-testid="card-pricing-commissioner">
              <h3 className="text-2xl font-bold mb-2" data-testid="text-tier-commissioner">COMMISSIONER</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold" data-testid="text-price-commissioner">$12</span>
                <span className="text-muted-foreground"> / Month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3" data-testid="feature-commissioner-0">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">FREE & PLAYER PRO +</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-1">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">League Scheduling</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-2">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Scorekeeping</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Player Management</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-4">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">League Wide Posts</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-5">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Awards & Records*</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-6">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Bracket Management*</span>
                </li>
              </ul>
              <button 
                onClick={() => window.location.href = '/api/login'}
                className="w-full py-3 px-6 rounded-full border-2 border-border hover:border-primary transition-colors font-semibold"
                data-testid="button-pricing-commissioner"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </section>
      {/* Footer */}
      <footer className="border-t border-border/50 py-12 px-6">
        <div className="max-w-7xl mx-auto text-center text-muted-foreground">
          <p className="text-sm" data-testid="text-footer">
            © 2025 Rosters. Built for teams, by team players.
          </p>
        </div>
      </footer>
    </div>
  );
}

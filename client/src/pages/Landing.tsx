import { Users, Calendar, Trophy, MessageCircle, ArrowRight, Zap, Shield, BarChart3, Check } from 'lucide-react';
import { useEffect, useState } from 'react';

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

  const highlights = [
    { icon: Zap, text: 'Lightning fast performance' },
    { icon: Shield, text: 'Secure and reliable' },
    { icon: BarChart3, text: 'Powerful analytics' },
  ];

  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
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
            Your Beer League Team,
            <br />
            <span className="text-primary">Organized</span>
          </h1>
          <p 
            className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed font-medium"
            data-testid="text-hero-subtitle"
          >Make Beer League Great Again</p>
          <p 
            className="text-base md:text-lg text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed"
            data-testid="text-hero-body"
          >
            "Beer league hockey shouldn't feel like herding cats. But it does—because nobody knows who's playing, nobody knows the game time, and half the guys ghost. Why? Group texts and spreadsheets. Total clown show. Roster fixes all of it. One app, built by hockey players, for hockey players. Your schedule, your lineup, your team—organized. Finally."
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button 
              onClick={() => window.location.href = '/api/login'}
              className="group bg-primary text-primary-foreground rounded-full py-4 px-10 font-semibold text-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center gap-2"
              data-testid="button-get-started"
            >
              Download Roster
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-6" data-testid="text-pricing-info">
            Enough chaos—play hockey.
          </p>
        </div>
      </section>
      {/* Highlights Bar */}
      <section className="py-12 px-6 border-y border-border/50 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {highlights.map((highlight, index) => (
              <div 
                key={index}
                className="flex items-center justify-center gap-3 text-muted-foreground"
                data-testid={`highlight-${index}`}
              >
                <highlight.icon className="w-5 h-5" />
                <span className="font-medium">{highlight.text}</span>
              </div>
            ))}
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
              <span className="text-muted-foreground">All in one place.</span>
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="group relative bg-card/50 backdrop-blur-sm rounded-3xl p-8 lg:p-10 border border-border/50 hover:border-primary/50 transition-all hover:bg-card/80"
                data-testid={`card-feature-${index}`}
              >
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 
                  className="text-2xl font-semibold mb-3"
                  data-testid={`text-feature-title-${index}`}
                >
                  {feature.title}
                </h3>
                <p 
                  className="text-muted-foreground text-lg leading-relaxed"
                  data-testid={`text-feature-description-${index}`}
                >
                  {feature.description}
                </p>
              </div>
            ))}
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
              <h3 className="text-2xl font-bold mb-2" data-testid="text-tier-free">Free</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold" data-testid="text-price-free">$0</span>
              </div>
              <p className="text-muted-foreground mb-6">For casual players</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3" data-testid="feature-free-0">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Join leagues and view rosters</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-free-1">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Basic team messaging</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-free-2">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Game notifications</span>
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

            {/* Player Plus Tier */}
            <div className="bg-card/50 backdrop-blur-sm rounded-3xl p-8 border-2 border-primary relative" data-testid="card-pricing-player">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-1 rounded-full" data-testid="badge-popular">
                Most Popular
              </div>
              <h3 className="text-2xl font-bold mb-2" data-testid="text-tier-player">Player Plus</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold" data-testid="text-price-player">$8</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-muted-foreground mb-6">For serious players</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3" data-testid="feature-player-0">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Everything in Free</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-1">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Advanced stats tracking</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-2">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Scrimmage scheduling</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Team statistics</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-player-4">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Priority support</span>
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
              <h3 className="text-2xl font-bold mb-2" data-testid="text-tier-commissioner">Commissioner</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold" data-testid="text-price-commissioner">$12</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-muted-foreground mb-6">For league organizers</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3" data-testid="feature-commissioner-0">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Everything in Player Plus</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-1">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">League creation & management</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-2">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Commissioner dashboard</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">League statistics</span>
                </li>
                <li className="flex items-start gap-3" data-testid="feature-commissioner-4">
                  <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Advanced team management</span>
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
      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-bold mb-10" data-testid="text-cta-heading">
            Download Roster.
            <br />
            Enough chaos—play hockey.
          </h2>
          <button 
            onClick={() => window.location.href = '/api/login'}
            className="group bg-primary text-primary-foreground rounded-full py-4 px-10 font-semibold text-lg hover:bg-primary/90 transition-all hover:scale-105 inline-flex items-center gap-2"
            data-testid="button-cta-get-started"
          >
            Download Roster
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
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

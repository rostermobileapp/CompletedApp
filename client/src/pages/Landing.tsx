import { Users, Calendar, Trophy, MessageCircle, ArrowRight, Zap, Shield, BarChart3 } from 'lucide-react';
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
          <div className="text-2xl font-bold" data-testid="text-app-name">Rosters</div>
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
          >
            Stop chasing teammates. Start playing hockey.
          </p>
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

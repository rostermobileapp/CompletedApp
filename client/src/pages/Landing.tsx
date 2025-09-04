import { useLocation } from 'wouter';
import { Users, Calendar, Trophy, MessageCircle } from 'lucide-react';

export default function Landing() {
  const [, navigate] = useLocation();

  const features = [
    {
      icon: Users,
      title: 'Team Management',
      description: 'Rosters, stats, messaging',
      color: 'primary',
    },
    {
      icon: Calendar,
      title: 'Scheduling',
      description: 'Games, practice, ice time',
      color: 'accent',
    },
    {
      icon: Trophy,
      title: 'League Stats',
      description: 'Rankings, standings',
      color: 'warning',
    },
    {
      icon: MessageCircle,
      title: 'Communication',
      description: 'Team & league chat',
      color: 'destructive',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-card" data-testid="landing-page">
      {/* Header */}
      <div className="flex justify-between items-center p-6 pt-12">
        <div className="text-2xl font-bold" data-testid="text-app-name">Rosters</div>
        <button 
          onClick={() => window.location.href = '/api/login'}
          className="text-primary hover:text-primary/80 font-medium"
          data-testid="button-sign-in"
        >
          Sign In
        </button>
      </div>
      
      {/* Hero Content */}
      <div className="flex-1 flex flex-col justify-center px-6 text-center">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 leading-tight" data-testid="text-hero-title">
            Manage Your<br />
            Sports League<br />
            <span className="text-primary">Like a Pro</span>
          </h1>
          <p className="text-muted-foreground text-lg mb-8" data-testid="text-hero-subtitle">
            From beer league hockey to competitive basketball.<br />
            Everything your team needs in one app.
          </p>
        </div>
        
        {/* Feature Grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="bg-card rounded-xl p-4 border border-border"
              data-testid={`card-feature-${index}`}
            >
              <div className={`w-8 h-8 bg-${feature.color} rounded-lg flex items-center justify-center mb-3`}>
                <feature.icon className="w-4 h-4 text-primary-foreground" />
              </div>
              <h3 className="font-semibold mb-1" data-testid={`text-feature-title-${index}`}>{feature.title}</h3>
              <p className="text-xs text-muted-foreground" data-testid={`text-feature-description-${index}`}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
        
        <button 
          onClick={() => window.location.href = '/api/login'}
          className="bg-primary text-primary-foreground rounded-xl py-4 px-8 font-semibold text-lg mb-4"
          data-testid="button-get-started"
        >
          Get Started Free
        </button>
        <p className="text-xs text-muted-foreground" data-testid="text-pricing-info">
          Free forever • Upgrade for advanced features
        </p>
      </div>
    </div>
  );
}

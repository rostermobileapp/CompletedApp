import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft } from 'lucide-react';

export default function Privacy() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="privacy-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => {
              setPageTransitionDirection('down');
              navigate('/profile');
            }}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Privacy</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-16">
        <div className="max-w-2xl w-full text-center space-y-8">
          {/* Privacy Statement */}
          <div className="space-y-4">
            <p className="text-2xl font-bold" data-testid="text-privacy-statement">
              We don't sell your data.
            </p>
            <p className="text-2xl font-bold">
              Period.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Everything we collect stays internal—we use it to run the app and make it better for our users.
            </p>
            <p className="text-lg text-muted-foreground">
              That's it... that's our Privacy Statement
            </p>
          </div>

          {/* GIF */}
          <div className="w-full max-w-md mx-auto rounded-lg overflow-hidden border border-border">
            <img
              src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNG14Ynk1aW5mMHJ1Y3ptcnp2NjBnNWZzcGRhZ2NmYXkydzd3dHYzYSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/otBpmUnhfqZ0WttGvc/giphy.gif"
              alt="Privacy protection animation"
              className="w-full h-auto"
              data-testid="img-privacy-gif"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

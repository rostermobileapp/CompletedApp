import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: undefined,
          }
        });
        
        if (error) throw error;
        
        if (data.user && !data.session) {
          toast({
            title: 'Almost there!',
            description: 'Check your email to verify your account before signing in.',
          });
        } else {
          toast({
            title: 'Success!',
            description: 'Your account has been created. You can now sign in.',
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        toast({
          title: 'Welcome back!',
          description: 'You have successfully signed in.',
        });
        setLocation('/');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'An error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="login-page">
      <div className="p-4">
        <button
          onClick={() => setLocation('/')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px]"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 pb-20 bg-[#3c83f6]">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center sm:text-left">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-auth-title">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-auth-description">
              {isSignUp
                ? 'Enter your email and password to create an account'
                : 'Enter your email and password to sign in'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="min-h-[44px]"
                data-testid="input-email"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="min-h-[44px]"
                data-testid="input-password"
              />
            </div>
            
            <Button
              type="submit"
              className="w-full min-h-[44px] bg-[#212121]"
              disabled={loading}
              data-testid="button-submit"
            >
              {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Button>
            
            {!isSignUp && (
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => setLocation('/forgot-password')}
                  className="text-primary hover:underline min-h-[44px] px-2"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </button>
              </div>
            )}
            
            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-primary hover:underline min-h-[44px] px-2"
                data-testid="button-toggle-mode"
              >
                {isSignUp
                  ? 'Already have an account? Sign in'
                  : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

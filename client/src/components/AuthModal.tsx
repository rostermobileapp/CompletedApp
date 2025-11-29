import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
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
        
        // Check if email confirmation is required
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
        onOpenChange(false);
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
        onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md top-4 translate-y-0" data-testid="modal-auth">
        <DialogHeader>
          <DialogTitle data-testid="text-auth-title">
            {isSignUp ? 'Create Account' : 'Sign In'}
          </DialogTitle>
          <DialogDescription data-testid="text-auth-description">
            {isSignUp
              ? 'Enter your email and password to create an account'
              : 'Enter your email and password to sign in'}
          </DialogDescription>
        </DialogHeader>
        
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
              data-testid="input-password"
            />
          </div>
          
          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            data-testid="button-submit"
          >
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </Button>
          
          {!isSignUp && (
            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  setLocation('/forgot-password');
                }}
                className="text-primary hover:underline"
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
              className="text-primary hover:underline"
              data-testid="button-toggle-mode"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

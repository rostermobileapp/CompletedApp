import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Mail } from 'lucide-react';
import { Link } from 'wouter';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setEmailSent(true);
      toast({
        title: 'Check your email',
        description: 'We sent you a password reset link. Please check your inbox.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to send reset email',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4" data-testid="page-forgot-password">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <Link href="/" data-testid="link-back">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to home
              </Button>
            </Link>
            
            <div className="flex justify-center mb-6">
              <img 
                src="https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZjhzcWNzZjB6dWlpbjJmcDNmNWN5YXYyOWc0YWN6Z3YwZGhoaTM2NCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/co0cvSJbGMgY8NTlHC/giphy.gif"
                alt="Forgot password animation"
                className="w-48 h-48 object-contain rounded-lg"
                data-testid="img-forgot-password-gif"
              />
            </div>
            
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold" data-testid="text-title">Forgot Password?</h1>
            </div>
            
            <p className="text-muted-foreground text-sm" data-testid="text-description">
              {emailSent
                ? 'Check your email for the password reset link.'
                : 'We are disappointed in you, but if you give us your email, we can reset it for you.'}
            </p>
          </div>

          {!emailSent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
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

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                data-testid="button-submit"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>
          ) : (
            <div className="space-y-4" data-testid="success-message">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <p className="text-sm text-green-600 dark:text-green-400">
                  A password reset link has been sent to <strong>{email}</strong>
                </p>
              </div>
              
              <p className="text-sm text-muted-foreground">
                Didn't receive the email? Check your spam folder or try again.
              </p>
              
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setEmailSent(false)}
                data-testid="button-try-again"
              >
                Try Another Email
              </Button>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link href="/">
              <button className="text-sm text-primary hover:underline" data-testid="link-back-to-login">
                Back to Login
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

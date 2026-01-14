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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';

interface EmailVerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onVerificationSuccess: () => void;
}

export function EmailVerificationModal({
  open,
  onOpenChange,
  email,
  onVerificationSuccess,
}: EmailVerificationModalProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast({
        variant: 'destructive',
        title: 'Invalid code',
        description: 'Please enter the full 6-digit code.',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup',
      });

      if (error) throw error;

      toast({
        title: 'Email verified!',
        description: 'Your account has been activated. Welcome!',
      });
      onVerificationSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Verification failed',
        description: error.message || 'Invalid or expired code. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (error) throw error;

      toast({
        title: 'Code resent!',
        description: 'Check your email for a new verification code.',
      });
      setCode('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to resend code',
        description: error.message || 'Please try again later.',
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md top-4 translate-y-0">
        <DialogHeader>
          <DialogTitle>Verify your email</DialogTitle>
          <DialogDescription>
            We've sent a 6-digit verification code to <strong>{email}</strong>. Enter it below to activate your account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-6 py-4">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(value) => setCode(value)}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>

          <Button
            onClick={handleVerify}
            className="w-full"
            disabled={loading || code.length !== 6}
          >
            {loading ? 'Verifying...' : 'Verify & Activate Account'}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{' '}
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resending}
              className="text-primary hover:underline disabled:opacity-50"
            >
              {resending ? 'Sending...' : 'Resend code'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

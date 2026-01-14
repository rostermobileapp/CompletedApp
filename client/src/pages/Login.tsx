import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { X, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import rosterVideo from '@assets/Roster_white_text_Transparent_Rev1_1768410673997.mp4';
import rosterLogo from '@assets/Dark_Mode_Logo_1768422401788.png';
import { EmailVerificationModal } from '@/components/EmailVerificationModal';

export default function Login() {
  const [showForm, setShowForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        console.log('[Signup] Attempting signup for:', email);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: undefined,
          }
        });
        
        console.log('[Signup] Response:', { 
          hasUser: !!data.user, 
          hasSession: !!data.session,
          userId: data.user?.id,
          sessionAccessToken: data.session?.access_token ? 'present' : 'missing',
          error: error?.message 
        });
        
        if (error) throw error;
        
        if (data.user && !data.session) {
          console.log('[Signup] User created but no session - showing verification modal for:', email);
          console.log('[Signup] Setting showVerification to true');
          setPendingEmail(email);
          setShowVerification(true);
          console.log('[Signup] Verification modal should now be visible');
        } else if (data.session) {
          console.log('[Signup] Session established, redirecting to home');
          toast({
            title: 'Welcome!',
            description: 'Your account has been created.',
          });
          setLocation('/');
        } else {
          console.log('[Signup] No user or session returned');
          toast({
            title: 'Success!',
            description: 'Your account has been created. You can now sign in.',
          });
          setIsSignUp(false);
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

  const handleClose = () => {
    setShowForm(false);
    setEmail('');
    setPassword('');
    setIsSignUp(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  };

  const handleVerificationSuccess = () => {
    setShowVerification(false);
    setPendingEmail('');
    setEmail('');
    setPassword('');
    toast({
      title: 'Welcome!',
      description: 'Your account is now active. You are signed in.',
    });
    setLocation('/');
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col overflow-hidden" data-testid="login-page">
      <motion.div
        className="absolute top-4 left-4 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: showForm ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      >
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-11 h-11 rounded-full text-white hover:bg-white/20 transition-colors bg-[#ffffff00]"
          data-testid="button-close"
          style={{ pointerEvents: showForm ? 'auto' : 'none' }}
        >
          <X className="w-5 h-5" />
        </button>
      </motion.div>
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <motion.div
          className="flex flex-col items-center"
          animate={{
            y: showForm ? '-25vh' : 0,
            scale: showForm ? 0.65 : 1,
          }}
          transition={{
            duration: 0.8,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-auto"
            data-testid="logo-image"
            src={rosterVideo}
          />

          <AnimatePresence>
            {!showForm && (
              <motion.div
                className="mt-12"
                initial={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.4 }}
              >
                <button
                  onClick={() => setShowForm(true)}
                  className="px-12 py-6 text-lg bg-transparent border-none min-h-[52px] text-[#ffffff] font-bold"
                  data-testid="button-login-initial"
                >
                  Login
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {showForm && (
            <>
              <motion.div
                className="fixed inset-0 z-40 bg-black"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                onClick={handleBackdropClick}
              />

              <motion.div
                className="fixed left-6 right-6 z-50 rounded-2xl px-5 py-6 pl-[4px] pr-[4px] pt-[4px] pb-[4px] bg-black"
                initial={{ opacity: 0, scale: 0.95, top: '33%' }}
                animate={{ opacity: 1, scale: 1, top: '8%' }}
                exit={{ opacity: 0, scale: 0.95, top: '33%' }}
                transition={{
                  duration: 0.8,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                <div className="text-center pt-[0px] pb-[0px] mt-[12px] mb-[12px]">
                  <img 
                    src={rosterLogo}
                    alt="Roster"
                    className="h-8 mx-auto"
                    data-testid="modal-logo"
                  />
                </div>

                <form onSubmit={handleSubmit} className="space-y-3 pl-[8px] pr-[8px] pt-[0px] pb-[0px] mt-[0px] mb-[0px] ml-[8px] mr-[8px]">
                  <div className="space-y-1">
                    <Label htmlFor="email" className="text-white text-sm">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="min-h-[44px] bg-[#2a2a2a] border-gray-700 text-white placeholder:text-gray-500"
                      data-testid="input-email"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <Label htmlFor="password" className="text-white text-sm">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="min-h-[44px] bg-[#2a2a2a] border-gray-700 text-white placeholder:text-gray-500 pr-12"
                        data-testid="input-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors p-1"
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {!isSignUp && (
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => setLocation('/forgot-password')}
                        className="hover:underline text-xs min-h-[36px] px-1 text-[#ffffff]"
                        data-testid="link-forgot-password"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                  
                  <Button
                    type="submit"
                    className="w-full min-h-[48px] bg-transparent text-white font-semibold text-base rounded-xl hover:bg-transparent"
                    disabled={loading}
                    data-testid="button-submit"
                  >
                    {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
                  </Button>
                  
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="text-xs min-h-[36px] px-2 text-[#ffffff]"
                      data-testid="button-toggle-mode"
                    >
                      {isSignUp
                        ? 'Already have an account? '
                        : "Don't have an account? "}
                      <span className="text-[#ffffff] font-extrabold">
                        {isSignUp ? 'Sign in' : 'Sign up'}
                      </span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <EmailVerificationModal
        open={showVerification}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowVerification(false);
            setPendingEmail('');
          }
        }}
        email={pendingEmail}
        onVerificationSuccess={handleVerificationSuccess}
      />
    </div>
  );
}

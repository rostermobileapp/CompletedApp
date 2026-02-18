import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ObjectUploader } from '@/components/ObjectUploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Camera, Check, Users, Shield, Trophy, Calendar } from 'lucide-react';
import rosterLogo from '@assets/Untitled_design_(42)_1771448459349.png';

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'America/Phoenix', label: 'Arizona (No DST)' },
  { value: 'America/Toronto', label: 'Eastern Time - Toronto' },
  { value: 'America/Vancouver', label: 'Pacific Time - Vancouver' },
  { value: 'America/Edmonton', label: 'Mountain Time - Edmonton' },
  { value: 'America/Winnipeg', label: 'Central Time - Winnipeg' },
  { value: 'America/Halifax', label: 'Atlantic Time (AT)' },
  { value: 'America/St_Johns', label: 'Newfoundland Time (NT)' },
  { value: 'Europe/London', label: 'GMT/BST - London' },
  { value: 'Europe/Paris', label: 'CET - Paris' },
  { value: 'Europe/Berlin', label: 'CET - Berlin' },
  { value: 'Australia/Sydney', label: 'AEST - Sydney' },
  { value: 'Australia/Melbourne', label: 'AEST - Melbourne' },
  { value: 'Asia/Tokyo', label: 'JST - Tokyo' },
];

const COMPETITIVE_LEVELS = [
  { value: 'Recreational', label: 'Recreational' },
  { value: 'Competitive', label: 'Competitive' },
  { value: 'Semi-Pro', label: 'Semi-Pro' },
  { value: 'Pro', label: 'Pro' },
];

const USE_CASE_OPTIONS = [
  { value: 'join_team', label: 'Join a Team/League', icon: Users, description: 'Find and join existing teams in your area' },
  { value: 'manage_team', label: 'Create & Manage a Team', icon: Shield, description: 'Start your own team and invite players' },
  { value: 'manage_league', label: 'Create & Manage a League', icon: Trophy, description: 'Organize leagues, schedule games, and manage teams' },
];

const TOTAL_STEPS = 4;

interface OnboardingData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  dateOfBirth: string;
  profileImageUrl: string;
  timezone: string;
  venmoUsername: string;
  cashappUsername: string;
  city: string;
  competitiveLevel: string;
  rosterUseCase: string;
}

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<OnboardingData>({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    dateOfBirth: '',
    profileImageUrl: '',
    timezone: '',
    venmoUsername: '',
    cashappUsername: '',
    city: '',
    competitiveLevel: '',
    rosterUseCase: '',
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const updateField = (field: keyof OnboardingData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('PATCH', '/api/user/onboarding', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/onboarding'] });
    },
  });

  const canAdvance = () => {
    if (currentStep === 1) {
      return formData.firstName.trim() !== '' && formData.lastName.trim() !== '';
    }
    if (currentStep === 2) {
      return formData.timezone !== '' && formData.competitiveLevel !== '';
    }
    if (currentStep === 3) {
      return formData.rosterUseCase !== '';
    }
    return true;
  };

  const handleNext = async () => {
    if (!canAdvance()) return;

    try {
      if (currentStep === 2) {
        await saveMutation.mutateAsync({
          firstName: formData.firstName,
          lastName: formData.lastName,
          phoneNumber: formData.phoneNumber || null,
          dateOfBirth: formData.dateOfBirth || null,
          profileImageUrl: formData.profileImageUrl || null,
          timezone: formData.timezone,
          venmoUsername: formData.venmoUsername || null,
          cashappUsername: formData.cashappUsername || null,
          city: formData.city || null,
          competitiveLevel: formData.competitiveLevel,
          onboardingProgress: { step: 2 },
        });
      }

      setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save your information. Please try again.', variant: 'destructive' });
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleFinish = async () => {
    try {
      await saveMutation.mutateAsync({
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneNumber: formData.phoneNumber || null,
        dateOfBirth: formData.dateOfBirth || null,
        profileImageUrl: formData.profileImageUrl || null,
        timezone: formData.timezone,
        venmoUsername: formData.venmoUsername || null,
        cashappUsername: formData.cashappUsername || null,
        city: formData.city || null,
        competitiveLevel: formData.competitiveLevel,
        rosterUseCase: formData.rosterUseCase,
        onboardingCompleted: true,
        onboardingProgress: { step: 4, completed: true },
      });
      queryClient.setQueryData(['/api/user'], (old: any) => old ? { ...old, onboardingCompleted: true } : old);
      toast({ title: 'Welcome to Roster!', description: 'Your profile has been set up successfully.' });
      navigate('/');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to complete onboarding. Please try again.', variant: 'destructive' });
    }
  };

  const handleGetUploadParameters = async () => {
    const response = await apiRequest('POST', '/api/profile-images/upload');
    const { uploadURL, path } = await response.json();
    return { method: 'PUT' as const, url: uploadURL, path };
  };

  const handleUploadComplete = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const imageUrl = result.successful[0].path;
      updateField('profileImageUrl', imageUrl);
      setPhotoPreview(getImageUrl(imageUrl) || '');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-400 font-medium">Step {currentStep} of {TOTAL_STEPS}</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i < currentStep ? 'bg-white' : 'bg-zinc-800'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pb-6 overflow-y-auto">
        {currentStep === 1 && (
          <StepBasicInfo
            formData={formData}
            updateField={updateField}
            photoPreview={photoPreview}
            onGetUploadParameters={handleGetUploadParameters}
            onUploadComplete={handleUploadComplete}
          />
        )}
        {currentStep === 2 && (
          <StepAdditionalInfo
            formData={formData}
            updateField={updateField}
          />
        )}
        {currentStep === 3 && (
          <StepUseCase
            formData={formData}
            updateField={updateField}
          />
        )}
        {currentStep === 4 && <StepAbout />}
      </div>

      <div className="px-6 pb-8 pt-4 border-t border-zinc-800">
        <div className="flex gap-3">
          {currentStep > 1 && (
            <Button
              variant="outline"
              onClick={handleBack}
              className="flex-1 h-12 bg-zinc-900 border-zinc-700 text-white hover:bg-zinc-800"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          {currentStep < TOTAL_STEPS ? (
            <Button
              onClick={handleNext}
              disabled={!canAdvance() || saveMutation.isPending}
              className="flex-1 h-12 bg-white text-black hover:bg-zinc-200 font-semibold disabled:opacity-40"
            >
              {saveMutation.isPending ? 'Saving...' : 'Next'}
              {!saveMutation.isPending && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          ) : (
            <Button
              onClick={handleFinish}
              disabled={saveMutation.isPending}
              className="flex-1 h-12 bg-white text-black hover:bg-zinc-200 font-semibold disabled:opacity-40"
            >
              {saveMutation.isPending ? 'Finishing...' : 'Finish'}
              {!saveMutation.isPending && <Check className="w-4 h-4 ml-2" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepBasicInfo({
  formData,
  updateField,
  photoPreview,
  onGetUploadParameters,
  onUploadComplete,
}: {
  formData: OnboardingData;
  updateField: (field: keyof OnboardingData, value: string) => void;
  photoPreview: string | null;
  onGetUploadParameters: () => Promise<{ method: 'PUT'; url: string; path?: string }>;
  onUploadComplete: (result: any) => void;
}) {
  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold">Basic Information</h1>
        <p className="text-zinc-400 mt-1">Let's get to know you</p>
      </div>

      <div className="flex justify-center">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border-2 border-zinc-700">
            {photoPreview ? (
              <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-8 h-8 text-zinc-500" />
            )}
          </div>
          <ObjectUploader
            onGetUploadParameters={onGetUploadParameters}
            onComplete={onUploadComplete}
            buttonClassName="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white text-black hover:bg-zinc-200 p-0 flex items-center justify-center"
          >
            <Camera className="w-4 h-4" />
          </ObjectUploader>
        </div>
      </div>
      <p className="text-center text-xs text-zinc-500">Upload Profile Photo (Optional)</p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="firstName" className="text-sm font-medium text-zinc-300">
            First Name <span className="text-red-400">*</span>
          </Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => updateField('firstName', e.target.value)}
            placeholder="Enter your first name"
            className="mt-1.5 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 h-12"
          />
        </div>

        <div>
          <Label htmlFor="lastName" className="text-sm font-medium text-zinc-300">
            Last Name <span className="text-red-400">*</span>
          </Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => updateField('lastName', e.target.value)}
            placeholder="Enter your last name"
            className="mt-1.5 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 h-12"
          />
        </div>

        <div>
          <Label htmlFor="phoneNumber" className="text-sm font-medium text-zinc-300">
            Phone Number <span className="text-zinc-600">(Optional)</span>
          </Label>
          <Input
            id="phoneNumber"
            type="tel"
            value={formData.phoneNumber}
            onChange={(e) => updateField('phoneNumber', e.target.value)}
            placeholder="(555) 123-4567"
            className="mt-1.5 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 h-12"
          />
        </div>

        <div>
          <Label htmlFor="dateOfBirth" className="text-sm font-medium text-zinc-300">
            Date of Birth <span className="text-zinc-600">(Optional)</span>
          </Label>
          <Input
            id="dateOfBirth"
            type="date"
            value={formData.dateOfBirth}
            onChange={(e) => updateField('dateOfBirth', e.target.value)}
            className="mt-1.5 bg-zinc-900 border-zinc-700 text-white h-12 [color-scheme:dark]"
          />
        </div>
      </div>
    </div>
  );
}

function StepAdditionalInfo({
  formData,
  updateField,
}: {
  formData: OnboardingData;
  updateField: (field: keyof OnboardingData, value: string) => void;
}) {
  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold">Additional Information</h1>
        <p className="text-zinc-400 mt-1">Help us personalize your experience</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium text-zinc-300">
            Timezone <span className="text-red-400">*</span>
          </Label>
          <select
            value={formData.timezone}
            onChange={(e) => updateField('timezone', e.target.value)}
            className="mt-1.5 w-full bg-zinc-900 border border-zinc-700 text-white h-12 rounded-md px-3 appearance-none focus:outline-none focus:ring-2 focus:ring-white"
          >
            <option value="" disabled>Select your timezone</option>
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-sm font-medium text-zinc-300">
            Player Type <span className="text-red-400">*</span>
          </Label>
          <select
            value={formData.competitiveLevel}
            onChange={(e) => updateField('competitiveLevel', e.target.value)}
            className="mt-1.5 w-full bg-zinc-900 border border-zinc-700 text-white h-12 rounded-md px-3 appearance-none focus:outline-none focus:ring-2 focus:ring-white"
          >
            <option value="" disabled>Select your player type</option>
            {COMPETITIVE_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>{level.label}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="venmoUsername" className="text-sm font-medium text-zinc-300">
            Venmo ID <span className="text-zinc-600">(Optional)</span>
          </Label>
          <Input
            id="venmoUsername"
            value={formData.venmoUsername}
            onChange={(e) => updateField('venmoUsername', e.target.value)}
            placeholder="@username"
            className="mt-1.5 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 h-12"
          />
        </div>

        <div>
          <Label htmlFor="cashappUsername" className="text-sm font-medium text-zinc-300">
            CashApp ID <span className="text-zinc-600">(Optional)</span>
          </Label>
          <Input
            id="cashappUsername"
            value={formData.cashappUsername}
            onChange={(e) => updateField('cashappUsername', e.target.value)}
            placeholder="$username"
            className="mt-1.5 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 h-12"
          />
        </div>

        <div>
          <Label htmlFor="city" className="text-sm font-medium text-zinc-300">
            City <span className="text-zinc-600">(Optional)</span>
          </Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => updateField('city', e.target.value)}
            placeholder="Enter your city"
            className="mt-1.5 bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 h-12"
          />
        </div>
      </div>
    </div>
  );
}

function StepUseCase({
  formData,
  updateField,
}: {
  formData: OnboardingData;
  updateField: (field: keyof OnboardingData, value: string) => void;
}) {
  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold">How do you plan to use Roster?</h1>
        <p className="text-zinc-400 mt-1">Select the option that best describes you</p>
      </div>

      <div className="space-y-3">
        {USE_CASE_OPTIONS.map((option) => {
          const isSelected = formData.rosterUseCase === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              onClick={() => updateField('rosterUseCase', option.value)}
              className={`w-full text-left p-5 rounded-xl border-2 transition-all duration-200 ${
                isSelected
                  ? 'border-white bg-white/10'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold text-base ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                    {option.label}
                  </h3>
                  <p className="text-sm text-zinc-500 mt-0.5">{option.description}</p>
                </div>
                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 mt-1">
                    <Check className="w-4 h-4 text-black" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepAbout() {
  return (
    <div className="space-y-8 pt-4">
      <div className="text-center pt-8">
        <img src={rosterLogo} alt="Roster Logo" className="w-24 h-24 rounded-2xl mx-auto mb-6" />
        <h1 className="text-2xl font-bold">Welcome to Roster</h1>
      </div>

      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <p className="text-zinc-300 leading-relaxed text-center">
          Roster was built to make organizing and joining recreational sports teams simple, fair, and fun for everyone. 
          Whether you're looking for a pickup game or managing an entire league, we've got you covered.
        </p>
      </div>

      <div className="space-y-3 pt-2">
        <a
          href="#"
          className="block w-full text-center py-3 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Terms of Service
        </a>
        <a
          href="#"
          className="block w-full text-center py-3 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Privacy Policy
        </a>
      </div>
    </div>
  );
}

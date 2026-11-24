import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ObjectUploader } from '@/components/ObjectUploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight, Camera, Check } from 'lucide-react';
import rosterLogo from '@assets/Untitled_design_(42)_1771448459349.png';
import './onboarding-profile.css';

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

const TOTAL_STEPS = 3;
const PROFILE_PREVIEW_STEPS = [
  { value: 1, label: 'Basic information' },
  { value: 2, label: 'Additional information' },
  { value: 3, label: 'About RosterHockey' },
];

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
}

export default function Onboarding({ familyAccountId }: { familyAccountId?: string } = {}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: familyAvailability } = useQuery<{ enabled: boolean }>({
    queryKey: ["family-availability", familyAccountId],
    queryFn: async () => (await apiRequest("GET", "/api/high-school/family/availability")).json(),
    enabled: !!familyAccountId, retry: false, staleTime: 30_000,
  });
  const profilePreviewParam = new URLSearchParams(window.location.search).get('profileStep');
  const profilePreviewStep = import.meta.env.DEV && PROFILE_PREVIEW_STEPS.some(({ value }) => String(value) === profilePreviewParam)
    ? Number(profilePreviewParam)
    : null;
  const [currentStep, setCurrentStep] = useState(profilePreviewStep || 1);
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
        onboardingCompleted: true,
        onboardingProgress: { step: 3, completed: true },
      });
      queryClient.setQueryData(['/api/user'], (old: any) => ({ ...(old || {}), onboardingCompleted: true }));
      toast({ title: 'Welcome to RosterHockey!', description: 'Your profile has been set up successfully.' });
      navigate('/get-started');
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
    <div className="adult-profile">
      <div className="profile-shell">
      <div className="profile-progress">
        <span className="profile-step-count">Step {currentStep} of {TOTAL_STEPS}</span>
        <div
          className="profile-progress-track"
          role="progressbar"
          aria-label="Profile onboarding progress"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={currentStep}
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`profile-progress-segment${i < currentStep ? ' is-complete' : ''}`}
            />
          ))}
        </div>
      </div>

      {familyAvailability?.enabled && <Button type="button" variant="outline" className="w-full mb-4"
        onClick={() => navigate("/high-school/family")}>Add a child without finishing my playing profile</Button>}

      <div className="profile-content">
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
        {currentStep === 3 && <StepAbout />}
      </div>

      <div className="profile-actions">
        <div className="flex gap-3">
          {currentStep > 1 && (
            <Button
              variant="outline"
              onClick={handleBack}
              className="profile-back flex-1"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          {currentStep < TOTAL_STEPS ? (
            <Button
              onClick={handleNext}
              disabled={!canAdvance() || saveMutation.isPending}
              className="profile-primary flex-1"
            >
              {saveMutation.isPending ? 'Saving...' : 'Next'}
              {!saveMutation.isPending && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          ) : (
            <Button
              onClick={handleFinish}
              disabled={saveMutation.isPending}
              className="profile-primary flex-1"
            >
              {saveMutation.isPending ? 'Finishing...' : 'Finish'}
              {!saveMutation.isPending && <Check className="w-4 h-4 ml-2" />}
            </Button>
          )}
        </div>
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
    <section className="profile-section">
      <div className="profile-heading">
        <h1 className="text-2xl font-bold">Basic Information</h1>
        <p>Let's get to know you</p>
      </div>

      <div className="profile-avatar-block">
        <div className="relative">
          <div className="profile-avatar">
            {photoPreview ? (
              <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <Camera size={31} aria-hidden="true" />
            )}
          </div>
          <ObjectUploader
            onGetUploadParameters={onGetUploadParameters}
            onComplete={onUploadComplete}
            cropShape="round"
            cropDialogTitle="Position your profile photo"
            buttonClassName="profile-photo-button absolute -bottom-1 -right-1 p-0 flex items-center justify-center"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">Upload profile photo</span>
          </ObjectUploader>
        </div>
      </div>
      <p className="profile-avatar-caption">Upload Profile Photo (Optional)</p>

      <div className="profile-fields">
        <div className="profile-field">
          <Label htmlFor="firstName">
            First Name <span className="profile-required">*</span>
          </Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => updateField('firstName', e.target.value)}
            placeholder="Enter your first name"
            className="profile-input"
          />
        </div>

        <div className="profile-field">
          <Label htmlFor="lastName">
            Last Name <span className="profile-required">*</span>
          </Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => updateField('lastName', e.target.value)}
            placeholder="Enter your last name"
            className="profile-input"
          />
        </div>

        <div className="profile-field">
          <Label htmlFor="phoneNumber">
            Phone Number <span className="profile-optional">(Optional)</span>
          </Label>
          <Input
            id="phoneNumber"
            type="tel"
            value={formData.phoneNumber}
            onChange={(e) => updateField('phoneNumber', e.target.value)}
            placeholder="(555) 123-4567"
            className="profile-input"
          />
        </div>

        <div className="profile-field">
          <Label htmlFor="dateOfBirth">
            Date of Birth <span className="profile-optional">(Optional)</span>
          </Label>
          <Input
            id="dateOfBirth"
            type="date"
            value={formData.dateOfBirth}
            onChange={(e) => updateField('dateOfBirth', e.target.value)}
            className="profile-input"
          />
        </div>
      </div>
    </section>
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
    <section className="profile-section">
      <div className="profile-heading">
        <h1 className="text-2xl font-bold">Additional Information</h1>
        <p>Help us personalize your experience</p>
      </div>

      <div className="profile-fields">
        <div className="profile-field">
          <Label htmlFor="timezone">
            Timezone <span className="profile-required">*</span>
          </Label>
          <select
            id="timezone"
            value={formData.timezone}
            onChange={(e) => updateField('timezone', e.target.value)}
            className="profile-select"
          >
            <option value="" disabled>Select your timezone</option>
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        <div className="profile-field">
          <Label htmlFor="competitiveLevel">
            Player Type <span className="profile-required">*</span>
          </Label>
          <select
            id="competitiveLevel"
            value={formData.competitiveLevel}
            onChange={(e) => updateField('competitiveLevel', e.target.value)}
            className="profile-select"
          >
            <option value="" disabled>Select your player type</option>
            {COMPETITIVE_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>{level.label}</option>
            ))}
          </select>
        </div>

        <div className="profile-field">
          <Label htmlFor="venmoUsername">
            Venmo ID <span className="profile-optional">(Optional)</span>
          </Label>
          <Input
            id="venmoUsername"
            value={formData.venmoUsername}
            onChange={(e) => updateField('venmoUsername', e.target.value)}
            placeholder="@username"
            className="profile-input"
          />
        </div>

        <div className="profile-field">
          <Label htmlFor="cashappUsername">
            CashApp ID <span className="profile-optional">(Optional)</span>
          </Label>
          <Input
            id="cashappUsername"
            value={formData.cashappUsername}
            onChange={(e) => updateField('cashappUsername', e.target.value)}
            placeholder="$username"
            className="profile-input"
          />
        </div>

        <div className="profile-field">
          <Label htmlFor="city">
            City <span className="profile-optional">(Optional)</span>
          </Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => updateField('city', e.target.value)}
            placeholder="Enter your city"
            className="profile-input"
          />
        </div>
      </div>
    </section>
  );
}

function StepAbout() {
  return (
    <section className="profile-section profile-about">
      <div className="profile-heading profile-about-intro">
        <img src={rosterLogo} alt="RosterHockey logo" className="profile-logo" />
        <h1 className="text-2xl font-bold">Welcome to RosterHockey</h1>
      </div>

      <div className="profile-about-card">
        <p>
          RosterHockey was built to make organizing and joining recreational sports teams simple, fair, and fun for everyone.
          Whether you're looking for a pickup game or managing an entire league, we've got you covered.
        </p>
      </div>

      <div className="profile-legal-links">
        <a
          href="#"
        >
          Terms of Service
        </a>
        <a
          href="#"
        >
          Privacy Policy
        </a>
      </div>
    </section>
  );
}

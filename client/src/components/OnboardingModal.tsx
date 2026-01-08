import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { Camera, ChevronRight, ChevronLeft, Loader2, Check, User } from "lucide-react";

interface OnboardingModalProps {
  isOpen: boolean;
  userEmail?: string | null;
}

interface FormData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  city: string;
  playerType: "Skater" | "Goalie" | "";
  dateOfBirth: string;
  venmoUsername: string;
  cashappUsername: string;
}

type StepConfig = {
  id: keyof FormData | "profilePhoto";
  title: string;
  subtitle: string;
  placeholder?: string;
  type: "text" | "email" | "tel" | "date" | "select" | "photo";
  required: boolean;
  options?: string[];
};

const STEPS: StepConfig[] = [
  { id: "firstName", title: "What's your first name?", subtitle: "Let's start with the basics", placeholder: "John", type: "text", required: true },
  { id: "lastName", title: "What's your last name?", subtitle: "Almost there with your name", placeholder: "Doe", type: "text", required: true },
  { id: "phoneNumber", title: "What's your phone number?", subtitle: "We'll use this to reach you about games", placeholder: "(123) 456-7890", type: "tel", required: true },
  { id: "email", title: "What's your email?", subtitle: "For important updates and notifications", placeholder: "john@example.com", type: "email", required: true },
  { id: "city", title: "What city are you in?", subtitle: "Help us find leagues near you", placeholder: "New York", type: "text", required: true },
  { id: "playerType", title: "Are you a Skater or Goalie?", subtitle: "Select your position", type: "select", required: true, options: ["Skater", "Goalie"] },
  { id: "dateOfBirth", title: "When's your birthday?", subtitle: "Optional - for age-based features", type: "date", required: false },
  { id: "venmoUsername", title: "What's your Venmo?", subtitle: "Optional - makes team payments easier", placeholder: "@username", type: "text", required: false },
  { id: "cashappUsername", title: "What's your CashApp?", subtitle: "Optional - another payment option", placeholder: "$username", type: "text", required: false },
  { id: "profilePhoto", title: "Add a profile photo", subtitle: "Optional - help teammates recognize you", type: "photo", required: false },
];

export function OnboardingModal({ isOpen, userEmail }: OnboardingModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: userEmail || "",
    city: "",
    playerType: "",
    dateOfBirth: "",
    venmoUsername: "",
    cashappUsername: "",
  });

  const [stepError, setStepError] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (userEmail && !formData.email) {
      setFormData(prev => ({ ...prev, email: userEmail }));
    }
  }, [userEmail]);

  const currentStepConfig = STEPS[currentStep];
  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const isLastStep = currentStep === STEPS.length - 1;

  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 0) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handleInputChange = (value: string) => {
    const stepId = currentStepConfig.id as keyof FormData;
    if (stepId === "phoneNumber") {
      setFormData(prev => ({ ...prev, [stepId]: formatPhoneNumber(value) }));
    } else {
      setFormData(prev => ({ ...prev, [stepId]: value }));
    }
    setStepError(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Profile photo must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    setProfileImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setProfileImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const validateCurrentStep = (): boolean => {
    const step = currentStepConfig;
    
    if (!step.required) return true;

    if (step.id === "firstName" && !formData.firstName.trim()) {
      setStepError("Please enter your first name");
      return false;
    }

    if (step.id === "lastName" && !formData.lastName.trim()) {
      setStepError("Please enter your last name");
      return false;
    }

    if (step.id === "phoneNumber") {
      const phoneDigits = formData.phoneNumber.replace(/\D/g, "");
      if (phoneDigits.length !== 10) {
        setStepError("Please enter a valid 10-digit phone number");
        return false;
      }
    }

    if (step.id === "email") {
      if (!formData.email.trim()) {
        setStepError("Please enter your email");
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        setStepError("Please enter a valid email address");
        return false;
      }
    }

    if (step.id === "city" && !formData.city.trim()) {
      setStepError("Please enter your city");
      return false;
    }

    if (step.id === "playerType" && !formData.playerType) {
      setStepError("Please select a player type");
      return false;
    }

    return true;
  };

  const validateDateOfBirth = (): boolean => {
    if (formData.dateOfBirth) {
      const dob = new Date(formData.dateOfBirth);
      const today = new Date();
      const age = Math.floor((today.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 13) {
        setStepError("You must be at least 13 years old");
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (currentStepConfig.id === "dateOfBirth" && !validateDateOfBirth()) {
      return;
    }

    if (!validateCurrentStep()) return;

    if (isLastStep) {
      handleSubmit();
    } else {
      setCurrentStep(prev => prev + 1);
      setStepError(null);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setStepError(null);
    }
  };

  const handleSkip = () => {
    if (!currentStepConfig.required) {
      if (currentStepConfig.id !== "profilePhoto") {
        const stepId = currentStepConfig.id as keyof FormData;
        setFormData(prev => ({ ...prev, [stepId]: "" }));
      }
      if (isLastStep) {
        handleSubmit();
      } else {
        setCurrentStep(prev => prev + 1);
        setStepError(null);
      }
    }
  };

  const uploadProfileImage = async (): Promise<string | null> => {
    if (!profileImage) return null;

    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch("/api/profile-images/upload", {
        method: "POST",
        headers: authHeaders,
      });

      if (!response.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL, path } = await response.json();

      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: profileImage,
        headers: {
          "Content-Type": profileImage.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image");
      }

      return path;
    } catch (error) {
      console.error("Error uploading profile image:", error);
      throw error;
    }
  };

  const onboardingMutation = useMutation({
    mutationFn: async () => {
      setIsUploading(true);

      let profileImageUrl: string | null = null;
      if (profileImage) {
        profileImageUrl = await uploadProfileImage();
      }

      const payload: Record<string, any> = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phoneNumber: formData.phoneNumber,
        city: formData.city.trim(),
        playerType: formData.playerType,
        onboardingCompleted: true,
      };

      if (formData.dateOfBirth) {
        payload.dateOfBirth = formData.dateOfBirth;
      }

      if (formData.venmoUsername.trim()) {
        payload.venmoUsername = formData.venmoUsername.trim();
      }

      if (formData.cashappUsername.trim()) {
        payload.cashappUsername = formData.cashappUsername.trim();
      }

      if (profileImageUrl) {
        payload.profileImageUrl = profileImageUrl;
      }

      const response = await apiRequest("PATCH", "/api/user/onboarding", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/onboarding"] });
      toast({
        title: "Welcome!",
        description: "Your profile has been set up successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save profile. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUploading(false);
    },
  });

  const handleSubmit = () => {
    onboardingMutation.mutate();
  };

  const getCurrentValue = (): string => {
    if (currentStepConfig.id === "profilePhoto") return "";
    return formData[currentStepConfig.id as keyof FormData] || "";
  };

  const canProceed = (): boolean => {
    const step = currentStepConfig;
    if (!step.required) return true;

    if (step.id === "firstName") return !!formData.firstName.trim();
    if (step.id === "lastName") return !!formData.lastName.trim();
    if (step.id === "phoneNumber") return formData.phoneNumber.replace(/\D/g, "").length === 10;
    if (step.id === "email") return !!formData.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
    if (step.id === "city") return !!formData.city.trim();
    if (step.id === "playerType") return !!formData.playerType;

    return true;
  };

  const renderStepContent = () => {
    const step = currentStepConfig;

    if (step.type === "select") {
      return (
        <div className="flex flex-col gap-4 w-full max-w-sm mx-auto">
          {step.options?.map((option) => (
            <Button
              key={option}
              type="button"
              variant={formData.playerType === option ? "default" : "outline"}
              className="h-16 text-xl font-medium"
              onClick={() => handleInputChange(option)}
              data-testid={`button-${option.toLowerCase()}`}
            >
              {option}
            </Button>
          ))}
        </div>
      );
    }

    if (step.type === "photo") {
      return (
        <div className="flex flex-col items-center gap-6">
          <div
            className="relative w-32 h-32 rounded-full bg-muted flex items-center justify-center cursor-pointer overflow-hidden border-4 border-dashed border-muted-foreground/30 hover:border-primary transition-colors"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-profile-photo"
          >
            {profileImagePreview ? (
              <img
                src={profileImagePreview}
                alt="Profile preview"
                className="w-full h-full object-cover"
                data-testid="img-profile-preview"
              />
            ) : (
              <div className="flex flex-col items-center text-muted-foreground">
                <Camera className="w-12 h-12 mb-2" />
                <span className="text-sm font-medium">Tap to add</span>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageSelect}
            className="hidden"
            data-testid="input-profile-photo"
          />
          {profileImagePreview && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setProfileImage(null);
                setProfileImagePreview(null);
              }}
              className="text-muted-foreground"
              data-testid="button-remove-photo"
            >
              Remove photo
            </Button>
          )}
        </div>
      );
    }

    return (
      <Input
        type={step.type}
        value={getCurrentValue()}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={step.placeholder}
        className={`h-14 text-lg text-center max-w-sm mx-auto ${stepError ? "border-destructive" : ""} ${step.id === "email" && userEmail ? "bg-muted" : ""}`}
        disabled={step.id === "email" && !!userEmail}
        autoFocus
        data-testid={`input-${step.id}`}
      />
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="p-6">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Step {currentStep + 1} of {STEPS.length}</span>
              {!currentStepConfig.required && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Optional</span>
              )}
            </div>
            <Progress value={progress} className="h-2" data-testid="progress-bar" />
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2" data-testid="text-step-title">
              {currentStepConfig.title}
            </h2>
            <p className="text-muted-foreground">
              {currentStepConfig.subtitle}
            </p>
          </div>

          <div className="min-h-[120px] flex items-center justify-center">
            {renderStepContent()}
          </div>

          {stepError && (
            <p className="text-center text-destructive text-sm mt-4" data-testid="text-error">
              {stepError}
            </p>
          )}

          <div className="flex gap-3 mt-8">
            {currentStep > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={onboardingMutation.isPending || isUploading}
                className="flex-1 h-12"
                data-testid="button-back"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>
            )}

            {!currentStepConfig.required && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleSkip}
                disabled={onboardingMutation.isPending || isUploading}
                className="flex-1 h-12"
                data-testid="button-skip"
              >
                Skip
              </Button>
            )}

            <Button
              type="button"
              onClick={handleNext}
              disabled={(!canProceed() && currentStepConfig.required) || onboardingMutation.isPending || isUploading}
              className="flex-1 h-12"
              data-testid="button-next"
            >
              {(onboardingMutation.isPending || isUploading) ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : isLastStep ? (
                <>
                  <Check className="w-5 h-5 mr-2" />
                  Complete
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-5 h-5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

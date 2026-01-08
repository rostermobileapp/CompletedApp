import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { Camera, User, Loader2, Check, AlertCircle } from "lucide-react";

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

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  city?: string;
  playerType?: string;
  dateOfBirth?: string;
}

export function OnboardingModal({ isOpen, userEmail }: OnboardingModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const [errors, setErrors] = useState<FormErrors>({});
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (userEmail && !formData.email) {
      setFormData(prev => ({ ...prev, email: userEmail }));
    }
  }, [userEmail]);

  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 0) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData(prev => ({ ...prev, phoneNumber: formatted }));
    if (errors.phoneNumber) {
      setErrors(prev => ({ ...prev, phoneNumber: undefined }));
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
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
        description: "Please select an image file (jpg, png, webp)",
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

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }

    const phoneDigits = formData.phoneNumber.replace(/\D/g, "");
    if (!phoneDigits || phoneDigits.length !== 10) {
      newErrors.phoneNumber = "Valid 10-digit phone number is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.city.trim()) {
      newErrors.city = "City is required";
    }

    if (!formData.playerType) {
      newErrors.playerType = "Please select a player type";
    }

    if (formData.dateOfBirth) {
      const dob = new Date(formData.dateOfBirth);
      const today = new Date();
      const age = Math.floor((today.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 13) {
        newErrors.dateOfBirth = "You must be at least 13 years old";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onboardingMutation.mutate();
    }
  };

  const isFormValid = () => {
    return (
      formData.firstName.trim() &&
      formData.lastName.trim() &&
      formData.phoneNumber.replace(/\D/g, "").length === 10 &&
      formData.email.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) &&
      formData.city.trim() &&
      formData.playerType
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center" data-testid="text-onboarding-title">
            Complete Your Profile
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Please fill in your information to get started
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="flex flex-col items-center mb-6">
            <div
              className="relative w-24 h-24 rounded-full bg-muted flex items-center justify-center cursor-pointer overflow-hidden border-2 border-dashed border-muted-foreground/30 hover:border-primary transition-colors"
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
                  <Camera className="w-8 h-8 mb-1" />
                  <span className="text-xs">Add Photo</span>
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
            <p className="text-xs text-muted-foreground mt-2">Optional - Max 5MB</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange("firstName", e.target.value)}
                placeholder="John"
                className={errors.firstName ? "border-destructive" : ""}
                data-testid="input-first-name"
              />
              {errors.firstName && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.firstName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">
                Last Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange("lastName", e.target.value)}
                placeholder="Doe"
                className={errors.lastName ? "border-destructive" : ""}
                data-testid="input-last-name"
              />
              {errors.lastName && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.lastName}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              placeholder="john@example.com"
              className={`${errors.email ? "border-destructive" : ""} ${userEmail ? "bg-muted" : ""}`}
              disabled={!!userEmail}
              data-testid="input-email"
            />
            {errors.email && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.email}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">
              Phone Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phoneNumber"
              type="tel"
              value={formData.phoneNumber}
              onChange={handlePhoneChange}
              placeholder="(123) 456-7890"
              className={errors.phoneNumber ? "border-destructive" : ""}
              data-testid="input-phone"
            />
            {errors.phoneNumber && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.phoneNumber}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">
              City <span className="text-destructive">*</span>
            </Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => handleInputChange("city", e.target.value)}
              placeholder="New York"
              className={errors.city ? "border-destructive" : ""}
              data-testid="input-city"
            />
            {errors.city && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.city}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="playerType">
              Player Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.playerType}
              onValueChange={(value) => handleInputChange("playerType", value as "Skater" | "Goalie")}
            >
              <SelectTrigger 
                className={errors.playerType ? "border-destructive" : ""}
                data-testid="select-player-type"
              >
                <SelectValue placeholder="Select player type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Skater" data-testid="option-skater">Skater</SelectItem>
                <SelectItem value="Goalie" data-testid="option-goalie">Goalie</SelectItem>
              </SelectContent>
            </Select>
            {errors.playerType && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.playerType}
              </p>
            )}
          </div>

          <div className="border-t pt-4 mt-4">
            <p className="text-sm text-muted-foreground mb-4">Optional Information</p>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                  className={errors.dateOfBirth ? "border-destructive" : ""}
                  data-testid="input-dob"
                />
                {errors.dateOfBirth && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.dateOfBirth}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="venmoUsername">Venmo Username</Label>
                  <Input
                    id="venmoUsername"
                    value={formData.venmoUsername}
                    onChange={(e) => handleInputChange("venmoUsername", e.target.value)}
                    placeholder="@username"
                    data-testid="input-venmo"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cashappUsername">CashApp Username</Label>
                  <Input
                    id="cashappUsername"
                    value={formData.cashappUsername}
                    onChange={(e) => handleInputChange("cashappUsername", e.target.value)}
                    placeholder="$username"
                    data-testid="input-cashapp"
                  />
                </div>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full mt-6"
            disabled={!isFormValid() || onboardingMutation.isPending || isUploading}
            data-testid="button-save-continue"
          >
            {(onboardingMutation.isPending || isUploading) ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Save and Continue
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

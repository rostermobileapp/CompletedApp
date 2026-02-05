import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { getImageUrl } from '@/lib/queryClient';
import { X } from 'lucide-react';

interface ProfilePhotoPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  profileImageUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export function ProfilePhotoPreview({
  isOpen,
  onClose,
  userId,
  profileImageUrl,
  firstName,
  lastName
}: ProfilePhotoPreviewProps) {
  const [, navigate] = useLocation();
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
    }
  }, [isOpen]);

  const handleViewProfile = () => {
    setPageTransitionDirection('up');
    navigate(`/user/${userId}`);
    onClose();
  };

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => {
      onClose();
    }, 500);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const getInitials = () => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    } else if (firstName) {
      return firstName[0].toUpperCase();
    }
    return 'U';
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 transition-opacity duration-500 ${
        isAnimating ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleBackdropClick}
      data-testid="profile-photo-preview-overlay"
    >
      <button
        type="button"
        onClick={handleClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-[10000]"
        data-testid="button-close-preview"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      <div
        className={`flex flex-col items-center gap-4 transition-transform duration-500 ease-out ${
          isAnimating ? 'scale-100' : 'scale-0'
        }`}
        style={{ transformOrigin: 'center center' }}
      >
        <Avatar
          className="w-48 h-48 border-4 border-white shadow-2xl"
          data-testid="profile-photo-enlarged"
        >
          <AvatarImage
            src={getImageUrl(profileImageUrl) || undefined}
            alt={firstName || 'User'}
            className="object-cover"
          />
          <AvatarFallback className="text-4xl font-semibold bg-primary text-primary-foreground">
            {getInitials()}
          </AvatarFallback>
        </Avatar>

        <div className="text-center text-white mb-2">
          <p className="text-lg font-medium">
            {firstName} {lastName}
          </p>
        </div>

        <Button
          onClick={handleViewProfile}
          variant="secondary"
          className="px-6"
          data-testid="button-view-profile"
        >
          View Profile
        </Button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

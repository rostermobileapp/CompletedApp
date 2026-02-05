import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getImageUrl } from '@/lib/queryClient';
import { ProfilePhotoPreview } from '@/components/ProfilePhotoPreview';

interface ClickableAvatarProps {
  userId: string;
  profileImageUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function ClickableAvatar({
  userId,
  profileImageUrl,
  firstName,
  lastName,
  className = '',
  size = 'md'
}: ClickableAvatarProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleInteraction = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isPreviewOpen) {
      console.log('[ClickableAvatar] Avatar clicked, opening preview for userId:', userId);
      setIsPreviewOpen(true);
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

  const sizeClasses = {
    xs: 'h-[30px] w-[30px]',
    sm: 'h-10 w-10',
    md: 'h-[50px] w-[50px]',
    lg: 'h-[60px] w-[60px]'
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInteraction}
        onPointerDown={handleInteraction}
        className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary rounded-full"
        data-testid={`button-avatar-${userId}`}
      >
        <Avatar className={`${sizeClasses[size]} ${className}`}>
          <AvatarImage src={getImageUrl(profileImageUrl) || undefined} alt={firstName || 'User'} />
          <AvatarFallback>{getInitials()}</AvatarFallback>
        </Avatar>
      </button>

      <ProfilePhotoPreview
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        userId={userId}
        profileImageUrl={profileImageUrl}
        firstName={firstName}
        lastName={lastName}
      />
    </>
  );
}

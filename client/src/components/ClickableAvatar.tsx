import { useLocation } from 'wouter';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { setPageTransitionDirection } from '@/components/PageTransition';

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
  const [, navigate] = useLocation();

  const handleClick = () => {
    setPageTransitionDirection('up');
    navigate(`/user/${userId}`);
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
    xs: 'h-6 w-6',
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12'
  };

  return (
    <button
      onClick={handleClick}
      className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary rounded-full"
      data-testid={`button-avatar-${userId}`}
    >
      <Avatar className={`${sizeClasses[size]} ${className}`}>
        <AvatarImage src={profileImageUrl || undefined} alt={firstName || 'User'} />
        <AvatarFallback>{getInitials()}</AvatarFallback>
      </Avatar>
    </button>
  );
}

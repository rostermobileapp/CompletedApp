import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Search, User, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getImageUrl } from '@/lib/queryClient';

interface TaggedUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface UserTagSelectorProps {
  selectedUsers: TaggedUser[];
  onUsersChange: (users: TaggedUser[]) => void;
  tournamentId?: string;
  leagueId?: string;
  placeholder?: string;
}

export function UserTagSelector({
  selectedUsers,
  onUsersChange,
  tournamentId,
  leagueId,
  placeholder = "Search users to tag..."
}: UserTagSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: searchResults = [], isLoading } = useQuery<TaggedUser[]>({
    queryKey: ['/api/users/search', searchQuery, tournamentId, leagueId],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      const params = new URLSearchParams({ q: searchQuery });
      if (tournamentId) params.append('tournamentId', tournamentId);
      if (leagueId) params.append('leagueId', leagueId);
      const response = await fetch(`/api/users/search?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: searchQuery.length >= 2,
    staleTime: 30000,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectUser = (user: TaggedUser) => {
    if (!selectedUsers.find(u => u.id === user.id)) {
      onUsersChange([...selectedUsers, user]);
    }
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleRemoveUser = (userId: string) => {
    onUsersChange(selectedUsers.filter(u => u.id !== userId));
  };

  const isUserSelected = (userId: string) => selectedUsers.some(u => u.id === userId);

  const getDisplayName = (user: TaggedUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.firstName || user.lastName || 'Unknown User';
  };

  return (
    <div ref={containerRef} className="relative w-full" data-testid="user-tag-selector">
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedUsers.map(user => (
            <div
              key={user.id}
              className="flex items-center gap-1 bg-primary/10 text-primary text-sm px-2 py-1 rounded-full"
              data-testid={`tagged-user-${user.id}`}
            >
              {user.profileImageUrl ? (
                <img
                  src={getImageUrl(user.profileImageUrl) || ''}
                  alt={getDisplayName(user)}
                  className="w-4 h-4 rounded-full object-cover"
                />
              ) : (
                <User className="w-4 h-4" />
              )}
              <span>{getDisplayName(user)}</span>
              <button
                type="button"
                onClick={() => handleRemoveUser(user.id)}
                className="ml-1 hover:text-destructive"
                data-testid={`remove-tag-${user.id}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="pl-9"
          data-testid="input-user-search"
        />
      </div>

      {isOpen && searchQuery.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-center text-muted-foreground text-sm">
              Searching...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-3 text-center text-muted-foreground text-sm">
              No users found
            </div>
          ) : (
            searchResults.map(user => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelectUser(user)}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                disabled={isUserSelected(user.id)}
                data-testid={`search-result-${user.id}`}
              >
                {user.profileImageUrl ? (
                  <img
                    src={getImageUrl(user.profileImageUrl) || ''}
                    alt={getDisplayName(user)}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <span className="flex-1">{getDisplayName(user)}</span>
                {isUserSelected(user.id) && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface UserFilterDropdownProps {
  selectedUserId: string | null;
  onUserChange: (userId: string | null) => void;
  tournamentId?: string;
  leagueId?: string;
  placeholder?: string;
}

export function UserFilterDropdown({
  selectedUserId,
  onUserChange,
  tournamentId,
  leagueId,
  placeholder = "Filter by user..."
}: UserFilterDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TaggedUser | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: searchResults = [], isLoading } = useQuery<TaggedUser[]>({
    queryKey: ['/api/users/search', searchQuery, tournamentId, leagueId],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      const params = new URLSearchParams({ q: searchQuery });
      if (tournamentId) params.append('tournamentId', tournamentId);
      if (leagueId) params.append('leagueId', leagueId);
      const response = await fetch(`/api/users/search?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: searchQuery.length >= 2,
    staleTime: 30000,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectUser = (user: TaggedUser) => {
    setSelectedUser(user);
    onUserChange(user.id);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedUser(null);
    onUserChange(null);
    setSearchQuery('');
  };

  const getDisplayName = (user: TaggedUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.firstName || user.lastName || 'Unknown User';
  };

  return (
    <div ref={containerRef} className="relative" data-testid="user-filter-dropdown">
      {selectedUser ? (
        <div className="flex items-center gap-2 bg-muted px-3 py-2 rounded-md">
          {selectedUser.profileImageUrl ? (
            <img
              src={getImageUrl(selectedUser.profileImageUrl) || ''}
              alt={getDisplayName(selectedUser)}
              className="w-5 h-5 rounded-full object-cover"
            />
          ) : (
            <User className="w-5 h-5 text-muted-foreground" />
          )}
          <span className="text-sm">{getDisplayName(selectedUser)}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-5 w-5 p-0 ml-1"
            data-testid="button-clear-user-filter"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className="pl-9 h-9"
            data-testid="input-user-filter-search"
          />
        </div>
      )}

      {isOpen && searchQuery.length >= 2 && !selectedUser && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-center text-muted-foreground text-sm">
              Searching...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-3 text-center text-muted-foreground text-sm">
              No users found
            </div>
          ) : (
            searchResults.map(user => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelectUser(user)}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                data-testid={`filter-result-${user.id}`}
              >
                {user.profileImageUrl ? (
                  <img
                    src={getImageUrl(user.profileImageUrl) || ''}
                    alt={getDisplayName(user)}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <span className="flex-1">{getDisplayName(user)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

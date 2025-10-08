import { useState, useEffect, useRef } from 'react';
import { Users, MessageCircle, User, Calendar, Settings, Plus, X, GripVertical, Swords } from 'lucide-react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import rostersLogoUrl from '@assets/Roster R White_1757096715093.png';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

// Define all available shortcut options
const AVAILABLE_SHORTCUTS = [
  { id: 'teams', icon: Users, label: 'My Team', path: '/teams' },
  { id: 'messages', icon: MessageCircle, label: 'Messages', path: '/messages' },
  { id: 'home', icon: null, label: 'Home', path: '/' },
  { id: 'profile', icon: User, label: 'Profile', path: '/profile' },
  { id: 'schedule', icon: Calendar, label: 'Schedule', path: '/calendar' },
  { id: 'league-management', icon: Settings, label: 'League Management', path: '/league-management' },
  { id: 'scrimmages', icon: Swords, label: 'Scrimmages', path: null, submenu: [
    { id: 'schedule-scrimmages', label: 'Schedule Scrimmages', path: '/create-scrimmage' },
    { id: 'manage-scrimmages', label: 'Manage Scrimmages', path: '/scrimmage-management' },
  ]},
];

// Default shortcuts (4 items)
const DEFAULT_SHORTCUTS = ['teams', 'messages', 'home', 'profile'];

type NavPreferences = {
  shortcuts: string[];
};

export function BottomNavigation() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [shortcuts, setShortcuts] = useState<string[]>(DEFAULT_SHORTCUTS);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScrimmageMenu, setShowScrimmageMenu] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  
  // Fetch user navigation preferences
  const { data: preferencesData } = useQuery({
    queryKey: ['/api/user/navigation-preferences'],
  });
  
  // Fetch unread message count
  const { data: unreadData } = useQuery({
    queryKey: ['/api/messages/unread-count'],
    refetchInterval: 10000,
    staleTime: 5000,
  });
  
  const unreadCount = (unreadData as { count: number } | undefined)?.count ?? 0;
  
  // Load saved preferences on mount
  useEffect(() => {
    const data = preferencesData as { preferences?: NavPreferences } | undefined;
    if (data?.preferences?.shortcuts) {
      // Defensively filter out any invalid shortcut IDs
      const validShortcutIds = AVAILABLE_SHORTCUTS.map(s => s.id);
      const validShortcuts = data.preferences.shortcuts.filter(id => validShortcutIds.includes(id));
      
      // Only use saved preferences if we have at least the default 4 shortcuts
      if (validShortcuts.length >= 4) {
        setShortcuts(validShortcuts);
      } else {
        // Fall back to defaults if saved preferences are incomplete
        setShortcuts(DEFAULT_SHORTCUTS);
      }
    }
  }, [preferencesData]);
  
  // Save preferences mutation
  const savePreferences = useMutation({
    mutationFn: async (newShortcuts: string[]) => {
      await apiRequest('PATCH', '/api/user/navigation-preferences', {
        preferences: { shortcuts: newShortcuts }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/navigation-preferences'] });
    },
    onError: (error: any) => {
      console.error('Failed to save navigation preferences:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save navigation preferences. Please try again.',
        variant: 'destructive',
      });
      // Revert to last known good state by refetching
      queryClient.invalidateQueries({ queryKey: ['/api/user/navigation-preferences'] });
    },
  });
  
  const handleAddShortcut = (shortcutId: string) => {
    if (shortcuts.length >= 5) return;
    
    const newShortcuts = [...shortcuts, shortcutId];
    setShortcuts(newShortcuts);
    savePreferences.mutate(newShortcuts);
    setShowAddModal(false);
    
    toast({
      title: 'Shortcut Added',
      description: 'Your shortcut has been added to the navigation bar',
    });
  };
  
  const handleDeleteShortcut = (index: number) => {
    if (shortcuts.length <= 4) return; // Don't delete if only 4 shortcuts
    
    const newShortcuts = shortcuts.filter((_, i) => i !== index);
    setShortcuts(newShortcuts);
    savePreferences.mutate(newShortcuts);
    setIsEditMode(false);
    
    toast({
      title: 'Shortcut Removed',
      description: 'Your shortcut has been removed from the navigation bar',
    });
  };
  
  const handleDragStart = (index: number, e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    dragStartPos.current = { x: clientX, y: clientY };
    
    longPressTimer.current = setTimeout(() => {
      setIsEditMode(true);
      setDraggedIndex(index);
    }, 500); // 500ms long press
  };
  
  const handleDragMove = (index: number, e: React.TouchEvent | React.MouseEvent) => {
    if (!dragStartPos.current) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = Math.abs(clientX - dragStartPos.current.x);
    const deltaY = Math.abs(clientY - dragStartPos.current.y);
    
    // Cancel long press if user moves too much
    if (deltaX > 10 || deltaY > 10) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
    
    if (draggedIndex !== null && isEditMode) {
      setDragOverIndex(index);
    }
  };
  
  const handleDragEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newShortcuts = [...shortcuts];
      const [removed] = newShortcuts.splice(draggedIndex, 1);
      newShortcuts.splice(dragOverIndex, 0, removed);
      
      setShortcuts(newShortcuts);
      savePreferences.mutate(newShortcuts);
      
      toast({
        title: 'Navigation Updated',
        description: 'Your shortcuts have been reordered',
      });
    }
    
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragStartPos.current = null;
  };
  
  const getActiveId = (pathname: string) => {
    if (pathname === '/') return 'home';
    if (pathname.startsWith('/teams')) return 'teams';
    if (pathname.startsWith('/messages')) return 'messages';
    if (pathname.startsWith('/profile') || pathname.startsWith('/subscription')) return 'profile';
    if (pathname.startsWith('/calendar')) return 'schedule';
    if (pathname.startsWith('/league-management')) return 'league-management';
    if (pathname.startsWith('/create-scrimmage') || pathname.startsWith('/scrimmage-management')) return 'scrimmages';
    return '';
  };
  
  const activeId = getActiveId(location);
  
  const handleNavClick = (shortcut: typeof AVAILABLE_SHORTCUTS[0]) => {
    if (isEditMode) return; // Don't navigate in edit mode
    
    if (shortcut.submenu) {
      setShowScrimmageMenu(true);
    } else if (shortcut.path) {
      navigate(shortcut.path);
    }
  };
  
  const availableToAdd = AVAILABLE_SHORTCUTS.filter(
    s => !shortcuts.includes(s.id) && s.id !== 'home' // Home should always be in default set
  );
  
  const gridCols = shortcuts.length === 5 ? 'grid-cols-5' : 'grid-cols-4';
  
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50" data-testid="bottom-navigation">
        <div className={cn("grid py-2", gridCols)}>
          {shortcuts.map((shortcutId, index) => {
            const shortcut = AVAILABLE_SHORTCUTS.find(s => s.id === shortcutId);
            if (!shortcut) return null;
            
            const Icon = shortcut.icon;
            const isActive = activeId === shortcut.id;
            const isDragging = draggedIndex === index;
            const isDragOver = dragOverIndex === index;
            
            return (
              <div
                key={shortcut.id}
                className={cn(
                  "relative transition-all",
                  isDragging && "opacity-50 scale-95",
                  isDragOver && "scale-105"
                )}
                onTouchStart={(e) => handleDragStart(index, e)}
                onTouchMove={(e) => handleDragMove(index, e)}
                onTouchEnd={handleDragEnd}
                onMouseDown={(e) => handleDragStart(index, e)}
                onMouseMove={(e) => handleDragMove(index, e)}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
              >
                <button
                  onClick={() => handleNavClick(shortcut)}
                  className={cn(
                    "flex flex-col items-center py-2 w-full transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground",
                    isEditMode && "pointer-events-none"
                  )}
                  data-testid={`nav-${shortcut.id}`}
                >
                  {isEditMode && (
                    <GripVertical className="absolute top-0 w-4 h-4 text-muted-foreground" />
                  )}
                  
                  {shortcut.id === 'home' ? (
                    <img 
                      src={rostersLogoUrl}
                      alt="Home"
                      className="mb-1 object-contain"
                      style={{ width: '30px', height: '30px' }}
                    />
                  ) : Icon && (
                    <div className="relative">
                      <Icon className="w-5 h-5 mb-1" />
                      {shortcut.id === 'messages' && unreadCount > 0 && (
                        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold" data-testid="message-badge">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </div>
                      )}
                    </div>
                  )}
                  <span className="text-xs">{shortcut.label}</span>
                </button>
                
                {isEditMode && index >= 4 && (
                  <button
                    onClick={() => handleDeleteShortcut(index)}
                    className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1"
                    data-testid={`delete-nav-${shortcut.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          
          {shortcuts.length < 5 && !isEditMode && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex flex-col items-center py-2 text-muted-foreground hover:text-primary transition-colors"
              data-testid="nav-add-shortcut"
            >
              <div className="w-5 h-5 mb-1 flex items-center justify-center border-2 border-dashed border-current rounded">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-xs">Add</span>
            </button>
          )}
        </div>
        
        {isEditMode && (
          <div className="pb-2 px-4">
            <Button
              onClick={() => setIsEditMode(false)}
              variant="outline"
              size="sm"
              className="w-full"
              data-testid="done-editing"
            >
              Done
            </Button>
          </div>
        )}
      </div>
      
      {/* Add Shortcut Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent data-testid="add-shortcut-modal">
          <DialogHeader>
            <DialogTitle>Add Shortcut</DialogTitle>
            <DialogDescription>
              Choose a shortcut to add to your navigation bar
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            {availableToAdd.map((shortcut) => (
              <Button
                key={shortcut.id}
                onClick={() => handleAddShortcut(shortcut.id)}
                variant="outline"
                className="justify-start"
                data-testid={`add-shortcut-${shortcut.id}`}
              >
                {shortcut.icon && <shortcut.icon className="w-4 h-4 mr-2" />}
                {shortcut.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Scrimmages Submenu Modal */}
      <Dialog open={showScrimmageMenu} onOpenChange={setShowScrimmageMenu}>
        <DialogContent data-testid="scrimmage-submenu">
          <DialogHeader>
            <DialogTitle>Scrimmages</DialogTitle>
            <DialogDescription>
              Choose an option
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            {AVAILABLE_SHORTCUTS.find(s => s.id === 'scrimmages')?.submenu?.map((item) => (
              <Button
                key={item.id}
                onClick={() => {
                  navigate(item.path);
                  setShowScrimmageMenu(false);
                }}
                variant="outline"
                data-testid={`submenu-${item.id}`}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

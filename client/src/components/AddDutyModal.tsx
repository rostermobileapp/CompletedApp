import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Pizza,
  Coffee,
  UtensilsCrossed,
  Cookie,
  IceCream,
  Beer,
  Wine,
  CupSoda,
  Milk,
  Wrench,
  Clipboard,
  Package,
  ShoppingBag,
  Camera,
  Heart,
  Star,
  Trophy,
  Smile,
  ThumbsUp,
  Flag,
  Music,
  LucideIcon,
} from 'lucide-react';

const AVAILABLE_ICONS: { name: string; icon: LucideIcon }[] = [
  { name: 'Pizza', icon: Pizza },
  { name: 'Coffee', icon: Coffee },
  { name: 'UtensilsCrossed', icon: UtensilsCrossed },
  { name: 'Cookie', icon: Cookie },
  { name: 'IceCream', icon: IceCream },
  { name: 'Beer', icon: Beer },
  { name: 'Wine', icon: Wine },
  { name: 'CupSoda', icon: CupSoda },
  { name: 'Milk', icon: Milk },
  { name: 'Wrench', icon: Wrench },
  { name: 'Clipboard', icon: Clipboard },
  { name: 'Package', icon: Package },
  { name: 'ShoppingBag', icon: ShoppingBag },
  { name: 'Camera', icon: Camera },
  { name: 'Heart', icon: Heart },
  { name: 'Star', icon: Star },
  { name: 'Trophy', icon: Trophy },
  { name: 'Smile', icon: Smile },
  { name: 'ThumbsUp', icon: ThumbsUp },
  { name: 'Flag', icon: Flag },
  { name: 'Music', icon: Music },
];

interface AddDutyModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
}

export default function AddDutyModal({ isOpen, onClose, teamId }: AddDutyModalProps) {
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string>('');
  const [scope, setScope] = useState<'single_game' | 'every_game'>('every_game');
  const { toast } = useToast();

  const createDutyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/teams/${teamId}/duties`, {
        name,
        icon: selectedIcon,
        scope,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Custom duty created successfully',
      });
      // Invalidate both team-level and all game-specific duty queries
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'duties'] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          // Invalidate any game-scoped duty query for this team
          return Array.isArray(key) && 
                 key[0] === '/api/games' && 
                 key[2] === 'teams' && 
                 key[3] === teamId && 
                 key[4] === 'duties';
        }
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create custom duty',
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    setName('');
    setSelectedIcon('');
    setScope('every_game');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !selectedIcon) {
      toast({
        title: 'Error',
        description: 'Please enter a name and select an icon',
        variant: 'destructive',
      });
      return;
    }
    createDutyMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[600px]" data-testid="dialog-add-duty">
        <DialogHeader>
          <DialogTitle>Add Custom Duty</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="duty-name">Duty Name</Label>
            <Input
              id="duty-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Snacks, Camera, Equipment"
              data-testid="input-duty-name"
            />
          </div>

          <div className="space-y-2">
            <Label>Select Icon</Label>
            <div className="grid grid-cols-7 gap-2">
              {AVAILABLE_ICONS.map(({ name: iconName, icon: Icon }) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setSelectedIcon(iconName)}
                  className={`p-3 rounded-lg border-2 transition-all hover:scale-110 ${
                    selectedIcon === iconName
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                  data-testid={`button-icon-${iconName}`}
                >
                  <Icon className="w-6 h-6 mx-auto" />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duty-scope">Scope</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as 'single_game' | 'every_game')}>
              <SelectTrigger id="duty-scope" data-testid="select-duty-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="every_game" data-testid="option-every-game">
                  Every Game (Always available)
                </SelectItem>
                <SelectItem value="single_game" data-testid="option-single-game">
                  Single Game (One-time use)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {scope === 'every_game'
                ? 'This duty will be available for all games'
                : 'This duty will only be available for a single game'}
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel-duty">
              Cancel
            </Button>
            <Button type="submit" disabled={createDutyMutation.isPending} data-testid="button-create-duty">
              {createDutyMutation.isPending ? 'Creating...' : 'Create Duty'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

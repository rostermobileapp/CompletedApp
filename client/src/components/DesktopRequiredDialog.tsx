import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DesktopRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description?: string;
  testId?: string;
}

const DEFAULT_DESCRIPTION =
  'Due to the complexity of setup, you must complete this step on a desktop browser. Login at Roster-App.com to get started.';

export function DesktopRequiredDialog({
  open,
  onOpenChange,
  description = DEFAULT_DESCRIPTION,
  testId,
}: DesktopRequiredDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>Desktop Required</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} data-testid="button-desktop-required-dismiss">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const DESKTOP_REQUIRED_COPY = {
  tournament:
    'Due to the complexity of tournament setup, you must create a tournament on a desktop browser. Login at Roster-App.com to get started.',
  league:
    'Due to the complexity of league setup, you must create a league on a desktop browser. Login at Roster-App.com to get started.',
  season:
    'Due to the complexity of season setup, you must create a new season on a desktop browser. Login at Roster-App.com to get started.',
};

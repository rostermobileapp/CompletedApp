import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Calendar, MapPin, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TournamentMatch } from "@shared/schema";

interface MatchEditDialogProps {
  match: TournamentMatch;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team1Name: string;
  team2Name: string;
}

const formSchema = z.object({
  scheduledTime: z.string().optional(),
  location: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function MatchEditDialog({
  match,
  open,
  onOpenChange,
  team1Name,
  team2Name
}: MatchEditDialogProps) {
  const { toast } = useToast();
  
  // Format date for datetime-local input
  const formatDateTimeLocal = (date: Date | string | null) => {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      scheduledTime: formatDateTimeLocal(match.scheduledTime),
      location: match.location || '',
    }
  });

  // Reset form when match changes or dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        scheduledTime: formatDateTimeLocal(match.scheduledTime),
        location: match.location || '',
      });
    }
  }, [match.id, open, match.scheduledTime, match.location, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: { scheduledTime: string | null; location: string | null }) => {
      await apiRequest('PATCH', `/api/tournaments/${match.tournamentId}/matches/${match.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', match.tournamentId, 'matches'] });
      toast({
        title: "Match updated",
        description: "The match schedule has been updated successfully"
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update match",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate({
      scheduledTime: values.scheduledTime || null,
      location: values.location?.trim() || null
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-edit-match">
        <DialogHeader>
          <DialogTitle>Edit Match Schedule</DialogTitle>
          <DialogDescription>
            Match {match.matchNumber} - {match.round}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            {/* Matchup Display */}
            <div className="rounded-lg border p-3 bg-muted/50">
              <div className="flex items-center justify-between text-sm font-medium">
                <span data-testid="text-dialog-team1">{team1Name}</span>
                <span className="text-muted-foreground">vs</span>
                <span data-testid="text-dialog-team2">{team2Name}</span>
              </div>
            </div>

            {/* Date/Time Input */}
            <FormField
              control={form.control}
              name="scheduledTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Date & Time
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                      data-testid="input-scheduled-time"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Location Input */}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Enter location..."
                      {...field}
                      data-testid="input-location"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateMutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save"
              >
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

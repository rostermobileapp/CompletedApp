import { useEffect, useState } from "react";
import { CalendarPlus, Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  NativeCalendarError,
  NativeCalendarEvent,
  NativeCalendarInfo,
  createDeviceCalendarEvent,
  getCalendarErrorMessage,
  getSavedCalendarId,
  hasExportedEvent,
  isNativeCalendarAvailable,
  markEventExported,
  retrieveDeviceCalendars,
  saveCalendarId,
} from "@/lib/nativeCalendar";

interface NativeCalendarExportButtonProps {
  event: NativeCalendarEvent | null;
  ownerKey?: string;
}

export default function NativeCalendarExportButton({
  event,
  ownerKey,
}: NativeCalendarExportButtonProps) {
  const { toast } = useToast();
  const [available, setAvailable] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<NativeCalendarInfo[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExported, setIsExported] = useState(false);

  useEffect(() => {
    const nativeAvailable = isNativeCalendarAvailable();
    setAvailable(nativeAvailable);
    if (!nativeAvailable || !event) return;

    const savedId = getSavedCalendarId(ownerKey);
    setSelectedCalendarId(savedId);
    setIsExported(savedId ? hasExportedEvent(ownerKey, savedId, event.sourceKey) : false);
  }, [event?.sourceKey, ownerKey]);

  if (!available || !event) return null;

  const loadCalendars = async () => {
    setIsLoadingCalendars(true);
    setErrorMessage(null);
    try {
      const nextCalendars = await retrieveDeviceCalendars();
      setCalendars(nextCalendars);
      setPickerOpen(true);
    } catch (error) {
      const message =
        error instanceof NativeCalendarError
          ? error.message
          : getCalendarErrorMessage((error as any)?.error);
      setErrorMessage(message);
      if (
        error instanceof NativeCalendarError &&
        ["calendar_permission_missing", "no_available_calendars", "cannot_retrieve_calendars"].includes(error.code)
      ) {
        setCalendars([]);
        setPickerOpen(true);
      }
      toast({
        title: "Device calendar unavailable",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingCalendars(false);
    }
  };

  const createEvent = async (calendarId: string) => {
    setIsCreating(true);
    setErrorMessage(null);
    try {
      await createDeviceCalendarEvent(event, calendarId);
      saveCalendarId(ownerKey, calendarId);
      markEventExported(ownerKey, calendarId, event.sourceKey);
      setSelectedCalendarId(calendarId);
      setIsExported(true);
      setPickerOpen(false);
      toast({
        title: "Added to device calendar",
        description: `${event.title} was added successfully.`,
      });
    } catch (error) {
      const message =
        error instanceof NativeCalendarError
          ? error.message
          : getCalendarErrorMessage((error as any)?.error);
      setErrorMessage(message);
      toast({
        title: "Could not add event",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleAdd = async () => {
    if (isExported) return;
    if (selectedCalendarId) {
      await createEvent(selectedCalendarId);
    } else {
      await loadCalendars();
    }
  };

  const handleChangeCalendar = async () => {
    await loadCalendars();
  };

  return (
    <>
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Button
          type="button"
          variant={isExported ? "secondary" : "outline"}
          size="sm"
          className="h-8 px-2.5 text-xs"
          onClick={handleAdd}
          disabled={isLoadingCalendars || isCreating || isExported}
          aria-label={isExported ? "Added to device calendar" : "Add to device calendar"}
          data-testid={`button-native-calendar-${event.sourceKey.replace(/:/g, "-")}`}
        >
          {isCreating || isLoadingCalendars ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isExported ? (
            <Check className="h-3.5 w-3.5 mr-1" />
          ) : (
            <CalendarPlus className="h-3.5 w-3.5 mr-1" />
          )}
          <span className="hidden sm:inline">
            {isExported ? "Added" : "Add to calendar"}
          </span>
        </Button>
        {isExported && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-1.5"
            onClick={handleChangeCalendar}
            disabled={isLoadingCalendars || isCreating}
            aria-label="Add this event to a different device calendar"
            data-testid={`button-change-native-calendar-${event.sourceKey.replace(/:/g, "-")}`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[425px]" data-testid="dialog-native-calendar-picker">
          <DialogHeader>
            <DialogTitle>Choose a device calendar</DialogTitle>
            <DialogDescription>
              Select where to add <strong>{event.title}</strong>.
            </DialogDescription>
          </DialogHeader>

          {errorMessage && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="space-y-2" role="radiogroup" aria-label="Available device calendars">
            {calendars.map((calendar) => (
              <button
                key={calendar.id}
                type="button"
                className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  selectedCalendarId === calendar.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted"
                }`}
                onClick={() => setSelectedCalendarId(calendar.id)}
                role="radio"
                aria-checked={selectedCalendarId === calendar.id}
                data-testid={`button-select-native-calendar-${calendar.id}`}
              >
                <span className="font-medium">{calendar.name}</span>
              </button>
            ))}
          </div>

          {calendars.length === 0 && !isLoadingCalendars && (
            <p className="text-sm text-muted-foreground">
              No calendars were returned by your device. Check calendar permissions and try again.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => selectedCalendarId && createEvent(selectedCalendarId)}
              disabled={!selectedCalendarId || isCreating}
              data-testid="button-confirm-native-calendar"
            >
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add event
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
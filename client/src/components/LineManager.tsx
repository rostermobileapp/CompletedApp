import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Users, UserPlus, Plus, Upload } from 'lucide-react';
import { Link } from 'wouter';
import { ClickableAvatar } from '@/components/ClickableAvatar';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import Papa from 'papaparse';

interface LineManagerProps {
  teamId: string;
  isTeamCaptain: boolean;
  teamMembers: any[];
}

export function LineManager({ teamId, isTeamCaptain, teamMembers }: LineManagerProps) {
  const { toast } = useToast();
  const [showAddPlayers, setShowAddPlayers] = useState(false);

  // Manual player form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [position, setPosition] = useState('');

  // CSV state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addManualPlayerMutation = useMutation({
    mutationFn: async (data: {
      firstName: string;
      lastName: string;
      email?: string;
      jerseyNumber?: string;
      position?: string;
    }) => {
      const response = await apiRequest('POST', `/api/teams/${teamId}/players/manual`, { teamId, ...data });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'members'] });
      toast({ title: 'Player Added', description: 'Player has been added to the roster.' });
      setFirstName('');
      setLastName('');
      setEmail('');
      setJerseyNumber('');
      setPosition('');
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const importPlayersMutation = useMutation({
    mutationFn: async (csvData: any[]) => {
      const response = await apiRequest('POST', `/api/teams/${teamId}/players/import`, { csvData });
      return response.json();
    },
    onSuccess: (data: { successCount: number; failedCount: number }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'members'] });
      const msg = [
        data.successCount > 0 ? `${data.successCount} imported` : null,
        data.failedCount > 0 ? `${data.failedCount} failed` : null,
      ].filter(Boolean).join(', ');
      toast({ title: 'Import Complete', description: msg || 'Players imported.' });
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error: Error) => {
      toast({ title: 'Import Failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: 'Error', description: 'First and last name are required.', variant: 'destructive' });
      return;
    }
    addManualPlayerMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || undefined,
      jerseyNumber: jerseyNumber.trim() || undefined,
      position: position.trim() || undefined,
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      toast({ title: 'Invalid File', description: 'Please upload a CSV file.', variant: 'destructive' });
      return;
    }
    setCsvFile(file);
  };

  const handleImportPlayers = () => {
    if (!csvFile) return;
    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          toast({ title: 'Error', description: 'CSV file is empty.', variant: 'destructive' });
          return;
        }
        importPlayersMutation.mutate(results.data);
      },
      error: (error) => {
        toast({ title: 'Error', description: `Failed to parse CSV: ${error.message}`, variant: 'destructive' });
      },
    });
  };

  const sortedMembers = [...teamMembers].sort((a, b) => {
    const lastNameA = (a.displayLastName || a.user?.lastName || '').toLowerCase();
    const lastNameB = (b.displayLastName || b.user?.lastName || '').toLowerCase();
    return lastNameA.localeCompare(lastNameB);
  });

  return (
    <>
      <Card className="rounded-lg hairline elev-rest text-card-foreground bg-[#e2e2e2] dark:bg-[#212121] mt-[4px] mb-[4px]">
        <CardHeader className="flex flex-col space-y-1.5 p-6 pl-[12px] pr-[12px] pt-[8px] pb-[4px]">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Roster
            {isTeamCaptain && (
              <Badge variant="secondary" className="ml-2">Captain</Badge>
            )}
            {isTeamCaptain && (
              <button
                onClick={() => setShowAddPlayers(true)}
                className="ml-auto w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/80 transition-colors"
                data-testid="button-add-players"
                aria-label="Add players"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 pl-[12px] pr-[12px] pt-[4px] pb-[12px]">
          {sortedMembers.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No players on this roster yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {sortedMembers.map((member: any) => {
                const memberFirstName = member.displayFirstName || member.user?.firstName || '';
                const memberLastName = member.displayLastName || member.user?.lastName || '';
                const memberJerseyNumber = member.jerseyNumber;
                const isCaptain = member.isCaptain;
                const profileImageUrl = member.user?.profileImageUrl;
                const playerId = member.user?.id || member.userId;

                return (
                  <div
                    key={member.id || playerId}
                    className="flex items-center pr-4 rounded-full hover:bg-muted/50 transition-colors bg-card hairline elev-rest overflow-hidden"
                    data-testid={`roster-player-${playerId}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ClickableAvatar
                        userId={playerId}
                        profileImageUrl={profileImageUrl}
                        firstName={memberFirstName}
                        lastName={memberLastName}
                        size="xs"
                        className="!h-[45px] !w-[45px]"
                      />
                      <Link
                        href={`/user/${playerId}`}
                        className="flex items-center gap-2 min-w-0 cursor-pointer"
                      >
                        {memberJerseyNumber && (
                          <span className="text-xs font-bold text-muted-foreground shrink-0">
                            #{memberJerseyNumber}
                          </span>
                        )}
                        <span className="text-sm font-medium truncate">
                          {memberLastName}{memberFirstName ? `, ${memberFirstName.charAt(0)}.` : ''}
                        </span>
                        {isCaptain && (
                          <span className="text-warning font-bold text-xs shrink-0">C</span>
                        )}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              {sortedMembers.length} {sortedMembers.length === 1 ? 'player' : 'players'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Add Players Sheet */}
      <Sheet open={showAddPlayers} onOpenChange={setShowAddPlayers}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add Players
            </SheetTitle>
          </SheetHeader>

          {/* Manual Add Form */}
          <div className="mb-6">
            <h3 className="font-semibold mb-1">Add Manually</h3>
            <p className="text-sm text-muted-foreground mb-4">Enter a player's details to add them one at a time.</p>
            <form onSubmit={handleAddPlayer} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="add-first-name">First Name *</Label>
                  <Input
                    id="add-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    disabled={addManualPlayerMutation.isPending}
                    data-testid="input-add-first-name"
                  />
                </div>
                <div>
                  <Label htmlFor="add-last-name">Last Name *</Label>
                  <Input
                    id="add-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    disabled={addManualPlayerMutation.isPending}
                    data-testid="input-add-last-name"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="add-email">Email</Label>
                <Input
                  id="add-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@example.com"
                  disabled={addManualPlayerMutation.isPending}
                  data-testid="input-add-email"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="add-jersey">Jersey Number</Label>
                  <Input
                    id="add-jersey"
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    placeholder="23"
                    disabled={addManualPlayerMutation.isPending}
                    data-testid="input-add-jersey"
                  />
                </div>
                <div>
                  <Label htmlFor="add-position">Position</Label>
                  <Input
                    id="add-position"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="Forward"
                    disabled={addManualPlayerMutation.isPending}
                    data-testid="input-add-position"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={addManualPlayerMutation.isPending || !firstName.trim() || !lastName.trim()}
                data-testid="button-submit-add-player"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {addManualPlayerMutation.isPending ? 'Adding...' : 'Add Player'}
              </Button>
            </form>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or import</span>
            </div>
          </div>

          {/* CSV Import */}
          <div>
            <h3 className="font-semibold mb-1">Import via CSV</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Upload a CSV with columns: firstName, lastName, email, jerseyNumber, position
            </p>
            <a
              href="/player-import-template.csv"
              download="player-import-template.csv"
              className="text-sm text-primary hover:underline block mb-3"
            >
              Download CSV Template
            </a>
            <div className="space-y-3">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                disabled={importPlayersMutation.isPending}
                data-testid="input-csv-file"
              />
              {csvFile && (
                <p className="text-sm text-muted-foreground">Selected: {csvFile.name}</p>
              )}
              <Button
                onClick={handleImportPlayers}
                className="w-full"
                variant="outline"
                disabled={!csvFile || importPlayersMutation.isPending}
                data-testid="button-import-csv"
              >
                <Upload className="w-4 h-4 mr-2" />
                {importPlayersMutation.isPending ? 'Importing...' : 'Import Players'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

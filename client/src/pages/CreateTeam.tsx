import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Upload, Copy, CheckCircle2, Users, UserPlus, Image as ImageIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { FixedBottomButton } from '@/components/FixedBottomButton';
import { ObjectUploader } from '@/components/ObjectUploader';
import { getImageUrl } from '@/lib/queryClient';
import { RinkPickerField } from '@/components/RinkPickerField';
import type { RinkSelection } from '@/components/RinkPickerField';

interface TeamResponse {
  id: string;
  name: string;
  uniqueTeamId: string;
  creatorId: string;
  captainId: string;
  logoUrl?: string | null;
  facilityId?: string | null;
}


export default function CreateTeam() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [teamName, setTeamName] = useState('');
  const [selectedFacility, setSelectedFacility] = useState<RinkSelection | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [createdTeam, setCreatedTeam] = useState<TeamResponse | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedTeamId, setCopiedTeamId] = useState(false);

  // Manual player addition state
  const [manualFirstName, setManualFirstName] = useState('');
  const [manualLastName, setManualLastName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualJerseyNumber, setManualJerseyNumber] = useState('');
  const [manualPosition, setManualPosition] = useState('');

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; photoUrl?: string; facilityId?: string }) => {
      const response = await apiRequest('POST', '/api/teams/standalone', { 
        teamName: data.name,
        photoUrl: data.photoUrl || null,
        facilityId: data.facilityId || null,
      });
      return response.json();
    },
    onSuccess: (data: TeamResponse) => {
      // Invalidate teams query so the dashboard shows the new team
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
      setCreatedTeam(data);
      toast({
        title: 'Team Created',
        description: `${data.name} has been created successfully!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Import players mutation
  const importPlayersMutation = useMutation({
    mutationFn: async ({ teamId, csvData }: { teamId: string; csvData: any[] }) => {
      const response = await apiRequest('POST', `/api/teams/${teamId}/players/import`, { csvData });
      return response.json();
    },
    onSuccess: (data: { successCount: number; failedCount: number }) => {
      const message = [
        data.successCount > 0 ? `${data.successCount} players imported` : null,
        data.failedCount > 0 ? `${data.failedCount} failed` : null
      ].filter(Boolean).join(', ');

      toast({
        title: 'Import Complete',
        description: message || 'Players imported successfully',
      });
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error: Error) => {
      toast({
        title: 'Import Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Manual player addition mutation
  const addManualPlayerMutation = useMutation({
    mutationFn: async (playerData: { 
      teamId: string; 
      firstName: string; 
      lastName: string; 
      email?: string; 
      jerseyNumber?: string; 
      position?: string;
    }) => {
      const response = await apiRequest('POST', `/api/teams/${playerData.teamId}/players/manual`, playerData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Player Added',
        description: 'Player has been added to the team successfully!',
      });
      setManualFirstName('');
      setManualLastName('');
      setManualEmail('');
      setManualJerseyNumber('');
      setManualPosition('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a team name',
        variant: 'destructive',
      });
      return;
    }
    createTeamMutation.mutate({
      name: teamName.trim(),
      photoUrl: photoUrl || undefined,
      facilityId: selectedFacility?.facilityId || undefined,
    });
  };

  const handleGetTeamLogoUploadParameters = async () => {
    const response = await apiRequest('POST', '/api/team-logos/upload', {});
    const { uploadURL, path } = await response.json();
    return {
      method: 'PUT' as const,
      url: uploadURL,
      path,
    };
  };

  const handleTeamPhotoUploadComplete = (result: {
    successful?: Array<{ uploadURL: string; path?: string }>;
    failed?: Array<any>;
  }) => {
    const uploaded = result.successful?.[0];
    if (uploaded?.path || uploaded?.uploadURL) {
      setPhotoUrl(uploaded.path || uploaded.uploadURL);
      toast({
        title: 'Photo Uploaded',
        description: 'Team photo uploaded successfully!',
      });
    } else if (result.failed && result.failed.length > 0) {
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload photo. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast({
          title: 'Invalid File',
          description: 'Please upload a CSV file',
          variant: 'destructive',
        });
        return;
      }
      setCsvFile(file);
    }
  };

  const handleImportPlayers = () => {
    if (!csvFile || !createdTeam) return;

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          toast({
            title: 'Error',
            description: 'CSV file is empty',
            variant: 'destructive',
          });
          return;
        }
        importPlayersMutation.mutate({
          teamId: createdTeam.id,
          csvData: results.data,
        });
      },
      error: (error) => {
        toast({
          title: 'Error',
          description: `Failed to parse CSV: ${error.message}`,
          variant: 'destructive',
        });
      },
    });
  };

  const handleAddManualPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdTeam) return;

    if (!manualFirstName.trim() || !manualLastName.trim()) {
      toast({
        title: 'Error',
        description: 'First name and last name are required',
        variant: 'destructive',
      });
      return;
    }

    addManualPlayerMutation.mutate({
      teamId: createdTeam.id,
      firstName: manualFirstName.trim(),
      lastName: manualLastName.trim(),
      email: manualEmail.trim() || undefined,
      jerseyNumber: manualJerseyNumber.trim() || undefined,
      position: manualPosition.trim() || undefined,
    });
  };

  const copyTeamIdToClipboard = () => {
    if (createdTeam?.uniqueTeamId) {
      navigator.clipboard.writeText(createdTeam.uniqueTeamId);
      setCopiedTeamId(true);
      toast({
        title: 'Copied!',
        description: 'Team ID copied to clipboard',
      });
      setTimeout(() => setCopiedTeamId(false), 2000);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl pb-[4px] pt-[20px]">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 whitespace-nowrap overflow-hidden text-ellipsis text-center">
        {createdTeam ? `Team Name: ${createdTeam.name}` : 'Create a Standalone Team'}
      </h1>
      {!createdTeam ? (
        <>
          {/* Independent Team Info Card */}
          <Card className="mb-6 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="p-6 pl-[4px] pr-[4px] pt-[4px] pb-[4px]">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">This team will be independent</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    You're creating a team that is not part of any league or tournament. This is perfect for pickup games, 
                    practice sessions, or organizing your own events. If you want to join a league later, you can request 
                    to join from your team's page.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pl-[20px] pr-[20px] pt-[8px] pb-[8px]">
              <CardTitle>Team Details</CardTitle>
              <CardDescription>
                Create a team independent of any league. You can invite players and request to join a league later.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-[8px] pl-[12px] pr-[12px] text-left">
              <form id="create-team-form" onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label htmlFor="teamName" className="block text-sm font-medium mb-2">
                  Team Name *
                </label>
                <Input
                  id="teamName"
                  data-testid="input-team-name"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter team name"
                  disabled={createTeamMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Team Photo (Optional)
                </label>
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30 overflow-hidden shrink-0"
                    data-testid="img-team-photo-preview"
                  >
                    {photoUrl ? (
                      <img
                        src={getImageUrl(photoUrl) || ''}
                        alt="Team photo preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                    )}
                  </div>
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={10485760}
                    onGetUploadParameters={handleGetTeamLogoUploadParameters}
                    onComplete={handleTeamPhotoUploadComplete}
                    cropShape="rect"
                    cropDialogTitle="Position your team logo"
                    buttonClassName="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3 text-sm"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {photoUrl ? 'Replace Photo' : 'Upload Photo'}
                  </ObjectUploader>
                  {photoUrl && (
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Uploaded</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Facility (Optional)
                </label>
                <RinkPickerField
                  onSelect={(rink) => setSelectedFacility(rink)}
                />
              </div>

            </form>
          </CardContent>
        </Card>
        
        <FixedBottomButton>
          <Button
            type="submit"
            form="create-team-form"
            data-testid="button-create-team"
            disabled={createTeamMutation.isPending || !teamName.trim()}
            className="w-full"
          >
            {createTeamMutation.isPending ? 'Creating...' : 'Create Team'}
          </Button>
        </FixedBottomButton>
        </>
      ) : (
        <div className="space-y-6">
          <Card className="border-green-500/50 bg-green-500/10">
            <CardContent className="space-y-4 pl-[12px] pr-[12px] pb-[12px]">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Team ID (Share this with players)</p>
                <div className="flex items-center gap-2">
                  <code className="text-3xl font-mono font-bold tracking-wider bg-muted px-4 py-2 rounded-md" data-testid="text-team-id">
                    {createdTeam.uniqueTeamId}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    data-testid="button-copy-team-id"
                    onClick={copyTeamIdToClipboard}
                  >
                    {copiedTeamId ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Share this ID with players so they can join your team
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add Players Manually
              </CardTitle>
              <CardDescription>
                Add players one at a time by entering their details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddManualPlayer} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      data-testid="input-manual-first-name"
                      value={manualFirstName}
                      onChange={(e) => setManualFirstName(e.target.value)}
                      placeholder="John"
                      disabled={addManualPlayerMutation.isPending}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      data-testid="input-manual-last-name"
                      value={manualLastName}
                      onChange={(e) => setManualLastName(e.target.value)}
                      placeholder="Doe"
                      disabled={addManualPlayerMutation.isPending}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    data-testid="input-manual-email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    placeholder="john.doe@example.com"
                    disabled={addManualPlayerMutation.isPending}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="jerseyNumber">Jersey Number</Label>
                    <Input
                      id="jerseyNumber"
                      data-testid="input-manual-jersey-number"
                      value={manualJerseyNumber}
                      onChange={(e) => setManualJerseyNumber(e.target.value)}
                      placeholder="23"
                      disabled={addManualPlayerMutation.isPending}
                    />
                  </div>
                  <div>
                    <Label htmlFor="position">Position</Label>
                    <Input
                      id="position"
                      data-testid="input-manual-position"
                      value={manualPosition}
                      onChange={(e) => setManualPosition(e.target.value)}
                      placeholder="Forward"
                      disabled={addManualPlayerMutation.isPending}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  data-testid="button-add-manual-player"
                  disabled={addManualPlayerMutation.isPending || !manualFirstName.trim() || !manualLastName.trim()}
                  className="w-full"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {addManualPlayerMutation.isPending ? 'Adding...' : 'Add Player'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Import Players (CSV)
              </CardTitle>
              <CardDescription>
                Upload a CSV file to bulk import players to your team
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-md">
                <p className="text-sm font-medium mb-2">CSV Template Format:</p>
                <p className="text-sm text-muted-foreground mb-2">
                  firstName, lastName, email, jerseyNumber, position
                </p>
                <a
                  href="/player-import-template.csv"
                  download="player-import-template.csv"
                  className="text-sm text-primary hover:underline"
                  data-testid="link-download-template"
                >
                  Download CSV Template
                </a>
              </div>

              <div className="space-y-3">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  data-testid="input-csv-file"
                  onChange={handleFileSelect}
                  disabled={importPlayersMutation.isPending}
                />
                {csvFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {csvFile.name}
                  </p>
                )}
                <Button
                  onClick={handleImportPlayers}
                  data-testid="button-import-players"
                  disabled={!csvFile || importPlayersMutation.isPending}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {importPlayersMutation.isPending ? 'Importing...' : 'Import Players'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button
              variant="outline"
              data-testid="button-view-team"
              onClick={() => setLocation('/teams')}
              className="flex-1"
            >
              View Team
            </Button>
            <Button
              variant="outline"
              data-testid="button-create-another"
              onClick={() => {
                setCreatedTeam(null);
                setTeamName('');
                setCsvFile(null);
                setPhotoUrl('');
                setSelectedFacility(null);
              }}
              className="flex-1"
            >
              Create Another Team
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

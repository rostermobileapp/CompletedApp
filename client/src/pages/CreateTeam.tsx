import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Upload, Copy, CheckCircle2, Users, UserPlus, Image as ImageIcon, Building2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface TeamResponse {
  id: string;
  name: string;
  uniqueTeamId: string;
  creatorId: string;
  captainId: string;
  logoUrl?: string | null;
  facilityId?: string | null;
}

interface Facility {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

export default function CreateTeam() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [teamName, setTeamName] = useState('');
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [createdTeam, setCreatedTeam] = useState<TeamResponse | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [copiedTeamId, setCopiedTeamId] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showCreateFacility, setShowCreateFacility] = useState(false);
  const [newFacilityName, setNewFacilityName] = useState('');
  const [newFacilityAddress, setNewFacilityAddress] = useState('');
  const [newFacilityCity, setNewFacilityCity] = useState('');
  const [newFacilityState, setNewFacilityState] = useState('');

  // Manual player addition state
  const [manualFirstName, setManualFirstName] = useState('');
  const [manualLastName, setManualLastName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualJerseyNumber, setManualJerseyNumber] = useState('');
  const [manualPosition, setManualPosition] = useState('');

  // Fetch facilities
  const { data: facilities = [] } = useQuery<Facility[]>({
    queryKey: ['/api/facilities'],
    enabled: !createdTeam, // Only fetch when creating team
  });

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

  // Create facility mutation
  const createFacilityMutation = useMutation({
    mutationFn: async (facilityData: { name: string; address?: string; city?: string; state?: string }) => {
      const response = await apiRequest('POST', '/api/facilities', facilityData);
      return response.json();
    },
    onSuccess: (data: Facility) => {
      queryClient.invalidateQueries({ queryKey: ['/api/facilities'] });
      setSelectedFacilityId(data.id);
      setShowCreateFacility(false);
      setNewFacilityName('');
      setNewFacilityAddress('');
      setNewFacilityCity('');
      setNewFacilityState('');
      toast({
        title: 'Facility Created',
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
      facilityId: selectedFacilityId || undefined,
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please upload an image file',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUploadingPhoto(true);

      // Get upload URL and path
      const urlResponse = await apiRequest('POST', '/api/team-logos/upload', {});
      const { uploadURL, path } = await urlResponse.json();

      // Upload to object storage
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload photo');
      }

      // Use the path returned from the API
      setPhotoUrl(path);

      toast({
        title: 'Photo Uploaded',
        description: 'Team photo uploaded successfully!',
      });
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload photo',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingPhoto(false);
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

  const handleCreateFacility = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFacilityName.trim();
    const address = newFacilityAddress.trim();
    const city = newFacilityCity.trim();
    const state = newFacilityState.trim();

    if (!name) {
      toast({
        title: 'Error',
        description: 'Facility name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!address) {
      toast({
        title: 'Error',
        description: 'Address is required',
        variant: 'destructive',
      });
      return;
    }

    if (!city) {
      toast({
        title: 'Error',
        description: 'City is required',
        variant: 'destructive',
      });
      return;
    }

    if (!state) {
      toast({
        title: 'Error',
        description: 'State is required',
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicate facilities
    const duplicate = facilities.find(
      facility =>
        facility.address?.toLowerCase() === address.toLowerCase() &&
        facility.city?.toLowerCase() === city.toLowerCase() &&
        facility.state?.toLowerCase() === state.toLowerCase()
    );

    if (duplicate) {
      toast({
        title: 'Duplicate Facility',
        description: 'This facility already exists',
        variant: 'destructive',
      });
      return;
    }

    createFacilityMutation.mutate({
      name,
      address,
      city,
      state,
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
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Create a Standalone Team</h1>
      
      {!createdTeam ? (
        <Card>
          <CardHeader>
            <CardTitle>Team Details</CardTitle>
            <CardDescription>
              Create a team independent of any league. You can invite players and request to join a league later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTeam} className="space-y-4">
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
                  <Input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    data-testid="input-team-photo"
                    onChange={handlePhotoUpload}
                    disabled={isUploadingPhoto}
                    className="flex-1"
                  />
                  {photoUrl && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Uploaded</span>
                    </div>
                  )}
                  {isUploadingPhoto && (
                    <span className="text-sm text-muted-foreground">Uploading...</span>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="facility" className="block text-sm font-medium mb-2">
                  Facility (Optional)
                </label>
                <div className="flex gap-2">
                  <Select 
                    value={selectedFacilityId || "none"} 
                    onValueChange={(value) => setSelectedFacilityId(value === "none" ? "" : value)}
                  >
                    <SelectTrigger data-testid="select-facility" className="flex-1">
                      <SelectValue placeholder="Select a facility" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No facility</SelectItem>
                      {facilities.map((facility) => (
                        <SelectItem key={facility.id} value={facility.id}>
                          {facility.name}
                          {facility.city && ` - ${facility.city}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="button-create-facility"
                    onClick={() => setShowCreateFacility(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                data-testid="button-create-team"
                disabled={createTeamMutation.isPending || !teamName.trim()}
                className="w-full"
              >
                {createTeamMutation.isPending ? 'Creating...' : 'Create Team'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="border-green-500/50 bg-green-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Team Created Successfully!
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Team Name</p>
                <p className="text-2xl font-bold" data-testid="text-team-name">{createdTeam.name}</p>
              </div>
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
                setSelectedFacilityId('');
              }}
              className="flex-1"
            >
              Create Another Team
            </Button>
          </div>
        </div>
      )}

      {/* Create Facility Dialog */}
      <Dialog open={showCreateFacility} onOpenChange={setShowCreateFacility}>
        <DialogContent data-testid="dialog-create-facility">
          <DialogHeader>
            <DialogTitle>Create New Facility</DialogTitle>
            <DialogDescription>
              Add a new facility to the system
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFacility} className="space-y-4">
            <div>
              <Label htmlFor="facilityName">Facility Name *</Label>
              <Input
                id="facilityName"
                data-testid="input-facility-name"
                value={newFacilityName}
                onChange={(e) => setNewFacilityName(e.target.value)}
                placeholder="Enter facility name"
                disabled={createFacilityMutation.isPending}
              />
            </div>
            <div>
              <Label htmlFor="facilityAddress">Address *</Label>
              <Input
                id="facilityAddress"
                data-testid="input-facility-address"
                value={newFacilityAddress}
                onChange={(e) => setNewFacilityAddress(e.target.value)}
                placeholder="123 Main St"
                disabled={createFacilityMutation.isPending}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="facilityCity">City *</Label>
                <Input
                  id="facilityCity"
                  data-testid="input-facility-city"
                  value={newFacilityCity}
                  onChange={(e) => setNewFacilityCity(e.target.value)}
                  placeholder="New York"
                  disabled={createFacilityMutation.isPending}
                />
              </div>
              <div>
                <Label htmlFor="facilityState">State *</Label>
                <Input
                  id="facilityState"
                  data-testid="input-facility-state"
                  value={newFacilityState}
                  onChange={(e) => setNewFacilityState(e.target.value)}
                  placeholder="NY"
                  disabled={createFacilityMutation.isPending}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateFacility(false)}
                disabled={createFacilityMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="button-submit-facility"
                disabled={createFacilityMutation.isPending || !newFacilityName.trim() || !newFacilityAddress.trim() || !newFacilityCity.trim() || !newFacilityState.trim()}
              >
                {createFacilityMutation.isPending ? 'Creating...' : 'Create Facility'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

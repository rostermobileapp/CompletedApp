import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Upload, Copy, CheckCircle2, Users } from 'lucide-react';

interface TeamResponse {
  id: string;
  name: string;
  uniqueTeamId: string;
  creatorId: string;
  captainId: string;
}

export default function CreateTeam() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [teamName, setTeamName] = useState('');
  const [createdTeam, setCreatedTeam] = useState<TeamResponse | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedTeamId, setCopiedTeamId] = useState(false);

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest('POST', '/api/teams/standalone', { teamName: name });
      return response.json();
    },
    onSuccess: (data: TeamResponse) => {
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
    createTeamMutation.mutate(teamName.trim());
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
                  Team Name
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
                <Users className="h-5 w-5" />
                Import Players (Optional)
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
              onClick={() => setLocation(`/teams/${createdTeam.id}`)}
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

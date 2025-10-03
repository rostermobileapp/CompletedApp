import { useState } from 'react';
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { usePermissions } from '@/context/SubscriptionContext';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Trophy,
  Calendar,
  Star,
  Check,
  X,
  Plus,
  Edit3,
  AlertCircle,
  Settings,
  Clock,
  Upload,
  FileText,
  UserCheck2,
  AlertTriangle,
  Download,
  Merge,
  Trash2,
  Edit,
  List,
  Target,
  Shield,
  AlertCircle as AlertIcon
} from 'lucide-react';
import { insertTeamSchema, insertSeasonSchema } from '@shared/schema';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ObjectUploader } from '@/components/ObjectUploader';
import { GoogleAddressAutocomplete } from '@/components/GoogleAddressAutocomplete';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type LeagueMember = {
  id: string;
  userId: string;
  skillLevel: string | null;
  skillRating?: number; // Added missing property
  status: string;
  assignedTeamId?: string;
  position?: string;
  notes?: string;
  jerseyNumber?: number;
  displayFirstName?: string; // For merged players - overrides user.firstName for league display
  displayLastName?: string; // For merged players - overrides user.lastName for league display
  isGoalie?: boolean; // Added for goalie status
  leagueRole?: string; // League-specific role
  leagueSpecialPermissions?: string[]; // League-specific special permissions
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    email: string;
  };
};


// Commissioner To-Do Component for Score Verification
function CommissionerScoreToDo({ leagueId }: { leagueId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch games that need score verification using correct business logic
  const { data: gamesNeedingVerification = [], isLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      const allGames = await response.json();
      
      if (!Array.isArray(allGames)) return [];
      
      // Find games that need commissioner verification based on the correct business logic:
      // 1. Today's date is AFTER the game's date (past games)
      // 2. Game has problematic score submissions (0, 1, or 2 mismatched)
      const gamesNeedingVerification = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      for (const game of allGames) {
        const gameDate = new Date(game.scheduledAt);
        gameDate.setHours(0, 0, 0, 0); // Start of game date
        
        // Only check games from past dates
        if (gameDate >= today) {
          continue; // Skip future games
        }
        
        try {
          const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
          const submissions = await submissionsResponse.json();
          
          if (!Array.isArray(submissions)) continue;
          
          const submissionCount = submissions.length;
          let needsVerification = false;
          let reason = '';
          let submissionDetails = submissions;
          
          // Check if there's a commissioner submission - if so, no verification needed
          const hasCommissionerSubmission = submissions.some(sub => 
            sub.submitterRole === 'commissioner' || sub.isCommissionerOverride === true
          );
          
          if (hasCommissionerSubmission) {
            // Commissioner has already submitted final score - no verification needed
            needsVerification = false;
          } else if (submissionCount === 0) {
            // No score submissions - needs verification
            needsVerification = true;
            reason = 'No score submissions';
          } else if (submissionCount === 1) {
            // Only one team submitted - needs verification
            needsVerification = true;
            reason = 'Missing one team submission';
          } else if (submissionCount === 2) {
            // Two submissions - check if they match
            const [sub1, sub2] = submissions;
            if (sub1.homeScore !== sub2.homeScore || sub1.awayScore !== sub2.awayScore) {
              needsVerification = true;
              reason = `Mismatched scores`;
            }
          }
          
          if (needsVerification) {
            gamesNeedingVerification.push({
              ...game,
              submissionCount,
              reason,
              submissions: submissionDetails
            });
          }
        } catch (error) {
          // Skip on error
          continue;
        }
      }
      
      return gamesNeedingVerification;
    },
    enabled: !!leagueId,
  });

  // Mutation to submit/update score for a game
  const submitScoreMutation = useMutation({
    mutationFn: async ({ gameId, homeScore, awayScore }: { gameId: string; homeScore: number; awayScore: number }) => {
      const response = await apiRequest('POST', `/api/games/${gameId}/submit-score`, {
        homeScore,
        awayScore,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Score submitted",
        description: "Game score has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'games-needing-verification'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'games'] });
    },
    onError: (error) => {
      console.error('Error submitting score:', error);
      toast({
        title: "Error",
        description: "Failed to submit score. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Component to handle individual score submission
  const ScoreSubmissionCard = ({ game }: { game: any }) => {
    const [homeScore, setHomeScore] = useState('');
    const [awayScore, setAwayScore] = useState('');

    const handleSubmitScore = () => {
      const home = parseInt(homeScore);
      const away = parseInt(awayScore);
      
      if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
        toast({
          title: "Invalid Score",
          description: "Please enter valid scores (numbers only).",
          variant: "destructive",
        });
        return;
      }
      
      submitScoreMutation.mutate({ gameId: game.id, homeScore: home, awayScore: away });
    };

    return (
      <div className="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-700 rounded-lg p-3 pt-[1px] pb-[1px]">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-medium text-gray-900 dark:text-white">
            {game.homeTeam?.name} vs {game.awayTeam?.name}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {format(new Date(game.scheduledAt), 'MMM d, yyyy • h:mm a')}
          </p>
        </div>
        {/* Show existing submissions if any */}
        {game.submissions && game.submissions.length > 0 && (
          <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Current Submissions:</h4>
            {game.submissions.map((sub: any, index: number) => (
              <div key={index} className="text-sm text-gray-700 dark:text-gray-300">
                Submission {index + 1}: {game.homeTeam?.name} {sub.homeScore} - {sub.awayScore} {game.awayTeam?.name}
                {sub.submittedBy && <span className="text-xs text-gray-500 ml-2">(by Team {sub.submittedBy})</span>}
              </div>
            ))}
          </div>
        )}
        {/* Score submission form */}
        <div className="grid grid-cols-3 gap-2 items-center">
          <div className="text-center">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
              {game.homeTeam?.name}
            </label>
            <Input
              type="number"
              min="0"
              value={homeScore}
              onChange={(e) => setHomeScore(e.target.value)}
              className="text-center"
              placeholder="0"
              data-testid={`input-home-score-${game.id}`}
            />
          </div>
          
          <div className="text-center text-lg font-bold text-gray-500">
            -
          </div>
          
          <div className="text-center">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
              {game.awayTeam?.name}
            </label>
            <Input
              type="number"
              min="0"
              value={awayScore}
              onChange={(e) => setAwayScore(e.target.value)}
              className="text-center"
              placeholder="0"
              data-testid={`input-away-score-${game.id}`}
            />
          </div>
        </div>
        <Button
          onClick={handleSubmitScore}
          disabled={submitScoreMutation.isPending || !homeScore || !awayScore}
          className="w-full mt-2"
          data-testid={`button-submit-score-${game.id}`}
        >
          {submitScoreMutation.isPending ? "Submitting..." : "Submit Final Score"}
        </Button>
      </div>
    );
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="mb-4">
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-600 dark:text-blue-300">Checking for games needing verification...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!Array.isArray(gamesNeedingVerification) || gamesNeedingVerification.length === 0) {
    return (
      <div className="mb-4">
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-sm text-green-600 dark:text-green-300">All games are up to date - no verification needed!</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-red-600" />
        <h2 className="text-xl font-bold text-red-600">Score Verification Needed</h2>
        <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">{gamesNeedingVerification.length}</span>
        </div>
      </div>
      
      <div className="space-y-4">
        {gamesNeedingVerification.map((game: any) => (
          <ScoreSubmissionCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}

type Season = {
  id: string;
  name: string;
  leagueId: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
};

// Utility function to format names as "Last Name, First Name"
// Supports display names from league membership for merged players
function formatUserName(
  user: { firstName?: string; lastName?: string; displayName?: string }, 
  membership?: { displayFirstName?: string; displayLastName?: string }
): string {
  // Use display names from membership if available (for merged players like Dale Barber)
  const firstName = membership?.displayFirstName || user.firstName;
  const lastName = membership?.displayLastName || user.lastName;
  
  if (lastName && firstName) {
    return `${lastName}, ${firstName}`;
  } else if (firstName) {
    return firstName;
  } else if (user.displayName) {
    return user.displayName;
  }
  return 'User';
}

type Team = {
  id: string;
  name: string;
  captainId: string;
  leagueId: string;
  isFreeAgents?: boolean; // Added missing property
};

type Game = {
  id: string;
  leagueId: string;
  seasonId?: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string;
  venue?: string;
  lockerRoom?: string; // Added missing property
  homeTeamLockerRoom?: string;
  awayTeamLockerRoom?: string;
  homeScore?: number; // Added missing property
  awayScore?: number; // Added missing property
  isCompleted: boolean; // Added missing property
  homeBeverageDutyUserId?: string;
  homeBeverageDutyClaimedAt?: string;
  awayBeverageDutyUserId?: string;
  awayBeverageDutyClaimedAt?: string;
  createdAt: string;
  // Add team objects that are commonly included in API responses
  homeTeam?: Team;
  awayTeam?: Team;
};

const createTeamSchema = insertTeamSchema.extend({
  captainId: insertTeamSchema.shape.captainId.optional(),
});

type CreateTeamForm = z.infer<typeof createTeamSchema>;

const createGameSchema = z.object({
  homeTeamId: z.string().min(1, 'Home team is required'),
  awayTeamId: z.string().min(1, 'Away team is required'),
  scheduledAt: z.string().min(1, 'Game date and time is required'),
  venue: z.string().optional(),
});

type CreateGameForm = z.infer<typeof createGameSchema>;

const editGameSchema = z.object({
  homeTeamId: z.string().min(1, 'Home team is required'),
  awayTeamId: z.string().min(1, 'Away team is required'),
  gameDate: z.string().min(1, 'Game date is required'),
  gameTime: z.string().min(1, 'Game time is required'),
  venue: z.string().optional(),
  lockerRoom: z.string().optional(),
});

type EditGameForm = z.infer<typeof editGameSchema>;

const editLeagueSchema = z.object({
  name: z.string().min(1, 'League name is required'),
  description: z.string().optional(),
  location: z.string().optional(),
  season: z.string().optional(),
  isActive: z.boolean(),
});

type EditLeagueForm = z.infer<typeof editLeagueSchema>;

const createSeasonSchema = z.object({
  name: z.string().min(1, 'Season name is required'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CreateSeasonForm = z.infer<typeof createSeasonSchema>;

// Games Calendar Component
function GamesCalendar({ games, teams, onGameClick }: {
  games: any[];
  teams: any[];
  onGameClick: (game: any) => void;
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Group games by date
  const gamesByDate = React.useMemo(() => {
    const grouped: { [key: string]: any[] } = {};
    games.forEach(game => {
      const dateKey = new Date(game.scheduledAt).toDateString();
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(game);
    });
    return grouped;
  }, [games]);

  // Get calendar days for current month
  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days = [];
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      days.push(new Date(date));
    }
    return days;
  };

  const calendarDays = getCalendarDays();
  const currentMonth = currentDate.getMonth();

  return (
    <div className="bg-background rounded-lg border p-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">
          {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            data-testid="button-prev-month"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            data-testid="button-today"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            data-testid="button-next-month"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {/* Day Headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="bg-muted p-3 text-center text-sm font-medium text-muted-foreground">
            {day}
          </div>
        ))}
        
        {/* Calendar Days */}
        {calendarDays.map((date, index) => {
          const dateKey = date.toDateString();
          const dayGames = gamesByDate[dateKey] || [];
          const isCurrentMonth = date.getMonth() === currentMonth;
          const isToday = date.toDateString() === new Date().toDateString();
          
          return (
            <div
              key={index}
              className={`bg-background p-2 min-h-[100px] ${
                !isCurrentMonth ? 'opacity-40' : ''
              } ${isToday ? 'bg-primary/5 border-2 border-primary/20' : ''}`}
            >
              <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : ''}`}>
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {dayGames.map(game => {
                  const homeTeam = teams.find(t => t.id === game.homeTeamId);
                  const awayTeam = teams.find(t => t.id === game.awayTeamId);
                  const gameTime = new Date(game.scheduledAt);
                  
                  return (
                    <div
                      key={game.id}
                      onClick={() => onGameClick(game)}
                      className="bg-blue-100 text-blue-800 p-1 rounded text-xs cursor-pointer hover:bg-blue-200 transition-colors"
                      data-testid={`calendar-game-${game.id}`}
                    >
                      <div className="font-medium truncate">
                        {homeTeam?.name || 'Team'} vs {awayTeam?.name || 'Team'}
                      </div>
                      <div className="text-blue-600">
                        {gameTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LeagueManagement() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canManageLeague } = usePermissions();
  const [activeTab, setActiveTab] = useState<'players' | 'teams' | 'games'>('games');
  const [gamesViewMode, setGamesViewMode] = useState<'calendar' | 'list'>('calendar');
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<LeagueMember | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [showScheduleGame, setShowScheduleGame] = useState(false);
  const [showEditGame, setShowEditGame] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Score management state
  const [commissionerHomeScore, setCommissionerHomeScore] = useState('');
  const [commissionerAwayScore, setCommissionerAwayScore] = useState('');
  const [isEditingGameScore, setIsEditingGameScore] = useState(false);
  const [editGameHomeScore, setEditGameHomeScore] = useState('');
  const [editGameAwayScore, setEditGameAwayScore] = useState('');
  const datePickerRef = React.useRef<HTMLDivElement>(null);
  const timePickerRef = React.useRef<HTMLDivElement>(null);
  
  // Bulk import state
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showMergeRequests, setShowMergeRequests] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Schedule import state  
  const [showScheduleImport, setShowScheduleImport] = useState(false);
  const [scheduleImportFile, setScheduleImportFile] = useState<File | null>(null);
  const scheduleFileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Merge modal state
  const [selectedMember, setSelectedMember] = useState<LeagueMember | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [potentialMatches, setPotentialMatches] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  
  // User merge modal state (for merging existing users)
  const [showUserMergeModal, setShowUserMergeModal] = useState(false);
  const [selectedPlayerToMerge, setSelectedPlayerToMerge] = useState<LeagueMember | null>(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [targetUserEmail, setTargetUserEmail] = useState('');
  const [preserveDisplayName, setPreserveDisplayName] = useState(true);
  
  // Delete confirmation state
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showDeleteTeamConfirmation, setShowDeleteTeamConfirmation] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<string | null>(null);
  const [showEditTeam, setShowEditTeam] = useState(false);
  const [selectedTeamForEdit, setSelectedTeamForEdit] = useState<Team | null>(null);
  
  // Bulk delete confirmation states
  const [showDeleteAllPlayersDialog, setShowDeleteAllPlayersDialog] = useState(false);
  const [showDeleteAllTeamsDialog, setShowDeleteAllTeamsDialog] = useState(false);
  const [showDeleteAllGamesDialog, setShowDeleteAllGamesDialog] = useState(false);
  
  // Co-commissioner management state
  const [coCommissionerEmail, setCoCommissionerEmail] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [statManagerEmail, setStatManagerEmail] = useState('');
  
  // Close date picker when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDatePicker]);

  // Close time picker when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timePickerRef.current && !timePickerRef.current.contains(event.target as Node)) {
        setShowTimePicker(false);
      }
    };

    if (showTimePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTimePicker]);
  const [showEditLeague, setShowEditLeague] = useState(false);
  const [showCreateSeason, setShowCreateSeason] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [playerEditForm, setPlayerEditForm] = useState({
    assignedTeamId: '',
    position: '',
    skillLevel: '',
    skillRating: 1,
    jerseyNumber: '',
    notes: '',
    isCaptain: false,
    isGoalie: false,
    displayFirstName: '',
    displayLastName: ''
  });

  // Get league ID and edit mode from URL params
  const leagueId = new URLSearchParams(window.location.search).get('leagueId') || '';
  const editMode = new URLSearchParams(window.location.search).get('edit') === 'true';
  const editMemberId = new URLSearchParams(window.location.search).get('editMember') || '';
  
  // Fetch current user for commissioner checks
  const { user } = useAuth();
  
  // Fetch user's leagues for selection
  const { data: userLeagues = [] } = useQuery({
    queryKey: ['/api/user/leagues'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/user/leagues');
      return response.json();
    },
    enabled: !leagueId,
  });

  // Fetch league data
  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch seasons for this league
  const { data: seasons = [], refetch: refetchSeasons } = useQuery<Season[]>({
    queryKey: ['/api/leagues', leagueId, 'seasons'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/seasons`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch league members
  const { data: members = [], refetch: refetchMembers } = useQuery<LeagueMember[]>({
    queryKey: ['/api/leagues', leagueId, 'members'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/members`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Use all members - no filtering needed, placeholders will be merged with real users
  const commissionerDisplayMembers: LeagueMember[] = Array.isArray(members) ? members : [];

  // Fetch pending members
  const { data: pendingMembers = [], refetch: refetchPending } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'pending-members'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/pending-members`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch teams
  const { data: teams = [], refetch: refetchTeams } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'teams'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/teams`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch games
  const { data: gamesData = [], refetch: refetchGames } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch score submissions for selected game
  const { data: selectedGameScoreSubmissions = [] } = useQuery<any[]>({
    queryKey: [`/api/games/${selectedGame?.id}/score-submissions`],
    enabled: !!selectedGame?.id,
  });

  // Sort games chronologically (earliest first)
  const games = React.useMemo(() => {
    return [...gamesData].sort((a, b) => {
      const dateA = new Date(a.scheduledAt);
      const dateB = new Date(b.scheduledAt);
      return dateA.getTime() - dateB.getTime();
    });
  }, [gamesData]);
  
  // Centralized commissioner check (after league query)
  const isCommissioner = React.useMemo(() => {
    return Boolean(league && user && league.commissionerId === user.id);
  }, [league, user]);

  // Get current co-commissioners from members with secondary_commissioner role
  const coCommissioners = React.useMemo(() => {
    if (!members || !Array.isArray(members)) return [];
    return members.filter((member: any) => member.leagueRole === 'secondary_commissioner');
  }, [members]);

  // Get current admins from members with admin special permission
  const admins = React.useMemo(() => {
    if (!members || !Array.isArray(members)) return [];
    return members.filter((member: any) => 
      member.leagueSpecialPermissions?.includes('admin')
    );
  }, [members]);

  // Get current stat managers from members with stat_manager special permission
  const statManagers = React.useMemo(() => {
    if (!members || !Array.isArray(members)) return [];
    return members.filter((member: any) => 
      member.leagueSpecialPermissions?.includes('stat_manager')
    );
  }, [members]);

  // Form for creating teams
  const teamForm = useForm<CreateTeamForm>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: {
      name: '',
      leagueId: leagueId,
    },
  });

  // Form for scheduling games
  const gameForm = useForm<CreateGameForm>({
    resolver: zodResolver(createGameSchema),
    defaultValues: {
      homeTeamId: '',
      awayTeamId: '',
      scheduledAt: '',
      venue: '',
    },
  });

  // Form for editing league
  const editLeagueForm = useForm<EditLeagueForm>({
    resolver: zodResolver(editLeagueSchema),
    defaultValues: {
      name: league?.name || '',
      description: league?.description || '',
      location: league?.location || '',
      season: league?.season || '',
      isActive: league?.isActive ?? true,
    },
  });

  // Form for creating seasons
  const seasonForm = useForm<CreateSeasonForm>({
    resolver: zodResolver(createSeasonSchema),
    defaultValues: {
      name: '',
      isActive: true,
    },
  });

  // Form for editing games
  const editGameForm = useForm<EditGameForm>({
    resolver: zodResolver(editGameSchema),
    defaultValues: {
      homeTeamId: '',
      awayTeamId: '',
      gameDate: '',
      gameTime: '',
      venue: '',
    },
  });

  // Update edit game form when selected game changes
  React.useEffect(() => {
    if (selectedGame) {
      const gameDate = new Date(selectedGame.scheduledAt);
      const formattedDate = gameDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const formattedTime = gameDate.toTimeString().slice(0, 5); // HH:MM
      editGameForm.reset({
        homeTeamId: selectedGame.homeTeamId,
        awayTeamId: selectedGame.awayTeamId,
        gameDate: formattedDate,
        gameTime: formattedTime,
        venue: selectedGame.venue || '',
        lockerRoom: selectedGame.lockerRoom || '',
      });
    }
  }, [selectedGame, editGameForm]);

  // Update form when league data loads
  React.useEffect(() => {
    if (league) {
      editLeagueForm.reset({
        name: league.name,
        description: league.description || '',
        location: league.location || '',
        season: league.season || '',
        isActive: league.isActive ?? true,
      });
    }
  }, [league, editLeagueForm]);

  // Set initial selected season to the first active season or first season
  React.useEffect(() => {
    if (seasons.length > 0 && !selectedSeasonId) {
      const activeSeason = seasons.find(s => s.isActive);
      setSelectedSeasonId(activeSeason?.id || seasons[0].id);
    }
  }, [seasons, selectedSeasonId]);

  // Auto-open player edit modal when editMember parameter is provided
  React.useEffect(() => {
    if (editMemberId && members.length > 0 && teams.length > 0 && !selectedPlayer) {
      const memberToEdit = members.find((member: LeagueMember) => member.id === editMemberId);
      if (memberToEdit) {
        const assignedTeam = teams.find((team: Team) => team.id === memberToEdit.assignedTeamId);
        setSelectedPlayer(memberToEdit);
        setPlayerEditForm({
          assignedTeamId: memberToEdit.assignedTeamId || '',
          position: memberToEdit.position || '',
          skillLevel: memberToEdit.skillLevel || '',
          skillRating: memberToEdit.skillRating || 1,
          jerseyNumber: memberToEdit.jerseyNumber?.toString() || '',
          notes: memberToEdit.notes || '',
          isCaptain: assignedTeam?.captainId === memberToEdit.userId,
          isGoalie: memberToEdit.isGoalie || false,
          displayFirstName: memberToEdit.displayFirstName || memberToEdit.user.firstName || '',
          displayLastName: memberToEdit.displayLastName || memberToEdit.user.lastName || ''
        });
        // Clear the editMember parameter from URL after opening modal
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('editMember');
        window.history.replaceState({}, '', newUrl.toString());
      }
    }
  }, [editMemberId, members, teams, selectedPlayer]);

  // Mutations for member management
  const approveMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const response = await apiRequest('POST', `/api/league-memberships/${membershipId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Member approved successfully' });
      refetchMembers();
      refetchPending();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const response = await apiRequest('POST', `/api/league-memberships/${membershipId}/reject`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Member rejected successfully' });
      refetchPending();
    },
  });

  const skillLevelMutation = useMutation({
    mutationFn: async ({ membershipId, skillLevel }: { membershipId: string; skillLevel: string | null }) => {
      const response = await apiRequest('PATCH', `/api/league-memberships/${membershipId}/skill-level`, {
        skillLevel,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Skill level updated successfully' });
      refetchMembers();
    },
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ memberId, updates }: { memberId: string; updates: any }) => {
      const response = await apiRequest('PATCH', `/api/leagues/${leagueId}/members/${memberId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Player Updated',
        description: 'Player details have been updated successfully.',
      });
      refetchMembers();
      setSelectedPlayer(null);
    },
  });

  const setTeamCaptainMutation = useMutation({
    mutationFn: async ({ teamId, captainId }: { teamId: string; captainId: string | null }) => {
      const response = await apiRequest('PATCH', `/api/teams/${teamId}/captain`, { captainId });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Team Captain Updated',
        description: 'Team captain has been assigned successfully.',
      });
      // Invalidate queries to refresh team and member data
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
      refetchMembers();
    },
  });

  // Upload mutation for bulk player import
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('playerFile', file);

      const response = await fetch(`/api/leagues/${leagueId}/players/import`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // If all imports failed and we have format help, show detailed error
      if (data.successfulRecords === 0 && data.formatHelp) {
        toast({
          title: 'Import Failed',
          description: (
            <div className="space-y-2">
              <p>{`${data.failedRecords} of ${data.totalRecords} players failed to import.`}</p>
              {data.errors && data.errors.length > 0 && (
                <p className="text-sm">{data.errors[0]}</p>
              )}
              <div className="text-sm mt-2 pt-2 border-t border-border">
                <p className="font-semibold">Expected format:</p>
                <p className="text-xs mt-1">{data.formatHelp.expectedFormat}</p>
                {data.formatHelp.receivedHeaders && (
                  <>
                    <p className="font-semibold mt-2">Your CSV headers:</p>
                    <p className="text-xs mt-1">{data.formatHelp.receivedHeaders}</p>
                  </>
                )}
              </div>
            </div>
          ),
          variant: 'destructive',
          duration: 10000, // Show for 10 seconds
        });
      } else {
        // Show success message with summary
        const successMessage = [
          `${data.successfulRecords} players imported successfully`,
          data.teamsCreated > 0 ? `${data.teamsCreated} teams created` : null,
          data.failedRecords > 0 ? `${data.failedRecords} failed` : null
        ].filter(Boolean).join(', ');
        
        toast({
          title: 'Import Successful',
          description: successMessage,
        });
      }
      
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowBulkImport(false);
      
      // Refetch data to show any new suggestions
      refetchMembers();
    },
    onError: (error: Error) => {
      toast({
        title: 'Import Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle file upload
  const handleFileUpload = () => {
    if (!importFile) return;
    uploadMutation.mutate(importFile);
  };

  // Upload mutation for bulk schedule import
  const scheduleUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('scheduleFile', file);

      const response = await fetch(`/api/leagues/${leagueId}/schedules/import`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Schedule upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      const successMessage = [
        `${data.successfulRecords} games scheduled successfully`,
        data.teamsCreated > 0 ? `${data.teamsCreated} teams created` : null,
        data.failedRecords > 0 ? `${data.failedRecords} failed` : null
      ].filter(Boolean).join(', ');
      
      toast({
        title: 'Schedule Import Successful',
        description: successMessage,
      });
      setScheduleImportFile(null);
      if (scheduleFileInputRef.current) scheduleFileInputRef.current.value = '';
      setShowScheduleImport(false);
      
      // Refetch games to show newly imported schedules
      refetchGames();
    },
    onError: (error: Error) => {
      toast({
        title: 'Schedule Import Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle schedule file upload
  const handleScheduleFileUpload = () => {
    if (!scheduleImportFile) return;
    scheduleUploadMutation.mutate(scheduleImportFile);
  };

  // Bulk delete mutations
  const deleteAllPlayersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/leagues/${leagueId}/members/all`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'All Players Deleted',
        description: 'All players have been removed from the league.',
      });
      refetchMembers();
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteAllTeamsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/leagues/${leagueId}/teams/all`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'All Teams Deleted',
        description: 'All teams have been removed from the league.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
      refetchMembers();
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteAllGamesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/leagues/${leagueId}/games/all`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'All Games Deleted',
        description: 'All games have been removed from the league.',
      });
      refetchGames();
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Team logo upload mutation
  const updateTeamLogoMutation = useMutation({
    mutationFn: async (data: { teamId: string; logoUrl: string }) => {
      const response = await apiRequest('PATCH', `/api/teams/${data.teamId}/logo`, { logoUrl: data.logoUrl });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
      toast({
        title: "Success",
        description: "Team logo updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update team logo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGetTeamLogoUploadParameters = async () => {
    try {
      const response = await apiRequest('POST', '/api/team-logos/upload');
      const data = await response.json();
      return {
        method: 'PUT' as const,
        url: data.uploadURL,
      };
    } catch (error) {
      console.error('Failed to get upload URL:', error);
      throw error;
    }
  };

  const createTeamLogoUploadComplete = (teamId: string) => async (files: File[]) => {
    if (files.length === 0) return;
    
    try {
      // Get upload parameters for this file
      const uploadParams = await handleGetTeamLogoUploadParameters();
      const file = files[0]; // Only handle the first file since maxNumberOfFiles is 1
      
      // Upload the file to object storage using the pre-signed URL
      const uploadResponse = await fetch(uploadParams.url, {
        method: uploadParams.method,
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status: ${uploadResponse.status}`);
      }
      
      // Extract the public URL from the upload URL (remove query parameters)
      const logoUrl = uploadParams.url.split('?')[0];
      
      // Update the team logo in the database
      updateTeamLogoMutation.mutate({ teamId, logoUrl });
      
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: "Error",
        description: "Failed to upload team logo. Please try again.",
        variant: "destructive",
      });
    }
  };

  const removeFromLeagueMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const response = await apiRequest('DELETE', `/api/league-memberships/${membershipId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Player Removed',
        description: 'Player has been removed from the league.',
      });
      refetchMembers();
      setSelectedPlayer(null);
    },
    onError: () => {
      toast({
        title: 'Remove Failed',
        description: 'Failed to remove player from league.',
        variant: 'destructive',
      });
    },
  });

  // Add co-commissioner mutation
  const addCoCommissionerMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest('POST', `/api/leagues/${leagueId}/co-commissioner`, { email });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Co-Commissioner Added',
        description: 'User has been granted co-commissioner privileges.',
      });
      setCoCommissionerEmail('');
      refetchMembers();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Add Co-Commissioner',
        description: error.message || 'Please check the email and try again.',
        variant: 'destructive',
      });
    },
  });

  // Remove co-commissioner mutation
  const removeCoCommissionerMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const response = await apiRequest('DELETE', `/api/leagues/${leagueId}/co-commissioner/${memberId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Co-Commissioner Removed',
        description: 'Co-commissioner privileges have been revoked.',
      });
      refetchMembers();
    },
    onError: () => {
      toast({
        title: 'Failed to Remove Co-Commissioner',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Add admin special permission mutation
  const addAdminMutation = useMutation({
    mutationFn: async (email: string) => {
      // Find user by email from members list
      const member = members?.find((m: any) => m.user.email === email);
      if (!member) {
        throw new Error('User not found in league members');
      }
      
      const currentPermissions = member.leagueSpecialPermissions || [];
      const newPermissions = currentPermissions.includes('admin') 
        ? currentPermissions 
        : [...currentPermissions, 'admin'];
      
      const response = await apiRequest('PATCH', `/api/leagues/${leagueId}/users/${member.userId}/permissions`, {
        leagueRole: member.leagueRole,
        leagueSpecialPermissions: newPermissions
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Admin Added',
        description: 'User has been granted admin privileges.',
      });
      setAdminEmail('');
      refetchMembers();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Add Admin',
        description: error.message || 'Please check the email and try again.',
        variant: 'destructive',
      });
    },
  });

  // Remove admin special permission mutation
  const removeAdminMutation = useMutation({
    mutationFn: async ({ userId, currentPermissions }: { userId: string; currentPermissions: string[] }) => {
      const member = members?.find((m: any) => m.userId === userId);
      if (!member) {
        throw new Error('User not found');
      }
      
      const newPermissions = currentPermissions.filter(p => p !== 'admin');
      
      const response = await apiRequest('PATCH', `/api/leagues/${leagueId}/users/${userId}/permissions`, {
        leagueRole: member.leagueRole,
        leagueSpecialPermissions: newPermissions
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Admin Removed',
        description: 'Admin privileges have been revoked.',
      });
      refetchMembers();
    },
    onError: () => {
      toast({
        title: 'Failed to Remove Admin',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Add stat manager special permission mutation
  const addStatManagerMutation = useMutation({
    mutationFn: async (email: string) => {
      // Find user by email from members list
      const member = members?.find((m: any) => m.user.email === email);
      if (!member) {
        throw new Error('User not found in league members');
      }
      
      const currentPermissions = member.leagueSpecialPermissions || [];
      const newPermissions = currentPermissions.includes('stat_manager') 
        ? currentPermissions 
        : [...currentPermissions, 'stat_manager'];
      
      const response = await apiRequest('PATCH', `/api/leagues/${leagueId}/users/${member.userId}/permissions`, {
        leagueRole: member.leagueRole,
        leagueSpecialPermissions: newPermissions
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Stat Manager Added',
        description: 'User has been granted stat manager privileges.',
      });
      setStatManagerEmail('');
      refetchMembers();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Add Stat Manager',
        description: error.message || 'Please check the email and try again.',
        variant: 'destructive',
      });
    },
  });

  // Remove stat manager special permission mutation
  const removeStatManagerMutation = useMutation({
    mutationFn: async ({ userId, currentPermissions }: { userId: string; currentPermissions: string[] }) => {
      const member = members?.find((m: any) => m.userId === userId);
      if (!member) {
        throw new Error('User not found');
      }
      
      const newPermissions = currentPermissions.filter(p => p !== 'stat_manager');
      
      const response = await apiRequest('PATCH', `/api/leagues/${leagueId}/users/${userId}/permissions`, {
        leagueRole: member.leagueRole,
        leagueSpecialPermissions: newPermissions
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Stat Manager Removed',
        description: 'Stat manager privileges have been revoked.',
      });
      refetchMembers();
    },
    onError: () => {
      toast({
        title: 'Failed to Remove Stat Manager',
        description: 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Team creation mutation
  const createTeamMutation = useMutation({
    mutationFn: async (data: CreateTeamForm) => {
      const response = await apiRequest('POST', '/api/teams', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Team created successfully' });
      setShowCreateTeam(false);
      teamForm.reset();
      refetchTeams();
    },
  });

  // Join team mutation - for team captains to join their own team
  const joinTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      // Find the current user's league membership
      const currentMembership = members.find(m => m.userId === user?.id);
      if (!currentMembership) {
        throw new Error('You must be a league member to join a team');
      }
      
      const response = await apiRequest('PATCH', `/api/leagues/${leagueId}/members/${currentMembership.id}`, {
        assignedTeamId: teamId
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Successfully joined team' });
      refetchMembers();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to join team',
        description: error.message || 'Please try again',
        variant: 'destructive'
      });
    },
  });

  // Game scheduling mutation
  const createGameMutation = useMutation({
    mutationFn: async (data: CreateGameForm) => {
      const gameData = {
        ...data,
        leagueId: leagueId,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
      };
      const response = await apiRequest('POST', '/api/games', gameData);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Game scheduled successfully' });
      setShowScheduleGame(false);
      gameForm.reset();
      refetchGames();
    },
  });

  // Game update mutation
  const updateGameMutation = useMutation({
    mutationFn: async ({ gameId, data, originalScheduledAt }: { gameId: string; data: EditGameForm; originalScheduledAt: string }) => {
      // Combine date and time into a single datetime using local date components
      const [year, month, day] = data.gameDate.split('-');
      const [hours, minutes] = data.gameTime.split(':');
      const combinedDateTime = new Date(
        parseInt(year), 
        parseInt(month) - 1, 
        parseInt(day), 
        parseInt(hours), 
        parseInt(minutes)
      );
      
      // Check if the scheduledAt has actually changed using consistent local components
      let shouldUpdateScheduledAt = false;
      if (originalScheduledAt) {
        const originalDate = new Date(originalScheduledAt);
        
        // Use consistent local components for comparison
        const originalY = originalDate.getFullYear();
        const originalM = String(originalDate.getMonth() + 1).padStart(2, '0');
        const originalD = String(originalDate.getDate()).padStart(2, '0');
        const originalHH = String(originalDate.getHours()).padStart(2, '0');
        const originalMM = String(originalDate.getMinutes()).padStart(2, '0');
        
        const originalFormattedDate = `${originalY}-${originalM}-${originalD}`;
        const originalFormattedTime = `${originalHH}:${originalMM}`;
        
        // Only update scheduledAt if date or time has changed
        shouldUpdateScheduledAt = data.gameDate !== originalFormattedDate || data.gameTime !== originalFormattedTime;
      }
      
      // Build update payload - only include scheduledAt if it changed
      const updatePayload: any = {
        homeTeamId: data.homeTeamId,
        awayTeamId: data.awayTeamId,
        venue: data.venue,
        lockerRoom: data.lockerRoom,
      };
      
      if (shouldUpdateScheduledAt) {
        updatePayload.scheduledAt = combinedDateTime.toISOString();
      }
      
      const response = await apiRequest('PATCH', `/api/games/${gameId}`, updatePayload);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Game updated successfully' });
      setShowEditGame(false);
      setSelectedGame(null);
      refetchGames();
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update game details.',
        variant: 'destructive',
      });
    },
  });

  // Game delete mutation
  const deleteGameMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const response = await apiRequest('DELETE', `/api/games/${gameId}`);
      // Check if response has content before trying to parse JSON
      const text = await response.text();
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          return { message: text };
        }
      }
      return { message: 'Game deleted successfully' };
    },
    onSuccess: () => {
      toast({ 
        title: 'Game deleted successfully',
        description: 'The game has been permanently removed from the schedule.'
      });
      setShowEditGame(false);
      setSelectedGame(null);
      setShowDeleteConfirmation(false);
      refetchGames();
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Commissioner score override mutation
  const commissionerScoreOverrideMutation = useMutation({
    mutationFn: async ({ gameId, homeScore, awayScore }: { gameId: string; homeScore: number; awayScore: number }) => {
      return await apiRequest("POST", `/api/games/${gameId}/submit-score`, { homeScore, awayScore });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${selectedGame?.id}/score-submissions`] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'games'] });
      
      setCommissionerHomeScore("");
      setCommissionerAwayScore("");
      
      toast({
        title: "Score Override Complete",
        description: "Commissioner score has been set and game updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Score Override Failed",
        description: error.message || "Failed to override score. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Team delete mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const response = await apiRequest('DELETE', `/api/teams/${teamId}`);
      // Check if response has content before trying to parse JSON
      const text = await response.text();
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          return { message: text };
        }
      }
      return { message: 'Team deleted successfully' };
    },
    onSuccess: () => {
      toast({ 
        title: 'Team deleted successfully',
        description: 'The team and all associated data have been permanently removed.'
      });
      // Invalidate both teams and games as team deletion affects both
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'games'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Team Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // League update mutation
  const updateLeagueMutation = useMutation({
    mutationFn: async (data: EditLeagueForm) => {
      const response = await apiRequest('PATCH', `/api/leagues/${leagueId}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'League updated successfully' });
      setShowEditLeague(false);
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update league details.',
        variant: 'destructive',
      });
    },
  });

  // League delete mutation
  const deleteLeagueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/leagues/${leagueId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'League deleted successfully' });
      // Invalidate all league-related queries to update the UI
      queryClient.invalidateQueries({ queryKey: ['/api/leagues/commissioner'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/leagues'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/league-memberships'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
      navigate('/league-list');
    },
    onError: () => {
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete league.',
        variant: 'destructive',
      });
    },
  });

  // Season create mutation
  const createSeasonMutation = useMutation({
    mutationFn: async (data: CreateSeasonForm) => {
      const response = await apiRequest('POST', `/api/leagues/${leagueId}/seasons`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Season created successfully' });
      setShowCreateSeason(false);
      seasonForm.reset();
      refetchSeasons();
    },
    onError: () => {
      toast({
        title: 'Creation Failed',
        description: 'Failed to create season.',
        variant: 'destructive',
      });
    },
  });

  // 🚨 SUBSCRIPTION GATE REMOVED - FULL ACCESS FOR EVERYONE! 🚨
  // All users now have commissioner access to manage leagues

  if (!leagueId) {
    return (
      <div className="min-h-screen flex flex-col pb-6" data-testid="league-selection-page">
        <div className="p-6 pt-12">
          <div className="flex items-center gap-4 mb-6">
            <button 
              onClick={() => navigate('/more')}
              className="text-muted-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Crown className="w-6 h-6 text-warning" />
              Select League to Manage
            </h1>
          </div>
        </div>

        <div className="px-6 flex-1">
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold mb-4">Your Leagues</h3>
            {userLeagues.length === 0 ? (
              <div className="text-center py-8">
                <Trophy className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-6">
                  You haven't created any leagues yet. Create your first league to start managing teams and scheduling games.
                </p>
                <button 
                  onClick={() => navigate('/create-league')}
                  className="bg-warning text-black px-6 py-3 rounded-lg font-semibold"
                  data-testid="button-create-first-league"
                >
                  Create Your First League
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {userLeagues.map((league: any) => (
                  <div 
                    key={league.id} 
                    className="p-4 bg-background rounded-lg border hover:border-primary cursor-pointer transition-colors"
                    onClick={() => navigate(`/league-management?leagueId=${league.id}`)}
                    data-testid={`league-option-${league.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{league.name}</h4>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span>{league.sport}</span>
                          {league.location && <span>• {league.location}</span>}
                          {league.season && <span>• {league.season}</span>}
                        </div>
                      </div>
                      <Crown className="w-5 h-5 text-warning" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (leagueLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">
          <div className="text-2xl font-bold text-primary">Loading League...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-6" data-testid="league-management-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={() => {
              setPageTransitionDirection('down');
              navigate('/league-list');
            }}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Crown className="w-6 h-6 text-warning" />
              League Management
            </h1>
            {league && (
              <p className="text-muted-foreground text-sm" data-testid="text-league-name">
                {league.name}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowEditLeague(true)}
            className="px-3 py-1.5 text-sm text-primary hover:text-primary/80 font-medium"
            data-testid="button-edit-league"
          >
            Edit
          </button>
        </div>

        {/* Season Selector */}
        {seasons.length > 0 && (
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2">Season</label>
              <select
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className="w-full p-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="select-season"
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name} {season.isActive ? '(Active)' : '(Inactive)'}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowCreateSeason(true)}
              className="mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium"
              data-testid="button-create-season"
            >
              <Plus className="w-4 h-4 mr-2 inline" />
              New Season
            </button>
          </div>
        )}

        {/* Create First Season */}
        {seasons.length === 0 && (
          <div className="mb-4 p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">No seasons yet</h3>
                <p className="text-sm text-muted-foreground">Create your first season to start organizing games and teams.</p>
              </div>
              <button
                onClick={() => setShowCreateSeason(true)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium"
                data-testid="button-create-first-season"
              >
                <Plus className="w-4 h-4 mr-2 inline" />
                Create Season
              </button>
            </div>
          </div>
        )}

        {/* Commissioner Score Verification To-Do */}
        {league && <CommissionerScoreToDo leagueId={league.id} />}

        {/* Tab Navigation */}
        <div className="flex bg-muted rounded-lg p-1">
          <button
            onClick={() => setActiveTab('players')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'players'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-players"
          >
            <Users className="w-4 h-4" />
            Players
          </button>
          <button
            onClick={() => setActiveTab('teams')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'teams'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-teams"
          >
            <Trophy className="w-4 h-4" />
            Teams
          </button>
          <button
            onClick={() => setActiveTab('games')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'games'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-games"
          >
            <Calendar className="w-4 h-4" />
            Games
          </button>
        </div>
      </div>
      {/* Tab Content */}
      <div className="px-6 flex-1">
        {/* Player Management Tab */}
        {activeTab === 'players' && (
          <div className="space-y-6">
            {/* Simple Import Button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Players</h3>
              </div>
              <button
                onClick={() => setShowBulkImport(!showBulkImport)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                data-testid="button-import-players"
              >
                <Upload className="w-3 h-3" />
                Import Players
              </button>
            </div>

            {/* Import Panel */}
            {showBulkImport && (
              <div className="mt-4 p-4 bg-card rounded-lg border border-border">
                <div className="flex flex-col gap-3">
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="file-drop-zone"
                  >
                    <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    {importFile ? (
                      <div>
                        <p className="font-medium text-green-600 text-sm">{importFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(importFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium text-sm mb-1">Select CSV file</p>
                        <p className="text-xs text-muted-foreground">
                          Format: Name,Team Name
                        </p>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      className="hidden"
                      data-testid="file-input"
                    />
                  </div>

                  {importFile && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleFileUpload}
                        disabled={uploadMutation.isPending}
                        className="flex-1 bg-green-500 text-white px-3 py-1.5 rounded-md hover:bg-green-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="button-upload-file"
                      >
                        {uploadMutation.isPending ? 'Processing...' : 'Upload'}
                      </button>
                      <button
                        onClick={() => {
                          setImportFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="px-3 py-1.5 border border-border rounded-md hover:bg-muted text-sm"
                        data-testid="button-clear-file"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pending Approvals */}
            {pendingMembers.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <UserPlus className="w-5 h-5 text-warning" />
                  <h3 className="text-lg font-semibold">Pending Approval ({pendingMembers.length})</h3>
                </div>
                <div className="space-y-3">
                  {pendingMembers.map((member: LeagueMember) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex-1" data-testid={`pending-player-${member.user.id}`}>
                        <p className="font-medium">{formatUserName(member.user, member)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            // Check for potential merges before approving
                            setSelectedMember(member);
                            
                            // Find potential matches in imported players
                            try {
                              const response = await apiRequest('GET', `/api/leagues/${leagueId}/imported-players/matches?firstName=${encodeURIComponent(member.user.firstName || '')}&lastName=${encodeURIComponent(member.user.lastName || '')}`);
                              const matches = await response.json();
                              setPotentialMatches(matches);
                            } catch (error) {
                              console.error('Error fetching matches:', error);
                              setPotentialMatches([]);
                            }
                            
                            setShowMergeModal(true);
                          }}
                          disabled={approveMutation.isPending}
                          className="flex items-center gap-1 px-3 py-1 bg-green-500/50 text-white rounded-md text-sm font-medium disabled:opacity-50"
                          data-testid={`button-approve-${member.user.id}`}
                        >
                          <Check className="w-3 h-3" />
                          Approve
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate(member.id)}
                          disabled={rejectMutation.isPending}
                          className="flex items-center gap-1 px-3 py-1 bg-red-500/50 text-white rounded-md text-sm font-medium disabled:opacity-50"
                          data-testid={`button-reject-${member.user.id}`}
                        >
                          <X className="w-3 h-3" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approved Members */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-green-500/50" />
                  <h3 className="text-lg font-semibold">League Members ({members.length})</h3>
                </div>
                {members.length > 0 && (
                  <button
                    onClick={() => setShowDeleteAllPlayersDialog(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-md text-sm font-medium transition-colors"
                    data-testid="button-delete-all-players"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete All Players
                  </button>
                )}
              </div>
              {members.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No approved members yet.</p>
              ) : (
                <div className="space-y-3">
                  {members.map((member: LeagueMember) => (
                    <div 
                      key={member.id} 
                      className="flex items-center justify-between p-3 bg-background rounded-lg border hover:bg-card cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedPlayer(member);
                        const assignedTeam = teams.find((team: Team) => team.id === member.assignedTeamId);
                        setPlayerEditForm({
                          assignedTeamId: member.assignedTeamId || '',
                          position: member.position || '',
                          skillLevel: member.skillLevel || '',
                          skillRating: member.skillRating || 1,
                          jerseyNumber: member.jerseyNumber?.toString() || '',
                          notes: member.notes || '',
                          isCaptain: assignedTeam?.captainId === member.userId,
                          isGoalie: member.isGoalie || false,
                          displayFirstName: member.displayFirstName || member.user.firstName || '',
                          displayLastName: member.displayLastName || member.user.lastName || ''
                        });
                      }}
                      data-testid={`member-${member.user.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{formatUserName(member.user, member)}</p>
                          {/* Show captain badge if user is captain of their assigned team */}
                          {member.assignedTeamId && teams.find((team: Team) => team.id === member.assignedTeamId)?.captainId === member.userId && (
                            <span className="w-4 h-4 text-warning font-bold text-sm flex items-center justify-center">C</span>
                          )}
                          {member.jerseyNumber && (
                            <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                              #{member.jerseyNumber}
                            </span>
                          )}
                        </div>
                        {member.position && (
                          <p className="text-xs text-muted-foreground">{member.position}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {member.skillLevel && (
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-warning" />
                            <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded">
                              {member.skillLevel}
                            </span>
                          </div>
                        )}
                        <Edit3 className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Team Management Tab */}
        {activeTab === 'teams' && (
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {selectedTeam && (
                    <button
                      onClick={() => setSelectedTeam(null)}
                      className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-background"
                      data-testid="button-back-to-teams"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <Trophy className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">
                    {selectedTeam ? `${selectedTeam.name} Players` : `Teams (${teams.length})`}
                  </h3>
                </div>
                {!selectedTeam && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCreateTeam(!showCreateTeam)}
                      className="flex items-center gap-2 px-4 py-2 bg-warning text-black rounded-lg text-sm font-medium"
                      data-testid="button-create-team"
                    >
                      <Plus className="w-4 h-4" />
                      Create Team
                    </button>
                    {teams.length > 0 && (
                      <button
                        onClick={() => setShowDeleteAllTeamsDialog(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-md text-sm font-medium transition-colors"
                        data-testid="button-delete-all-teams"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete All Teams
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Create Team Form */}
              {showCreateTeam && (
                <div className="mb-6 p-4 bg-background rounded-lg border">
                  <form onSubmit={teamForm.handleSubmit((data) => createTeamMutation.mutate(data))} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Team Name</label>
                      <input
                        {...teamForm.register('name')}
                        className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter team name"
                        data-testid="input-team-name"
                      />
                      {teamForm.formState.errors.name && (
                        <p className="text-destructive text-sm mt-1">{teamForm.formState.errors.name.message}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={createTeamMutation.isPending}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                        data-testid="button-submit-team"
                      >
                        {createTeamMutation.isPending ? 'Creating...' : 'Create Team'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateTeam(false)}
                        className="px-4 py-2 bg-muted text-muted-foreground rounded-lg"
                        data-testid="button-cancel-team"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Teams List or Team Detail */}
              {!selectedTeam ? (
                // Teams List View
                ((() => {
                  const freeAgents = commissionerDisplayMembers.filter((m: LeagueMember) => !m.assignedTeamId);
                  const allTeamsToShow = [
                    // Free Agents virtual team
                    {
                      id: 'free-agents',
                      name: 'Free Agents',
                      captainId: null,
                      leagueId: league.id,
                      isFreeAgents: true
                    },
                    ...teams
                  ];

                  return (
                    <div className="space-y-3">
                      {allTeamsToShow.map((team: any) => {
                        const teamMembers = team.isFreeAgents 
                          ? freeAgents 
                          : commissionerDisplayMembers.filter((m: LeagueMember) => m.assignedTeamId === team.id);
                        const captain = team.isFreeAgents 
                          ? null 
                          : commissionerDisplayMembers.find((m: LeagueMember) => m.userId === team.captainId);
                        
                        return (
                          <div 
                            key={team.id} 
                            className={`flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors ${
                              team.isFreeAgents ? 'bg-muted/30 border-dashed' : 'bg-background'
                            }`}
                            onClick={() => setSelectedTeam(team)}
                            data-testid={`team-${team.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="font-medium text-base">{team.name}</p>
                                {team.isFreeAgents && (
                                  <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                                    Unassigned
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground space-y-1">
                                {!team.isFreeAgents && (
                                  <p>Captain: {captain?.user ? formatUserName(captain.user) : 'Not assigned'}</p>
                                )}
                                <p>{teamMembers.length} player{teamMembers.length !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 ml-4">
                              {!team.isFreeAgents && (
                                <div className="flex gap-2">
                                  {(() => {
                                    // Check if user can join the team
                                    const userMembership = members.find(m => m.userId === user?.id);
                                    const isCaptain = team.captainId === user?.id;
                                    const isCommissioner = league.commissionerId === user?.id;
                                    const isNotOnTeam = userMembership && userMembership.assignedTeamId !== team.id;
                                    
                                    // Show join button if user is captain OR commissioner, and not already on the team
                                    if ((isCaptain || isCommissioner) && isNotOnTeam) {
                                      return (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            joinTeamMutation.mutate(team.id);
                                          }}
                                          disabled={joinTeamMutation.isPending}
                                          className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/30 flex items-center gap-1 transition-colors disabled:opacity-50"
                                          data-testid={`button-join-team-${team.id}`}
                                        >
                                          <UserPlus className="w-3 h-3" />
                                          Join Team
                                        </button>
                                      );
                                    }
                                    return null;
                                  })()}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toast({ title: 'Team messaging feature coming soon!', description: `Start a group chat with ${team.name}` });
                                    }}
                                    className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/30 flex items-center gap-1 transition-colors"
                                    data-testid={`button-message-team-${team.id}`}
                                  >
                                    <Users className="w-3 h-3" />
                                    Message
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTeamForEdit(team);
                                      setShowEditTeam(true);
                                    }}
                                    className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs hover:bg-gray-500/30 flex items-center gap-1 transition-colors"
                                    data-testid={`edit-team-${team.id}`}
                                  >
                                    <Edit className="w-3 h-3" />
                                    Edit
                                  </button>
                                </div>
                              )}
                              <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })())
              ) : (
                // Team Detail View - Show Players in Selected Team
                ((() => {
                  const teamMembers = selectedTeam.isFreeAgents 
                    ? commissionerDisplayMembers.filter((m: LeagueMember) => !m.assignedTeamId)
                    : commissionerDisplayMembers.filter((m: LeagueMember) => m.assignedTeamId === selectedTeam.id);
                  
                  return teamMembers.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {selectedTeam.isFreeAgents 
                          ? "All players are currently assigned to teams" 
                          : "No players assigned to this team yet"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {selectedTeam.isFreeAgents 
                          ? "Players without team assignments will appear here" 
                          : "Assign players from the Players tab"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {teamMembers.map((member: LeagueMember) => (
                        <div 
                          key={member.id} 
                          className="flex items-center justify-between p-3 bg-background rounded-lg border hover:bg-muted/50 transition-colors"
                          data-testid={`team-player-${member.user.id}`}
                        >
                          <div 
                            className="flex-1 cursor-pointer"
                            onClick={() => {
                              setSelectedPlayer(member);
                              const assignedTeam = teams.find((team: Team) => team.id === member.assignedTeamId);
                              setPlayerEditForm({
                                assignedTeamId: member.assignedTeamId || '',
                                position: member.position || '',
                                skillLevel: member.skillLevel || '',
                                skillRating: member.skillRating || 1,
                                jerseyNumber: member.jerseyNumber?.toString() || '',
                                notes: member.notes || '',
                                isCaptain: assignedTeam?.captainId === member.userId,
                                isGoalie: member.isGoalie || false,
                                displayFirstName: member.displayFirstName || member.user.firstName || '',
                                displayLastName: member.displayLastName || member.user.lastName || ''
                              });
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{formatUserName(member.user, member)}</p>
                              {!selectedTeam.isFreeAgents && member.userId === selectedTeam.captainId && (
                                <Crown className="w-4 h-4 text-warning" />
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {member.position && <p>Position: {member.position}</p>}
                              {member.jerseyNumber && <p>Jersey: #{member.jerseyNumber}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Captain Assignment Controls */}
                            {!selectedTeam.isFreeAgents && (
                              <div className="flex flex-col gap-1">
                                {member.userId === selectedTeam.captainId ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTeamCaptainMutation.mutate({
                                        teamId: selectedTeam.id,
                                        captainId: null
                                      });
                                    }}
                                    disabled={setTeamCaptainMutation.isPending}
                                    className="px-2 py-1 bg-warning/20 text-warning rounded text-xs font-medium hover:bg-warning/30 disabled:opacity-50"
                                    data-testid={`button-remove-captain-${member.user.id}`}
                                  >
                                    Remove Captain
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTeamCaptainMutation.mutate({
                                        teamId: selectedTeam.id,
                                        captainId: member.userId
                                      });
                                    }}
                                    disabled={setTeamCaptainMutation.isPending}
                                    className="px-2 py-1 bg-primary/20 text-primary rounded text-xs font-medium hover:bg-primary/30 disabled:opacity-50"
                                    data-testid={`button-set-captain-${member.user.id}`}
                                  >
                                    Set Captain
                                  </button>
                                )}
                              </div>
                            )}
                            <div className="text-right">
                              <span className="tier-badge bg-success text-accent-foreground text-xs px-2 py-1 rounded-full">
                                {member.status?.toUpperCase() || 'ACTIVE'}
                              </span>
                              {member.skillRating && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Skill: {member.skillRating}/10
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })())
              )}
            </div>
          </div>
        )}

        {/* Game Scheduling Tab */}
        {activeTab === 'games' && (
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Game Schedule</h3>
                </div>
                
                {/* Desktop layout: horizontal with calendar toggle */}
                <div className="hidden md:flex md:items-center md:justify-between">
                  <div className="flex bg-muted rounded-lg p-1">
                    <button
                      onClick={() => setGamesViewMode('calendar')}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        gamesViewMode === 'calendar'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      data-testid="button-calendar-view"
                    >
                      <Calendar className="w-3 h-3" />
                      Calendar
                    </button>
                    <button
                      onClick={() => setGamesViewMode('list')}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        gamesViewMode === 'list'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      data-testid="button-list-view"
                    >
                      <List className="w-3 h-3" />
                      List
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowScheduleImport(!showScheduleImport)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                      data-testid="button-import-schedules"
                    >
                      <Upload className="w-3 h-3" />
                      Import Schedules
                    </button>
                    <button
                      onClick={() => setShowScheduleGame(!showScheduleGame)}
                      disabled={teams.length < 2}
                      className="flex items-center gap-2 px-4 py-2 bg-warning text-black rounded-lg text-sm font-medium disabled:opacity-50"
                      data-testid="button-schedule-game"
                    >
                      <Plus className="w-4 h-4" />
                      Schedule Game
                    </button>
                    {games.length > 0 && (
                      <button
                        onClick={() => setShowDeleteAllGamesDialog(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-md text-sm font-medium transition-colors"
                        data-testid="button-delete-all-games"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete All Games
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile layout: stacked buttons, no calendar toggle (list view only) */}
                <div className="md:hidden space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => setShowScheduleImport(!showScheduleImport)}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm flex-1"
                      data-testid="button-import-schedules"
                    >
                      <Upload className="w-3 h-3" />
                      Import Schedules
                    </button>
                    <button
                      onClick={() => setShowScheduleGame(!showScheduleGame)}
                      disabled={teams.length < 2}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-warning text-black rounded-lg text-sm font-medium disabled:opacity-50 flex-1"
                      data-testid="button-schedule-game"
                    >
                      <Plus className="w-4 h-4" />
                      Schedule Game
                    </button>
                  </div>
                  {games.length > 0 && (
                    <button
                      onClick={() => setShowDeleteAllGamesDialog(true)}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-md text-sm font-medium transition-colors w-full"
                      data-testid="button-delete-all-games-mobile"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete All Games
                    </button>
                  )}
                </div>
              </div>

              {teams.length < 2 && (
                <div className="mb-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    You need at least 2 teams to schedule games. Create teams first.
                  </p>
                </div>
              )}

              {/* Schedule Game Form */}
              {showScheduleGame && teams.length >= 2 && (
                <div className="mb-6 p-4 bg-background rounded-lg border">
                  <form onSubmit={gameForm.handleSubmit((data) => createGameMutation.mutate(data))} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Home Team</label>
                        <select
                          {...gameForm.register('homeTeamId')}
                          className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          data-testid="select-home-team"
                        >
                          <option value="">Select home team</option>
                          {teams.map((team: Team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Away Team</label>
                        <select
                          {...gameForm.register('awayTeamId')}
                          className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          data-testid="select-away-team"
                        >
                          <option value="">Select away team</option>
                          {teams.map((team: Team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Game Date & Time</label>
                      <input
                        {...gameForm.register('scheduledAt')}
                        type="datetime-local"
                        className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        data-testid="input-game-time"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Venue (optional)</label>
                      <input
                        {...gameForm.register('venue')}
                        className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Game venue"
                        data-testid="input-venue"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={createGameMutation.isPending}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                        data-testid="button-submit-game"
                      >
                        {createGameMutation.isPending ? 'Scheduling...' : 'Schedule Game'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowScheduleGame(false)}
                        className="px-4 py-2 bg-muted text-muted-foreground rounded-lg"
                        data-testid="button-cancel-game"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Schedule Import Panel */}
              {showScheduleImport && (
                <div className="mb-6 p-4 bg-card rounded-lg border border-border">
                  <div className="flex flex-col gap-3">
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => scheduleFileInputRef.current?.click()}
                      data-testid="schedule-file-drop-zone"
                    >
                      <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      {scheduleImportFile ? (
                        <div>
                          <p className="font-medium text-green-600 text-sm">{scheduleImportFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(scheduleImportFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-sm mb-1">Select CSV file</p>
                          <p className="text-xs text-muted-foreground">
                            Format: Date, Time, Home Team, Away Team, Home Team Locker Room (optional), Away Team Locker Room (optional)
                          </p>
                        </div>
                      )}
                      <input
                        ref={scheduleFileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={(e) => setScheduleImportFile(e.target.files?.[0] || null)}
                        className="hidden"
                        data-testid="schedule-file-input"
                      />
                    </div>

                    {scheduleImportFile && (
                      <div className="flex gap-2">
                        <button
                          onClick={handleScheduleFileUpload}
                          disabled={scheduleUploadMutation.isPending}
                          className="flex-1 bg-green-500 text-white px-3 py-1.5 rounded-md hover:bg-green-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="button-upload-schedule-file"
                        >
                          {scheduleUploadMutation.isPending ? 'Processing...' : 'Upload'}
                        </button>
                        <button
                          onClick={() => {
                            setScheduleImportFile(null);
                            if (scheduleFileInputRef.current) scheduleFileInputRef.current.value = '';
                          }}
                          className="px-3 py-1.5 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 text-sm font-medium"
                          data-testid="button-clear-schedule-file"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Games Display */}
              {games.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No games scheduled yet. Create your first game above.
                </p>
              ) : (
                <>
                  {/* Desktop: Show calendar view if selected, otherwise list view */}
                  <div className="hidden md:block">
                    {gamesViewMode === 'calendar' ? (
                      <GamesCalendar games={games} teams={teams} onGameClick={(game) => {
                        setSelectedGame(game);
                        setShowEditGame(true);
                      }} />
                    ) : (
                      <div className="space-y-3">
                        {games.map((game: any) => {
                          const homeTeam = teams.find((t: Team) => t.id === game.homeTeamId);
                          const awayTeam = teams.find((t: Team) => t.id === game.awayTeamId);
                          const gameDate = new Date(game.scheduledAt);
                          
                          return (
                            <div 
                              key={game.id} 
                              className="flex items-center justify-between p-4 bg-background rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                setSelectedGame(game);
                                setShowEditGame(true);
                              }}
                              data-testid={`game-${game.id}`}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-4 mb-2">
                                  <div className="flex flex-col items-center">
                                    <div className="w-10 h-10 bg-primary rounded flex items-center justify-center mb-1">
                                      {homeTeam?.logoUrl ? (
                                        <img 
                                          src={homeTeam.logoUrl} 
                                          alt={`${homeTeam.name} logo`}
                                          className="w-full h-full rounded object-cover"
                                          data-testid={`img-home-team-logo-${game.id}`}
                                        />
                                      ) : (
                                        <Trophy className="w-5 h-5 text-primary-foreground" />
                                      )}
                                    </div>
                                    <p className="font-medium text-center">{homeTeam?.name || 'Unknown'}</p>
                                    <p className="text-xs text-muted-foreground">HOME</p>
                                  </div>
                                  <div className="text-muted-foreground font-bold">VS</div>
                                  <div className="flex flex-col items-center">
                                    <div className="w-10 h-10 bg-primary rounded flex items-center justify-center mb-1">
                                      {awayTeam?.logoUrl ? (
                                        <img 
                                          src={awayTeam.logoUrl} 
                                          alt={`${awayTeam.name} logo`}
                                          className="w-full h-full rounded object-cover"
                                          data-testid={`img-away-team-logo-${game.id}`}
                                        />
                                      ) : (
                                        <Trophy className="w-5 h-5 text-primary-foreground" />
                                      )}
                                    </div>
                                    <p className="font-medium text-center">{awayTeam?.name || 'Unknown'}</p>
                                    <p className="text-xs text-muted-foreground">AWAY</p>
                                  </div>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  <p>📅 {gameDate.toLocaleDateString()} at {gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  {game.venue && <p>📍 {game.venue}</p>}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-xs bg-blue-100/50 text-blue-800/50 px-2 py-1 rounded-full">
                                  {game.status || 'SCHEDULED'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Mobile: Always show list view */}
                  <div className="md:hidden">
                    <div className="space-y-3">
                      {games.map((game: any) => {
                        const homeTeam = teams.find((t: Team) => t.id === game.homeTeamId);
                        const awayTeam = teams.find((t: Team) => t.id === game.awayTeamId);
                        const gameDate = new Date(game.scheduledAt);
                        
                        return (
                          <div 
                            key={game.id} 
                            className="flex items-center justify-between p-4 bg-background rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => {
                              setSelectedGame(game);
                              setShowEditGame(true);
                            }}
                            data-testid={`game-${game.id}`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-4 mb-2">
                                <div className="flex flex-col items-center">
                                  <div className="w-10 h-10 bg-primary rounded flex items-center justify-center mb-1">
                                    {homeTeam?.logoUrl ? (
                                      <img 
                                        src={homeTeam.logoUrl} 
                                        alt={`${homeTeam.name} logo`}
                                        className="w-full h-full rounded object-cover"
                                        data-testid={`img-home-team-logo-${game.id}`}
                                      />
                                    ) : (
                                      <Trophy className="w-5 h-5 text-primary-foreground" />
                                    )}
                                  </div>
                                  <p className="font-medium text-center">{homeTeam?.name || 'Unknown'}</p>
                                  <p className="text-xs text-muted-foreground">HOME</p>
                                </div>
                                <div className="text-muted-foreground font-bold">VS</div>
                                <div className="flex flex-col items-center">
                                  <div className="w-10 h-10 bg-primary rounded flex items-center justify-center mb-1">
                                    {awayTeam?.logoUrl ? (
                                      <img 
                                        src={awayTeam.logoUrl} 
                                        alt={`${awayTeam.name} logo`}
                                        className="w-full h-full rounded object-cover"
                                        data-testid={`img-away-team-logo-${game.id}`}
                                      />
                                    ) : (
                                      <Trophy className="w-5 h-5 text-primary-foreground" />
                                    )}
                                  </div>
                                  <p className="font-medium text-center">{awayTeam?.name || 'Unknown'}</p>
                                  <p className="text-xs text-muted-foreground">AWAY</p>
                                </div>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <p>📅 {gameDate.toLocaleDateString()} at {gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                {game.venue && <p>📍 {game.venue}</p>}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs bg-blue-100/50 text-blue-800/50 px-2 py-1 rounded-full">
                                {game.status || 'SCHEDULED'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Player Detail Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold">{formatUserName(selectedPlayer.user, selectedPlayer)}</h3>
                  <p className="text-sm text-muted-foreground">{selectedPlayer.user.email}</p>
                </div>
                <button
                  onClick={() => setSelectedPlayer(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Team Assignment */}
                <div>
                  <label className="block text-sm font-medium mb-2">Assigned Team</label>
                  <select
                    value={playerEditForm.assignedTeamId}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, assignedTeamId: e.target.value }))}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">No team assigned</option>
                    {teams.map((team: Team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>

                {/* Player Name Fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">First Name</label>
                    <input
                      type="text"
                      value={playerEditForm.displayFirstName}
                      onChange={(e) => setPlayerEditForm(prev => ({ ...prev, displayFirstName: e.target.value }))}
                      className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter first name"
                      data-testid="input-first-name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Last Name</label>
                    <input
                      type="text"
                      value={playerEditForm.displayLastName}
                      onChange={(e) => setPlayerEditForm(prev => ({ ...prev, displayLastName: e.target.value }))}
                      className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter last name"
                      data-testid="input-last-name"
                    />
                  </div>
                </div>

                {/* Captain Status */}
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="captain-checkbox"
                    checked={playerEditForm.isCaptain}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, isCaptain: e.target.checked }))}
                    className="h-4 w-4 text-primary border-border rounded focus:ring-primary"
                    data-testid="checkbox-captain"
                  />
                  <label htmlFor="captain-checkbox" className="text-sm font-medium">
                    Captain
                  </label>
                </div>

                {/* Goalie Status */}
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="goalie-checkbox"
                    checked={playerEditForm.isGoalie}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, isGoalie: e.target.checked }))}
                    className="h-4 w-4 text-primary border-border rounded focus:ring-primary"
                    data-testid="checkbox-goalie"
                  />
                  <label htmlFor="goalie-checkbox" className="text-sm font-medium">
                    Goalie
                  </label>
                </div>

                {/* Position */}
                <div>
                  <label className="block text-sm font-medium mb-2">Position</label>
                  <input
                    type="text"
                    value={playerEditForm.position}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, position: e.target.value }))}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Forward, Defense, Goalie"
                  />
                </div>

                {/* Skill Rating */}
                <div>
                  <label className="block text-sm font-medium mb-2">Skill Rating (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={playerEditForm.skillRating}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, skillRating: parseInt(e.target.value) || 1 }))}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Jersey Number */}
                <div>
                  <label className="block text-sm font-medium mb-2">Jersey Number</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={playerEditForm.jerseyNumber}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, jerseyNumber: e.target.value }))}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter jersey number"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium mb-2">Notes</label>
                  <textarea
                    value={playerEditForm.notes}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Add notes about this player..."
                  />
                </div>
              </div>

              <div className="space-y-3 mt-6">
                {/* Action Buttons */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => {
                      // TODO: Implement messaging functionality
                      toast({ title: 'Messaging feature coming soon!' });
                    }}
                    className="px-4 py-2 bg-blue-500/50 text-white rounded-lg hover:bg-blue-600/50 text-sm font-medium"
                  >
                    Message Player
                  </button>
                  <button
                    onClick={() => {
                      const updates = {
                        assignedTeamId: playerEditForm.assignedTeamId || null,
                        position: playerEditForm.position,
                        skillRating: playerEditForm.skillRating,
                        jerseyNumber: playerEditForm.jerseyNumber ? parseInt(playerEditForm.jerseyNumber) : null,
                        notes: playerEditForm.notes,
                        isGoalie: playerEditForm.isGoalie,
                        displayFirstName: playerEditForm.displayFirstName?.trim() || null,
                        displayLastName: playerEditForm.displayLastName?.trim() || null
                      };
                      
                      // Handle captain assignment separately (this affects the team's captainId)
                      if (playerEditForm.isCaptain && playerEditForm.assignedTeamId) {
                        // Set this player as captain of their assigned team
                        setTeamCaptainMutation.mutate({
                          teamId: playerEditForm.assignedTeamId,
                          captainId: selectedPlayer.userId
                        });
                      } else if (!playerEditForm.isCaptain && playerEditForm.assignedTeamId) {
                        // Remove captain status if unchecked and this player was the captain
                        const assignedTeam = teams.find((team: Team) => team.id === playerEditForm.assignedTeamId);
                        if (assignedTeam?.captainId === selectedPlayer.userId) {
                          setTeamCaptainMutation.mutate({
                            teamId: playerEditForm.assignedTeamId,
                            captainId: null
                          });
                        }
                      }
                      updatePlayerMutation.mutate({
                        memberId: selectedPlayer.id,
                        updates
                      });
                    }}
                    disabled={updatePlayerMutation.isPending}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                  >
                    {updatePlayerMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>

                {/* Merge Player (Commissioner Only) */}
                {league?.commissionerId === user?.id && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Merge Player</h4>
                    <p className="text-xs text-muted-foreground">
                      Merge this player with another user account (useful for linking placeholder players to real users)
                    </p>
                    <button
                      onClick={() => {
                        setSelectedPlayerToMerge(selectedPlayer);
                        setShowUserMergeModal(true);
                        setSelectedPlayer(null); // Close player modal
                      }}
                      className="w-full px-4 py-2 bg-blue-500/50 text-white rounded-lg hover:bg-blue-600/50 text-sm font-medium"
                      data-testid={`button-merge-${selectedPlayer.user.id}`}
                    >
                      <Users className="w-4 h-4 inline mr-2" />
                      Merge with Another User
                    </button>
                  </div>
                )}

                {/* Remove Options */}
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      if (confirm('Remove this player from their assigned team?')) {
                        updatePlayerMutation.mutate({
                          memberId: selectedPlayer.id,
                          updates: { assignedTeamId: null }
                        });
                      }
                    }}
                    className="w-full px-4 py-2 bg-yellow-500/50 text-white rounded-lg hover:bg-yellow-600/50 text-sm font-medium"
                  >
                    Remove from Team
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to remove this player from the league entirely? This cannot be undone.')) {
                        removeFromLeagueMutation.mutate(selectedPlayer.id);
                      }
                    }}
                    className="w-full px-4 py-2 bg-red-500/50 text-white rounded-lg hover:bg-red-600/50 text-sm font-medium"
                  >
                    Remove from League
                  </button>
                </div>

                {/* Close Button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => setSelectedPlayer(null)}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Edit League Modal */}
      {showEditLeague && league && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Edit League</h2>
                <button
                  onClick={() => setShowEditLeague(false)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  data-testid="button-close-edit-league"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={editLeagueForm.handleSubmit((data) => {
                  updateLeagueMutation.mutate(data);
                })}
                className="space-y-4"
              >
                {/* League Name */}
                <div>
                  <label className="block text-sm font-medium mb-2">League Name</label>
                  <input
                    {...editLeagueForm.register('name')}
                    type="text"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter league name"
                    data-testid="input-league-name"
                  />
                  {editLeagueForm.formState.errors.name && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {editLeagueForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    {...editLeagueForm.register('description')}
                    rows={3}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Describe your league..."
                    data-testid="input-league-description"
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium mb-2">League Address</label>
                  <Controller
                    name="location"
                    control={editLeagueForm.control}
                    render={({ field }) => (
                      <GoogleAddressAutocomplete
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="Enter league address"
                        className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        dataTestId="input-league-location"
                      />
                    )}
                  />
                </div>

                {/* Season */}
                <div>
                  <label className="block text-sm font-medium mb-2">Season</label>
                  <input
                    {...editLeagueForm.register('season')}
                    type="text"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Spring 2024"
                    data-testid="input-league-season"
                  />
                </div>

                {/* Active Status */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      {...editLeagueForm.register('isActive')}
                      type="checkbox"
                      className="rounded border-border focus:ring-primary"
                      data-testid="checkbox-league-active"
                    />
                    <span className="text-sm font-medium">League is active</span>
                  </label>
                </div>

                {/* Co-Commissioner Management */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Co-Commissioners</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Grant co-commissioner privileges to other users. They will have full management access to this league.
                  </p>
                  
                  {/* Current co-commissioners list */}
                  {coCommissioners.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {coCommissioners.map((coComm: any) => (
                        <div key={coComm.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                          <div className="flex items-center gap-2">
                            <Crown className="w-4 h-4 text-yellow-600" />
                            <span className="text-sm">
                              {coComm.user.firstName && coComm.user.lastName 
                                ? `${coComm.user.firstName} ${coComm.user.lastName}` 
                                : coComm.user.email}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Remove co-commissioner privileges from this user?')) {
                                removeCoCommissionerMutation.mutate(coComm.id);
                              }
                            }}
                            disabled={removeCoCommissionerMutation.isPending}
                            className="text-red-500 hover:text-red-600 text-sm"
                            data-testid={`button-remove-cocommissioner-${coComm.id}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Add new co-commissioner */}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={coCommissionerEmail}
                      onChange={(e) => setCoCommissionerEmail(e.target.value)}
                      placeholder="Enter user's email"
                      className="flex-1 p-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      data-testid="input-cocommissioner-email"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!coCommissionerEmail) {
                          toast({ title: 'Please enter an email address', variant: 'destructive' });
                          return;
                        }
                        addCoCommissionerMutation.mutate(coCommissionerEmail);
                      }}
                      disabled={addCoCommissionerMutation.isPending || !coCommissionerEmail}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                      data-testid="button-add-cocommissioner"
                    >
                      {addCoCommissionerMutation.isPending ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>

                {/* Admin Management */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">League Admins</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Grant admin privileges to users. Admins can manage league settings and permissions.
                  </p>
                  
                  {/* Current admins list */}
                  {admins.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {admins.map((admin: any) => (
                        <div key={admin.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-red-500" />
                            <span className="text-sm">
                              {admin.user.firstName && admin.user.lastName 
                                ? `${admin.user.firstName} ${admin.user.lastName}` 
                                : admin.user.email}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Remove admin privileges from this user?')) {
                                removeAdminMutation.mutate({ 
                                  userId: admin.userId, 
                                  currentPermissions: admin.leagueSpecialPermissions || [] 
                                });
                              }
                            }}
                            disabled={removeAdminMutation.isPending}
                            className="text-red-500 hover:text-red-600 text-sm"
                            data-testid={`button-remove-admin-${admin.id}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Add new admin */}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="Enter league member's email"
                      className="flex-1 p-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      data-testid="input-admin-email"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!adminEmail) {
                          toast({ title: 'Please enter an email address', variant: 'destructive' });
                          return;
                        }
                        addAdminMutation.mutate(adminEmail);
                      }}
                      disabled={addAdminMutation.isPending || !adminEmail}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                      data-testid="button-add-admin"
                    >
                      {addAdminMutation.isPending ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>

                {/* Stat Manager Management */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Stat Managers</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Grant stat manager privileges to users. Stat managers can edit game statistics and scores.
                  </p>
                  
                  {/* Current stat managers list */}
                  {statManagers.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {statManagers.map((statManager: any) => (
                        <div key={statManager.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                          <div className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-green-500" />
                            <span className="text-sm">
                              {statManager.user.firstName && statManager.user.lastName 
                                ? `${statManager.user.firstName} ${statManager.user.lastName}` 
                                : statManager.user.email}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Remove stat manager privileges from this user?')) {
                                removeStatManagerMutation.mutate({ 
                                  userId: statManager.userId, 
                                  currentPermissions: statManager.leagueSpecialPermissions || [] 
                                });
                              }
                            }}
                            disabled={removeStatManagerMutation.isPending}
                            className="text-red-500 hover:text-red-600 text-sm"
                            data-testid={`button-remove-stat-manager-${statManager.id}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Add new stat manager */}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={statManagerEmail}
                      onChange={(e) => setStatManagerEmail(e.target.value)}
                      placeholder="Enter league member's email"
                      className="flex-1 p-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      data-testid="input-stat-manager-email"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!statManagerEmail) {
                          toast({ title: 'Please enter an email address', variant: 'destructive' });
                          return;
                        }
                        addStatManagerMutation.mutate(statManagerEmail);
                      }}
                      disabled={addStatManagerMutation.isPending || !statManagerEmail}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                      data-testid="button-add-stat-manager"
                    >
                      {addStatManagerMutation.isPending ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>

                {/* Commissioner Transfer */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3 text-orange-600/50">⚠️ Transfer Commissioner</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Transfer ownership of this league to another user. You will lose all commissioner privileges for this league.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="Enter new commissioner's email"
                      className="flex-1 p-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      data-testid="input-new-commissioner-email"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const email = (document.querySelector('[data-testid="input-new-commissioner-email"]') as HTMLInputElement)?.value;
                        if (!email) {
                          toast({ title: 'Please enter an email address', variant: 'destructive' });
                          return;
                        }
                        if (confirm(`Are you sure you want to transfer commissioner privileges to ${email}? This action cannot be undone.`)) {
                          // TODO: Implement commissioner transfer
                          toast({ title: 'Commissioner transfer functionality coming soon!' });
                        }
                      }}
                      className="px-4 py-2 bg-orange-500/50 text-white rounded-lg hover:bg-orange-600/50 text-sm font-medium"
                      data-testid="button-transfer-commissioner"
                    >
                      Transfer
                    </button>
                  </div>
                </div>

                {/* Delete League Button */}
                <div className="border-t pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete the league "${league?.name}"? This action cannot be undone and will remove all associated teams, games, and data.`)) {
                        deleteLeagueMutation.mutate();
                      }
                    }}
                    disabled={deleteLeagueMutation.isPending}
                    className="w-full px-4 py-2 bg-red-500/50 text-white rounded-lg hover:bg-red-600/50 text-sm font-medium disabled:opacity-50"
                    data-testid="button-delete-league"
                  >
                    {deleteLeagueMutation.isPending ? 'Deleting...' : 'Delete League'}
                  </button>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditLeague(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                    data-testid="button-cancel-edit-league"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateLeagueMutation.isPending}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                    data-testid="button-save-league-changes"
                  >
                    {updateLeagueMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Create Season Modal */}
      {showCreateSeason && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Create New Season</h2>
                <button
                  onClick={() => setShowCreateSeason(false)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  data-testid="button-close-create-season"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={seasonForm.handleSubmit((data) => {
                  createSeasonMutation.mutate(data);
                })}
                className="space-y-4"
              >
                {/* Season Name */}
                <div>
                  <label className="block text-sm font-medium mb-2">Season Name</label>
                  <input
                    {...seasonForm.register('name')}
                    type="text"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Spring 2024, Fall League 2023"
                    data-testid="input-season-name"
                  />
                  {seasonForm.formState.errors.name && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {seasonForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium mb-2">Start Date (Optional)</label>
                  <input
                    {...seasonForm.register('startDate')}
                    type="date"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-season-start-date"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium mb-2">End Date (Optional)</label>
                  <input
                    {...seasonForm.register('endDate')}
                    type="date"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-season-end-date"
                  />
                </div>

                {/* Active Status */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      {...seasonForm.register('isActive')}
                      type="checkbox"
                      className="rounded border-border focus:ring-primary"
                      data-testid="checkbox-season-active"
                    />
                    <span className="text-sm font-medium">Season is active</span>
                  </label>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateSeason(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                    data-testid="button-cancel-create-season"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSeasonMutation.isPending}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                    data-testid="button-create-season-submit"
                  >
                    {createSeasonMutation.isPending ? 'Creating...' : 'Create Season'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Edit Game Modal */}
      {showEditGame && selectedGame && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Edit Game</h2>
                <button
                  onClick={() => {
                    setShowEditGame(false);
                    setSelectedGame(null);
                  }}
                  className="text-muted-foreground hover:text-foreground p-1"
                  data-testid="button-close-edit-game"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={editGameForm.handleSubmit((data) => {
                  updateGameMutation.mutate({ 
                    gameId: selectedGame.id, 
                    data,
                    originalScheduledAt: selectedGame.scheduledAt
                  });
                })}
                className="space-y-4"
              >
                {/* Home Team */}
                <div>
                  <label className="block text-sm font-medium mb-2">Home Team</label>
                  <select
                    {...editGameForm.register('homeTeamId')}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="select-home-team"
                  >
                    <option value="">Select home team</option>
                    {teams.map((team: Team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                  {editGameForm.formState.errors.homeTeamId && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {editGameForm.formState.errors.homeTeamId.message}
                    </p>
                  )}
                </div>

                {/* Away Team */}
                <div>
                  <label className="block text-sm font-medium mb-2">Away Team</label>
                  <select
                    {...editGameForm.register('awayTeamId')}
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="select-away-team"
                  >
                    <option value="">Select away team</option>
                    {teams.map((team: Team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                  {editGameForm.formState.errors.awayTeamId && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {editGameForm.formState.errors.awayTeamId.message}
                    </p>
                  )}
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium mb-2">Game Date</label>
                  <div className="relative">
                    <Controller
                      name="gameDate"
                      control={editGameForm.control}
                      render={({ field }) => (
                        <>
                          <button
                            type="button"
                            onClick={() => setShowDatePicker(!showDatePicker)}
                            className="w-full p-3 pr-12 bg-card text-card-foreground border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-left"
                            data-testid="button-game-date"
                          >
                            {field.value ? (() => {
                              const [year, month, day] = field.value.split('-');
                              const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                              return date.toLocaleDateString();
                            })() : 'Select date'}
                          </button>
                          <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                          {showDatePicker && (
                            <div 
                              ref={datePickerRef}
                              className="absolute z-50 mt-1 bg-white dark:bg-card border border-border rounded-lg shadow-lg min-w-[350px]"
                            >
                              <DayPicker
                                mode="single"
                                selected={field.value ? (() => {
                                  const [year, month, day] = field.value.split('-');
                                  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                })() : undefined}
                                onSelect={(date) => {
                                  if (date) {
                                    // Use local date components to avoid timezone issues
                                    const year = date.getFullYear();
                                    const month = String(date.getMonth() + 1).padStart(2, '0');
                                    const day = String(date.getDate()).padStart(2, '0');
                                    const dateString = `${year}-${month}-${day}`;
                                    field.onChange(dateString);
                                    setShowDatePicker(false);
                                  }
                                }}
                                className="p-4"
                                classNames={{
                                  today: "rdp-cell_today bg-primary/20 text-black font-bold text-lg w-12 h-12",
                                  selected: "rdp-cell_selected bg-primary text-white font-bold text-lg w-12 h-12",
                                  root: "text-black text-lg",
                                  day: "text-black hover:bg-gray-100 text-lg w-12 h-12 flex items-center justify-center cursor-pointer",
                                  nav_button: "text-black hover:bg-gray-100 w-10 h-10 flex items-center justify-center",
                                  caption: "text-black font-medium text-xl mb-4",
                                  head_cell: "text-black font-medium text-base p-2",
                                  table: "w-full border-spacing-1",
                                  cell: "text-center p-1",
                                } as any}
                              />
                            </div>
                          )}
                        </>
                      )}
                    />
                  </div>
                  {editGameForm.formState.errors.gameDate && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {editGameForm.formState.errors.gameDate.message}
                    </p>
                  )}
                </div>

                {/* Time */}
                <div>
                  <label className="block text-sm font-medium mb-2">Game Time</label>
                  <div className="relative">
                    <Controller
                      name="gameTime"
                      control={editGameForm.control}
                      render={({ field }) => (
                        <>
                          <button
                            type="button"
                            onClick={() => setShowTimePicker(!showTimePicker)}
                            className="w-full p-3 pr-12 bg-card text-card-foreground border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-left"
                            data-testid="button-game-time"
                          >
                            {field.value ? (() => {
                              const [hours, minutes] = field.value.split(':');
                              const hour12 = parseInt(hours) === 0 ? 12 : parseInt(hours) > 12 ? parseInt(hours) - 12 : parseInt(hours);
                              const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
                              return `${hour12}:${minutes} ${ampm}`;
                            })() : 'Select time'}
                          </button>
                          <Clock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                          {showTimePicker && (
                            <div 
                              ref={timePickerRef}
                              className="absolute z-50 mt-1 bg-background border border-border rounded-lg shadow-lg min-w-[300px]"
                            >
                              <div className="p-6">
                                <div className="flex items-start justify-center gap-8">
                                  {/* Hours */}
                                  <div className="flex flex-col items-center">
                                    <div className="text-base font-semibold mb-3 text-foreground">Hour</div>
                                    <div className="h-40 w-16 overflow-y-auto border-2 border-border rounded-xl bg-card scrollbar-thin">
                                      {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                                        <button
                                          key={hour}
                                          type="button"
                                          onClick={() => {
                                            const currentTime = field.value || '12:00';
                                            const [, minutes] = currentTime.split(':');
                                            const currentHour24 = field.value ? parseInt(field.value.split(':')[0]) : 12;
                                            const isCurrentlyPM = currentHour24 >= 12;
                                            let newHour24;
                                            if (isCurrentlyPM && hour !== 12) {
                                              newHour24 = hour + 12;
                                            } else if (!isCurrentlyPM && hour === 12) {
                                              newHour24 = 0;
                                            } else if (isCurrentlyPM && hour === 12) {
                                              newHour24 = 12;
                                            } else {
                                              newHour24 = hour;
                                            }
                                            field.onChange(`${String(newHour24).padStart(2, '0')}:${minutes}`);
                                          }}
                                          className={`w-full h-12 flex items-center justify-center text-base font-medium hover:bg-primary/10 rounded-lg mx-1 my-1 transition-colors ${
                                            field.value && (() => {
                                              const currentHour24 = parseInt(field.value.split(':')[0]);
                                              const currentHour12 = currentHour24 === 0 ? 12 : currentHour24 > 12 ? currentHour24 - 12 : currentHour24;
                                              return currentHour12 === hour;
                                            })() ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground'
                                          }`}
                                        >
                                          {hour}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex items-center text-2xl font-bold text-muted-foreground mt-12">:</div>

                                  {/* Minutes */}
                                  <div className="flex flex-col items-center">
                                    <div className="text-base font-semibold mb-3 text-foreground">Minutes</div>
                                    <div className="h-40 w-16 overflow-y-auto border-2 border-border rounded-xl bg-card scrollbar-thin">
                                      {Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => (
                                        <button
                                          key={minute}
                                          type="button"
                                          onClick={() => {
                                            const currentTime = field.value || '12:00';
                                            const [hours] = currentTime.split(':');
                                            field.onChange(`${hours}:${String(minute).padStart(2, '0')}`);
                                          }}
                                          className={`w-full h-12 flex items-center justify-center text-base font-medium hover:bg-primary/10 rounded-lg mx-1 my-1 transition-colors ${
                                            field.value && parseInt(field.value.split(':')[1]) === minute ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground'
                                          }`}
                                        >
                                          {String(minute).padStart(2, '0')}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* AM/PM */}
                                  <div className="flex flex-col items-center">
                                    <div className="text-base font-semibold mb-3 text-foreground">Period</div>
                                    <div className="flex flex-col gap-3">
                                      {['AM', 'PM'].map((period) => (
                                        <button
                                          key={period}
                                          type="button"
                                          onClick={() => {
                                            const currentTime = field.value || '12:00';
                                            const [hours, minutes] = currentTime.split(':');
                                            const currentHour24 = parseInt(hours);
                                            const currentHour12 = currentHour24 === 0 ? 12 : currentHour24 > 12 ? currentHour24 - 12 : currentHour24;
                                            
                                            let newHour24;
                                            if (period === 'AM' && currentHour12 === 12) {
                                              newHour24 = 0;
                                            } else if (period === 'AM') {
                                              newHour24 = currentHour12;
                                            } else if (period === 'PM' && currentHour12 === 12) {
                                              newHour24 = 12;
                                            } else {
                                              newHour24 = currentHour12 + 12;
                                            }
                                            
                                            field.onChange(`${String(newHour24).padStart(2, '0')}:${minutes}`);
                                          }}
                                          className={`w-16 h-12 flex items-center justify-center text-base font-semibold hover:bg-primary/10 rounded-lg transition-colors ${
                                            field.value && (() => {
                                              const currentHour24 = parseInt(field.value.split(':')[0]);
                                              const isCurrentlyPM = currentHour24 >= 12;
                                              return (period === 'PM' && isCurrentlyPM) || (period === 'AM' && !isCurrentlyPM);
                                            })() ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground border border-border'
                                          }`}
                                        >
                                          {period}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex justify-center mt-6 pt-4 border-t border-border">
                                  <button
                                    type="button"
                                    onClick={() => setShowTimePicker(false)}
                                    className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors"
                                  >
                                    Done
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    />
                    {editGameForm.formState.errors.gameTime && (
                      <p className="text-red-500/50 text-sm mt-1">
                        {editGameForm.formState.errors.gameTime.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Rink */}
                <div>
                  <label className="block text-sm font-medium mb-2">Rink (Optional)</label>
                  <input
                    {...editGameForm.register('venue')}
                    type="text"
                    placeholder="Enter rink name"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-game-venue"
                  />
                </div>

                {/* Locker Room */}
                <div>
                  <label className="block text-sm font-medium mb-2">Locker Room (Optional)</label>
                  <input
                    {...editGameForm.register('lockerRoom')}
                    type="text"
                    placeholder="Enter locker room assignment"
                    className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-game-locker-room"
                  />
                </div>

                {/* Score Management Section */}
                {selectedGame && (
                  <div className="pt-6 border-t border-border">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Score Management
                    </h3>
                    
                    {/* Current Game Score */}
                    {selectedGame.isCompleted || (selectedGame.homeScore !== null && selectedGame.awayScore !== null) ? (
                      <div className="space-y-4 mb-4">
                        {isEditingGameScore && isCommissioner ? (
                          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <p className="text-sm font-medium text-blue-600 mb-3 text-center">Edit Final Score:</p>
                            <div className="grid grid-cols-3 gap-3 items-center mb-4">
                              <div className="text-center">
                                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                                  {teams.find((t: Team) => t.id === selectedGame.homeTeamId)?.name || 'Home'}
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={editGameHomeScore}
                                  onChange={(e) => setEditGameHomeScore(e.target.value)}
                                  className="text-center text-xl font-bold"
                                  placeholder="0"
                                  data-testid="input-edit-game-home-score"
                                />
                              </div>
                              <div className="text-center text-xl font-bold text-muted-foreground">
                                -
                              </div>
                              <div className="text-center">
                                <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                                  {teams.find((t: Team) => t.id === selectedGame.awayTeamId)?.name || 'Away'}
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={editGameAwayScore}
                                  onChange={(e) => setEditGameAwayScore(e.target.value)}
                                  className="text-center text-xl font-bold"
                                  placeholder="0"
                                  data-testid="input-edit-game-away-score"
                                />
                              </div>
                            </div>
                            <div className="flex gap-3">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setIsEditingGameScore(false);
                                  setEditGameHomeScore('');
                                  setEditGameAwayScore('');
                                }}
                                className="flex-1"
                                data-testid="button-cancel-game-score-edit"
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => {
                                  if (!isCommissioner) {
                                    toast({
                                      title: "Access Denied",
                                      description: "Only league commissioners can edit final scores.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  
                                  const home = parseInt(editGameHomeScore);
                                  const away = parseInt(editGameAwayScore);
                                  
                                  // Robust validation
                                  if (editGameHomeScore.trim() === '' || editGameAwayScore.trim() === '' || 
                                      isNaN(home) || isNaN(away) || home < 0 || away < 0 || 
                                      !Number.isInteger(home) || !Number.isInteger(away)) {
                                    toast({
                                      title: "Invalid Score",
                                      description: "Please enter valid whole numbers (0 or greater) for both teams.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  
                                  commissionerScoreOverrideMutation.mutate(
                                    { gameId: selectedGame.id, homeScore: home, awayScore: away },
                                    {
                                      onSuccess: () => {
                                        setIsEditingGameScore(false);
                                        setEditGameHomeScore('');
                                        setEditGameAwayScore('');
                                        
                                        // Comprehensive cache invalidation
                                        queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'games'] });
                                        queryClient.invalidateQueries({ queryKey: ['/api/games', selectedGame.id] });
                                        queryClient.invalidateQueries({ queryKey: [`/api/games/${selectedGame.id}/score-submissions`] });
                                        queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'standings'] });
                                        queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
                                        queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
                                        
                                        toast({
                                          title: "Score Updated",
                                          description: "Final score has been successfully updated.",
                                        });
                                      },
                                      onError: (error) => {
                                        toast({
                                          title: "Update Failed",
                                          description: "Failed to update score. Please try again.",
                                          variant: "destructive",
                                        });
                                      }
                                    }
                                  );
                                }}
                                disabled={!isCommissioner || commissionerScoreOverrideMutation.isPending || !editGameHomeScore.trim() || !editGameAwayScore.trim() || isNaN(parseInt(editGameHomeScore)) || isNaN(parseInt(editGameAwayScore)) || parseInt(editGameHomeScore) < 0 || parseInt(editGameAwayScore) < 0}
                                className="flex-1"
                                data-testid="button-save-game-score-changes"
                              >
                                {commissionerScoreOverrideMutation.isPending ? "Saving..." : "Update Score"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-medium text-green-600">Final Score:</p>
                              {isCommissioner && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (!isCommissioner) {
                                      toast({
                                        title: "Access Denied",
                                        description: "Only league commissioners can edit final scores.",
                                        variant: "destructive",
                                      });
                                      return;
                                    }
                                    setIsEditingGameScore(true);
                                    // Prefill with current scores, ensuring we have valid numbers
                                    const currentHomeScore = selectedGame.homeScore ?? 0;
                                    const currentAwayScore = selectedGame.awayScore ?? 0;
                                    setEditGameHomeScore(currentHomeScore.toString());
                                    setEditGameAwayScore(currentAwayScore.toString());
                                  }}
                                  className="flex items-center gap-2 text-xs"
                                  data-testid="button-edit-game-score"
                                >
                                  <Edit className="w-3 h-3" />
                                  Edit
                                </Button>
                              )}
                            </div>
                            <div className="flex items-center justify-center space-x-4">
                              <div className="text-center">
                                <p className="text-sm text-muted-foreground">
                                  {teams.find((t: Team) => t.id === selectedGame.homeTeamId)?.name || 'Home'}
                                </p>
                                <p className="text-2xl font-bold text-green-600">{selectedGame.homeScore}</p>
                              </div>
                              <div className="text-xl font-bold text-muted-foreground">-</div>
                              <div className="text-center">
                                <p className="text-sm text-muted-foreground">
                                  {teams.find((t: Team) => t.id === selectedGame.awayTeamId)?.name || 'Away'}
                                </p>
                                <p className="text-2xl font-bold text-green-600">{selectedGame.awayScore}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mb-4">
                        <p className="text-sm text-muted-foreground mb-3">Game not yet completed</p>
                        
                        {/* Score Submissions */}
                        {selectedGameScoreSubmissions.length > 0 && (
                          <div className="space-y-3 mb-4">
                            <p className="text-sm font-medium">Score Submissions:</p>
                            {selectedGameScoreSubmissions.map((submission: any, index: number) => (
                              <div 
                                key={submission.id} 
                                className={`p-3 rounded-lg border ${
                                  submission.submitterRole === 'commissioner' 
                                    ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
                                    : 'bg-muted border-border'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-4">
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">
                                        {teams.find((t: Team) => t.id === selectedGame.homeTeamId)?.name || 'Home'}
                                      </p>
                                      <p className="text-lg font-bold">{submission.homeScore}</p>
                                    </div>
                                    <div className="text-sm font-bold text-muted-foreground">-</div>
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">
                                        {teams.find((t: Team) => t.id === selectedGame.awayTeamId)?.name || 'Away'}
                                      </p>
                                      <p className="text-lg font-bold">{submission.awayScore}</p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs font-medium capitalize">
                                      {submission.submitterRole.replace('_', ' ')}
                                      {submission.submitterRole === 'commissioner' && ' (Override)'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(submission.submittedAt).toLocaleDateString()} {new Date(submission.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                            
                            {/* Check for conflicts */}
                            {(() => {
                              const captainSubmissions = selectedGameScoreSubmissions.filter((s: any) => 
                                s.submitterRole === 'home_captain' || s.submitterRole === 'away_captain'
                              );
                              const homeSubmission = captainSubmissions.find((s: any) => s.submitterRole === 'home_captain');
                              const awaySubmission = captainSubmissions.find((s: any) => s.submitterRole === 'away_captain');
                              
                              if (homeSubmission && awaySubmission && 
                                  (homeSubmission.homeScore !== awaySubmission.homeScore || 
                                   homeSubmission.awayScore !== awaySubmission.awayScore)) {
                                return (
                                  <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <AlertIcon className="w-4 h-4 text-yellow-600" />
                                      <p className="text-sm font-medium text-yellow-600">Score Conflict Detected</p>
                                    </div>
                                    <p className="text-xs text-yellow-600">
                                      Team captains have submitted different scores. Commissioner override required.
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}

                        {/* Commissioner Score Override */}
                        <div className="bg-card border border-border rounded-lg p-4">
                          <h4 className="text-sm font-medium mb-3">Commissioner Score Override</h4>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <Label htmlFor="commissionerHomeScore" className="text-xs font-medium">
                                {teams.find((t: Team) => t.id === selectedGame.homeTeamId)?.name || 'Home'} Score
                              </Label>
                              <Input
                                id="commissionerHomeScore"
                                type="number"
                                min="0"
                                value={commissionerHomeScore}
                                onChange={(e) => setCommissionerHomeScore(e.target.value)}
                                placeholder="0"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="commissionerAwayScore" className="text-xs font-medium">
                                {teams.find((t: Team) => t.id === selectedGame.awayTeamId)?.name || 'Away'} Score
                              </Label>
                              <Input
                                id="commissionerAwayScore"
                                type="number"
                                min="0"
                                value={commissionerAwayScore}
                                onChange={(e) => setCommissionerAwayScore(e.target.value)}
                                placeholder="0"
                                className="mt-1"
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            onClick={() => {
                              const home = parseInt(commissionerHomeScore);
                              const away = parseInt(commissionerAwayScore);
                              if (!isNaN(home) && !isNaN(away) && home >= 0 && away >= 0) {
                                commissionerScoreOverrideMutation.mutate({ 
                                  gameId: selectedGame.id, 
                                  homeScore: home, 
                                  awayScore: away 
                                });
                              }
                            }}
                            disabled={
                              commissionerScoreOverrideMutation.isPending || 
                              !commissionerHomeScore.trim() || 
                              !commissionerAwayScore.trim() ||
                              isNaN(parseInt(commissionerHomeScore)) ||
                              isNaN(parseInt(commissionerAwayScore))
                            }
                            className="w-full text-sm"
                          >
                            {commissionerScoreOverrideMutation.isPending ? "Setting Score..." : "Set Final Score"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Submit Buttons */}
                <div className="space-y-3 pt-4">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditGame(false);
                        setSelectedGame(null);
                      }}
                      className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                      data-testid="button-cancel-edit-game"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateGameMutation.isPending}
                      className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
                      data-testid="button-save-game-changes"
                    >
                      {updateGameMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirmation(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium transition-colors"
                    data-testid="button-delete-game"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Game
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Delete Game Confirmation Modal */}
      {showDeleteConfirmation && selectedGame && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Delete Game</h2>
                  <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="bg-muted p-4 rounded-lg mb-6">
                <p className="text-sm font-medium mb-1">
                  {(() => {
                    const homeTeam = teams.find((t: Team) => t.id === selectedGame.homeTeamId);
                    const awayTeam = teams.find((t: Team) => t.id === selectedGame.awayTeamId);
                    return `${homeTeam?.name || 'Unknown'} vs ${awayTeam?.name || 'Unknown'}`;
                  })()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(selectedGame.scheduledAt).toLocaleDateString()} at {
                    new Date(selectedGame.scheduledAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  }
                </p>
              </div>

              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to delete this game? This will permanently remove the game from the schedule and delete all associated attendance records.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirmation(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                  data-testid="button-cancel-delete-game"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteGameMutation.mutate(selectedGame.id)}
                  disabled={deleteGameMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium disabled:opacity-50"
                  data-testid="button-confirm-delete-game"
                >
                  {deleteGameMutation.isPending ? 'Deleting...' : 'Delete Game'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Team Confirmation Modal */}
      {showDeleteTeamConfirmation && teamToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Delete Team</h2>
                  <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="bg-muted p-4 rounded-lg mb-6">
                <p className="text-sm font-medium mb-1">
                  {(() => {
                    const team = teams.find((t: Team) => t.id === teamToDelete);
                    return team?.name || 'Unknown Team';
                  })()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const teamMembers = commissionerDisplayMembers.filter((m: LeagueMember) => m.assignedTeamId === teamToDelete);
                    return `${teamMembers.length} player${teamMembers.length !== 1 ? 's' : ''}`;
                  })()}
                </p>
              </div>

              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to delete this team? This will permanently remove the team and all associated data including:
              </p>
              
              <ul className="text-sm text-muted-foreground mb-6 ml-4 space-y-1 list-disc">
                <li>All team memberships</li>
                <li>All games involving this team</li>
                <li>All attendance records for this team</li>
              </ul>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteTeamConfirmation(false);
                    setTeamToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                  data-testid="button-cancel-delete-team"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (teamToDelete) {
                      deleteTeamMutation.mutate(teamToDelete);
                      setShowDeleteTeamConfirmation(false);
                      setTeamToDelete(null);
                    }
                  }}
                  disabled={deleteTeamMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium disabled:opacity-50"
                  data-testid="button-confirm-delete-team"
                >
                  {deleteTeamMutation.isPending ? 'Deleting...' : 'Delete Team'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Merge Approval Modal */}
      {showMergeModal && selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Approve Player</h3>
              <button
                onClick={() => {
                  setShowMergeModal(false);
                  setSelectedMember(null);
                  setPotentialMatches([]);
                  setSelectedMatch(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="font-medium">New Player:</p>
                <p className="text-sm text-muted-foreground">{formatUserName(selectedMember.user, selectedMember)}</p>
              </div>
              
              {potentialMatches.length > 0 && (
                <div className="border-t border-border pt-4">
                  <p className="font-medium mb-2">Potential Matches Found:</p>
                  <div className="space-y-2 mb-4">
                    {potentialMatches.map((match: any) => (
                      <div 
                        key={match.id} 
                        className={`p-2 border rounded-lg cursor-pointer ${
                          selectedMatch === match.id ? 'border-blue-500 bg-blue-500/10' : 'border-border'
                        }`}
                        onClick={() => setSelectedMatch(selectedMatch === match.id ? null : match.id)}
                      >
                        <p className="text-sm font-medium">{match.firstName} {match.lastName}</p>
                        <p className="text-xs text-muted-foreground">Team: {match.teamName}</p>
                      </div>
                    ))}
                  </div>
                  
                  {selectedMatch && (
                    <button
                      onClick={async () => {
                        try {
                          // Merge the selected imported player with the real user
                          await apiRequest('POST', `/api/leagues/${leagueId}/players/merge`, {
                            membershipId: selectedMember.id,
                            importedPlayerId: selectedMatch
                          });
                          
                          // Refresh the member lists
                          queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'pending-members'] });
                          queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
                          
                          toast({
                            title: "Success",
                            description: "Player merged successfully!",
                          });
                          
                          setShowMergeModal(false);
                          setSelectedMember(null);
                          setPotentialMatches([]);
                          setSelectedMatch(null);
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to merge player.",
                            variant: "destructive",
                          });
                        }
                      }}
                      className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 font-medium"
                    >
                      Approve and Merge with Selected
                    </button>
                  )}
                </div>
              )}
              
              <div className="pt-4 border-t border-border">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      approveMutation.mutate(selectedMember.id);
                      setShowMergeModal(false);
                      setSelectedMember(null);
                    }}
                    disabled={approveMutation.isPending}
                    className="flex-1 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 font-medium disabled:opacity-50"
                  >
                    {approveMutation.isPending ? 'Approving...' : 'Approve Without Merge'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Edit Team Modal */}
      {showEditTeam && selectedTeamForEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Team</h3>
              <button
                onClick={() => {
                  setShowEditTeam(false);
                  setSelectedTeamForEdit(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="font-medium text-lg">{selectedTeamForEdit.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const teamMembers = commissionerDisplayMembers.filter((m: LeagueMember) => m.assignedTeamId === selectedTeamForEdit.id);
                    return `${teamMembers.length} player${teamMembers.length !== 1 ? 's' : ''}`;
                  })()}
                </p>
              </div>

              {/* Team Logo Section */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">Team Logo</p>
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={10485760}
                    onGetUploadParameters={handleGetTeamLogoUploadParameters}
                    onComplete={createTeamLogoUploadComplete(selectedTeamForEdit.id)}
                    buttonClassName="h-8 px-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Upload className="w-3 h-3" />
                      <span>Upload Logo</span>
                    </div>
                  </ObjectUploader>
                </div>
                
                {/* Show current logo if exists */}
                {(selectedTeamForEdit as any)?.logoUrl && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <img 
                      src={(selectedTeamForEdit as any).logoUrl} 
                      alt={`${selectedTeamForEdit.name} logo`}
                      className="w-12 h-12 rounded-lg object-contain bg-background"
                    />
                    <div>
                      <p className="text-sm font-medium">Current Logo</p>
                      <p className="text-xs text-muted-foreground">Upload a new logo to replace</p>
                    </div>
                  </div>
                )}
                
                {!(selectedTeamForEdit as any)?.logoUrl && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">No Logo</p>
                      <p className="text-xs text-muted-foreground">Upload a team logo</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="pt-4 border-t border-border">
                <p className="text-sm font-medium mb-3">Team Actions</p>
                
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      toast({ title: 'Team messaging feature coming soon!', description: `Start a group chat with ${selectedTeamForEdit.name}` });
                    }}
                    className="w-full px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 font-medium flex items-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    Message Team
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowEditTeam(false);
                      setTeamToDelete(selectedTeamForEdit.id);
                      setShowDeleteTeamConfirmation(true);
                      setSelectedTeamForEdit(null);
                    }}
                    className="w-full px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 font-medium flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Team
                  </button>
                </div>
              </div>
              
              <div className="pt-4 border-t border-border">
                <button
                  onClick={() => {
                    setShowEditTeam(false);
                    setSelectedTeamForEdit(null);
                  }}
                  className="w-full px-4 py-2 bg-gray-500/20 text-gray-400 rounded-lg hover:bg-gray-500/30 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* User Merge Modal */}
      {showUserMergeModal && selectedPlayerToMerge && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Merge Player</h3>
              <button
                onClick={() => {
                  setShowUserMergeModal(false);
                  setSelectedPlayerToMerge(null);
                  setTargetUserId('');
                  setTargetUserEmail('');
                  setPreserveDisplayName(true);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="font-medium">Source Player:</p>
                <p className="text-sm text-muted-foreground">
                  {formatUserName(selectedPlayerToMerge.user, selectedPlayerToMerge)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedPlayerToMerge.user.email}
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium">Target User ID</label>
                <input
                  type="text"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  placeholder="e.g., 47231827"
                  className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the user ID of the account to merge with
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium">Target User Email (Optional)</label>
                <input
                  type="email"
                  value={targetUserEmail}
                  onChange={(e) => setTargetUserEmail(e.target.value)}
                  placeholder="e.g., tobinkern88@gmail.com"
                  className="w-full p-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Enter email for verification
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={preserveDisplayName}
                    onChange={(e) => setPreserveDisplayName(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Preserve display name from source player</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  If checked, the source player's name will be shown on the roster
                </p>
              </div>
              
              <div className="pt-4 border-t border-border">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowUserMergeModal(false);
                      setSelectedPlayerToMerge(null);
                      setTargetUserId('');
                      setTargetUserEmail('');
                      setPreserveDisplayName(true);
                    }}
                    className="flex-1 bg-muted text-muted-foreground px-4 py-2 rounded-lg hover:bg-muted/80 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!targetUserId.trim()) {
                        toast({
                          title: "Error",
                          description: "Please enter a target user ID.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      try {
                        const response = await apiRequest('POST', `/api/leagues/${leagueId}/merge-player`, {
                          fromUserId: selectedPlayerToMerge.userId,
                          toUserId: targetUserId.trim(),
                          preserveName: preserveDisplayName
                        });
                        
                        if (response.ok) {
                          toast({
                            title: "Success",
                            description: `Player merged successfully! ${preserveDisplayName ? 'Display name preserved.' : ''}`,
                          });
                          
                          // Invalidate queries to refresh the data
                          await queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
                          await queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
                          
                          setShowUserMergeModal(false);
                          setSelectedPlayerToMerge(null);
                          setTargetUserId('');
                          setTargetUserEmail('');
                          setPreserveDisplayName(true);
                        } else {
                          const error = await response.json();
                          toast({
                            title: "Error",
                            description: error.message || "Failed to merge players.",
                            variant: "destructive",
                          });
                        }
                      } catch (error) {
                        console.error('Merge error:', error);
                        toast({
                          title: "Error",
                          description: "Failed to merge players. Please try again.",
                          variant: "destructive",
                        });
                      }
                    }}
                    disabled={!targetUserId.trim()}
                    className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50"
                  >
                    Merge Players
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Players Confirmation Dialog */}
      <AlertDialog open={showDeleteAllPlayersDialog} onOpenChange={setShowDeleteAllPlayersDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Players?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {members.length} players from this league. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-all-players">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllPlayersMutation.mutate()}
              className="bg-red-500 hover:bg-red-600"
              data-testid="button-confirm-delete-all-players"
            >
              Delete All Players
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Teams Confirmation Dialog */}
      <AlertDialog open={showDeleteAllTeamsDialog} onOpenChange={setShowDeleteAllTeamsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Teams?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {teams.length} teams from this league and unassign all players. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-all-teams">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllTeamsMutation.mutate()}
              className="bg-red-500 hover:bg-red-600"
              data-testid="button-confirm-delete-all-teams"
            >
              Delete All Teams
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Games Confirmation Dialog */}
      <AlertDialog open={showDeleteAllGamesDialog} onOpenChange={setShowDeleteAllGamesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Games?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {games.length} games from this league. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-all-games">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllGamesMutation.mutate()}
              className="bg-red-500 hover:bg-red-600"
              data-testid="button-confirm-delete-all-games"
            >
              Delete All Games
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
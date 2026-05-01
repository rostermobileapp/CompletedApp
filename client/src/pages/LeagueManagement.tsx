import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest, getImageUrl, queryClient } from '@/lib/queryClient';
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
  AlertCircle as AlertIcon,
  User,
  Search
} from 'lucide-react';
import { insertTeamSchema, insertSeasonSchema } from '@shared/schema';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ObjectUploader } from '@/components/ObjectUploader';
import { GoogleAddressAutocomplete } from '@/components/GoogleAddressAutocomplete';
import { useIsMobile } from '@/hooks/useIsMobile';
import { DesktopRequiredDialog, DESKTOP_REQUIRED_COPY } from '@/components/DesktopRequiredDialog';
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
  status: string;
  assignedTeamId?: string;
  position?: string;
  notes?: string;
  jerseyNumber?: number;
  isSkater?: boolean;
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
    profileImageUrl?: string;
    timezone?: string;
  };
};


// Compact Score Verification Alert Component
function ScoreVerificationAlert({ leagueId }: { leagueId: string }) {
  const [, navigate] = useLocation();

  // Fetch count of games that need score verification using optimized backend endpoint
  const { data: gamesNeedingVerification = [], isLoading: isLoadingGames } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification'],
    refetchInterval: 90000,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games-needing-verification`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Also fetch tournament matches needing verification
  const { data: tournamentMatchesNeedingVerification = [], isLoading: isLoadingTournaments } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'tournament-matches-needing-verification'],
    refetchInterval: 90000,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/tournament-matches-needing-verification`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!leagueId,
  });

  const isLoading = isLoadingGames || isLoadingTournaments;

  if (isLoading) {
    return null;
  }

  const count = gamesNeedingVerification.length + tournamentMatchesNeedingVerification.length;

  if (count === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <div 
        className="dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 cursor-pointer pt-[4px] pb-[4px] pl-[12px] pr-[12px] bg-[#ff000082]"
        onClick={() => navigate(`/league/${leagueId}/score-verification`)}
        data-testid="score-verification-alert"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#000000] text-[#ffffff]">
              <span className="text-white text-sm font-bold">{count}</span>
            </div>
            <div>
              <h3 className="text-base font-semibold dark:text-red-400 text-[#ffffff]">Record Scores</h3>
            </div>
          </div>
          <Button
            variant="outline"
            className="border-red-300 dark:border-red-700 dark:text-red-400 text-[#fcfcfc] bg-[#000000] hover:border-red-300 dark:hover:border-red-700 hover:text-[#fcfcfc] dark:hover:text-red-400 hover:bg-[#000000]"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/league/${leagueId}/score-verification`);
            }}
            data-testid="button-view-score-verification"
          >
            Review Scores
          </Button>
        </div>
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
  seasonId?: string | null;
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
  isScrimmage?: boolean; // Scrimmage indicator
  resultType?: 'regulation' | 'overtime' | 'shootout'; // Added for OTL tracking
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
  awayTeamId: z.string().optional(), // Optional for single-team scrimmages
  scheduledAt: z.string().min(1, 'Game date and time is required'),
  venue: z.string().optional(),
  isScrimmage: z.boolean().default(false),
}).refine((data) => {
  // Away team is required for regular games, optional for scrimmages
  if (!data.isScrimmage && (!data.awayTeamId || data.awayTeamId === '')) {
    return false;
  }
  return true;
}, {
  message: 'Away team is required for regular games',
  path: ['awayTeamId'],
});

type CreateGameForm = z.infer<typeof createGameSchema>;

const editGameSchema = z.object({
  homeTeamId: z.string().min(1, 'Home team is required'),
  awayTeamId: z.string().optional(),
  gameDate: z.string().min(1, 'Game date is required'),
  gameTime: z.string().min(1, 'Game time is required'),
  venue: z.string().optional(),
  homeTeamLockerRoom: z.string().optional(),
  awayTeamLockerRoom: z.string().optional(),
  isScrimmage: z.boolean().default(false),
});

type EditGameForm = z.infer<typeof editGameSchema>;

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'America/Phoenix', label: 'Arizona (No DST)' },
  { value: 'America/Toronto', label: 'Eastern Time - Toronto' },
  { value: 'America/Vancouver', label: 'Pacific Time - Vancouver' },
  { value: 'America/Edmonton', label: 'Mountain Time - Edmonton' },
  { value: 'America/Winnipeg', label: 'Central Time - Winnipeg' },
  { value: 'America/Halifax', label: 'Atlantic Time (AT)' },
  { value: 'America/St_Johns', label: 'Newfoundland Time (NT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European Time' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
];

const subApprovalWorkflowOptions = [
  { value: 'substitute_only', label: 'No Commissioner or opposing team approval needed' },
  { value: 'captain_only', label: 'By Captain of Opposing Team' },
  { value: 'commissioner_only', label: 'By League Commissioner' },
  { value: 'captain_and_commissioner', label: 'Commissioner & Captain of Opposing Team' },
] as const;

const editLeagueSchema = z.object({
  name: z.string().min(1, 'League name is required'),
  description: z.string().optional(),
  location: z.string().optional(),
  season: z.string().optional(),
  facilityId: z.string().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean(),
  subApprovalWorkflow: z.enum(['substitute_only', 'captain_only', 'commissioner_only', 'captain_and_commissioner']).optional(),
});

type EditLeagueForm = z.infer<typeof editLeagueSchema>;

const createFacilitySchema = z.object({
  name: z.string().min(1, 'Facility name is required'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional(),
});

type CreateFacilityForm = z.infer<typeof createFacilitySchema>;

const createSeasonSchema = z.object({
  name: z.string().min(1, 'Season name is required'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type CreateSeasonForm = z.infer<typeof createSeasonSchema>;

type NewSeasonStep = 'close' | 'details' | 'players';

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
    <div className="bg-background rounded-lg hairline elev-rest p-4">
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
            className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary transition-colors"
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
                      className={`p-1 rounded text-xs cursor-pointer transition-colors ${
                        game.isScrimmage 
                          ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:hover:bg-orange-900/70' 
                          : 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70'
                      }`}
                      data-testid={`calendar-game-${game.id}`}
                    >
                      <div className="font-medium truncate">
                        {game.isScrimmage && <span className="mr-1">⚡</span>}
                        {awayTeam ? `${homeTeam?.name || 'Team'} vs ${awayTeam.name}` : `${homeTeam?.name || 'Team'} Practice`}
                      </div>
                      <div className={game.isScrimmage ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}>
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
  const isMobile = useIsMobile();
  const [showDesktopRequiredLeague, setShowDesktopRequiredLeague] = useState(false);
  const [showDesktopRequiredSeason, setShowDesktopRequiredSeason] = useState(false);
  const [seasonToDelete, setSeasonToDelete] = useState<Season | null>(null);
  const [activeTab, setActiveTab] = useState<'players' | 'teams' | 'games'>('games');
  const [gamesViewMode, setGamesViewMode] = useState<'calendar' | 'list'>('calendar');
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<LeagueMember | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamCaptains, setTeamCaptains] = useState<string[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [showScheduleGame, setShowScheduleGame] = useState(false);
  const [showEditGame, setShowEditGame] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Score management state
  const [commissionerHomeScore, setCommissionerHomeScore] = useState('');
  const [commissionerAwayScore, setCommissionerAwayScore] = useState('');
  const [commissionerIsOvertimeShootout, setCommissionerIsOvertimeShootout] = useState(false);
  const [commissionerResultType, setCommissionerResultType] = useState<'overtime' | 'shootout'>('overtime');
  const [isEditingGameScore, setIsEditingGameScore] = useState(false);
  const [editGameHomeScore, setEditGameHomeScore] = useState('');
  const [editGameAwayScore, setEditGameAwayScore] = useState('');
  const [editGameIsOvertimeShootout, setEditGameIsOvertimeShootout] = useState(false);
  const [editGameResultType, setEditGameResultType] = useState<'overtime' | 'shootout'>('overtime');
  const datePickerRef = React.useRef<HTMLDivElement>(null);
  const timePickerRef = React.useRef<HTMLDivElement>(null);
  
  // Bulk import state
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showMergeRequests, setShowMergeRequests] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Manual player add state
  const [showManualAddPlayer, setShowManualAddPlayer] = useState(false);
  const [manualPlayerForm, setManualPlayerForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    assignedTeamId: '',
    seasonId: '',
  });
  
  // Schedule import state  
  const [showScheduleImport, setShowScheduleImport] = useState(false);
  const [scheduleImportFile, setScheduleImportFile] = useState<File | null>(null);
  const scheduleFileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Games list scroll refs
  const gamesListDesktopRef = React.useRef<HTMLDivElement>(null);
  const gamesListMobileRef = React.useRef<HTMLDivElement>(null);
  const [hasScrolledToNextGame, setHasScrolledToNextGame] = useState(false);
  
  // Approval modal state
  const [selectedMember, setSelectedMember] = useState<LeagueMember | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [potentialMatches, setPotentialMatches] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [approvalMode, setApprovalMode] = useState<'initial' | 'replace'>('initial');
  const [placeholderSearchQuery, setPlaceholderSearchQuery] = useState('');
  const [placeholderSearchResults, setPlaceholderSearchResults] = useState<LeagueMember[]>([]);
  const [selectedPlaceholder, setSelectedPlaceholder] = useState<LeagueMember | null>(null);
  const [isReplacingInApproval, setIsReplacingInApproval] = useState(false);
  
  // Replace player modal state (for replacing placeholder players with real users)
  const [showReplacePlayerModal, setShowReplacePlayerModal] = useState(false);
  const [selectedPlayerToReplace, setSelectedPlayerToReplace] = useState<LeagueMember | null>(null);
  const [replaceTargetUserId, setReplaceTargetUserId] = useState('');
  const [replaceSearchQuery, setReplaceSearchQuery] = useState('');
  const [replaceSearchResults, setReplaceSearchResults] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isReplacingPlayer, setIsReplacingPlayer] = useState(false);
  const [preserveDisplayName, setPreserveDisplayName] = useState(true);
  
  // Delete confirmation state
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showDeleteTeamConfirmation, setShowDeleteTeamConfirmation] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<string | null>(null);
  const [showEditTeam, setShowEditTeam] = useState(false);
  const [selectedTeamForEdit, setSelectedTeamForEdit] = useState<Team | null>(null);
  
  // Post-merge placeholder deletion state
  const [showPostMergeDeleteDialog, setShowPostMergeDeleteDialog] = useState(false);
  const [postMergePlaceholderInfo, setPostMergePlaceholderInfo] = useState<{
    userId: string;
    name: string;
    hadStats: boolean;
  } | null>(null);
  const [isDeletingPostMergePlaceholder, setIsDeletingPostMergePlaceholder] = useState(false);
  
  // Delete placeholder with stats dialog state
  const [showDeletePlaceholderWithStatsDialog, setShowDeletePlaceholderWithStatsDialog] = useState(false);
  const [playerToDeleteWithStats, setPlayerToDeleteWithStats] = useState<LeagueMember | null>(null);
  const [isCheckingPlayerStats, setIsCheckingPlayerStats] = useState(false);
  
  // Bulk delete confirmation states
  const [showDeleteAllPlayersDialog, setShowDeleteAllPlayersDialog] = useState(false);
  const [showDeleteAllTeamsDialog, setShowDeleteAllTeamsDialog] = useState(false);
  const [showDeleteAllGamesDialog, setShowDeleteAllGamesDialog] = useState(false);
  
  // Co-commissioner management state
  const [coCommissionerEmail, setCoCommissionerEmail] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [statManagerEmail, setStatManagerEmail] = useState('');
  
  // Facility management state
  const [showCreateFacility, setShowCreateFacility] = useState(false);
  const [facilitySearch, setFacilitySearch] = useState('');
  const [selectedFacility, setSelectedFacility] = useState<any>(null);
  
  // Member search state
  const [memberSearch, setMemberSearch] = useState('');
  
  // Fetch team captains when a team is selected
  React.useEffect(() => {
    const fetchCaptains = async () => {
      if (selectedTeam && !selectedTeam.isFreeAgents) {
        try {
          const response = await apiRequest('GET', `/api/teams/${selectedTeam.id}/captains`);
          if (response.ok) {
            const data = await response.json();
            // Handle both { captains: [] } format and raw array format for backwards compatibility
            const captains = Array.isArray(data) ? data : (data.captains || []);
            setTeamCaptains(captains);
          } else {
            // Fall back to just captainId on error
            setTeamCaptains(selectedTeam.captainId ? [selectedTeam.captainId] : []);
          }
        } catch (error) {
          console.error('Error fetching team captains:', error);
          // Fall back to just captainId
          setTeamCaptains(selectedTeam.captainId ? [selectedTeam.captainId] : []);
        }
      } else {
        setTeamCaptains([]);
      }
    };
    fetchCaptains();
  }, [selectedTeam?.id]);
  
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
  const [newSeasonStep, setNewSeasonStep] = useState<NewSeasonStep>('close');
  const [closeCurrentSeason, setCloseCurrentSeason] = useState(true);
  const [notReturningMemberIds, setNotReturningMemberIds] = useState<Set<string>>(new Set());
  const [showResetPlayersConfirm, setShowResetPlayersConfirm] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [playerEditForm, setPlayerEditForm] = useState({
    assignedTeamId: '',
    position: '',
    skillLevel: '',
    jerseyNumber: '',
    notes: '',
    isCaptain: false,
    isGoalie: false,
    isSkater: true, // Default to skater
    displayFirstName: '',
    displayLastName: '',
    timezone: 'America/New_York'
  });

  // Get league ID and edit mode from URL params
  // Use location from wouter to make this reactive to URL changes
  const [locationPath] = useLocation();
  
  // Parse query params reactively based on location changes
  const searchParams = React.useMemo(() => {
    return new URLSearchParams(window.location.search);
  }, [locationPath]);
  
  const leagueId = searchParams.get('leagueId') || '';
  const editMode = searchParams.get('edit') === 'true';
  const editMemberId = searchParams.get('editMember') || '';
  
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

  // Fetch all facilities for facility selector
  const { data: facilities = [], refetch: refetchFacilities } = useQuery({
    queryKey: ['/api/facilities', facilitySearch],
    queryFn: async () => {
      const url = facilitySearch 
        ? `/api/facilities?search=${encodeURIComponent(facilitySearch)}`
        : '/api/facilities';
      const response = await apiRequest('GET', url);
      return response.json();
    },
  });

  // Fetch seasons for this league
  const { data: seasons = [], refetch: refetchSeasons, isLoading: seasonsLoading } = useQuery<Season[]>({
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

  // WebSocket connection for real-time pending member updates
  const wsRef = useRef<WebSocket | null>(null);
  
  useEffect(() => {
    if (!user?.id || !leagueId) return;
    
    // Construct WebSocket URL
    let wsUrl;
    try {
      const origin = window.location.origin;
      wsUrl = origin.replace('https:', 'wss:').replace('http:', 'ws:') + '/ws';
    } catch (error) {
      console.warn('Failed to get origin, using fallback:', error);
      wsUrl = 'ws://localhost:5000/ws';
    }
    
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      wsRef.current = websocket;
      // Authenticate with the server
      websocket.send(JSON.stringify({
        type: 'authenticate',
        userId: user.id
      }));
    };
    
    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle pending member added event
        if (data.type === 'pending_member_added' && data.leagueId === leagueId) {
          // Refetch pending members to show the new request immediately
          refetchPending();
        }
        
        // Handle real-time notification updates
        if (data.type === 'notification_update') {
          queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
          queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user/notification-counts'] });
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };
    
    websocket.onclose = () => {
      wsRef.current = null;
    };
    
    return () => {
      websocket.close();
    };
  }, [user?.id, leagueId, refetchPending]);

  // Fetch pending team join requests
  const { data: teamJoinRequests = [], refetch: refetchTeamJoinRequests } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'team-join-requests'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/team-join-requests`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch teams
  const { data: allTeams = [], refetch: refetchTeams } = useQuery<Team[]>({
    queryKey: ['/api/leagues', leagueId, 'teams'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/teams`);
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Fetch games
  const { data: allGamesData = [], refetch: refetchGames } = useQuery<any[]>({
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

  // Scope teams to the currently-selected season so the League Management
  // views show only that season's teams. Teams without a seasonId (legacy
  // pre-seasons data) are kept visible only when no season is selected.
  const teams = React.useMemo(() => {
    if (!selectedSeasonId) return allTeams;
    return allTeams.filter((t: any) => t.seasonId === selectedSeasonId);
  }, [allTeams, selectedSeasonId]);

  // Scope and sort games to the currently-selected season.
  const games = React.useMemo(() => {
    const scoped = selectedSeasonId
      ? allGamesData.filter((g: any) => g.seasonId === selectedSeasonId)
      : allGamesData;
    return [...scoped].sort((a, b) => {
      const dateA = new Date(a.scheduledAt);
      const dateB = new Date(b.scheduledAt);
      return dateA.getTime() - dateB.getTime();
    });
  }, [allGamesData, selectedSeasonId]);

  // Reset scroll state when switching to list view
  useEffect(() => {
    if (gamesViewMode === 'list') {
      setHasScrolledToNextGame(false);
    }
  }, [gamesViewMode]);

  // Auto-scroll to next upcoming game when list view is shown or on mobile
  useEffect(() => {
    if (games.length === 0) return;
    
    // For desktop, only scroll when in list mode
    // For mobile, always scroll (mobile always shows list)
    const isMobile = window.innerWidth < 768;
    if (!isMobile && gamesViewMode !== 'list') return;
    if (hasScrolledToNextGame) return;
    
    const now = new Date();
    const sortedGames = [...games].sort((a, b) => 
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
    
    // Find the first game that is today or in the future
    const nextGameIndex = sortedGames.findIndex(game => {
      const gameDate = new Date(game.scheduledAt);
      return gameDate >= now;
    });
    
    if (nextGameIndex >= 0) {
      const nextGame = sortedGames[nextGameIndex];
      
      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        // Try desktop container first (only visible on desktop in list view)
        const desktopContainer = gamesListDesktopRef.current;
        if (desktopContainer && desktopContainer.offsetParent !== null) {
          const gameRow = desktopContainer.querySelector(`[data-game-id="${nextGame.id}"]`);
          if (gameRow) {
            gameRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHasScrolledToNextGame(true);
            return;
          }
        }
        
        // Try mobile container (always visible on mobile)
        const mobileContainer = gamesListMobileRef.current;
        if (mobileContainer && mobileContainer.offsetParent !== null) {
          const gameCard = mobileContainer.querySelector(`[data-game-id="${nextGame.id}"]`);
          if (gameCard) {
            gameCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHasScrolledToNextGame(true);
          }
        }
      }, 300);
    }
  }, [gamesViewMode, games, hasScrolledToNextGame]);
  
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
      isScrimmage: false,
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
      facilityId: league?.facilityId || '',
      timezone: (league as any)?.timezone || 'America/New_York',
      isActive: league?.isActive ?? true,
      subApprovalWorkflow: (league as any)?.subApprovalWorkflow || 'captain_and_commissioner',
    },
  });

  // Form for creating facility
  const createFacilityForm = useForm<CreateFacilityForm>({
    resolver: zodResolver(createFacilitySchema),
    defaultValues: {
      name: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      phoneNumber: '',
      email: '',
      website: '',
    },
  });

  // Form for creating seasons
  const seasonForm = useForm<CreateSeasonForm>({
    resolver: zodResolver(createSeasonSchema),
    defaultValues: {
      name: '',
      startDate: '',
      endDate: '',
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
      homeTeamLockerRoom: '',
      awayTeamLockerRoom: '',
      isScrimmage: false,
    },
  });

  // Update edit game form when selected game changes
  React.useEffect(() => {
    if (selectedGame) {
      const gameDate = new Date(selectedGame.scheduledAt);
      // Format as local time without timezone conversion
      const year = gameDate.getFullYear();
      const month = String(gameDate.getMonth() + 1).padStart(2, '0');
      const day = String(gameDate.getDate()).padStart(2, '0');
      const hours = String(gameDate.getHours()).padStart(2, '0');
      const minutes = String(gameDate.getMinutes()).padStart(2, '0');
      
      editGameForm.reset({
        homeTeamId: selectedGame.homeTeamId,
        awayTeamId: selectedGame.awayTeamId || '',
        gameDate: `${year}-${month}-${day}`,
        gameTime: `${hours}:${minutes}`,
        venue: selectedGame.venue || '',
        homeTeamLockerRoom: selectedGame.homeTeamLockerRoom || '',
        awayTeamLockerRoom: selectedGame.awayTeamLockerRoom || '',
        isScrimmage: selectedGame.isScrimmage || false,
      });
    }
  }, [selectedGame]);

  // Update form when league data loads (only when league changes, not facilities)
  React.useEffect(() => {
    if (league) {
      editLeagueForm.reset({
        name: league.name,
        description: league.description || '',
        location: league.location || '',
        season: league.season || '',
        isActive: league.isActive ?? true,
        facilityId: league.facilityId || '',
        timezone: (league as any)?.timezone || 'America/New_York',
        subApprovalWorkflow: (league as any)?.subApprovalWorkflow || 'captain_and_commissioner',
      });
    }
  }, [league]);
  
  // Set selected facility based on league's facilityId and available facilities
  React.useEffect(() => {
    if (league && facilities.length > 0) {
      if (league.facilityId) {
        const facility = facilities.find((f: any) => f.id === league.facilityId);
        if (facility) {
          setSelectedFacility(facility);
        }
      } else if (!league.facilityId && selectedFacility === null) {
        // Only clear if not already cleared
        setSelectedFacility(null);
      }
    }
  }, [league?.facilityId, facilities]);

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
          jerseyNumber: memberToEdit.jerseyNumber?.toString() || '',
          notes: memberToEdit.notes || '',
          isCaptain: assignedTeam?.captainId === memberToEdit.userId,
          isGoalie: memberToEdit.isGoalie || false,
          isSkater: memberToEdit.isSkater ?? true, // Default to true if not set
          displayFirstName: memberToEdit.displayFirstName || memberToEdit.user.firstName || '',
          displayLastName: memberToEdit.displayLastName || memberToEdit.user.lastName || '',
          timezone: memberToEdit.user.timezone || 'America/New_York'
        });
        // Clear the editMember parameter from URL after opening modal
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('editMember');
        window.history.replaceState({}, '', newUrl.toString());
      }
    }
  }, [editMemberId, members, teams, selectedPlayer]);

  // Mutation for messaging a player
  const createDirectMessageMutation = useMutation({
    mutationFn: async (otherUserId: string) => {
      // League management page is league-scoped by URL; the resulting DM
      // lives at the league level (no team or tournament scope).
      const response = await apiRequest('POST', '/api/conversations/direct', {
        otherUserId,
        leagueId: leagueId,
        teamId: null,
        tournamentId: null,
      });
      return response.json();
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      const conversationId = conversation.id || conversation.conversationId;
      if (conversationId) {
        setPageTransitionDirection('up');
        navigate(`/messages/${conversationId}`);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start conversation",
        variant: "destructive",
      });
    },
  });

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

  // Mutations for team join requests
  const approveTeamJoinMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiRequest('POST', `/api/league-requests/${requestId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: 'Team Approved', 
        description: 'The team and all its members have been added to your league.' 
      });
      refetchTeamJoinRequests();
      refetchTeams();
      refetchMembers();
    },
  });

  const rejectTeamJoinMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const response = await apiRequest('POST', `/api/league-requests/${requestId}/reject`);
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: 'Request Rejected', 
        description: 'The team join request has been rejected.' 
      });
      refetchTeamJoinRequests();
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

  // Add captain mutation (for multi-captain support)
  const addCaptainMutation = useMutation({
    mutationFn: async ({ teamId, captainUserId }: { teamId: string; captainUserId: string }) => {
      const response = await apiRequest('POST', `/api/teams/${teamId}/captains`, { captainUserId });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add captain');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Captain Added',
        description: 'Player has been made a team captain.',
      });
      // Update local captains state from response
      if (data.captains) {
        setTeamCaptains(data.captains);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
      refetchMembers();
    },
    onError: async (error: Error) => {
      toast({
        title: 'Failed to add captain',
        description: error.message,
        variant: 'destructive',
      });
      // Refetch captains to ensure UI is in sync
      const teamIdAtError = selectedTeam?.id;
      if (teamIdAtError) {
        try {
          const res = await apiRequest('GET', `/api/teams/${teamIdAtError}/captains`);
          if (res.ok) {
            const data = await res.json();
            // Only update if we're still on the same team
            if (selectedTeam?.id === teamIdAtError) {
              const captains = Array.isArray(data) ? data : (data.captains || []);
              setTeamCaptains(captains);
            }
          }
        } catch (e) {
          console.error('Failed to refetch captains:', e);
        }
      }
      // Invalidate related queries after refetch attempt
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
    },
  });

  // Remove captain mutation (for multi-captain support)
  const removeCaptainMutation = useMutation({
    mutationFn: async ({ teamId, captainUserId }: { teamId: string; captainUserId: string }) => {
      const response = await apiRequest('DELETE', `/api/teams/${teamId}/captains/${captainUserId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove captain');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Captain Removed',
        description: 'Player is no longer a team captain.',
      });
      // Update local captains state from response
      if (data.captains) {
        setTeamCaptains(data.captains);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
      refetchMembers();
    },
    onError: async (error: Error) => {
      toast({
        title: 'Failed to remove captain',
        description: error.message,
        variant: 'destructive',
      });
      // Refetch captains to ensure UI is in sync
      const teamIdAtError = selectedTeam?.id;
      if (teamIdAtError) {
        try {
          const res = await apiRequest('GET', `/api/teams/${teamIdAtError}/captains`);
          if (res.ok) {
            const data = await res.json();
            // Only update if we're still on the same team
            if (selectedTeam?.id === teamIdAtError) {
              const captains = Array.isArray(data) ? data : (data.captains || []);
              setTeamCaptains(captains);
            }
          }
        } catch (e) {
          console.error('Failed to refetch captains:', e);
        }
      }
      // Invalidate related queries after refetch attempt
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
    },
  });

  // Upload mutation for bulk player import
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!leagueId) {
        throw new Error('League ID is required');
      }

      const formData = new FormData();
      formData.append('playerFile', file);

      // Get auth headers from supabase
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Use API_BASE_URL from environment (Railway in prod, localhost in dev)
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      const url = `${API_BASE_URL}/api/leagues/${leagueId}/players/import`;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Upload failed';
        try {
          const text = await response.text();
          const error = JSON.parse(text);
          errorMessage = error.message || errorMessage;
        } catch (e) {
          errorMessage = `Upload failed with status ${response.status}`;
        }
        throw new Error(errorMessage);
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

      // Get auth headers from supabase
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Use API_BASE_URL from environment (Railway in prod, localhost in dev)
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      const url = `${API_BASE_URL}/api/leagues/${leagueId}/schedules/import`;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = 'Schedule upload failed';
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch (e) {
          const text = await response.text();
          errorMessage = text || `Upload failed with status ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: (data) => {
      // If all imports failed and we have errors, show detailed error
      if (data.successfulRecords === 0 && data.errors && data.errors.length > 0) {
        toast({
          title: 'Schedule Import Failed',
          description: (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <p>{`All ${data.failedRecords} games failed to import.`}</p>
              <div className="text-sm mt-2 pt-2 border-t border-border">
                <p className="font-semibold">Errors:</p>
                <ul className="list-disc pl-4 mt-1">
                  {data.errors.slice(0, 10).map((error: string, idx: number) => (
                    <li key={idx} className="text-xs">{error}</li>
                  ))}
                  {data.errors.length > 10 && (
                    <li className="text-xs italic">... and {data.errors.length - 10} more errors</li>
                  )}
                </ul>
              </div>
            </div>
          ),
          variant: 'destructive',
          duration: 15000,
        });
      } else {
        // Show success message with summary
        const successMessage = [
          `${data.gamesCreated || data.successfulRecords} games scheduled successfully`,
          data.teamsCreated > 0 ? `${data.teamsCreated} teams created` : null,
          data.gamesSkipped > 0 ? `${data.gamesSkipped} duplicates skipped` : null,
          data.failedRecords > 0 ? `${data.failedRecords} failed` : null
        ].filter(Boolean).join(', ');
        
        toast({
          title: 'Schedule Import Successful',
          description: successMessage,
        });
      }
      
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

  // Mutation for manual player addition
  const manualAddPlayerMutation = useMutation({
    mutationFn: async (playerData: typeof manualPlayerForm) => {
      if (!leagueId) {
        throw new Error('League ID is required');
      }

      const response = await apiRequest('POST', `/api/leagues/${leagueId}/members/manual-add`, {
        firstName: playerData.firstName,
        lastName: playerData.lastName,
        email: playerData.email,
        phoneNumber: playerData.phoneNumber,
        assignedTeamId: playerData.assignedTeamId || null,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add player');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Player Added',
        description: `${manualPlayerForm.firstName} ${manualPlayerForm.lastName} has been added to the league. You can send a welcome email from the batch email feature.`,
      });
      
      // Reset form
      setManualPlayerForm({
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        assignedTeamId: '',
      });
      setShowManualAddPlayer(false);
      
      // Refetch members
      refetchMembers();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Add Player',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

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
        path: data.path, // Return path for later use
      };
    } catch (error) {
      console.error('Failed to get upload URL:', error);
      throw error;
    }
  };

  const createTeamLogoUploadComplete = (teamId: string) => (result: { successful?: Array<{ uploadURL: string; path?: string }>; failed?: Array<any> }) => {
    if (result.successful && result.successful.length > 0) {
      const logoUrl = result.successful[0].path || result.successful[0].uploadURL;
      updateTeamLogoMutation.mutate({ teamId, logoUrl });
    } else if (result.failed && result.failed.length > 0) {
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

  // Add stat manager special permission mutation - uses invite-scorekeeper endpoint
  // This allows inviting users by email even if they're not league members yet
  const addStatManagerMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest('POST', `/api/leagues/${leagueId}/invite-scorekeeper`, {
        email: email
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add stat manager');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Scorekeeper Added',
        description: `${data.user?.firstName || data.user?.email || 'User'} has been granted scorekeeper privileges.`,
      });
      setStatManagerEmail('');
      refetchMembers();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Add Scorekeeper',
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

  // Join team mutation - for team captains/commissioners to join their own team
  const joinTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      // Find the current user's league membership
      let currentMembership = members.find(m => m.userId === user?.id);
      
      // If user doesn't have a membership yet, create one first (auto-approve for commissioner/captain)
      if (!currentMembership) {
        const joinResponse = await apiRequest('POST', `/api/leagues/${leagueId}/join`, {});
        const newMembership = await joinResponse.json();
        
        // Auto-approve the membership since they're commissioner/captain
        const approveResponse = await apiRequest('POST', `/api/league-memberships/${newMembership.id}/approve`, {});
        currentMembership = await approveResponse.json();
      }
      
      // Ensure we have a membership before proceeding
      if (!currentMembership) {
        throw new Error('Failed to get or create league membership');
      }
      
      // Now assign them to the team
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
      // Send datetime-local string directly without timezone conversion
      // The datetime is in the league's timezone and should be stored as-is
      const gameData = {
        ...data,
        leagueId: leagueId,
        scheduledAt: data.scheduledAt,
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
        awayTeamId: data.awayTeamId || null,
        venue: data.venue,
        homeTeamLockerRoom: data.homeTeamLockerRoom,
        awayTeamLockerRoom: data.awayTeamLockerRoom,
        isScrimmage: data.isScrimmage,
      };
      
      if (shouldUpdateScheduledAt) {
        // Send datetime string directly without timezone conversion
        // The datetime is in the league's timezone and should be stored as-is
        const formattedDateTime = `${data.gameDate}T${data.gameTime}`;
        updatePayload.scheduledAt = formattedDateTime;
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
    mutationFn: async ({ gameId, homeScore, awayScore, resultType }: { gameId: string; homeScore: number; awayScore: number; resultType?: 'regulation' | 'overtime' | 'shootout' }) => {
      return await apiRequest("POST", `/api/games/${gameId}/submit-score`, { homeScore, awayScore, resultType: resultType || 'regulation' });
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
      // Invalidate teams, games, and standings as team deletion affects all
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'games'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'standings'] });
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

  // Create facility mutation
  const createFacilityMutation = useMutation({
    mutationFn: async (data: CreateFacilityForm) => {
      const response = await apiRequest('POST', '/api/facilities', data);
      return response.json();
    },
    onSuccess: (newFacility) => {
      toast({ title: 'Facility created successfully' });
      setShowCreateFacility(false);
      createFacilityForm.reset();
      refetchFacilities();
      // Automatically select the newly created facility
      setSelectedFacility(newFacility);
      editLeagueForm.setValue('facilityId', newFacility.id);
      // Clear the facility search to prevent dropdown issues
      setFacilitySearch('');
    },
    onError: () => {
      toast({
        title: 'Create Failed',
        description: 'Failed to create facility.',
        variant: 'destructive',
      });
    },
  });

  // League delete mutation
  const deleteSeasonMutation = useMutation({
    mutationFn: async (seasonId: string) => {
      const response = await apiRequest('DELETE', `/api/leagues/${leagueId}/seasons/${seasonId}`);
      return response.json();
    },
    onSuccess: (_data, seasonId) => {
      toast({
        title: 'Season Deleted',
        description: 'The season has been removed.',
      });
      // If the user was viewing the deleted season, switch to the most-recent
      // remaining one (or empty string when none are left).
      if (selectedSeasonId === seasonId) {
        const remaining = (Array.isArray(seasons) ? seasons : []).filter((s) => s.id !== seasonId);
        setSelectedSeasonId(remaining[0]?.id ?? '');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'seasons'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
      setSeasonToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Cannot Delete Season',
        description: error.message || 'Failed to delete season.',
        variant: 'destructive',
      });
      setSeasonToDelete(null);
    },
  });

  const deleteLeagueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/leagues/${leagueId}`);
      return response.json();
    },
    onSuccess: () => {
      // Silently delete in background - just invalidate queries and navigate
      queryClient.invalidateQueries({ queryKey: ['/api/leagues/commissioner'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/leagues'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/league-memberships'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
      navigate('/league-list');
    },
    onError: (error: Error) => {
      // Only show error toast if something goes wrong
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete league.',
        variant: 'destructive',
      });
    },
  });

  // The currently-active season (if any) — used by the New Season wizard
  // to ask whether the commissioner wants to close it as part of turnover.
  const activeSeason = React.useMemo(
    () => (Array.isArray(seasons) ? seasons.find((s) => s.isActive) : undefined),
    [seasons],
  );

  // Open the New Season wizard. Skip the "close current season" step when
  // there is no active season to close.
  const openNewSeasonWizard = React.useCallback(() => {
    if (isMobile) {
      setShowDesktopRequiredSeason(true);
      return;
    }
    seasonForm.reset({ name: '', startDate: '', endDate: '' });
    setNotReturningMemberIds(new Set());
    setCloseCurrentSeason(!!activeSeason);
    setNewSeasonStep(activeSeason ? 'close' : 'details');
    setShowResetPlayersConfirm(false);
    setShowCreateSeason(true);
  }, [isMobile, activeSeason, seasonForm]);

  const closeNewSeasonWizard = React.useCallback(() => {
    setShowCreateSeason(false);
    setNewSeasonStep('close');
    setCloseCurrentSeason(true);
    setNotReturningMemberIds(new Set());
    setShowResetPlayersConfirm(false);
    seasonForm.reset({ name: '', startDate: '', endDate: '' });
  }, [seasonForm]);

  // Season transition mutation: closes current season (optionally), creates
  // the new season, removes selected/all players, and clears assignedTeamId
  // for everyone who's returning so they land in Free Agents.
  const seasonTransitionMutation = useMutation({
    mutationFn: async (payload: {
      closeCurrentSeasonId?: string | null;
      season: { name: string; startDate?: string | null; endDate?: string | null };
      resetAllPlayers?: boolean;
      removedMemberIds?: string[];
    }) => {
      const response = await apiRequest(
        'POST',
        `/api/leagues/${leagueId}/seasons/transition`,
        payload,
      );
      return response.json() as Promise<{ season: Season }>;
    },
    onSuccess: (data) => {
      toast({ title: 'Season created successfully' });
      setShowCreateSeason(false);
      setNewSeasonStep('close');
      setCloseCurrentSeason(true);
      setNotReturningMemberIds(new Set());
      setShowResetPlayersConfirm(false);
      seasonForm.reset();
      // Auto-select the brand-new season
      if (data?.season?.id) {
        setSelectedSeasonId(data.season.id);
      }
      refetchSeasons();
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'games'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'standings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/teams'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/leagues'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Creation Failed',
        description: error.message || 'Failed to create season.',
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
          <div className="bg-card rounded-xl hairline elev-rest p-6">
            <h3 className="text-lg font-semibold mb-4">Your Leagues</h3>
            {userLeagues.length === 0 ? (
              <div className="text-center py-8">
                <Trophy className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-6">
                  You haven't created any leagues yet. Create your first league to start managing teams and scheduling games.
                </p>
                <button 
                  onClick={() => {
                    if (isMobile) {
                      setShowDesktopRequiredLeague(true);
                      return;
                    }
                    navigate('/create-league');
                  }}
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
                    className="p-4 bg-background rounded-lg hairline elev-rest hover:border-primary cursor-pointer transition-colors"
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
        <DesktopRequiredDialog
          open={showDesktopRequiredLeague}
          onOpenChange={setShowDesktopRequiredLeague}
          description={DESKTOP_REQUIRED_COPY.league}
        />
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
      <div className="p-6 pl-[20px] pr-[20px] mt-[8px] mb-[8px] pt-[4px] pb-[4px]">
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
            <h1 className="font-bold flex items-center gap-2 text-[18px]" data-testid="text-page-title">
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
            className="px-3 py-1.5 hover:text-primary/80 font-medium text-[16px] text-[#ffffff] bg-[#3c83f6]"
            data-testid="button-edit-league"
          >Settings</button>
        </div>

        {/* Season Selector */}
        {seasons.length > 0 && (
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <select
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className="w-full p-2 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
              onClick={openNewSeasonWizard}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium"
              data-testid="button-create-season"
            >
              <Plus className="w-4 h-4 mr-2 inline" />
              New Season
            </button>
          </div>
        )}

        {/* Create First Season */}
        {seasons.length === 0 && (
          <div className="mb-4 p-4 bg-card hairline elev-rest rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">No seasons yet</h3>
                <p className="text-sm text-muted-foreground">Create your first season to start organizing games and teams.</p>
              </div>
              <button
                onClick={openNewSeasonWizard}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium"
                data-testid="button-create-first-season"
              >
                <Plus className="w-4 h-4 mr-2 inline" />
                Create Season
              </button>
            </div>
          </div>
        )}

        {/* Score Verification Alert */}
        {league && <ScoreVerificationAlert leagueId={league.id} />}

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
            Members
            {pendingMembers.length > 0 && (
              <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">{pendingMembers.length}</span>
              </div>
            )}
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
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBulkImport(!showBulkImport)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                  data-testid="button-import-players"
                >
                  <Upload className="w-3 h-3" />
                  Import Players
                </button>
                <button
                  onClick={() => setShowManualAddPlayer(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                  data-testid="button-add-player-manually"
                >
                  <UserPlus className="w-3 h-3" />
                  Add Manually
                </button>
              </div>
            </div>

            {/* Import Panel */}
            {showBulkImport && (
              <div className="mt-4 p-4 bg-card rounded-lg hairline elev-rest">
                <div className="flex flex-col gap-3">
                  {/* Download Template Button */}
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <p className="text-sm text-muted-foreground">
                      Download the CSV template to import players
                    </p>
                    <a
                      href="/player-import-template.csv"
                      download="player-import-template.csv"
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                      data-testid="button-download-template"
                    >
                      <Download className="w-3 h-3" />
                      Download Template
                    </a>
                  </div>
                  
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors elev-rest"
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
                          Format: Player Full Name, Team, Skill Level, Email, Jersey #, Player Type
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

            {/* Manual Add Player Modal */}
            {showManualAddPlayer && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-card rounded-lg hairline elev-rest p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
                  <h3 className="text-lg font-semibold mb-4">Add Player Manually</h3>
                  
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    manualAddPlayerMutation.mutate(manualPlayerForm);
                  }} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">First Name *</label>
                      <input
                        type="text"
                        value={manualPlayerForm.firstName}
                        onChange={(e) => setManualPlayerForm({...manualPlayerForm, firstName: e.target.value})}
                        className="w-full p-3 bg-background hairline elev-inset rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="First name"
                        required
                        data-testid="input-manual-player-first-name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Last Name *</label>
                      <input
                        type="text"
                        value={manualPlayerForm.lastName}
                        onChange={(e) => setManualPlayerForm({...manualPlayerForm, lastName: e.target.value})}
                        className="w-full p-3 bg-background hairline elev-inset rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Last name"
                        required
                        data-testid="input-manual-player-last-name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Email *</label>
                      <input
                        type="email"
                        value={manualPlayerForm.email}
                        onChange={(e) => setManualPlayerForm({...manualPlayerForm, email: e.target.value})}
                        className="w-full p-3 bg-background hairline elev-inset rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Email address"
                        required
                        data-testid="input-manual-player-email"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Phone Number</label>
                      <input
                        type="tel"
                        value={manualPlayerForm.phoneNumber}
                        onChange={(e) => setManualPlayerForm({...manualPlayerForm, phoneNumber: e.target.value})}
                        className="w-full p-3 bg-background hairline elev-inset rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Phone number (optional)"
                        data-testid="input-manual-player-phone"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Season</label>
                      <select
                        value={manualPlayerForm.seasonId}
                        onChange={(e) => setManualPlayerForm({...manualPlayerForm, seasonId: e.target.value})}
                        disabled={seasonsLoading}
                        className="w-full p-3 bg-background hairline elev-inset rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="select-manual-player-season"
                      >
                        <option value="">
                          {seasonsLoading ? 'Loading seasons...' : 'Select a season (optional)'}
                        </option>
                        {seasons.map((season: Season) => (
                          <option key={season.id} value={season.id}>
                            {season.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Assign to Team</label>
                      <select
                        value={manualPlayerForm.assignedTeamId}
                        onChange={(e) => setManualPlayerForm({...manualPlayerForm, assignedTeamId: e.target.value})}
                        className="w-full p-3 bg-background hairline elev-inset rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        data-testid="select-manual-player-team"
                      >
                        <option value="">No team (optional)</option>
                        {teams.map((team: Team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <button
                        type="submit"
                        disabled={manualAddPlayerMutation.isPending || !manualPlayerForm.firstName || !manualPlayerForm.lastName || !manualPlayerForm.email}
                        className="flex-1 bg-blue-500 text-white px-3 py-2 rounded-md hover:bg-blue-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="button-submit-manual-player"
                      >
                        {manualAddPlayerMutation.isPending ? 'Adding...' : 'Add Player'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowManualAddPlayer(false);
                          setManualPlayerForm({
                            firstName: '',
                            lastName: '',
                            email: '',
                            phoneNumber: '',
                            assignedTeamId: '',
                            seasonId: '',
                          });
                        }}
                        className="px-3 py-2 border border-border rounded-md hover:bg-muted text-sm"
                        data-testid="button-cancel-manual-player"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Pending Approvals */}
            {pendingMembers.length > 0 && (
              <div className="bg-card rounded-xl hairline elev-rest p-6">
                <div className="flex items-center gap-2 mb-4">
                  <UserPlus className="w-5 h-5 text-warning" />
                  <h3 className="text-lg font-semibold">Pending Approval ({pendingMembers.length})</h3>
                </div>
                <div className="space-y-3">
                  {pendingMembers.map((member: LeagueMember) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-background rounded-lg hairline elev-rest">
                      <div className="flex-1" data-testid={`pending-player-${member.user.id}`}>
                        <p className="font-medium">{formatUserName(member.user, member)}</p>
                        {(member as any).message && (
                          <p className="text-sm text-muted-foreground mt-1 italic" data-testid={`pending-player-message-${member.user.id}`}>
                            "{(member as any).message}"
                          </p>
                        )}
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

            {/* Team Join Requests */}
            {teamJoinRequests.length > 0 && (
              <div className="bg-card rounded-xl hairline elev-rest p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-warning" />
                  <h3 className="text-lg font-semibold">Team Join Requests ({teamJoinRequests.length})</h3>
                </div>
                <div className="space-y-3">
                  {teamJoinRequests.map((request: any) => (
                    <div key={request.id} className="p-4 bg-background rounded-lg hairline elev-rest" data-testid={`team-request-${request.id}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="font-semibold text-lg" data-testid={`team-name-${request.id}`}>{request.team.name}</p>
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-500 text-xs rounded-full">
                              {request.team.uniqueTeamId}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              <span>{request.team.memberCount || 0} players</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Crown className="w-4 h-4" />
                              <span>Created by {request.requester.firstName} {request.requester.lastName}</span>
                            </div>
                          </div>
                          {request.message && (
                            <p className="text-sm text-muted-foreground italic mt-2" data-testid={`team-request-message-${request.id}`}>
                              "{request.message}"
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveTeamJoinMutation.mutate(request.id)}
                            disabled={approveTeamJoinMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1 bg-green-500/50 text-white rounded-md text-sm font-medium disabled:opacity-50"
                            data-testid={`button-approve-team-${request.id}`}
                          >
                            <Check className="w-3 h-3" />
                            Approve
                          </button>
                          <button
                            onClick={() => rejectTeamJoinMutation.mutate(request.id)}
                            disabled={rejectTeamJoinMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1 bg-red-500/50 text-white rounded-md text-sm font-medium disabled:opacity-50"
                            data-testid={`button-reject-team-${request.id}`}
                          >
                            <X className="w-3 h-3" />
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approved Members */}
            <div className="bg-card rounded-xl hairline elev-rest p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
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
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search players..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-9 w-full h-9 text-sm"
                  data-testid="input-member-search"
                />
              </div>
              {members.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No approved members yet.</p>
              ) : (
                <div className="space-y-3">
                  {members.filter((member: LeagueMember) => {
                    if (!memberSearch.trim()) return true;
                    const searchLower = memberSearch.toLowerCase().trim();
                    const displayName = formatUserName(member.user, member).toLowerCase();
                    const email = member.user.email?.toLowerCase() || '';
                    const jerseyNum = member.jerseyNumber?.toString() || '';
                    return displayName.includes(searchLower) || email.includes(searchLower) || jerseyNum.includes(searchLower);
                  }).map((member: LeagueMember) => (
                    <div 
                      key={member.id} 
                      className="flex items-center justify-between p-3 bg-background rounded-lg hairline elev-rest hover:bg-card cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedPlayer(member);
                        const assignedTeam = teams.find((team: Team) => team.id === member.assignedTeamId);
                        setPlayerEditForm({
                          assignedTeamId: member.assignedTeamId || '',
                          position: member.position || '',
                          skillLevel: member.skillLevel || '',
                          jerseyNumber: member.jerseyNumber?.toString() || '',
                          notes: member.notes || '',
                          isCaptain: assignedTeam?.captainId === member.userId,
                          isGoalie: member.isGoalie || false,
                          isSkater: member.isSkater ?? true, // Default to true if not set
                          displayFirstName: member.displayFirstName || member.user.firstName || '',
                          displayLastName: member.displayLastName || member.user.lastName || '',
                          timezone: member.user.timezone || 'America/New_York'
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
            <div className="bg-card rounded-xl hairline elev-rest p-6">
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
                <div className="mb-6 p-4 bg-background rounded-lg hairline elev-rest">
                  <form onSubmit={teamForm.handleSubmit((data) => createTeamMutation.mutate(data))} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Team Name</label>
                      <input
                        {...teamForm.register('name')}
                        className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                            className={`flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${
                              team.isFreeAgents ? 'bg-muted/30 border border-dashed' : 'bg-background hairline elev-rest'
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
                                <div className="flex flex-col gap-1">
                                  {(() => {
                                    // Check if user can join the team
                                    const userMembership = members.find(m => m.userId === user?.id);
                                    const isCaptain = team.captainId === user?.id;
                                    const isCommissioner = league.commissionerId === user?.id;
                                    
                                    // User can join if they're captain/commissioner AND either:
                                    // 1. They have no membership yet (haven't joined league), OR
                                    // 2. They have a membership but not assigned to this team
                                    const canJoin = (isCaptain || isCommissioner) && 
                                                   (!userMembership || userMembership.assignedTeamId !== team.id);
                                    
                                    if (canJoin) {
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
                          className="flex items-center justify-between p-3 bg-background rounded-lg hairline elev-rest hover:bg-muted/50 transition-colors"
                          data-testid={`team-player-${member.user.id}`}
                        >
                          <div 
                            className="flex items-center gap-3 flex-1 cursor-pointer"
                            onClick={() => {
                              setSelectedPlayer(member);
                              const assignedTeam = teams.find((team: Team) => team.id === member.assignedTeamId);
                              setPlayerEditForm({
                                assignedTeamId: member.assignedTeamId || '',
                                position: member.position || '',
                                skillLevel: member.skillLevel || '',
                                jerseyNumber: member.jerseyNumber?.toString() || '',
                                notes: member.notes || '',
                                isCaptain: assignedTeam?.captainId === member.userId,
                                isGoalie: member.isGoalie || false,
                                isSkater: member.isSkater ?? true, // Default to true if not set
                                displayFirstName: member.displayFirstName || member.user.firstName || '',
                                displayLastName: member.displayLastName || member.user.lastName || '',
                                timezone: member.user.timezone || 'America/New_York'
                              });
                            }}
                          >
                            {/* Profile Picture */}
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                              {member.user.profileImageUrl ? (
                                <img 
                                  src={getImageUrl(member.user.profileImageUrl) || ''} 
                                  alt={formatUserName(member.user, member)}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-6 h-6 text-muted-foreground" />
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{formatUserName(member.user, member)}</p>
                                {!selectedTeam.isFreeAgents && teamCaptains.includes(member.userId) && (
                                  <span className="px-1.5 py-0.5 bg-warning/20 text-warning rounded text-xs font-bold">C</span>
                                )}
                                {member.isGoalie && (
                                  <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-500 rounded text-xs font-bold">G</span>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <p>Skill: {member.skillLevel || 'null'}</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {/* Position and Jersey on right side */}
                            <div className="text-sm text-muted-foreground text-right">
                              <p>Position: {member.position || 'null'}</p>
                              <p>Jersey: {member.jerseyNumber ? `#${member.jerseyNumber}` : 'null'}</p>
                            </div>
                            
                            {/* Captain Assignment Controls - Allow multiple captains */}
                            {!selectedTeam.isFreeAgents && (() => {
                              const isCaptain = teamCaptains.includes(member.userId);
                              return isCaptain ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeCaptainMutation.mutate({
                                      teamId: selectedTeam.id,
                                      captainUserId: member.userId
                                    });
                                  }}
                                  disabled={removeCaptainMutation.isPending}
                                  className="px-2 py-1 bg-destructive/20 text-destructive rounded text-xs font-medium hover:bg-destructive/30 disabled:opacity-50"
                                  data-testid={`button-remove-captain-${member.user.id}`}
                                >
                                  Remove Captain
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addCaptainMutation.mutate({
                                      teamId: selectedTeam.id,
                                      captainUserId: member.userId
                                    });
                                  }}
                                  disabled={addCaptainMutation.isPending}
                                  className="px-2 py-1 bg-primary/20 text-primary rounded text-xs font-medium hover:bg-primary/30 disabled:opacity-50"
                                  data-testid={`button-set-captain-${member.user.id}`}
                                >
                                  Make Captain
                                </button>
                              );
                            })()}
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
            <div className="bg-card rounded-xl hairline elev-rest p-6 pl-[4px] pr-[4px] pt-[4px] pb-[4px]">
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

                {/* Mobile layout: horizontal buttons, no calendar toggle (list view only) */}
                <div className="md:hidden flex flex-wrap gap-2">
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
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex-1 bg-[#289d14] text-[#ffffff]"
                    data-testid="button-schedule-game"
                  >
                    <Plus className="w-4 h-4" />
                    Schedule Game
                  </button>
                  {games.length > 0 && (
                    <button
                      onClick={() => setShowDeleteAllGamesDialog(true)}
                      className="flex items-center justify-center gap-2 px-3 py-2 hover:bg-red-500/20 rounded-md text-sm font-medium transition-colors flex-1 text-[#ffffff] bg-[#860405]"
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
                <div className="mb-6 p-4 bg-background rounded-lg hairline elev-rest">
                  <form onSubmit={gameForm.handleSubmit((data) => createGameMutation.mutate(data))} className="space-y-4">
                    {/* Game/Scrimmage Toggle */}
                    <div className="flex gap-2 p-1 bg-muted rounded-lg">
                      <button
                        type="button"
                        onClick={() => gameForm.setValue('isScrimmage', false)}
                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                          !gameForm.watch('isScrimmage')
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        data-testid="button-game-type"
                      >
                        Game
                        <span className="block text-xs font-normal opacity-70">Counts for standings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => gameForm.setValue('isScrimmage', true)}
                        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                          gameForm.watch('isScrimmage')
                            ? 'bg-orange-500 text-white shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        data-testid="button-scrimmage-type"
                      >
                        Scrimmage
                        <span className="block text-xs font-normal opacity-70">No stats/standings</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Home Team</label>
                        <select
                          {...gameForm.register('homeTeamId')}
                          className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          data-testid="select-home-team"
                        >
                          <option value="">Select home team</option>
                          {teams.map((team: Team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Away Team
                          {gameForm.watch('isScrimmage') && (
                            <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                          )}
                        </label>
                        <select
                          {...gameForm.register('awayTeamId')}
                          className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          data-testid="select-away-team"
                        >
                          {gameForm.watch('isScrimmage') ? (
                            <option value="">No opponent (single team)</option>
                          ) : (
                            <option value="">Select away team</option>
                          )}
                          {teams.map((team: Team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Game Date & Time
                        <span className="text-muted-foreground font-normal ml-2">
                          ({TIMEZONES.find(tz => tz.value === ((league as any)?.timezone || 'America/New_York'))?.label || 'Eastern Time (ET)'})
                        </span>
                      </label>
                      <input
                        {...gameForm.register('scheduledAt')}
                        type="datetime-local"
                        className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        data-testid="input-game-time"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Venue (optional)</label>
                      <input
                        {...gameForm.register('venue')}
                        className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                        {createGameMutation.isPending ? 'Scheduling...' : (gameForm.watch('isScrimmage') ? 'Schedule Scrimmage' : 'Schedule Game')}
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
                <div className="mb-6 p-4 bg-card rounded-lg hairline elev-rest">
                  <div className="flex flex-col gap-3">
                    {/* Download Template Button */}
                    <div className="flex items-center justify-between pb-2 border-b border-border">
                      <p className="text-sm text-muted-foreground">
                        Download the CSV template to import schedules
                      </p>
                      <a
                        href="/schedule-import-template.csv"
                        download="schedule-import-template.csv"
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
                        data-testid="button-download-schedule-template"
                      >
                        <Download className="w-3 h-3" />
                        Download Template
                      </a>
                    </div>
                    
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors elev-rest"
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
                  {/* Desktop: Show calendar view if selected, otherwise table view */}
                  <div className="hidden md:block">
                    {gamesViewMode === 'calendar' ? (
                      <GamesCalendar games={games} teams={teams} onGameClick={(game) => {
                        setSelectedGame(game);
                        setShowEditGame(true);
                      }} />
                    ) : (
                      <div ref={gamesListDesktopRef} className="max-h-[600px] overflow-y-auto border rounded-lg">
                        <table className="w-full">
                          <thead className="bg-muted/50 sticky top-0 z-10">
                            <tr>
                              <th className="text-left p-3 text-sm font-semibold">Date & Time</th>
                              <th className="text-left p-3 text-sm font-semibold">Home Team</th>
                              <th className="text-center p-3 text-sm font-semibold">Score</th>
                              <th className="text-left p-3 text-sm font-semibold">Away Team</th>
                              <th className="text-left p-3 text-sm font-semibold">Venue</th>
                              <th className="text-center p-3 text-sm font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              // Sort games by date (chronological order)
                              const sortedGames = [...games].sort((a, b) => {
                                const dateA = new Date(a.scheduledAt);
                                const dateB = new Date(b.scheduledAt);
                                return dateA.getTime() - dateB.getTime();
                              });
                              
                              return sortedGames.map((game: any) => {
                                const homeTeam = teams.find((t: Team) => t.id === game.homeTeamId);
                                const awayTeam = teams.find((t: Team) => t.id === game.awayTeamId);
                                const gameDate = new Date(game.scheduledAt);
                                const hasScore = typeof game.homeScore === 'number' && typeof game.awayScore === 'number';
                                
                                return (
                                  <tr 
                                    key={game.id}
                                    className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                                    onClick={() => {
                                      setSelectedGame(game);
                                      setShowEditGame(true);
                                    }}
                                    data-testid={`game-${game.id}`}
                                    data-game-id={game.id}
                                  >
                                    <td className="p-3 text-sm">
                                      <div>{gameDate.toLocaleDateString()}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </div>
                                    </td>
                                    <td className="p-3">
                                      <div className="flex items-center gap-2">
                                        {homeTeam?.logoUrl ? (
                                          <img 
                                            src={getImageUrl(homeTeam.logoUrl) || ''} 
                                            alt={`${homeTeam.name} logo`}
                                            className="w-8 h-8 rounded object-cover bg-transparent"
                                            data-testid={`img-home-team-logo-${game.id}`}
                                          />
                                        ) : (
                                          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                                            <Trophy className="w-4 h-4 text-primary-foreground" />
                                          </div>
                                        )}
                                        <span className="font-medium text-sm">{homeTeam?.name || 'Unknown'}</span>
                                      </div>
                                    </td>
                                    <td className="p-3 text-center">
                                      {hasScore ? (
                                        <span className="font-bold text-lg">{game.homeScore} - {game.awayScore}</span>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                      )}
                                    </td>
                                    <td className="p-3">
                                      {awayTeam ? (
                                        <div className="flex items-center gap-2">
                                          {awayTeam.logoUrl ? (
                                            <img 
                                              src={getImageUrl(awayTeam.logoUrl) || ''} 
                                              alt={`${awayTeam.name} logo`}
                                              className="w-8 h-8 rounded object-cover bg-transparent"
                                              data-testid={`img-away-team-logo-${game.id}`}
                                            />
                                          ) : (
                                            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                                              <Trophy className="w-4 h-4 text-primary-foreground" />
                                            </div>
                                          )}
                                          <span className="font-medium text-sm">{awayTeam.name}</span>
                                        </div>
                                      ) : (
                                        <span className="text-sm text-muted-foreground italic">Practice</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-sm text-muted-foreground">
                                      {game.venue || '-'}
                                    </td>
                                    <td className="p-3 text-center">
                                      <div className="flex flex-col items-center gap-1">
                                        {game.isScrimmage && (
                                          <span className="text-xs bg-orange-100/50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 px-2 py-0.5 rounded-full font-medium">
                                            SCRIMMAGE
                                          </span>
                                        )}
                                        <span className={`text-xs px-2 py-1 rounded-full ${
                                          game.isScrimmage 
                                            ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400'
                                            : 'bg-blue-100/50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                                        }`}>
                                          {game.status || 'SCHEDULED'}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Mobile: Always show list view with scrolling and sorting */}
                  <div className="md:hidden">
                    <div ref={gamesListMobileRef} className="max-h-[600px] overflow-y-auto space-y-3 border rounded-lg p-2">
                      {(() => {
                        // Sort games by date (chronological order)
                        const sortedGames = [...games].sort((a, b) => {
                          const dateA = new Date(a.scheduledAt);
                          const dateB = new Date(b.scheduledAt);
                          return dateA.getTime() - dateB.getTime();
                        });
                        
                        return sortedGames.map((game: any) => {
                          const homeTeam = teams.find((t: Team) => t.id === game.homeTeamId);
                          const awayTeam = teams.find((t: Team) => t.id === game.awayTeamId);
                          const gameDate = new Date(game.scheduledAt);
                          const hasScore = typeof game.homeScore === 'number' && typeof game.awayScore === 'number';
                          
                          return (
                            <div 
                              key={game.id} 
                              className={`p-3 bg-background rounded-lg cursor-pointer hover:bg-muted/50 transition-colors elev-rest ${
                                game.isScrimmage 
                                  ? 'border-2 border-orange-500 dark:border-orange-400' 
                                  : 'hairline'
                              }`}
                              onClick={() => {
                                setSelectedGame(game);
                                setShowEditGame(true);
                              }}
                              data-testid={`game-${game.id}`}
                              data-game-id={game.id}
                            >
                              {/* Scrimmage Badge */}
                              {game.isScrimmage && (
                                <div className="flex justify-center mb-2">
                                  <span className="text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300 px-3 py-1 rounded-full font-medium">
                                    SCRIMMAGE
                                  </span>
                                </div>
                              )}
                              {/* Team Matchup */}
                              <div className="flex items-center justify-between">
                                {/* Home Team */}
                                <div className="flex flex-col items-center flex-1">
                                  <div className={`w-14 h-14 rounded-lg flex items-center justify-center mb-1.5 ${homeTeam?.logoUrl ? 'bg-transparent' : 'bg-primary'}`}>
                                    {homeTeam?.logoUrl ? (
                                      <img 
                                        src={getImageUrl(homeTeam.logoUrl) || ''} 
                                        alt={`${homeTeam.name} logo`}
                                        className="w-full h-full rounded-lg object-cover bg-transparent"
                                        data-testid={`img-home-team-logo-${game.id}`}
                                      />
                                    ) : (
                                      <Trophy className="w-7 h-7 text-primary-foreground" />
                                    )}
                                  </div>
                                  <p className="font-semibold text-center text-xs">{homeTeam?.name || 'Unknown'}</p>
                                  <p className="text-xs text-muted-foreground">HOME</p>
                                  {hasScore && (
                                    <p className="text-sm font-bold mt-1">{game.homeScore}</p>
                                  )}
                                </div>

                                {/* Date & Time */}
                                <div className="px-3 flex flex-col items-center justify-center">
                                  <p className="text-xs font-semibold text-center">{gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                                  <p className="text-xs text-muted-foreground">{gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  {!hasScore && (
                                    <p className="text-xs text-muted-foreground mt-1">-</p>
                                  )}
                                </div>

                                {/* Away Team */}
                                <div className="flex flex-col items-center flex-1">
                                  {awayTeam ? (
                                    <>
                                      <div className={`w-14 h-14 rounded-lg flex items-center justify-center mb-1.5 ${awayTeam.logoUrl ? 'bg-transparent' : 'bg-primary'}`}>
                                        {awayTeam.logoUrl ? (
                                          <img 
                                            src={getImageUrl(awayTeam.logoUrl) || ''} 
                                            alt={`${awayTeam.name} logo`}
                                            className="w-full h-full rounded-lg object-cover bg-transparent"
                                            data-testid={`img-away-team-logo-${game.id}`}
                                          />
                                        ) : (
                                          <Trophy className="w-7 h-7 text-primary-foreground" />
                                        )}
                                      </div>
                                      <p className="font-semibold text-center text-xs">{awayTeam.name}</p>
                                      <p className="text-xs text-muted-foreground">AWAY</p>
                                      {hasScore && (
                                        <p className="text-sm font-bold mt-1">{game.awayScore}</p>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center mb-1.5">
                                        <span className="text-2xl">🏃</span>
                                      </div>
                                      <p className="text-center text-xs text-muted-foreground italic">Practice</p>
                                    </>
                                  )}
                                </div>
                              </div>
                              {/* Venue (if present) */}
                              {game.venue && (
                                <div className="text-center text-xs text-muted-foreground mt-2 pt-2 border-t">
                                  📍 {game.venue}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
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
          <div className="bg-background rounded-xl hairline elev-inset w-full max-w-md max-h-[90vh] overflow-y-auto">
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
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                      className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                      className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter last name"
                      data-testid="input-last-name"
                    />
                  </div>
                </div>

                {/* Player Role Selection */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium mb-2">Player Role</label>
                  
                  {/* Skater */}
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="skater-checkbox"
                      checked={playerEditForm.isSkater}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // When selecting Skater, deselect Goalie
                          setPlayerEditForm(prev => ({ ...prev, isSkater: true, isGoalie: false }));
                        }
                      }}
                      className="h-4 w-4 text-primary border-border rounded focus:ring-primary"
                      data-testid="checkbox-skater"
                    />
                    <label htmlFor="skater-checkbox" className="text-sm font-medium">
                      Skater
                    </label>
                  </div>

                  {/* Goalie */}
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="goalie-checkbox"
                      checked={playerEditForm.isGoalie}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // When selecting Goalie, deselect Skater
                          setPlayerEditForm(prev => ({ ...prev, isGoalie: true, isSkater: false }));
                        }
                      }}
                      className="h-4 w-4 text-primary border-border rounded focus:ring-primary"
                      data-testid="checkbox-goalie"
                    />
                    <label htmlFor="goalie-checkbox" className="text-sm font-medium">
                      Goalie
                    </label>
                  </div>

                  {/* Captain Status (can be combined with Skater or Goalie) */}
                  <div className="flex items-center space-x-3 pt-2 border-t border-border">
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
                </div>

                {/* Position */}
                <div>
                  <label className="block text-sm font-medium mb-2">Position</label>
                  <input
                    type="text"
                    value={playerEditForm.position}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, position: e.target.value }))}
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Forward, Defense, Goalie"
                  />
                </div>

                {/* Skill Level */}
                <div>
                  <label className="block text-sm font-medium mb-2">Skill Level (Optional)</label>
                  <input
                    type="text"
                    value={playerEditForm.skillLevel}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, skillLevel: e.target.value }))}
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., 1-10, A-E, Beginner"
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
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Add notes about this player..."
                  />
                </div>

                {/* Timezone */}
                <div>
                  <label className="block text-sm font-medium mb-2">Timezone</label>
                  <select
                    value={playerEditForm.timezone}
                    onChange={(e) => setPlayerEditForm(prev => ({ ...prev, timezone: e.target.value }))}
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="select-player-timezone"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3 mt-6">
                {/* Action Buttons */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => {
                      if (!user) {
                        toast({
                          title: "Sign in required",
                          description: "Please sign in to send messages",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (selectedPlayer.userId === user.id) {
                        toast({
                          title: "Cannot message yourself",
                          description: "You cannot start a conversation with yourself",
                          variant: "destructive",
                        });
                        return;
                      }
                      const isPlaceholder = selectedPlayer.user?.email?.includes('@placeholder.roster') || 
                        selectedPlayer.user?.id?.startsWith('placeholder-');
                      if (isPlaceholder) {
                        toast({
                          title: "Cannot message this player",
                          description: "This is a placeholder player without a real account. Replace them with a registered user first to enable messaging.",
                          variant: "destructive",
                        });
                        return;
                      }
                      createDirectMessageMutation.mutate(selectedPlayer.userId);
                    }}
                    disabled={createDirectMessageMutation.isPending}
                    className="px-4 py-2 bg-blue-500/50 text-white rounded-lg hover:bg-blue-600/50 text-sm font-medium disabled:opacity-50"
                  >
                    {createDirectMessageMutation.isPending ? 'Opening...' : 'Message Player'}
                  </button>
                  <button
                    onClick={() => {
                      const updates = {
                        assignedTeamId: playerEditForm.assignedTeamId || null,
                        position: playerEditForm.position,
                        skillLevel: playerEditForm.skillLevel?.trim() || null,
                        jerseyNumber: playerEditForm.jerseyNumber ? parseInt(playerEditForm.jerseyNumber) : null,
                        notes: playerEditForm.notes,
                        isGoalie: playerEditForm.isGoalie,
                        isSkater: playerEditForm.isSkater,
                        displayFirstName: playerEditForm.displayFirstName?.trim() || null,
                        displayLastName: playerEditForm.displayLastName?.trim() || null,
                        timezone: playerEditForm.timezone
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
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium disabled:opacity-50"
                  >
                    {updatePlayerMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>

                {/* Replace Player (Commissioner Only) */}
                {league?.commissionerId === user?.id && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Replace Player</h4>
                    <p className="text-xs text-muted-foreground">
                      Replace this placeholder player with a registered user (keeps team assignment)
                    </p>
                    <button
                      onClick={() => {
                        setSelectedPlayerToReplace(selectedPlayer);
                        setShowReplacePlayerModal(true);
                        setSelectedPlayer(null); // Close player modal
                      }}
                      className="w-full px-4 py-2 bg-blue-500/50 text-white rounded-lg hover:bg-blue-600/50 text-sm font-medium"
                      data-testid={`button-replace-${selectedPlayer.user.id}`}
                    >
                      <Users className="w-4 h-4 inline mr-2" />
                      Replace with User
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
                    onClick={async () => {
                      const isPlaceholder = selectedPlayer.user?.email?.includes('@placeholder.roster') || 
                        selectedPlayer.user?.id?.startsWith('placeholder-');
                      
                      if (isPlaceholder) {
                        // Check if placeholder has stats before deleting
                        setIsCheckingPlayerStats(true);
                        try {
                          const response = await apiRequest('GET', `/api/leagues/${leagueId}/stats/players/${selectedPlayer.userId}`);
                          const stats = await response.json();
                          
                          const hasStats = stats && (
                            (stats.gamesPlayed || 0) > 0 || 
                            (stats.goals || 0) > 0 || 
                            (stats.assists || 0) > 0
                          );
                          
                          if (hasStats) {
                            // Show special dialog for placeholder with stats
                            setPlayerToDeleteWithStats(selectedPlayer);
                            setShowDeletePlaceholderWithStatsDialog(true);
                            setSelectedPlayer(null);
                          } else {
                            // No stats, normal deletion
                            if (confirm('Are you sure you want to remove this placeholder player from the league? This cannot be undone.')) {
                              removeFromLeagueMutation.mutate(selectedPlayer.id);
                            }
                          }
                        } catch (error) {
                          console.error('Error checking stats:', error);
                          // Fallback to normal confirmation
                          if (confirm('Are you sure you want to remove this player from the league entirely? This cannot be undone.')) {
                            removeFromLeagueMutation.mutate(selectedPlayer.id);
                          }
                        } finally {
                          setIsCheckingPlayerStats(false);
                        }
                      } else {
                        // Regular user, just confirm
                        if (confirm('Are you sure you want to remove this player from the league entirely? This cannot be undone.')) {
                          removeFromLeagueMutation.mutate(selectedPlayer.id);
                        }
                      }
                    }}
                    disabled={isCheckingPlayerStats}
                    className="w-full px-4 py-2 bg-red-500/50 text-white rounded-lg hover:bg-red-600/50 text-sm font-medium disabled:opacity-50"
                  >
                    {isCheckingPlayerStats ? 'Checking...' : 'Remove from League'}
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
          <div className="bg-background rounded-xl hairline elev-inset max-w-md w-full max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-6 pt-6 pb-4 flex-shrink-0 flex items-center justify-between">
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
                className="flex flex-col flex-1 min-h-0"
              >
              <div className="px-6 overflow-y-auto flex-1 space-y-4 pb-4">
                {/* League Name */}
                <div>
                  <label className="block text-sm font-medium mb-2">League Name</label>
                  <input
                    {...editLeagueForm.register('name')}
                    type="text"
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="Describe your league..."
                    data-testid="input-league-description"
                  />
                </div>

                {/* Facility Link */}
                <div>
                  <label className="block text-sm font-medium mb-2">Facility</label>
                  {/* Hidden input to register facilityId with the form */}
                  <input
                    type="hidden"
                    {...editLeagueForm.register('facilityId')}
                  />
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                      {!selectedFacility ? (
                        <div className="relative">
                          <input
                            type="text"
                            value={facilitySearch}
                            onChange={(e) => setFacilitySearch(e.target.value)}
                            placeholder="Search for a facility..."
                            className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            data-testid="input-facility-search"
                          />
                          {facilitySearch && facilities.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-card hairline elev-lift rounded-lg max-h-60 overflow-y-auto" data-testid="facility-search-results">
                              {facilities.map((facility: any) => (
                                <button
                                  key={facility.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedFacility(facility);
                                    editLeagueForm.setValue('facilityId', facility.id);
                                    setFacilitySearch('');
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-0"
                                  data-testid={`facility-result-${facility.id}`}
                                >
                                  <div className="font-medium">{facility.name}</div>
                                  {(facility.city || facility.state) && (
                                    <div className="text-sm text-muted-foreground">
                                      {facility.city}{facility.city && facility.state ? ', ' : ''}{facility.state}
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-3 bg-muted hairline elev-rest rounded-lg" data-testid="selected-facility">
                          <div>
                            <div className="font-medium" data-testid="text-facility-name">{selectedFacility.name}</div>
                            {(selectedFacility.city || selectedFacility.state) && (
                              <div className="text-sm text-muted-foreground" data-testid="text-facility-location">
                                {selectedFacility.city}{selectedFacility.city && selectedFacility.state ? ', ' : ''}{selectedFacility.state}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFacility(null);
                              editLeagueForm.setValue('facilityId', '');
                            }}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid="button-clear-facility"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateFacility(true)}
                      className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium whitespace-nowrap"
                      data-testid="button-add-facility"
                    >
                      <Plus className="w-4 h-4 inline mr-1" />
                      Add New
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Link this league to a facility where games are played
                  </p>
                </div>

                {/* Season */}
                <div>
                  <label className="block text-sm font-medium mb-2">Season</label>
                  <input
                    {...editLeagueForm.register('season')}
                    type="text"
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Spring 2024"
                    data-testid="input-league-season"
                  />
                </div>

                {/* Timezone */}
                <div>
                  <label className="block text-sm font-medium mb-2">Timezone</label>
                  <Controller
                    name="timezone"
                    control={editLeagueForm.control}
                    render={({ field }) => (
                      <Select
                        value={field.value || 'America/New_York'}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="w-full" data-testid="select-league-timezone">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This timezone will be used for all game schedules and notifications
                  </p>
                </div>

                {/* Sub Approval Workflow */}
                <div>
                  <label className="block text-sm font-medium mb-2">How Are Subs Approved?</label>
                  <p className="text-xs text-muted-foreground mb-3">
                    This controls who must approve a substitution request after the substitute player confirms availability.
                  </p>
                  <Controller
                    name="subApprovalWorkflow"
                    control={editLeagueForm.control}
                    render={({ field }) => (
                      <div className="space-y-2">
                        {subApprovalWorkflowOptions.map((option) => (
                          <label
                            key={option.value}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              field.value === option.value
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            }`}
                            data-testid={`radio-sub-approval-${option.value}`}
                          >
                            <input
                              type="radio"
                              value={option.value}
                              checked={field.value === option.value}
                              onChange={() => field.onChange(option.value)}
                              className="accent-primary"
                            />
                            <span className="text-sm">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  />
                </div>

                {/* Active Status */}
                <div className="hairline elev-rest rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">League Status</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Inactive leagues are hidden from players but remain editable by commissioners.
                      </p>
                    </div>
                    <Controller
                      control={editLeagueForm.control}
                      name="isActive"
                      render={({ field }) => (
                        <div className="flex bg-muted rounded-lg p-1 gap-1 shrink-0" data-testid="toggle-league-active">
                          <button
                            type="button"
                            onClick={() => field.onChange(true)}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                              field.value
                                ? 'bg-green-500 text-white shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Active
                          </button>
                          <button
                            type="button"
                            onClick={() => field.onChange(false)}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                              !field.value
                                ? 'bg-yellow-500 text-white shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Inactive
                          </button>
                        </div>
                      )}
                    />
                  </div>
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
                      className="flex-1 p-2 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium disabled:opacity-50"
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
                      className="flex-1 p-2 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium disabled:opacity-50"
                      data-testid="button-add-admin"
                    >
                      {addAdminMutation.isPending ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>

                {/* Stat Manager Management */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Scorekeepers</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Invite scorekeepers by email. They can edit game statistics and scores. Users must have an account first.
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
                      placeholder="Enter scorekeeper's email"
                      className="flex-1 p-2 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
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
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium disabled:opacity-50"
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
                      className="flex-1 p-2 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
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

                {/* Manage Seasons */}
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium mb-2">Seasons</label>
                  {seasons.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-seasons">
                      No seasons yet.
                    </p>
                  ) : (
                    <div className="space-y-2" data-testid="list-seasons">
                      {seasons.map((season) => (
                        <div
                          key={season.id}
                          className="flex items-center justify-between gap-2 p-3 bg-card hairline elev-rest rounded-lg"
                          data-testid={`season-row-${season.id}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {season.name}
                              {season.isActive && (
                                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  Active
                                </span>
                              )}
                            </div>
                            {(season.startDate || season.endDate) && (
                              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                {season.startDate ? format(new Date(season.startDate), 'MMM d, yyyy') : '—'}
                                {' – '}
                                {season.endDate ? format(new Date(season.endDate), 'MMM d, yyyy') : '—'}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSeasonToDelete(season);
                            }}
                            disabled={deleteSeasonMutation.isPending}
                            className="px-3 py-1.5 bg-red-500/50 text-white rounded-lg hover:bg-red-600/50 text-xs font-medium disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
                            data-testid={`button-delete-season-${season.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Seasons that still contain games, teams, tournaments, or stats can't be deleted — remove those first.
                  </p>
                </div>

                {/* Delete League Button */}
                <div className="border-t pt-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      alert(`Deleting league: ${league?.name} (ID: ${leagueId})`);
                      console.log('[DeleteLeague] Button clicked, leagueId:', leagueId, 'league:', league?.name);
                      const confirmed = confirm(`Are you sure you want to delete the league "${league?.name}"? This action cannot be undone and will remove all associated teams, games, and data.`);
                      console.log('[DeleteLeague] Confirm result:', confirmed);
                      if (confirmed) {
                        alert('About to call mutation.mutate()!');
                        console.log('[DeleteLeague] User confirmed, calling mutation...');
                        try {
                          deleteLeagueMutation.mutate();
                          alert('Mutation called successfully!');
                        } catch (err: any) {
                          alert('Mutation threw error: ' + err?.message);
                        }
                      }
                    }}
                    disabled={deleteLeagueMutation.isPending}
                    className="w-full px-4 py-2 bg-red-500/50 text-white rounded-lg hover:bg-red-600/50 text-sm font-medium disabled:opacity-50"
                    data-testid="button-delete-league"
                  >
                    {deleteLeagueMutation.isPending ? 'Deleting...' : 'Delete League'}
                  </button>
                </div>

              </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 px-6 py-4 border-t border-border flex-shrink-0">
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
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium disabled:opacity-50"
                    data-testid="button-save-league-changes"
                  >
                    {updateLeagueMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
          </div>
        </div>
      )}
      {/* Create Season Modal */}
      {showCreateSeason && (() => {
        const stepOrder: NewSeasonStep[] = activeSeason
          ? ['close', 'details', 'players']
          : ['details', 'players'];
        const stepIndex = stepOrder.indexOf(newSeasonStep);
        const totalSteps = stepOrder.length;
        const goPrev = () => {
          if (stepIndex > 0) setNewSeasonStep(stepOrder[stepIndex - 1]);
        };
        const goNext = () => {
          if (stepIndex < totalSteps - 1) setNewSeasonStep(stepOrder[stepIndex + 1]);
        };

        const handleDetailsContinue = seasonForm.handleSubmit(() => {
          goNext();
        });

        const submitTransition = (resetAllPlayers: boolean) => {
          const data = seasonForm.getValues();
          seasonTransitionMutation.mutate({
            closeCurrentSeasonId:
              activeSeason && closeCurrentSeason ? activeSeason.id : null,
            season: {
              name: data.name,
              startDate: data.startDate || null,
              endDate: data.endDate || null,
            },
            resetAllPlayers,
            removedMemberIds: resetAllPlayers
              ? []
              : Array.from(notReturningMemberIds),
          });
        };

        const sortedMembers = [...(members as LeagueMember[])].sort((a, b) => {
          const an = (a.displayFirstName || a.user?.firstName || a.user?.displayName || a.user?.email || '').toLowerCase();
          const bn = (b.displayFirstName || b.user?.firstName || b.user?.displayName || b.user?.email || '').toLowerCase();
          return an.localeCompare(bn);
        });

        const returningCount =
          sortedMembers.length - notReturningMemberIds.size;

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-xl hairline elev-inset max-w-2xl w-full max-h-[85vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold">New Season</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Step {stepIndex + 1} of {totalSteps}
                      {newSeasonStep === 'close' && ' · Close current season'}
                      {newSeasonStep === 'details' && ' · Season details'}
                      {newSeasonStep === 'players' && ' · Returning players'}
                    </p>
                  </div>
                  <button
                    onClick={closeNewSeasonWizard}
                    className="text-muted-foreground hover:text-foreground p-1"
                    data-testid="button-close-create-season"
                    disabled={seasonTransitionMutation.isPending}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-6">
                  {stepOrder.map((s, i) => (
                    <div
                      key={s}
                      className={`h-1.5 flex-1 rounded-full ${
                        i <= stepIndex ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>

                {/* STEP: close current season */}
                {newSeasonStep === 'close' && activeSeason && (
                  <div className="space-y-4">
                    <div className="p-4 bg-card hairline elev-rest rounded-lg">
                      <h3 className="font-medium mb-1">Close current season?</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        <span className="font-medium text-foreground">
                          {activeSeason.name}
                        </span>{' '}
                        is currently active. Would you like to close it before
                        starting the new one?
                      </p>
                      <div className="space-y-2">
                        <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
                          <input
                            type="radio"
                            name="close-season-choice"
                            checked={closeCurrentSeason}
                            onChange={() => setCloseCurrentSeason(true)}
                            className="mt-1"
                            data-testid="radio-close-current-season-yes"
                          />
                          <div>
                            <div className="text-sm font-medium">
                              Yes, close {activeSeason.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              The season is marked inactive. Its games, teams,
                              and standings stay intact for history.
                            </div>
                          </div>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
                          <input
                            type="radio"
                            name="close-season-choice"
                            checked={!closeCurrentSeason}
                            onChange={() => setCloseCurrentSeason(false)}
                            className="mt-1"
                            data-testid="radio-close-current-season-no"
                          />
                          <div>
                            <div className="text-sm font-medium">
                              No, keep it active
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Both seasons will be marked active. You can close
                              the old season later from the season dropdown.
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={closeNewSeasonWizard}
                        className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                        data-testid="button-cancel-create-season"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium"
                        data-testid="button-wizard-next-close"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: season details */}
                {newSeasonStep === 'details' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleDetailsContinue();
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-sm font-medium mb-2">Season Name</label>
                      <input
                        {...seasonForm.register('name')}
                        type="text"
                        className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="e.g., Spring 2024, Fall League 2023"
                        data-testid="input-season-name"
                      />
                      {seasonForm.formState.errors.name && (
                        <p className="text-red-500/50 text-sm mt-1">
                          {seasonForm.formState.errors.name.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Start Date (Optional)</label>
                      <input
                        {...seasonForm.register('startDate')}
                        type="date"
                        className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        data-testid="input-season-start-date"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">End Date (Optional)</label>
                      <input
                        {...seasonForm.register('endDate')}
                        type="date"
                        className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        data-testid="input-season-end-date"
                      />
                    </div>

                    <div className="text-xs text-muted-foreground p-3 bg-muted/40 rounded-lg">
                      The new season starts with an empty schedule and no
                      teams. You'll choose which players carry over on the next
                      step.
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={activeSeason ? goPrev : closeNewSeasonWizard}
                        className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                        data-testid="button-wizard-back-details"
                      >
                        {activeSeason ? 'Back' : 'Cancel'}
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium"
                        data-testid="button-wizard-next-details"
                      >
                        Continue
                      </button>
                    </div>
                  </form>
                )}

                {/* STEP: not returning players */}
                {newSeasonStep === 'players' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-1">Who's not returning?</h3>
                      <p className="text-sm text-muted-foreground">
                        Check the box next to anyone who isn't coming back this
                        season — they'll be removed from the league. Everyone
                        else returns and moves to Free Agents until you put
                        them on a team.
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground" data-testid="text-returning-count">
                        {returningCount} returning · {notReturningMemberIds.size} not returning
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setNotReturningMemberIds(new Set())}
                          className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                          data-testid="button-mark-all-returning"
                        >
                          Clear all
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setNotReturningMemberIds(
                              new Set(sortedMembers.map((m) => m.id)),
                            )
                          }
                          className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                          data-testid="button-mark-none-returning"
                        >
                          Select all
                        </button>
                      </div>
                    </div>

                    <div className="border border-border rounded-lg max-h-72 overflow-y-auto divide-y divide-border">
                      {sortedMembers.length === 0 && (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No players in this league yet.
                        </div>
                      )}
                      {sortedMembers.map((m) => {
                        const notReturning = notReturningMemberIds.has(m.id);
                        const first = m.displayFirstName || m.user?.firstName || '';
                        const last = m.displayLastName || m.user?.lastName || '';
                        const name =
                          (first + ' ' + last).trim() ||
                          m.user?.displayName ||
                          m.user?.email ||
                          'Player';
                        return (
                          <label
                            key={m.id}
                            className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40"
                            data-testid={`row-returning-member-${m.id}`}
                          >
                            <input
                              type="checkbox"
                              checked={notReturning}
                              onChange={(e) => {
                                setNotReturningMemberIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(m.id);
                                  else next.delete(m.id);
                                  return next;
                                });
                              }}
                              className="rounded border-border focus:ring-primary"
                              data-testid={`checkbox-returning-member-${m.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-medium truncate ${notReturning ? 'line-through text-muted-foreground' : ''}`}>
                                {name}
                              </div>
                              {m.user?.email && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {m.user.email}
                                </div>
                              )}
                            </div>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                notReturning
                                  ? 'bg-muted text-muted-foreground'
                                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              }`}
                            >
                              {notReturning ? 'Not returning' : 'Returning'}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={goPrev}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                        data-testid="button-wizard-back-players"
                        disabled={seasonTransitionMutation.isPending}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowResetPlayersConfirm(true)}
                        className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted"
                        data-testid="button-skip-reset-players"
                        disabled={seasonTransitionMutation.isPending || sortedMembers.length === 0}
                      >
                        Skip & Reset Player List
                      </button>
                      <button
                        type="button"
                        onClick={() => submitTransition(false)}
                        disabled={seasonTransitionMutation.isPending}
                        className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium disabled:opacity-50"
                        data-testid="button-create-season-submit"
                      >
                        {seasonTransitionMutation.isPending
                          ? 'Creating...'
                          : 'Create Season'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Reset confirm dialog */}
            {showResetPlayersConfirm && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                <div className="bg-background rounded-xl hairline elev-inset max-w-sm w-full p-6 space-y-4">
                  <h3 className="text-lg font-bold">Reset entire player list?</h3>
                  <p className="text-sm text-muted-foreground">
                    This will remove every player from the league as part of
                    creating the new season. They'll need to rejoin or be
                    re-invited. This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowResetPlayersConfirm(false)}
                      className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                      data-testid="button-cancel-reset-players"
                      disabled={seasonTransitionMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowResetPlayersConfirm(false);
                        submitTransition(true);
                      }}
                      disabled={seasonTransitionMutation.isPending}
                      className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                      data-testid="button-confirm-reset-players"
                    >
                      {seasonTransitionMutation.isPending
                        ? 'Resetting...'
                        : 'Reset & Create'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
      {/* Create Facility Modal */}
      {showCreateFacility && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl hairline elev-inset max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Create New Facility</h2>
                <button
                  onClick={() => {
                    setShowCreateFacility(false);
                    createFacilityForm.reset();
                  }}
                  className="text-muted-foreground hover:text-foreground p-1"
                  data-testid="button-close-create-facility"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={createFacilityForm.handleSubmit((data) => {
                  createFacilityMutation.mutate(data);
                })}
                className="space-y-4"
              >
                {/* Facility Name */}
                <div>
                  <label className="block text-sm font-medium mb-2">Facility Name *</label>
                  <input
                    {...createFacilityForm.register('name')}
                    type="text"
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Downtown Ice Arena"
                    data-testid="input-facility-name"
                  />
                  {createFacilityForm.formState.errors.name && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {createFacilityForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium mb-2">Address</label>
                  <input
                    {...createFacilityForm.register('address')}
                    type="text"
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., 123 Main Street"
                    data-testid="input-facility-address"
                  />
                </div>

                {/* City, State, Zip Code */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">City</label>
                    <input
                      {...createFacilityForm.register('city')}
                      type="text"
                      className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="City"
                      data-testid="input-facility-city"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">State</label>
                    <input
                      {...createFacilityForm.register('state')}
                      type="text"
                      className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="State"
                      data-testid="input-facility-state"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Zip Code</label>
                  <input
                    {...createFacilityForm.register('zipCode')}
                    type="text"
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Zip Code"
                    data-testid="input-facility-zip"
                  />
                </div>

                {/* Phone and Email */}
                <div>
                  <label className="block text-sm font-medium mb-2">Phone Number</label>
                  <input
                    {...createFacilityForm.register('phoneNumber')}
                    type="tel"
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="(555) 123-4567"
                    data-testid="input-facility-phone"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    {...createFacilityForm.register('email')}
                    type="email"
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="facility@example.com"
                    data-testid="input-facility-email"
                  />
                  {createFacilityForm.formState.errors.email && (
                    <p className="text-red-500/50 text-sm mt-1">
                      {createFacilityForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                {/* Website */}
                <div>
                  <label className="block text-sm font-medium mb-2">Website</label>
                  <input
                    {...createFacilityForm.register('website')}
                    type="url"
                    className="w-full p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="https://facility.com"
                    data-testid="input-facility-website"
                  />
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateFacility(false);
                      createFacilityForm.reset();
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                    data-testid="button-cancel-create-facility"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createFacilityMutation.isPending}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium disabled:opacity-50"
                    data-testid="button-submit-create-facility"
                  >
                    {createFacilityMutation.isPending ? 'Creating...' : 'Create Facility'}
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
          <div className="bg-background rounded-xl hairline elev-inset max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">Edit Game</h2>
                  {selectedGame.isScrimmage && (
                    <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full font-medium">
                      SCRIMMAGE
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowEditGame(false);
                    setSelectedGame(null);
                  }}
                  className="text-muted-foreground hover:text-foreground p-1"
                  data-testid="button-close-edit-game"
                >
                  <X className="w-4 h-4" />
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
                className="space-y-2"
              >
                {/* Game/Scrimmage Toggle */}
                <div className="flex gap-2 p-1 bg-muted rounded-lg">
                  <button
                    type="button"
                    onClick={() => editGameForm.setValue('isScrimmage', false)}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      !editGameForm.watch('isScrimmage')
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    data-testid="button-edit-game-type"
                  >
                    Game
                    <span className="block text-xs font-normal opacity-70">Counts for standings</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => editGameForm.setValue('isScrimmage', true)}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      editGameForm.watch('isScrimmage')
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    data-testid="button-edit-scrimmage-type"
                  >
                    Scrimmage
                    <span className="block text-xs font-normal opacity-70">No stats/standings</span>
                  </button>
                </div>

                {/* Teams Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">Home Team</label>
                    <select
                      {...editGameForm.register('homeTeamId')}
                      className="w-full p-2 text-sm bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      data-testid="select-home-team"
                    >
                      <option value="">Select</option>
                      {teams.map((team: Team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Away Team</label>
                    <select
                      {...editGameForm.register('awayTeamId')}
                      className="w-full p-2 text-sm bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      data-testid="select-away-team"
                    >
                      <option value="">Select</option>
                      {teams.map((team: Team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Date/Time Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">Date</label>
                    <div className="relative" ref={datePickerRef}>
                      <Controller
                        name="gameDate"
                        control={editGameForm.control}
                        render={({ field }) => (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowDatePicker(!showDatePicker)}
                              className="w-full p-2 pr-8 text-sm bg-card text-card-foreground hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-left"
                              data-testid="button-game-date"
                            >
                              {field.value ? (() => {
                                const [year, month, day] = field.value.split('-');
                                const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                return date.toLocaleDateString();
                              })() : 'Select'}
                            </button>
                            <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            {showDatePicker && (
                              <div 
                                className="absolute z-[9999] mt-1 bg-white dark:bg-zinc-800 border border-border rounded-lg shadow-lg"
                              >
                                <DayPicker
                                  mode="single"
                                  selected={field.value ? (() => {
                                    const [year, month, day] = field.value.split('-');
                                    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                  })() : undefined}
                                  onSelect={(date) => {
                                    if (date) {
                                      const year = date.getFullYear();
                                      const month = String(date.getMonth() + 1).padStart(2, '0');
                                      const day = String(date.getDate()).padStart(2, '0');
                                      const dateString = `${year}-${month}-${day}`;
                                      field.onChange(dateString);
                                      setShowDatePicker(false);
                                    }
                                  }}
                                  className="p-2"
                                  classNames={{
                                    today: "rdp-cell_today bg-primary/20 text-black dark:text-white font-semibold text-sm w-8 h-8",
                                    selected: "rdp-cell_selected bg-primary text-white font-semibold text-sm w-8 h-8",
                                    root: "text-black dark:text-white text-sm",
                                    day: "text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-700 text-sm w-8 h-8 flex items-center justify-center cursor-pointer rounded",
                                    nav_button: "text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-700 w-7 h-7 flex items-center justify-center rounded",
                                    caption: "text-black dark:text-white font-medium text-sm mb-2",
                                    head_cell: "text-black dark:text-white font-medium text-xs p-1",
                                    table: "w-full border-collapse",
                                    cell: "text-center p-0.5",
                                  } as any}
                                />
                              </div>
                            )}
                          </>
                        )}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Time</label>
                    <div className="relative" ref={timePickerRef}>
                      <Controller
                        name="gameTime"
                        control={editGameForm.control}
                        render={({ field }) => (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowTimePicker(!showTimePicker)}
                              className="w-full p-2 pr-8 text-sm bg-card text-card-foreground hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-left"
                              data-testid="button-game-time"
                            >
                              {field.value ? (() => {
                                const [hours, minutes] = field.value.split(':');
                                const hour12 = parseInt(hours) === 0 ? 12 : parseInt(hours) > 12 ? parseInt(hours) - 12 : parseInt(hours);
                                const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
                                return `${hour12}:${minutes} ${ampm}`;
                              })() : 'Select'}
                            </button>
                            <Clock className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            {showTimePicker && (
                              <div 
                                className="absolute z-[9999] mt-1 bg-background border border-border rounded-lg shadow-lg min-w-[300px]"
                              >
                                <div className="p-4">
                                  <div className="flex items-start justify-center gap-4">
                                    <div className="flex flex-col items-center">
                                      <div className="text-sm font-semibold mb-2 text-foreground">Hour</div>
                                      <div className="h-32 w-14 overflow-y-auto hairline elev-rest rounded-lg bg-card">
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
                                            className={`w-full h-8 flex items-center justify-center text-sm font-medium hover:bg-primary/10 transition-colors ${
                                              field.value && (() => {
                                                const currentHour24 = parseInt(field.value.split(':')[0]);
                                                const currentHour12 = currentHour24 === 0 ? 12 : currentHour24 > 12 ? currentHour24 - 12 : currentHour24;
                                                return currentHour12 === hour;
                                              })() ? 'bg-primary text-primary-foreground' : 'text-foreground'
                                            }`}
                                          >
                                            {hour}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex items-center text-xl font-bold text-muted-foreground mt-8">:</div>
                                    <div className="flex flex-col items-center">
                                      <div className="text-sm font-semibold mb-2 text-foreground">Min</div>
                                      <div className="h-32 w-14 overflow-y-auto hairline elev-rest rounded-lg bg-card">
                                        {Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => (
                                          <button
                                            key={minute}
                                            type="button"
                                            onClick={() => {
                                              const currentTime = field.value || '12:00';
                                              const [hours] = currentTime.split(':');
                                              field.onChange(`${hours}:${String(minute).padStart(2, '0')}`);
                                            }}
                                            className={`w-full h-8 flex items-center justify-center text-sm font-medium hover:bg-primary/10 transition-colors ${
                                              field.value && parseInt(field.value.split(':')[1]) === minute ? 'bg-primary text-primary-foreground' : 'text-foreground'
                                            }`}
                                          >
                                            {String(minute).padStart(2, '0')}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-center">
                                      <div className="text-sm font-semibold mb-2 text-foreground">Period</div>
                                      <div className="flex flex-col gap-2">
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
                                            className={`w-12 h-8 flex items-center justify-center text-sm font-semibold hover:bg-primary/10 rounded transition-colors ${
                                              field.value && (() => {
                                                const currentHour24 = parseInt(field.value.split(':')[0]);
                                                const isCurrentlyPM = currentHour24 >= 12;
                                                return (period === 'PM' && isCurrentlyPM) || (period === 'AM' && !isCurrentlyPM);
                                              })() ? 'bg-primary text-primary-foreground' : 'text-foreground border border-border'
                                            }`}
                                          >
                                            {period}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex justify-center mt-4 pt-3 border-t border-border">
                                    <button
                                      type="button"
                                      onClick={() => setShowTimePicker(false)}
                                      className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary font-medium transition-colors"
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
                    </div>
                  </div>
                </div>

                {/* Rink */}
                <div>
                  <label className="block text-xs font-medium mb-1">Rink (Optional)</label>
                  <input
                    {...editGameForm.register('venue')}
                    type="text"
                    placeholder="Enter rink name"
                    className="w-full p-2 text-sm bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-game-venue"
                  />
                </div>

                {/* Locker Rooms Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">Home Locker Room</label>
                    <input
                      {...editGameForm.register('homeTeamLockerRoom')}
                      type="text"
                      placeholder="Home locker"
                      className="w-full p-2 text-sm bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      data-testid="input-home-locker-room"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Away Locker Room</label>
                    <input
                      {...editGameForm.register('awayTeamLockerRoom')}
                      type="text"
                      placeholder="Away locker"
                      className="w-full p-2 text-sm bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      data-testid="input-away-locker-room"
                    />
                  </div>
                </div>

                {/* Score Management Section */}
                {selectedGame && (
                  <div className="pt-3 border-t border-border">
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
                      <Target className="w-4 h-4" />
                      Score Management
                    </h3>
                    
                    {/* Current Game Score */}
                    {selectedGame.isCompleted || (selectedGame.homeScore !== null && selectedGame.awayScore !== null) ? (
                      <div className="space-y-4 mb-4">
                        {isEditingGameScore && isCommissioner ? (
                          <div className="dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-[#e2e2e2] dark:bg-[#212121]">
                            <p className="text-sm font-medium mb-3 text-center text-[#ffffff]">Edit Final Score:</p>
                            <div className="grid grid-cols-3 gap-3 items-center mb-4">
                              <div className="text-center">
                                <label className="block text-sm font-medium dark:text-blue-300 mb-1 text-[#ffffff]">
                                  {teams.find((t: Team) => t.id === selectedGame.homeTeamId)?.name || 'Home'}
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={editGameHomeScore}
                                  onChange={(e) => {
                                    const newHomeScore = e.target.value;
                                    setEditGameHomeScore(newHomeScore);
                                    const homeVal = parseInt(newHomeScore);
                                    const awayVal = parseInt(editGameAwayScore);
                                    if (!isNaN(homeVal) && !isNaN(awayVal) && Math.abs(homeVal - awayVal) > 1) {
                                      setEditGameIsOvertimeShootout(false);
                                    }
                                  }}
                                  className="text-center text-xl font-bold"
                                  placeholder="0"
                                  data-testid="input-edit-game-home-score"
                                />
                              </div>
                              <div className="text-center text-xl font-bold text-muted-foreground">
                                -
                              </div>
                              <div className="text-center">
                                <label className="block text-sm font-medium dark:text-blue-300 mb-1 text-[#ffffff]">
                                  {teams.find((t: Team) => t.id === selectedGame.awayTeamId)?.name || 'Away'}
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={editGameAwayScore}
                                  onChange={(e) => {
                                    const newAwayScore = e.target.value;
                                    setEditGameAwayScore(newAwayScore);
                                    const homeVal = parseInt(editGameHomeScore);
                                    const awayVal = parseInt(newAwayScore);
                                    if (!isNaN(homeVal) && !isNaN(awayVal) && Math.abs(homeVal - awayVal) > 1) {
                                      setEditGameIsOvertimeShootout(false);
                                    }
                                  }}
                                  className="text-center text-xl font-bold"
                                  placeholder="0"
                                  data-testid="input-edit-game-away-score"
                                />
                              </div>
                            </div>
                            
                            <div className="mb-3 space-y-3">
                              {(() => {
                                const homeVal = parseInt(editGameHomeScore);
                                const awayVal = parseInt(editGameAwayScore);
                                const hasValidScores = !isNaN(homeVal) && !isNaN(awayVal) && homeVal >= 0 && awayVal >= 0;
                                const scoreDiff = hasValidScores ? Math.abs(homeVal - awayVal) : 0;
                                const canSelectOvertimeShootout = !hasValidScores || scoreDiff <= 1;
                                
                                return (
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id="edit-overtime-shootout"
                                      checked={editGameIsOvertimeShootout && canSelectOvertimeShootout}
                                      onCheckedChange={(checked) => {
                                        if (canSelectOvertimeShootout) {
                                          setEditGameIsOvertimeShootout(checked === true);
                                        }
                                      }}
                                      disabled={!canSelectOvertimeShootout}
                                      data-testid="checkbox-edit-overtime-shootout"
                                    />
                                    <Label
                                      htmlFor="edit-overtime-shootout"
                                      className={`text-sm font-medium leading-none ${!canSelectOvertimeShootout ? 'cursor-not-allowed opacity-50' : ''} text-[#ffffff]`}
                                    >
                                      Overtime/Shootout
                                      {!canSelectOvertimeShootout && (
                                        <span className="ml-2 text-xs text-muted-foreground">(score difference must be 0 or 1)</span>
                                      )}
                                    </Label>
                                  </div>
                                );
                              })()}

                              {editGameIsOvertimeShootout && (
                                <div>
                                  <Label htmlFor="edit-result-type" className="text-xs font-medium">
                                    Result Type
                                  </Label>
                                  <Select
                                    value={editGameResultType}
                                    onValueChange={(value: 'overtime' | 'shootout') => setEditGameResultType(value)}
                                  >
                                    <SelectTrigger id="edit-result-type" data-testid="select-edit-result-type" className="mt-1">
                                      <SelectValue placeholder="Select result type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="overtime">Overtime</SelectItem>
                                      <SelectItem value="shootout">Shootout</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex gap-3">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setIsEditingGameScore(false);
                                  setEditGameHomeScore('');
                                  setEditGameAwayScore('');
                                  setEditGameIsOvertimeShootout(false);
                                  setEditGameResultType('overtime');
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
                                  
                                  // Double-check: only allow OT/SO if score difference is 0 or 1
                                  const scoreDiff = Math.abs(home - away);
                                  const canUseOvertimeShootout = scoreDiff <= 1;
                                  const resultType = (editGameIsOvertimeShootout && canUseOvertimeShootout) ? editGameResultType : 'regulation';
                                  commissionerScoreOverrideMutation.mutate(
                                    { gameId: selectedGame.id, homeScore: home, awayScore: away, resultType },
                                    {
                                      onSuccess: () => {
                                        setIsEditingGameScore(false);
                                        setEditGameHomeScore('');
                                        setEditGameAwayScore('');
                                        setEditGameIsOvertimeShootout(false);
                                        setEditGameResultType('overtime');
                                        
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
                          <div className="dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 bg-[#e2e2e2] dark:bg-[#212121]">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-medium text-[#ffffff]">Final Score:</p>
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
                                    
                                    // Prefill overtime/shootout state
                                    if (selectedGame.resultType === 'overtime' || selectedGame.resultType === 'shootout') {
                                      setEditGameIsOvertimeShootout(true);
                                      setEditGameResultType(selectedGame.resultType);
                                    } else {
                                      setEditGameIsOvertimeShootout(false);
                                      setEditGameResultType('overtime');
                                    }
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
                                <p className="text-2xl font-bold text-[#ffffff]">{selectedGame.homeScore}</p>
                              </div>
                              <div className="text-xl font-bold text-muted-foreground">-</div>
                              <div className="text-center">
                                <p className="text-sm text-muted-foreground">
                                  {teams.find((t: Team) => t.id === selectedGame.awayTeamId)?.name || 'Away'}
                                </p>
                                <p className="text-2xl font-bold text-[#ffffff]">{selectedGame.awayScore}</p>
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
                                      <p className="text-lg font-bold text-[#000000]">{submission.homeScore}</p>
                                    </div>
                                    <div className="text-sm font-bold text-muted-foreground">-</div>
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">
                                        {teams.find((t: Team) => t.id === selectedGame.awayTeamId)?.name || 'Away'}
                                      </p>
                                      <p className="text-lg font-bold text-[#000000]">{submission.awayScore}</p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs font-medium capitalize text-[#000000]">
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
                        <div className="bg-card hairline elev-rest rounded-lg p-4">
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
                                onChange={(e) => {
                                  const newHomeScore = e.target.value;
                                  setCommissionerHomeScore(newHomeScore);
                                  const homeVal = parseInt(newHomeScore);
                                  const awayVal = parseInt(commissionerAwayScore);
                                  if (!isNaN(homeVal) && !isNaN(awayVal) && Math.abs(homeVal - awayVal) > 1) {
                                    setCommissionerIsOvertimeShootout(false);
                                  }
                                }}
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
                                onChange={(e) => {
                                  const newAwayScore = e.target.value;
                                  setCommissionerAwayScore(newAwayScore);
                                  const homeVal = parseInt(commissionerHomeScore);
                                  const awayVal = parseInt(newAwayScore);
                                  if (!isNaN(homeVal) && !isNaN(awayVal) && Math.abs(homeVal - awayVal) > 1) {
                                    setCommissionerIsOvertimeShootout(false);
                                  }
                                }}
                                placeholder="0"
                                className="mt-1"
                              />
                            </div>
                          </div>
                          
                          <div className="mb-3 space-y-3">
                            {(() => {
                              const homeVal = parseInt(commissionerHomeScore);
                              const awayVal = parseInt(commissionerAwayScore);
                              const hasValidScores = !isNaN(homeVal) && !isNaN(awayVal) && homeVal >= 0 && awayVal >= 0;
                              const scoreDiff = hasValidScores ? Math.abs(homeVal - awayVal) : 0;
                              const canSelectOvertimeShootout = !hasValidScores || scoreDiff <= 1;
                              
                              return (
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="commissioner-overtime-shootout"
                                    checked={commissionerIsOvertimeShootout && canSelectOvertimeShootout}
                                    onCheckedChange={(checked) => {
                                      if (canSelectOvertimeShootout) {
                                        setCommissionerIsOvertimeShootout(checked === true);
                                      }
                                    }}
                                    disabled={!canSelectOvertimeShootout}
                                    data-testid="checkbox-overtime-shootout"
                                  />
                                  <Label
                                    htmlFor="commissioner-overtime-shootout"
                                    className={`text-sm font-medium leading-none ${!canSelectOvertimeShootout ? 'cursor-not-allowed opacity-50' : ''} text-[#ffffff]`}
                                  >
                                    Overtime/Shootout
                                    {!canSelectOvertimeShootout && (
                                      <span className="ml-2 text-xs text-muted-foreground">(score difference must be 0 or 1)</span>
                                    )}
                                  </Label>
                                </div>
                              );
                            })()}

                            {commissionerIsOvertimeShootout && (
                              <div>
                                <Label htmlFor="commissioner-result-type" className="text-xs font-medium">
                                  Result Type
                                </Label>
                                <Select
                                  value={commissionerResultType}
                                  onValueChange={(value: 'overtime' | 'shootout') => setCommissionerResultType(value)}
                                >
                                  <SelectTrigger id="commissioner-result-type" data-testid="select-result-type" className="mt-1">
                                    <SelectValue placeholder="Select result type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="overtime">Overtime</SelectItem>
                                    <SelectItem value="shootout">Shootout</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                          
                          <Button
                            type="button"
                            onClick={() => {
                              const home = parseInt(commissionerHomeScore);
                              const away = parseInt(commissionerAwayScore);
                              if (!isNaN(home) && !isNaN(away) && home >= 0 && away >= 0) {
                                // Double-check: only allow OT/SO if score difference is 0 or 1
                                const scoreDiff = Math.abs(home - away);
                                const canUseOvertimeShootout = scoreDiff <= 1;
                                const resultType = (commissionerIsOvertimeShootout && canUseOvertimeShootout) ? commissionerResultType : 'regulation';
                                commissionerScoreOverrideMutation.mutate({ 
                                  gameId: selectedGame.id, 
                                  homeScore: home, 
                                  awayScore: away,
                                  resultType
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
                <div className="space-y-2 pt-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditGame(false);
                        setSelectedGame(null);
                      }}
                      className="flex-1 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                      data-testid="button-cancel-edit-game"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateGameMutation.isPending}
                      className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary text-sm font-medium disabled:opacity-50"
                      data-testid="button-save-game-changes"
                    >
                      {updateGameMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirmation(true)}
                    className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium transition-colors"
                    data-testid="button-delete-game"
                  >
                    <Trash2 className="w-3 h-3" />
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
          <div className="bg-background rounded-xl hairline elev-inset max-w-md w-full">
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
                    return awayTeam ? `${homeTeam?.name || 'Unknown'} vs ${awayTeam.name}` : `${homeTeam?.name || 'Unknown'} Practice`;
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
          <div className="bg-background rounded-xl hairline elev-inset max-w-md w-full">
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
      {/* Player Approval Modal */}
      {showMergeModal && selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-card rounded-lg p-4 sm:p-6 w-full max-w-[calc(100vw-1rem)] sm:max-w-md hairline elev-rest">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {approvalMode === 'initial' ? 'Approve Player' : 'Replace Placeholder'}
              </h3>
              <button
                onClick={() => {
                  setShowMergeModal(false);
                  setSelectedMember(null);
                  setPotentialMatches([]);
                  setSelectedMatch(null);
                  setApprovalMode('initial');
                  setPlaceholderSearchQuery('');
                  setPlaceholderSearchResults([]);
                  setSelectedPlaceholder(null);
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
              
              {approvalMode === 'initial' && (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      approveMutation.mutate(selectedMember.id);
                      setShowMergeModal(false);
                      setSelectedMember(null);
                      setApprovalMode('initial');
                    }}
                    disabled={approveMutation.isPending}
                    className="w-full bg-green-500 text-white px-4 py-3 rounded-lg hover:bg-green-600 font-medium disabled:opacity-50"
                  >
                    {approveMutation.isPending ? 'Approving...' : 'Accept as New Player'}
                  </button>
                  
                  <button
                    onClick={() => {
                      setApprovalMode('replace');
                      const placeholders = commissionerDisplayMembers.filter((m: LeagueMember) => 
                        m.user?.email?.includes('@placeholder.roster') || 
                        m.user?.id?.startsWith('placeholder-')
                      );
                      setPlaceholderSearchResults(placeholders);
                    }}
                    className="w-full bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 font-medium"
                  >
                    Replace a Placeholder
                  </button>
                </div>
              )}
              
              {approvalMode === 'replace' && (
                <div className="space-y-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Search placeholder players..."
                      value={placeholderSearchQuery}
                      onChange={(e) => {
                        const query = e.target.value.toLowerCase();
                        setPlaceholderSearchQuery(e.target.value);
                        const placeholders = commissionerDisplayMembers.filter((m: LeagueMember) => {
                          const isPlaceholder = m.user?.email?.includes('@placeholder.roster') || 
                            m.user?.id?.startsWith('placeholder-');
                          if (!isPlaceholder) return false;
                          if (!query) return true;
                          const name = formatUserName(m.user, m).toLowerCase();
                          return name.includes(query);
                        });
                        setPlaceholderSearchResults(placeholders);
                      }}
                      className="w-full px-3 py-2 hairline elev-inset rounded-lg bg-background text-foreground"
                    />
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {placeholderSearchResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No placeholder players found
                      </p>
                    ) : (
                      placeholderSearchResults.map((placeholder: LeagueMember) => {
                        const team = teams?.find((t: any) => t.id === placeholder.assignedTeamId);
                        return (
                          <div
                            key={placeholder.id}
                            onClick={() => setSelectedPlaceholder(
                              selectedPlaceholder?.id === placeholder.id ? null : placeholder
                            )}
                            className={`p-3 border rounded-lg cursor-pointer ${
                              selectedPlaceholder?.id === placeholder.id 
                                ? 'border-blue-500 bg-blue-500/10' 
                                : 'border-border hover:border-muted-foreground'
                            }`}
                          >
                            <p className="font-medium text-sm">{formatUserName(placeholder.user, placeholder)}</p>
                            {team && (
                              <p className="text-xs text-muted-foreground">Team: {team.name}</p>
                            )}
                            {placeholder.jerseyNumber && (
                              <p className="text-xs text-muted-foreground">#{placeholder.jerseyNumber}</p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <button
                      onClick={() => {
                        setApprovalMode('initial');
                        setPlaceholderSearchQuery('');
                        setPlaceholderSearchResults([]);
                        setSelectedPlaceholder(null);
                      }}
                      className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                    >
                      Back
                    </button>
                    <button
                      onClick={async () => {
                        if (!selectedPlaceholder) return;
                        
                        setIsReplacingInApproval(true);
                        try {
                          // Replace the placeholder with the new user, and delete the pending membership atomically
                          const response = await apiRequest('POST', `/api/leagues/${leagueId}/replace-player`, {
                            placeholderUserId: selectedPlaceholder.userId,
                            newUserId: selectedMember.userId,
                            preserveDisplayName: false,
                            pendingMembershipIdToDelete: selectedMember.id
                          });
                          
                          if (response.ok) {
                            const result = await response.json();
                            
                            await queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'pending-members'] });
                            await queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
                            await queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
                            
                            // Close the merge modal
                            setShowMergeModal(false);
                            setSelectedMember(null);
                            setApprovalMode('initial');
                            setPlaceholderSearchQuery('');
                            setPlaceholderSearchResults([]);
                            setSelectedPlaceholder(null);
                            
                            // Show success message
                            const statsMessage = result.statsTransferred 
                              ? " All stats have been transferred."
                              : "";
                            toast({
                              title: "Success",
                              description: `Placeholder replaced successfully!${statsMessage}`,
                            });
                            
                            // If this was a placeholder user, ask if they want to delete it
                            if (result.isPlaceholder && result.placeholderUserId) {
                              setPostMergePlaceholderInfo({
                                userId: result.placeholderUserId,
                                name: result.placeholderName || 'Unknown',
                                hadStats: result.hadStats || false,
                              });
                              setShowPostMergeDeleteDialog(true);
                            }
                          } else {
                            const error = await response.json();
                            toast({
                              title: "Error",
                              description: error.message || "Failed to replace placeholder.",
                              variant: "destructive",
                            });
                          }
                        } catch (error) {
                          console.error('Replace error:', error);
                          toast({
                            title: "Error",
                            description: "Failed to replace placeholder. Please try again.",
                            variant: "destructive",
                          });
                        } finally {
                          setIsReplacingInApproval(false);
                        }
                      }}
                      disabled={!selectedPlaceholder || isReplacingInApproval}
                      className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary font-medium disabled:opacity-50"
                    >
                      {isReplacingInApproval ? 'Replacing...' : 'Confirm Replace'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Post-Merge Placeholder Delete Dialog */}
      {showPostMergeDeleteDialog && postMergePlaceholderInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-card rounded-lg p-4 sm:p-6 w-full max-w-[calc(100vw-1rem)] sm:max-w-md hairline elev-rest">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Delete Placeholder User?</h3>
              <button
                onClick={() => {
                  setShowPostMergeDeleteDialog(false);
                  setPostMergePlaceholderInfo(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The placeholder user <span className="font-medium text-foreground">{postMergePlaceholderInfo.name}</span> has been replaced and all data has been transferred to the new user.
              </p>
              
              {postMergePlaceholderInfo.hadStats && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">
                    All stats have been successfully transferred to the new player.
                  </p>
                </div>
              )}
              
              <p className="text-sm text-muted-foreground">
                Would you like to delete the placeholder user from the system? This is optional - the placeholder is no longer in this league.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowPostMergeDeleteDialog(false);
                    setPostMergePlaceholderInfo(null);
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                >
                  Keep Placeholder
                </button>
                <button
                  onClick={async () => {
                    if (!postMergePlaceholderInfo) return;
                    
                    setIsDeletingPostMergePlaceholder(true);
                    try {
                      const response = await apiRequest('DELETE', `/api/users/${postMergePlaceholderInfo.userId}`);
                      
                      if (response.ok) {
                        toast({
                          title: "Success",
                          description: "Placeholder user deleted successfully.",
                        });
                      } else {
                        const error = await response.json();
                        toast({
                          title: "Note",
                          description: error.message || "Could not delete placeholder user. They may be in other leagues.",
                        });
                      }
                    } catch (error) {
                      console.error('Delete placeholder error:', error);
                      toast({
                        title: "Note",
                        description: "Could not delete placeholder user.",
                      });
                    } finally {
                      setIsDeletingPostMergePlaceholder(false);
                      setShowPostMergeDeleteDialog(false);
                      setPostMergePlaceholderInfo(null);
                    }
                  }}
                  disabled={isDeletingPostMergePlaceholder}
                  className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 font-medium disabled:opacity-50"
                >
                  {isDeletingPostMergePlaceholder ? 'Deleting...' : 'Delete Placeholder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Placeholder With Stats Dialog */}
      {showDeletePlaceholderWithStatsDialog && playerToDeleteWithStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-card rounded-lg p-4 sm:p-6 w-full max-w-[calc(100vw-1rem)] sm:max-w-md hairline elev-rest">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-amber-500">Placeholder Has Stats</h3>
              <button
                onClick={() => {
                  setShowDeletePlaceholderWithStatsDialog(false);
                  setPlayerToDeleteWithStats(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  This placeholder player has recorded stats. If you delete them, the stats will be lost.
                </p>
              </div>
              
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{formatUserName(playerToDeleteWithStats.user, playerToDeleteWithStats)}</span> has game statistics that will be permanently deleted.
              </p>
              
              <p className="text-sm text-muted-foreground">
                Would you like to transfer these stats to another player first, or delete them anyway?
              </p>
              
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    // Open the replace modal with this placeholder pre-selected
                    setSelectedPlayerToReplace(playerToDeleteWithStats);
                    setShowReplacePlayerModal(true);
                    setShowDeletePlaceholderWithStatsDialog(false);
                    setPlayerToDeleteWithStats(null);
                  }}
                  className="w-full bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 font-medium flex items-center justify-center gap-2"
                >
                  <Merge className="w-4 h-4" />
                  Merge Stats First
                </button>
                
                <button
                  onClick={() => {
                    removeFromLeagueMutation.mutate(playerToDeleteWithStats.id);
                    setShowDeletePlaceholderWithStatsDialog(false);
                    setPlayerToDeleteWithStats(null);
                  }}
                  className="w-full bg-red-500/50 text-white px-4 py-2 rounded-lg hover:bg-red-600/50 font-medium"
                >
                  Delete Anyway (Stats Will Be Lost)
                </button>
                
                <button
                  onClick={() => {
                    setShowDeletePlaceholderWithStatsDialog(false);
                    setPlayerToDeleteWithStats(null);
                  }}
                  className="w-full px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Edit Team Modal */}
      {showEditTeam && selectedTeamForEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg p-6 max-w-md w-full hairline elev-rest">
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
                    cropShape="rect"
                    cropDialogTitle="Position your team logo"
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
                  <div className="flex items-center gap-3 p-3 bg-muted/50 hairline elev-rest rounded-lg">
                    <img 
                      src={getImageUrl((selectedTeamForEdit as any).logoUrl) || ''} 
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
                  <div className="flex items-center gap-3 p-3 bg-muted/50 hairline elev-rest rounded-lg">
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
      {/* Replace Player Modal */}
      {showReplacePlayerModal && selectedPlayerToReplace && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 pt-8 z-50">
          <div className="bg-card rounded-lg p-6 max-w-lg w-full hairline elev-rest max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Replace Player</h3>
              <button
                onClick={() => {
                  setShowReplacePlayerModal(false);
                  setSelectedPlayerToReplace(null);
                  setReplaceTargetUserId('');
                  setReplaceSearchQuery('');
                  setReplaceSearchResults([]);
                  setPreserveDisplayName(true);
                }}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-close-replace-modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4 overflow-y-auto flex-1">
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground uppercase mb-1">Player to Replace</p>
                <p className="font-medium">
                  {formatUserName(selectedPlayerToReplace.user, selectedPlayerToReplace)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedPlayerToReplace.user.email || 'No email'}
                  {selectedPlayerToReplace.assignedTeamId && teams.find(t => t.id === selectedPlayerToReplace.assignedTeamId) && (
                    <> • Team: {teams.find(t => t.id === selectedPlayerToReplace.assignedTeamId)?.name}</>
                  )}
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium">Search for Registered User</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replaceSearchQuery}
                    onChange={(e) => setReplaceSearchQuery(e.target.value)}
                    placeholder="Search by name or email..."
                    className="flex-1 p-3 bg-card hairline elev-rest rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-replace-search"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && replaceSearchQuery.trim().length >= 2) {
                        e.preventDefault();
                        setIsSearchingUsers(true);
                        apiRequest('GET', `/api/users/search?q=${encodeURIComponent(replaceSearchQuery.trim())}`)
                          .then(res => res.json())
                          .then(data => {
                            setReplaceSearchResults(data);
                            setIsSearchingUsers(false);
                          })
                          .catch(() => {
                            setIsSearchingUsers(false);
                            toast({
                              title: "Error",
                              description: "Failed to search users.",
                              variant: "destructive",
                            });
                          });
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (replaceSearchQuery.trim().length >= 2) {
                        setIsSearchingUsers(true);
                        apiRequest('GET', `/api/users/search?q=${encodeURIComponent(replaceSearchQuery.trim())}`)
                          .then(res => res.json())
                          .then(data => {
                            setReplaceSearchResults(data);
                            setIsSearchingUsers(false);
                          })
                          .catch(() => {
                            setIsSearchingUsers(false);
                            toast({
                              title: "Error",
                              description: "Failed to search users.",
                              variant: "destructive",
                            });
                          });
                      }
                    }}
                    disabled={replaceSearchQuery.trim().length < 2 || isSearchingUsers}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary font-medium disabled:opacity-50"
                  >
                    {isSearchingUsers ? 'Searching...' : 'Search'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Search all registered users by name or email (minimum 2 characters)
                </p>
              </div>
              
              {/* User Search Results */}
              {replaceSearchResults.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="max-h-48 overflow-y-auto">
                    {replaceSearchResults.map((user: any) => {
                      const isSelected = replaceTargetUserId === user.id;
                      const isAlreadyInLeague = members.some(m => m.userId === user.id);
                      return (
                        <button
                          key={user.id}
                          onClick={() => setReplaceTargetUserId(isSelected ? '' : user.id)}
                          disabled={isAlreadyInLeague}
                          className={`w-full p-3 text-left border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors ${isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : ''} ${isAlreadyInLeague ? 'opacity-50 cursor-not-allowed' : ''}`}
                          data-testid={`button-select-replace-target-${user.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                {user.lastName && user.firstName ? `${user.lastName}, ${user.firstName}` : user.email}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {user.email}
                                {isAlreadyInLeague && <span className="ml-2 text-yellow-500">(Already in league)</span>}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <Check className="w-3 h-3 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {replaceSearchQuery.trim().length >= 2 && replaceSearchResults.length === 0 && !isSearchingUsers && (
                <div className="p-4 text-center text-muted-foreground border border-border rounded-lg">
                  No users found matching "{replaceSearchQuery}"
                </div>
              )}
              
              {replaceTargetUserId && (
                <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Replace With</p>
                  {(() => {
                    const targetUser = replaceSearchResults.find((u: any) => u.id === replaceTargetUserId);
                    if (!targetUser) return null;
                    return (
                      <>
                        <p className="font-medium">
                          {targetUser.lastName && targetUser.firstName ? `${targetUser.lastName}, ${targetUser.firstName}` : targetUser.email}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {targetUser.email}
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
              
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={preserveDisplayName}
                    onChange={(e) => setPreserveDisplayName(e.target.checked)}
                    className="rounded"
                    data-testid="checkbox-preserve-name"
                  />
                  <span className="text-sm">Keep original player's display name on roster</span>
                </label>
              </div>
              
              <div className="pt-4 border-t border-border">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowReplacePlayerModal(false);
                      setSelectedPlayerToReplace(null);
                      setReplaceTargetUserId('');
                      setReplaceSearchQuery('');
                      setReplaceSearchResults([]);
                      setPreserveDisplayName(true);
                    }}
                    className="flex-1 bg-muted text-muted-foreground px-4 py-2 rounded-lg hover:bg-muted/80 font-medium"
                    data-testid="button-cancel-replace"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!replaceTargetUserId) {
                        toast({
                          title: "Error",
                          description: "Please select a user to replace with.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      setIsReplacingPlayer(true);
                      try {
                        const response = await apiRequest('POST', `/api/leagues/${leagueId}/replace-player`, {
                          placeholderUserId: selectedPlayerToReplace.userId,
                          newUserId: replaceTargetUserId,
                          preserveDisplayName: preserveDisplayName
                        });
                        
                        if (response.ok) {
                          toast({
                            title: "Success",
                            description: "Player replaced successfully! Team assignment preserved.",
                          });
                          
                          // Invalidate queries to refresh the data
                          await queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'members'] });
                          await queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'teams'] });
                          
                          setShowReplacePlayerModal(false);
                          setSelectedPlayerToReplace(null);
                          setReplaceTargetUserId('');
                          setReplaceSearchQuery('');
                          setReplaceSearchResults([]);
                          setPreserveDisplayName(true);
                        } else {
                          const error = await response.json();
                          toast({
                            title: "Error",
                            description: error.message || "Failed to replace player.",
                            variant: "destructive",
                          });
                        }
                      } catch (error) {
                        console.error('Replace error:', error);
                        toast({
                          title: "Error",
                          description: "Failed to replace player. Please try again.",
                          variant: "destructive",
                        });
                      } finally {
                        setIsReplacingPlayer(false);
                      }
                    }}
                    disabled={!replaceTargetUserId || isReplacingPlayer}
                    className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary font-medium disabled:opacity-50"
                    data-testid="button-confirm-replace"
                  >
                    {isReplacingPlayer ? 'Replacing...' : 'Replace Player'}
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
      <DesktopRequiredDialog
        open={showDesktopRequiredSeason}
        onOpenChange={setShowDesktopRequiredSeason}
        description={DESKTOP_REQUIRED_COPY.season}
      />

      <AlertDialog
        open={!!seasonToDelete}
        onOpenChange={(open) => {
          if (!open) setSeasonToDelete(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-delete-season">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Season?</AlertDialogTitle>
            <AlertDialogDescription>
              {seasonToDelete
                ? `Permanently delete the season "${seasonToDelete.name}"? This cannot be undone. Seasons with games, teams, tournaments, or stats can't be deleted — remove those first.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-season">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (seasonToDelete) {
                  deleteSeasonMutation.mutate(seasonToDelete.id);
                }
              }}
              disabled={deleteSeasonMutation.isPending}
              className="bg-red-500 hover:bg-red-600"
              data-testid="button-confirm-delete-season"
            >
              {deleteSeasonMutation.isPending ? 'Deleting...' : 'Delete Season'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
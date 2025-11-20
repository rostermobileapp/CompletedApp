# Overview

Rosters is a free, comprehensive sports team management platform designed to streamline sports team management for various sports. It offers league and team organization, game scheduling, messaging, and tournament/playoff management functionalities. The platform operates on a freemium model with subscription-gated features, aiming to provide a robust solution for sports enthusiasts and administrators.

## Tournament System (Nov 20, 2025)

The platform now includes a comprehensive tournament/playoff system supporting:
- **Tournament Types**: Season playoffs and standalone tournaments
- **Formats**: Single elimination (canonical seeding with bye handling), double elimination (in progress), round robin, and split round robin
- **Features**: 
  - Canonical bracket generation (1v16, 2v15, etc.) with configurable bye policies for odd team counts
  - **Bye Policy Options** (for odd-numbered teams in elimination formats):
    - Top Seed Gets Bye to Round 2: Seed #1 automatically advances; remaining teams play in Round 1
    - Bottom 2 Seeds Play Play-In Game: Separate "Play-In Round" where bottom 2 seeds compete; winner faces #1 seed in Round 1
  - Automatic match creation with advancement pointers
  - Match scheduling and score tracking infrastructure
  - Format recommendations based on team count (detailed pros/cons/game estimates)
  - Touch-optimized mobile-first design
  - **SVG-based bracket visualization** with zoom/pan controls
- **Access Control**: Commissioner, Secondary Commissioner, and Admin only
- **Backend**: Complete with active improvements ✅
  - Database schema (3 tables: tournaments, tournament_teams, tournament_matches)
  - API routes with full CRUD and permissions (requireLeagueManagement middleware)
  - Bracket generator with canonical seeding and configurable bye policies (stored in tournament.settings.byePolicy)
  - **Double Elimination Status**: Core formulas implemented with visual hierarchy complete (4px color-coded borders, spacing formulas, blue/red arrows). Advancement logic for odd team counts in active refinement.
  - Format recommendation engine with detailed pros/cons analysis
  - PATCH /api/tournaments/:id for editing draft tournaments with automatic bracket regeneration
- **Frontend**: Complete with enhanced bracket visualization ✅
  - Tournaments Dashboard (/leagues/:leagueId/tournaments) - List view with status badges
  - Tournament Creator (/leagues/:leagueId/tournaments/create) - 3-step wizard with enhanced format recommendations and bye policy selector (shown for odd team counts)
  - Tournament Edit (/tournaments/:tournamentId/edit) - Multi-step wizard with pre-filled data (draft-only)
  - Tournament Detail (/tournaments/:tournamentId) - Tabbed view with BracketView component supporting Play-In Round display
  - **BracketView Component**: SVG bracket rendering with:
    - **Visual Hierarchy**: 4px color-coded borders (blue for winners bracket, red for losers bracket, gold for grand finals)
    - **Spacing Formulas**: Winners gap = baseGap × 2^(roundIndex), Losers gap = baseGap × 1.5^(floor(roundIndex/2))
    - **Connector Arrows**: Blue arrows for winner advancement, red arrows for loser drops to losers bracket
    - Stable round ordering algorithm
    - Horizontal separation of winners/losers brackets (no overlap)
    - Zoom controls (0.3x-3x): buttons, ctrl+scroll, pinch-to-zoom
    - Pan controls: drag, scroll, touch gestures
    - Dynamic layout calculation based on bracket size
- **Navigation**: 
  - Hamburger Menu → "Tournaments" button → Smart landing page (auto-redirects for single league, shows league selector for multiple)
  - Dashboard → Tournaments Card (when league selected) → Tournament List
  - New API endpoint: GET /api/leagues/manageable (returns leagues user can manage tournaments for with tournament counts)
- **Known Limitations**:
  - Double elimination odd-team advancement logic under refinement (even team counts fully functional)
  - Match result recording UI is placeholder (infrastructure exists)
  - Match scheduling/editing buttons are placeholders (future enhancement)
  - Connector anchoring uses notes-based heuristics rather than explicit slot metadata (visual may vary for complex transitions)
  - Losers bracket routing in double elimination requires manual match result entry to function (automatic advancement exists for winners bracket only)
- **Testing Status**: Manual testing required (automated e2e blocked by auth configuration)

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is a mobile-first, responsive single-page application built with React and TypeScript. It uses `shadcn/ui` (based on Radix UI) for components, `React Query` for server state, `React Context` for client-side state, and `Wouter` for routing. It incorporates a freemium model with a subscription-gating system.

## Backend Architecture

The backend is a REST API developed with Express.js and TypeScript, featuring a modular design. Authentication relies on Supabase JWT token verification, with user data synchronized to a local PostgreSQL database upon authentication. The messaging system handles both direct team and league-assigned team memberships. Unique, URL-friendly IDs are generated for leagues using `nanoid`.

## Data Storage Solutions

PostgreSQL serves as the primary database, managed with Drizzle ORM for type-safe operations. The schema includes users, leagues, teams, games, memberships, and messaging. Drizzle Kit is used for migration management.

## Authentication and Authorization

Supabase Authentication handles user authentication via email/password and JWT tokens. The backend validates these tokens using a Supabase service role key. New users are assigned a 'free_tier' role by default. Role-based access control (free_tier, player_pro, commissioner, secondary_commissioner) is enforced at both API and UI levels, with real-time subscription enforcement via Stripe webhooks and proactive verification. Commissioner permissions allow full team management operations, including deleting teams, adding/removing players (manual or CSV import), with safeguards against removing team captains. Password reset functionality leverages Supabase's built-in features.

## UI/UX Decisions

The UI/UX prioritizes a mobile-first responsive design using `shadcn/ui`. Design elements include an Apple Fitness+ inspired landing page, horizontal button layouts, dark-themed components, NHL.com mobile-inspired stats page redesign, and streamlined stats management. Premium features are gracefully presented to free-tier users. A fixed 5-item bottom navigation bar and a global slide-out hamburger menu provide intuitive navigation. The application supports user-controlled light and dark modes. League cards display unique IDs and the league list includes a search function. User profiles display a 6-character alphanumeric display ID. Personalized messages for join requests are supported and displayed in commissioner views.

## Feature Specifications

Key features include:
- **Subscription-Gating System**: Conditional rendering based on user subscription tiers.
- **Payment Management**: Tools for payment requests and tracking.
- **Universal Needs Attention System**: Persistent notifications for pending tasks.
- **Team Captain Announcements**: Team-specific announcements with visibility controls.
- **CSV Import System**: Bulk import for players and schedules with flexible column matching.
- **Bulk Delete Operations**: Commissioner-only feature for players, teams, or games.
- **Facility Linking**: Commissioners can link leagues to facilities.
- **Recurring Scrimmages**: Scheduling scrimmages with various recurrence patterns.
- **Substitute Game Display**: Approved substitute games appear on player calendars.
- **Finalize & Invoice for Scrimmages**: Automation for finalizing rosters, sending notifications, and creating payment requests.
- **Standalone Team Creation**: Users can create teams independently of leagues.
- **Player Management**: Manual and CSV bulk import options for players.
- **League Migration**: Teams can request to join leagues, with commissioner approval.
- **Profile "Your Teams" Section**: Allows users to view and leave teams, with captain-specific deletion options.
- **Messages Scroll to First Unread**: Automatically scrolls to the newest unread message in conversations.
- **Dashboard Enhancements**: localStorage persistence for selections, unified selectors, and dynamic display of approved scrimmages and team records.
- **Profile Career Stats**: Aggregated career stats for users across all leagues.
- **Team-Scoped Messages and Payments**: Filtering based on the currently selected dashboard team.
- **Dashboard-Teams Page Synchronization**: Bidirectional synchronization of team selection.
- **Calendar Team Filtering**: Calendar/Schedule page respects Dashboard team selection.
- **Email Notifications for Scrimmage Invites**: Automated email notifications for invited players.
- **Automatic Team Chat Synchronization**: Group chats automatically update participants based on team roster changes.
- **Automatic Captain Chat Synchronization**: Captain-only chats automatically update participants based on captain status changes.
- **Star Awards System**: A 3-star awards system for hockey leagues, where winning captains award stars after games, impacting leaderboards and captain to-do lists.

# External Dependencies

## Third-Party Services

- **Supabase Authentication**: User authentication and session management.
- **Supabase Storage**: Cloud storage for user-uploaded images (profile photos, team logos, message attachments, announcement media).
- **Neon Database**: PostgreSQL hosting.
- **Stripe**: Payment processing and subscription management.
- **Resend**: Email delivery service.

## UI and Component Libraries

- **Radix UI**: Accessible headless UI components.
- **shadcn/ui**: Pre-built component library.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.

## Development and Build Tools

- **Vite**: Fast build tool and development server.
- **React Query (TanStack Query)**: Server state management.
- **Wouter**: Lightweight client-side routing.
- **Drizzle ORM**: Type-safe database operations.
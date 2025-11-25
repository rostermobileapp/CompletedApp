# Overview

Rosters is a comprehensive, free sports team management platform designed to streamline operations for various sports. It offers league and team organization, game scheduling, messaging, and advanced tournament/playoff management. Operating on a freemium model with subscription-gated features, Roster aims to be a robust solution for sports enthusiasts and administrators.

The platform now includes a sophisticated tournament system supporting diverse formats like single elimination, double elimination, round robin, triple elimination, 3-game guarantee, consolation, compass draw, and a custom bracket builder. This system features canonical bracket generation with configurable bye policies, automatic match creation, scheduling, score tracking, format recommendations, and touch-optimized SVG-based bracket visualization with zoom/pan controls.

# Recent Changes

## November 25, 2025 - Scorekeeper Dashboard for Live Game Scoring

### Scorekeeper Dashboard
- **Feature**: Comprehensive dashboard for authorized users to track live game scoring, manage goals/penalties, and finalize games
- **Access Control**: Only accessible to commissioners, global stat_manager permission holders, and league-level stat_manager permission holders
- **Database Schema**:
  - `game_goals` table: Tracks goals with scorer, primary assist, secondary assist, period, and submission status
  - `game_penalties` table: Tracks penalties with player, minutes, penalty type, period, and submission status
- **Backend Implementation**:
  - `POST/DELETE /api/games/:gameId/goals` - Add/remove goals
  - `POST/DELETE /api/games/:gameId/penalties` - Add/remove penalties
  - `POST /api/games/:gameId/finalize` - Finalize game and update player stats
  - `PATCH /api/games/:gameId/scores` - Update game scores in real-time
  - `GET /api/scorekeeper/games` - Get games for scorekeeper with permission checking (supports both leagueId and tournamentId)
  - `GET /api/scorekeeper/options` - Get leagues and tournaments where user has scorekeeper access
  - `GET /api/scorekeeper/tournament-team/:tournamentTeamId/players` - Get tournament team players for roster display
- **Frontend Implementation** (client/src/pages/ScorekeeperDashboard.tsx):
  - Unified league and tournament selection dropdown with visual distinction (trophy icon for tournaments)
  - Game schedule view with upcoming and completed games/matches
  - Live scoring interface with goal/penalty entry forms
  - Team roster integration for both regular teams and tournament teams
  - Real-time score display and updates
  - Game finalization workflow with confirmation
  - Loading states and error handling for roster fetching
  - Automatic landscape orientation lock on mobile for live scoring mode
  - Blue GOAL button with modal dialog for goal entry with primary/secondary assists

## November 25, 2025 - Additional Team Payment Enforcement & Dashboard Tournament Integration

### Additional Team Payment for Paid Tournaments
- **Feature**: When a paid tournament has new teams added via CSV import, additional payment is required
- **Schema**: Added `paidTeamCount` field to tournaments table to track originally paid team count
- **Backend Implementation**:
  - Import endpoint `/api/tournaments/:tournamentId/players/import` now checks if tournament is paid and if new teams are being added
  - Returns 402 response with `additionalTeamsCount`, `additionalFee`, and `newTeamsDetected` array when payment is required
  - New endpoint `/api/tournaments/:tournamentId/additional-teams-checkout` creates Stripe session for additional team payments
  - Webhook handles `additional_team_payment` type and increments `paidTeamCount` after successful payment
- **Frontend Implementation**:
  - Dialog in TournamentDetail.tsx informs users about additional payment requirement
  - Shows breakdown of new teams detected and total fee ($10 per additional team)
  - Redirects to Stripe checkout for payment

### Dashboard Tournament Selection
- **Feature**: Paid tournaments now appear in the Dashboard team/league selection dropdown
- **Backend**: New endpoint `/api/user/paid-tournaments` fetches tournaments where user is either:
  - A participant with "approved" status, OR
  - The tournament creator (for standalone tournaments)
- **Frontend Implementation**:
  - Extended selection state type to support 'tournament' alongside 'team' and 'league'
  - Added "MY TOURNAMENTS" section in dropdown with orange trophy icon
  - Shows tournament name and unique ID
  - Proper localStorage persistence for tournament selection
- **Navigation**: Stats and Standings cards route to tournament detail page when tournament is selected
- **Tournament-only Users**: Shows helpful info section with "View Tournament" button when no teams/leagues exist

## November 24, 2025 - Standalone Tournament Visibility & Team Assignment

### Unified Tournaments Landing Page
- **Issue**: Standalone tournaments were being saved to the database but had no UI to view them after creation
- **Fix**: Completely redesigned TournamentsLanding.tsx to show all tournaments in one unified list
- **Implementation**: Created `/api/tournaments/all` endpoint that fetches both standalone tournaments and league tournaments where the user is a commissioner
- **Authentication Fix**: Changed `/api/tournaments/all` to use `req.user.claims.sub` instead of `req.user.id` for proper user identification
- **User Impact**: All tournaments now appear together on one landing page with league name badges to distinguish league tournaments from standalone ones

### Play-In Round Team Assignment for Standalone Tournaments
- **Issue**: Play-in round matches in standalone tournaments were auto-assigned the bottom 2 seed teams instead of showing dropdowns for manual selection
- **Root Cause**: Bracket generator (`generateSingleElimination()` and `generateDoubleElimination()`) automatically assigned teams to play-in matches regardless of tournament type
- **Fix**: 
  - Modified `/api/tournaments/:id/generate-bracket` endpoint to pass `tournamentType` in settings to bracket generator
  - Updated bracket generators to check `settings.tournamentType === 'standalone'` and leave play-in match teams as `null` instead of auto-assigning
  - BracketView component already had correct dropdown logic that shows dropdowns when `!match.team1Id && !hasUpstreamMatch()`
- **User Impact**: For standalone tournaments, play-in round matches now show team selection dropdowns, allowing commissioners to manually assign teams. For league tournaments, teams are still auto-assigned based on seeding.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is a mobile-first, responsive single-page application built with React and TypeScript. It utilizes `shadcn/ui` (based on Radix UI) for components, `React Query` for server state management, `React Context` for client-side state, and `Wouter` for routing. The UI/UX prioritizes a mobile-first responsive design, incorporating design elements like an Apple Fitness+ inspired landing page, dark-themed components, and intuitive navigation with a fixed bottom navigation bar and global slide-out menu. It supports user-controlled light and dark modes and gracefully presents premium features to free-tier users.

## Backend Architecture

The backend is a modular REST API developed with Express.js and TypeScript. Authentication is handled via Supabase JWT token verification, with user data synchronized to a local PostgreSQL database. The system includes a messaging infrastructure for direct team and league-assigned team memberships, and generates unique, URL-friendly IDs for leagues using `nanoid`.

## Data Storage Solutions

PostgreSQL is the primary database, managed with Drizzle ORM for type-safe operations. The schema covers users, leagues, teams, games, memberships, and messaging, with Drizzle Kit used for migration management.

## Authentication and Authorization

Supabase Authentication manages user authentication via email/password and JWT tokens. The backend validates these tokens using a Supabase service role key. A role-based access control system (`free_tier`, `player_pro`, `commissioner`, `secondary_commissioner`) is enforced at both API and UI levels, with real-time subscription enforcement via Stripe webhooks. Commissioners have full team management capabilities, including player and team administration, with safeguards for captain roles.

## Tournament System Implementation

The tournament system supports various formats with a universal state machine approach for double elimination that handles any team count and intelligent bye handling. Phase 2 bracket generators for triple elimination, 3-game guarantee, consolation, and compass draw are fully functional. Round Robin + Playoffs functionality is integrated, supporting record-based playoff seeding. The frontend features a `BracketView` component for SVG bracket rendering with visual hierarchy, bracket-specific positioning for multi-bracket layouts, dynamic spacing formulas, and connector arrows, along with zoom and pan controls. A custom bracket builder provides a drag-and-drop interface for designing tournament structures with matchup cards and routing controls.

### Tournament Payment and Access Control

Standalone tournaments operate on a commissioner-pays model where league commissioners pay $10 per team via Stripe checkout. Players receive free, time-limited access (30 days before tournament start to 7 days after final game) to tournament-specific features only: Home, My Team, Messages, Profile, and Payments. League-related features (leagues, scrimmages, standalone team creation) are hidden from tournament-only users.

Key components:
- **Unique Tournament IDs**: 8-character nanoid for easy sharing and tournament discovery
- **Payment Processing**: Stripe integration with one-time payment (amount calculated as team count × 1000 cents)
- **Access Windows**: Automatically calculated based on first match start date and last match end date
- **Participant Management**: Join request workflow with commissioner approval, CSV import for bulk team/player addition
- **Tournament Search**: Dedicated `/tournament-search` page for players to find and join tournaments using unique IDs
- **Payment Status Tracking**: Visual indicators (Paid/Pending badges), payment amount display, and checkout button on tournament detail page

### Standalone Tournament Creation

Free tier users can now create standalone tournaments without league management permissions. The creation flow includes:

**Frontend Components:**
- **TournamentsLanding.tsx**: Unified landing page showing all tournaments (both standalone and league-based) in one list with league name badges to distinguish tournament types
- **TournamentCreateStandalone.tsx**: Multi-step creation wizard with three stages:
  1. Tournament Details (name, format, description)
  2. Add Teams and Players (manual entry or CSV upload)
  3. Review & Create
- **BracketView.tsx**: Implements slot-level dropdown logic - each team position is independently evaluated using `hasUpstreamMatch()` to determine if it should show a dropdown for manual team selection or display the upstream match reference

**CSV Import Format:**
The CSV import during tournament creation (Step 2) now supports uploading both teams and players in a single file:
- **Required Column**: `Team Name`
- **Optional Player Columns**: `Player Full Name`, `Email`, `Phone Number`, `Jersey #`, `Position`, `Skill Level`, `Player Type` (Goalie/Skater)
- Flexible header detection (supports variations like `team_name`, `TeamName`, etc.)
- Automatically de-duplicates team names
- Minimum 3 teams, maximum 128 teams required
- Player data is automatically imported after tournament creation
- Players can also be added later via CSV import on the tournament detail page

**Backend Authorization:**
- Standalone tournament creation (`POST /api/tournaments` with type="standalone") is open to all authenticated users
- League tournament creation requires commissioner permissions
- Tournament creators have full modification rights to their standalone tournaments
- Payment enforcement occurs at tournament finalization, not creation

## Feature Specifications

Key features include a subscription-gating system, payment management, a universal "Needs Attention" notification system, team captain announcements, CSV import for players and schedules, bulk delete operations, facility linking, recurring scrimmages, substitute game display, and automation for finalizing scrimmages and invoicing. Additional features include standalone team creation, player management, league migration requests, a "Your Teams" section for users, automatic scroll to first unread messages, dashboard enhancements with localStorage persistence, profile career stats, team-scoped messages and payments, calendar team filtering, email notifications for scrimmage invites, and automatic chat synchronization for teams and captains. A 3-star awards system for hockey leagues is also implemented.

# External Dependencies

## Third-Party Services

- **Supabase Authentication**: User authentication and session management.
- **Supabase Storage**: Cloud storage for user-uploaded media.
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
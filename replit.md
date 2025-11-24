# Overview

Rosters is a comprehensive, free sports team management platform designed to streamline operations for various sports. It offers league and team organization, game scheduling, messaging, and advanced tournament/playoff management. Operating on a freemium model with subscription-gated features, Roster aims to be a robust solution for sports enthusiasts and administrators.

The platform now includes a sophisticated tournament system supporting diverse formats like single elimination, double elimination, round robin, triple elimination, 3-game guarantee, consolation, compass draw, and a custom bracket builder. This system features canonical bracket generation with configurable bye policies, automatic match creation, scheduling, score tracking, format recommendations, and touch-optimized SVG-based bracket visualization with zoom/pan controls.

# Recent Changes

## November 24, 2025 - Standalone Tournament Visibility & Dropdown Fixes

### Standalone Tournaments Now Visible
- **Issue**: Standalone tournaments were being saved to the database but had no UI to view them after creation
- **Fix**: Added "My Standalone Tournaments" section to TournamentsLanding.tsx
- **Implementation**: Created `/api/tournaments/standalone` endpoint that fetches standalone tournaments created by the current user
- **User Impact**: Users can now see and access their standalone tournaments from the tournaments landing page

### Bracket Dropdown Logic Fixed
- **Issue**: Team selection dropdowns not showing for play-in round winners in standalone tournament brackets
- **Root Cause**: Play-in matches weren't properly linked to their destination matches via `advancesToMatchId`
- **Fix**: Modified `generateSingleElimination()` in bracketGenerator.ts to link play-in matches to the matches they feed into
- **Implementation**: Added logic after bracket generation to find destination match using sourceMatch tracking and set `advancesToMatchId` accordingly
- **User Impact**: Dropdowns now correctly appear for team slots that need manual assignment, while slots receiving teams from prior matches show "Winner of Match X" labels

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
- **TournamentsLanding.tsx**: Shows "Create Standalone Tournament" button to all authenticated users and displays "My Standalone Tournaments" section listing all standalone tournaments created by the user
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
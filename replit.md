# Overview

Rosters is a free, comprehensive sports team management platform designed to streamline sports team management for various sports. It offers league and team organization, game scheduling, messaging, and tournament/playoff management functionalities. The platform operates on a freemium model with subscription-gated features, aiming to provide a robust solution for sports enthusiasts and administrators.

## Tournament System (Complete - Nov 19, 2025)

The platform now includes a comprehensive tournament/playoff system supporting:
- **Tournament Types**: Season playoffs and standalone tournaments
- **Formats**: Single elimination (canonical seeding with bye handling), double elimination (beta - winners bracket only), round robin, and split round robin
- **Features**: 
  - Canonical bracket generation (1v16, 2v15, etc.) with proper bye distribution
  - Automatic match creation with advancement pointers
  - Match scheduling and score tracking infrastructure
  - Format recommendations based on team count (detailed pros/cons/game estimates)
  - Touch-optimized mobile-first design
- **Access Control**: Commissioner, Secondary Commissioner, and Admin only
- **Backend**: Complete and architect-approved ✅
  - Database schema (3 tables: tournaments, tournament_teams, tournament_matches)
  - API routes with full CRUD and permissions (requireLeagueManagement middleware)
  - Bracket generator with canonical seeding and bye auto-advancement
  - Format recommendation engine with detailed pros/cons analysis
- **Frontend**: Complete and architect-approved ✅
  - Tournaments Dashboard (/leagues/:leagueId/tournaments) - List view with status badges
  - Tournament Creator (/leagues/:leagueId/tournaments/create) - 3-step wizard with enhanced format recommendations
  - Tournament Detail (/tournaments/:tournamentId) - Tabbed view (Bracket, Teams, Schedule)
- **Known Limitations**:
  - Double elimination is beta: Creates winners bracket + grand finals placeholder; losers bracket requires manual match setup
  - Match result recording UI is placeholder (infrastructure exists)
  - Match scheduling/editing buttons are placeholders (future enhancement)
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
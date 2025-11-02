# Overview

Rosters is a free, comprehensive sports team management platform for various sports, offering league and team organization, game scheduling, and messaging functionalities to streamline sports team management.

## Recent Changes

**November 1, 2025**: Supabase Authentication Migration
- Migrated from Replit Auth (OIDC) to Supabase Authentication
- Implemented email/password authentication with sign-up, sign-in, and sign-out
- Email confirmation disabled for immediate access after signup
- JWT token-based authentication with automatic header injection on API requests
- Frontend uses Supabase client (@supabase/supabase-js) with session state management
- Backend validates JWT tokens using Supabase service role key
- Default user role set to 'free_tier' on account creation
- End-to-end authentication flow tested and verified

**November 1, 2025**: Landing page pricing update
- Updated pricing from $8/month to $5/month for Player Pro tier
- Simplified landing page header layout (logo centered, login button on right)

**November 2, 2025**: User Display ID System
- Implemented 6-character alphanumeric display IDs for all users (e.g., "A3xY9k", "LFB3Kf")
- Display IDs are automatically generated using nanoid on user creation with collision detection
- Existing users automatically receive display IDs on next login (automatic backfill)
- Profile page displays user's display ID in monospace font below name
- Display IDs stored in `displayId` field with unique constraint in users table
- Available via `/api/user` and `/api/auth/user` endpoints

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is a mobile-first, responsive single-page application built with React and TypeScript, utilizing `shadcn/ui` (based on Radix UI) for components, `React Query` for server state, `React Context` for client-side state, and `Wouter` for routing. It supports a freemium model with a subscription-gating system.

## Backend Architecture

The backend is a REST API developed with Express.js and TypeScript, featuring a modular design for authentication, database operations, and route handling. Authentication uses Supabase JWT token verification, where the backend validates access tokens on protected endpoints using the Supabase service role key. User data is synchronized to the local PostgreSQL database on authentication. The messaging system properly handles both direct team memberships (via `team_memberships` table) and league-assigned team memberships (via `assigned_team_id` in `league_memberships` table) when creating team group conversations, ensuring all team members can participate regardless of how they joined the team.

**Unique ID Generation**: League creation automatically generates unique, URL-friendly IDs using nanoid. When a league is created without specifying a custom ID, the system generates an 8-character unique identifier. Format: `{8-char-nanoid}` (e.g., "aB3xY9kL").

**Drizzle Field Naming Issue**: Drizzle ORM returns snake_case field names from database queries under certain conditions, even when the schema defines camelCase properties. The `/api/leagues/commissioner` endpoint includes explicit field mapping to ensure `uniqueLeagueId` is always returned in camelCase format for frontend compatibility.

## Data Storage Solutions

PostgreSQL is the primary database, using Drizzle ORM for type-safe operations. The schema includes entities for users, leagues, teams, games, memberships, and messaging, with Drizzle Kit managing migrations. Session storage is also PostgreSQL-based.

## Authentication and Authorization

Authentication uses Supabase Authentication with email/password credentials and JWT token-based verification. The frontend uses the Supabase client library to manage user sessions and automatically includes JWT tokens in API requests. The backend validates these tokens using Supabase's service role key. New users are automatically assigned the 'free_tier' role on signup. Role-based access control is implemented via subscription tiers (free_tier, player_pro, commissioner, secondary_commissioner) with hierarchical permissions, enforced at both API and UI levels. A dual-layer system (Stripe webhooks and proactive verification) ensures real-time enforcement of subscription cancellations.

## UI/UX Decisions

The UI/UX emphasizes a mobile-first responsive design using `shadcn/ui`. Key design elements include an Apple Fitness+ inspired landing page, horizontal button layouts for mobile game schedules, dark-themed player substitution components, an NHL.com mobile-inspired Stats page redesign with tab navigation and season filtering, and streamlined Stats Management. Premium features are presented with an elegant dialog for free-tier users. A fixed 5-item bottom navigation bar (Teams, Messages, Home, Profile, Payments) provides quick access, complemented by a global slide-out hamburger menu for permission-gated features.

**Theme System**: The application supports both light and dark modes with a user-controlled toggle. Light mode features clean white backgrounds with dark gray text and very light gray cards for subtle depth. Dark mode uses dark backgrounds with light text. The theme preference is stored in localStorage and persists across sessions. Theme toggle buttons are available in the Profile page Settings section and the slide-out hamburger menu header, allowing users to switch themes from anywhere in the app. The ThemeProvider (React Context) manages theme state globally, dynamically applying the `dark` class to the document root. All colors use CSS custom properties with raw HSL triplets for proper Tailwind/shadcn integration. Logo images (Landing page header, Dashboard header, and bottom navigation home icon) use CSS `invert` filter to automatically change from white to black in light mode while remaining white in dark mode.

**League List Display**: Each league card prominently displays the league's unique ID in a monospace font badge below the league name, providing easy identification and reference for users. The league list includes a search input that allows users to search for leagues by their unique ID with case-insensitive matching, displaying real-time filtered results.

## Feature Specifications

Key features include:
- **Subscription-gating system**: Conditional rendering based on user tiers.
- **Payment Request and Tracking**: Management of payment requests among league members.
- **Universal Needs Attention System**: Persistent notification bar for pending tasks.
- **Team Captain Announcements**: Team-specific announcements with visibility controls.
- **CSV Import System**: Bulk import for players and schedules with flexible column matching, automatic team creation, and detailed error reporting.
- **Bulk Delete Operations**: Commissioner-only feature for deleting players, teams, or games.
- **Facility Linking**: Commissioners can link leagues to facilities via a selector dropdown or inline creation.
- **Recurring Scrimmages**: Scheduling scrimmages with daily, weekly, or monthly recurrence patterns.
- **Substitute Game Display on Schedule**: Approved substitute games appear on a player's calendar with special formatting.
- **Finalize & Invoice for Scrimmages**: One-click automation that finalizes scrimmage rosters, sends targeted notifications, and automatically creates payment requests when scrimmages have a cost.
- **Standalone Team Creation**: Users can create teams without being part of a league, including unique alphanumeric IDs, team photo uploads, and facility assignment.
- **Player Management**: Options for manual player addition (with optional email and placeholder players) and CSV bulk import.
- **League Migration**: Teams can request to join leagues, with commissioner approval and automatic member migration.
- **Profile "Your Teams" Section**: Allows users to view and leave teams. Team captains can delete their teams (instead of leaving), which removes all team data including members, games, conversations, and related information. Non-captains can only leave teams with comprehensive cleanup of their individual data.
- **Messages Scroll to First Unread**: Automatically scrolls to the newest unread message when opening a conversation, falling back to the bottom if no unread messages.
- **Dashboard Enhancements**: Includes localStorage persistence for team/league selection, unified team/league selector mirroring the Profile page, and correct display of approved scrimmages with a relocated "Finalize & Invoice" button. Smart league feature access: when a team that belongs to a league is selected, users can access league features (News, Standings, To-Do) through the team's league context. The team record box (W-L-T-OTL) dynamically updates based on the selected team and pulls accurate data from league standings, hiding when a league is selected or the user is not part of a team.
- **Profile Career Stats**: The Profile page displays an aggregated stats card showing the user's career Goals, Assists, and Points across all leagues they're a member of. The card automatically pulls data from the stats system for all league memberships.
- **Team-Scoped Messages and Payments**: Messages and Payments pages now filter by the currently selected team on the Dashboard. Uses a custom event system (`useDashboardSelection` hook with `notifyDashboardSelectionChange()`) to sync selection changes in real-time within the same browser tab, ensuring conversations and payment requests only show data relevant to the selected team.
- **Dashboard-Teams Page Synchronization**: The Teams page (My Team) now uses the shared `useDashboardSelection` hook to stay synchronized with Dashboard team selection. Bidirectional sync ensures when a team is selected on Dashboard, it displays on Teams page, and vice versa. The hook provides `setTeamSelection()` and `setLeagueSelection()` functions to update the selection from any page, maintaining localStorage as single source of truth.
- **Calendar Team Filtering**: The Calendar/Schedule page (accessed via "View All" button) respects Dashboard team selection. When a team is selected, Calendar shows only games, scrimmages, and substitute games for that team. Uses `activeTeam` logic with automatic fallback to first team if selected team is invalid/deleted, ensuring consistent filtering and UI rendering even with stale selections.
- **Email Notifications for Scrimmage Invites**: When scrimmages are created with email invites, the system automatically sends email notifications to all invited email addresses using the Resend service. Emails include complete scrimmage details (title, date/time, location, creator name, skill level, cost, notes, max players) in both HTML and plain text formats, along with a link to view and respond to the invitation. Email sending is non-blocking - if emails fail to send, the scrimmage is still created successfully and errors are logged. Notifications are sent for both single and recurring scrimmages.
- **Automatic Team Chat Synchronization**: Team group chats automatically stay synchronized with current team rosters. When team membership changes (member joins/leaves, player added, team joins league, etc.), the system automatically updates chat participants to match the current roster. The sync includes both direct team members and league-assigned members, always including the team captain. An admin endpoint (`/api/admin/sync-all-team-chats`) is available to manually sync all existing team chats if needed.
- **Automatic Captain Chat Synchronization**: Captain-only chats automatically stay synchronized with all team captains in each league. When captain status changes (captain assigned/changed, team joins/leaves league, team deleted, etc.), the system automatically updates chat participants to include only current team captains. Synchronization triggers automatically on all captain-related mutations. An admin endpoint (`/api/admin/sync-all-captain-chats`) is available to manually sync all existing captain chats if needed.
- **Star Awards System**: Comprehensive 3-star awards system for hockey leagues where the winning team's captain awards stars after each completed game (1st star = 3 points, 2nd star = 2 points, 3rd star = 1 point). Only the winning captain can submit awards, with security validation ensuring the captain is authorized and selected players participated in the game. Players from both teams are eligible for awards. The system displays the top 3 star point leaders league-wide on the Stats page, includes a star awards submission form on game details pages, and integrates pending star awards into the captain's to-do list via the "Needs Attention" modal. The Needs Attention badge count automatically includes games awaiting star awards, ensuring captains are reminded to complete this task.

# External Dependencies

## Third-Party Services

- **Supabase Authentication**: User authentication and session management with email/password login.
- **Neon Database**: PostgreSQL hosting.
- **Stripe**: Payment processing and subscription management.
- **Google Cloud Storage**: User-uploaded content.
- **Resend**: Email delivery service for scrimmage invite notifications.

## UI and Component Libraries

- **Radix UI**: Accessible headless UI components.
- **shadcn/ui**: Pre-built component library for design consistency.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.

## Development and Build Tools

- **Vite**: Fast build tool and development server.
- **React Query (TanStack Query)**: Server state management.
- **Wouter**: Lightweight client-side routing.
- **Drizzle ORM**: Type-safe database operations.
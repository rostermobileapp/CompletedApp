# Overview

Rosters is a free, comprehensive sports team management platform for various sports, offering league and team organization, game scheduling, and messaging functionalities to streamline sports team management.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is a mobile-first, responsive single-page application built with React and TypeScript, utilizing `shadcn/ui` (based on Radix UI) for components, `React Query` for server state, `React Context` for client-side state, and `Wouter` for routing. It supports a freemium model with a subscription-gating system.

## Backend Architecture

The backend is a REST API developed with Express.js and TypeScript, featuring a modular design for authentication, database operations, and route handling. Authentication uses Replit's OpenID Connect via Passport.js with secure user sessions stored in PostgreSQL. The messaging system properly handles both direct team memberships (via `team_memberships` table) and league-assigned team memberships (via `assigned_team_id` in `league_memberships` table) when creating team group conversations, ensuring all team members can participate regardless of how they joined the team.

**Unique ID Generation**: League creation automatically generates unique, URL-friendly IDs using nanoid. When a league is created without specifying a custom ID, the system generates an 8-character unique identifier. Format: `{8-char-nanoid}` (e.g., "aB3xY9kL").

**Drizzle Field Naming Issue**: Drizzle ORM returns snake_case field names from database queries under certain conditions, even when the schema defines camelCase properties. The `/api/leagues/commissioner` endpoint includes explicit field mapping to ensure `uniqueLeagueId` is always returned in camelCase format for frontend compatibility.

## Data Storage Solutions

PostgreSQL is the primary database, using Drizzle ORM for type-safe operations. The schema includes entities for users, leagues, teams, games, memberships, and messaging, with Drizzle Kit managing migrations. Session storage is also PostgreSQL-based.

## Authentication and Authorization

Authentication uses Replit's OpenID Connect with session-based methods. Role-based access control is implemented via subscription tiers (free, player_plus, commissioner) with hierarchical permissions, enforced at both API and UI levels. A dual-layer system (Stripe webhooks and proactive verification) ensures real-time enforcement of subscription cancellations.

## UI/UX Decisions

The UI/UX emphasizes a mobile-first responsive design using `shadcn/ui`. Key design elements include an Apple Fitness+ inspired landing page, horizontal button layouts for mobile game schedules, dark-themed player substitution components, an NHL.com mobile-inspired Stats page redesign with tab navigation and season filtering, and streamlined Stats Management. Premium features are presented with an elegant dialog for free-tier users. A fixed 5-item bottom navigation bar (Teams, Messages, Home, Profile, Payments) provides quick access, complemented by a global slide-out hamburger menu for permission-gated features.

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
- **Dashboard Enhancements**: Includes localStorage persistence for team/league selection, unified team/league selector mirroring the Profile page, and correct display of approved scrimmages with a relocated "Finalize & Invoice" button. Smart league feature access: when a team that belongs to a league is selected, users can access league features (News, Standings, To-Do) through the team's league context. The team record box (W-L-T) dynamically updates based on the selected team and pulls accurate data from league standings, hiding when a league is selected or the user is not part of a team.
- **Team-Scoped Messages and Payments**: Messages and Payments pages now filter by the currently selected team on the Dashboard. Uses a custom event system (`useDashboardSelection` hook with `notifyDashboardSelectionChange()`) to sync selection changes in real-time within the same browser tab, ensuring conversations and payment requests only show data relevant to the selected team.
- **Dashboard-Teams Page Synchronization**: The Teams page (My Team) now uses the shared `useDashboardSelection` hook to stay synchronized with Dashboard team selection. Bidirectional sync ensures when a team is selected on Dashboard, it displays on Teams page, and vice versa. The hook provides `setTeamSelection()` and `setLeagueSelection()` functions to update the selection from any page, maintaining localStorage as single source of truth.
- **Calendar Team Filtering**: The Calendar/Schedule page (accessed via "View All" button) respects Dashboard team selection. When a team is selected, Calendar shows only games, scrimmages, and substitute games for that team. Uses `activeTeam` logic with automatic fallback to first team if selected team is invalid/deleted, ensuring consistent filtering and UI rendering even with stale selections.
- **Email Notifications for Scrimmage Invites**: When scrimmages are created with email invites, the system automatically sends email notifications to all invited email addresses using the Resend service. Emails include complete scrimmage details (title, date/time, location, creator name, skill level, cost, notes, max players) in both HTML and plain text formats, along with a link to view and respond to the invitation. Email sending is non-blocking - if emails fail to send, the scrimmage is still created successfully and errors are logged. Notifications are sent for both single and recurring scrimmages.

# External Dependencies

## Third-Party Services

- **Replit Authentication**: User authentication and session management.
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
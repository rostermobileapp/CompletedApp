# Overview

Rosters is a comprehensive, free sports team management platform designed to streamline operations for various sports. It offers league and team organization, game scheduling, messaging, and advanced tournament/playoff management. Operating on a freemium model with subscription-gated features, Roster aims to be a robust solution for sports enthusiasts and administrators.

The platform now includes a sophisticated tournament system supporting diverse formats like single elimination, double elimination, round robin, triple elimination, 3-game guarantee, consolation, compass draw, and a custom bracket builder. This system features canonical bracket generation with configurable bye policies, automatic match creation, scheduling, score tracking, format recommendations, and touch-optimized SVG-based bracket visualization with zoom/pan controls.

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
Key components include unique tournament IDs (8-character nanoid), Stripe integration for one-time payments, access windows calculated based on match dates, a join request workflow with commissioner approval, CSV import for bulk team/player addition, and a dedicated search page for players to find and join tournaments.

### Standalone Tournament Creation

Free tier users can create standalone tournaments without league management permissions. The creation flow is a multi-step wizard covering tournament details, team/player addition (manual or CSV upload), and review. The `BracketView.tsx` component implements slot-level dropdown logic for manual team selection in play-in rounds for standalone tournaments. CSV import supports both teams and players in a single file with flexible header detection and automatic de-duplication. Backend authorization ensures standalone tournament creation is open to all authenticated users, with payment enforced at tournament finalization.

### Photo Album System

A mobile-optimized photo album feature allows users to upload, view, and download photos from tournaments and leagues. The feature uses an independent `/media` route structure (`/media/tournament/:id` and `/media/league/:id`) with entity-specific permission models.

#### Tournament Photo Albums
Tournament photo galleries are accessible to approved tournament participants only. Access is participant-based with time-limited availability (30 days before tournament start to 7 days after final game). The UI features a Google Photos-inspired design with edge-to-edge 3-column grid layout (gap-0.5), upload button in header, fullscreen viewer with swipe gesture navigation, pinch-to-zoom support, and download all photos as ZIP functionality. Photos are displayed with object-contain and black letterboxing/pillarboxing for non-square images.

#### League Photo Albums
League photo galleries are a premium feature gated behind paid subscriptions. Access requires both approved league membership AND a paid subscription (user role !== 'free_tier'). Free tier users see a paywall message with upgrade prompt when accessing league photo galleries. The upload, view, delete, and download functionality mirrors the tournament photo system. Photos are stored in Supabase Storage under the `/league-photos` prefix with proper cleanup on deletion.

Backend validation enforces access control, file type restrictions (JPEG, PNG, GIF, WebP), and 10MB file size limits for both tournament and league photos. The Photos button is accessible from the home screen's quick access cards (4-card layout: News, Photos, Stats, Standings) and navigates to the appropriate media gallery based on context.

## Feature Specifications

Key features include a subscription-gating system, payment management, a universal "Needs Attention" notification system, team captain announcements, CSV import for players and schedules, bulk delete operations, facility linking, recurring scrimmages, substitute game display, and automation for finalizing scrimmages and invoicing. Additional features include standalone team creation, player management, league migration requests, a "Your Teams" section for users, automatic scroll to first unread messages, dashboard enhancements with localStorage persistence, profile career stats, team-scoped messages and payments, calendar team filtering, email notifications for scrimmage invites, and automatic chat synchronization for teams and captains. A 3-star awards system for hockey leagues is also implemented.

### Scrimmage Email Notification System

The platform includes a comprehensive email notification system for scrimmages:

1. **Approval Notifications**: When a commissioner approves a player's scrimmage request, an approval email is automatically sent containing the scrimmage details (title, date, location, cost) and a direct link to view the scrimmage.

2. **Automated Reminders**: Creators can configure reminder emails when creating a scrimmage. Preset options include 2 hours, 1 day, 2 days, and 1 week before the event. Reminders are only sent to approved players. A background job runs every 5 minutes to check for upcoming scrimmages and dispatch reminders.

3. **Duplicate Prevention**: The `scrimmageRemindersSent` table tracks sent reminders to prevent duplicate emails. Each combination of scrimmage ID, user ID, and hours-before interval is recorded.

The email templates feature branded styling with plain-text fallbacks for accessibility. Key files: `server/emails.ts` (email functions), `server/scrimmageReminderJob.ts` (scheduled job), `shared/schema.ts` (reminder schema fields).

# External Dependencies

## Third-Party Services

-   **Supabase Authentication**: User authentication and session management.
-   **Supabase Storage**: Cloud storage for user-uploaded media.
-   **Neon Database**: PostgreSQL hosting.
-   **Stripe**: Payment processing and subscription management.
-   **Resend**: Email delivery service.

## UI and Component Libraries

-   **Radix UI**: Accessible headless UI components.
-   **shadcn/ui**: Pre-built component library.
-   **Tailwind CSS**: Utility-first CSS framework.
-   **Lucide React**: Icon library.

## Development and Build Tools

-   **Vite**: Fast build tool and development server.
-   **React Query (TanStack Query)**: Server state management.
-   **Wouter**: Lightweight client-side routing.
-   **Drizzle ORM**: Type-safe database operations.
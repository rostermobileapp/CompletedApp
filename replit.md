# Overview

Rosters is a free, comprehensive sports team management platform designed to streamline operations for various sports. It offers league and team organization, game scheduling, messaging, and advanced tournament/playoff management. Operating on a freemium model with subscription-gated features, Roster aims to be a robust solution for sports enthusiasts and administrators.

The platform includes a sophisticated tournament system supporting diverse formats like single elimination, double elimination, round robin, triple elimination, 3-game guarantee, consolation, compass draw, and a custom bracket builder. This system features canonical bracket generation with configurable bye policies, automatic match creation, scheduling, score tracking, format recommendations, and touch-optimized SVG-based bracket visualization with zoom/pan controls.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is a mobile-first, responsive single-page application built with React and TypeScript. It uses `shadcn/ui` (based on Radix UI) for components, `React Query` for server state, `React Context` for client-side state, and `Wouter` for routing. The UI/UX prioritizes a mobile-first responsive design, incorporating an Apple Fitness+ inspired landing page, dark-themed components, and intuitive navigation with a fixed bottom navigation bar and global slide-out menu. It supports user-controlled light/dark modes and gracefully presents premium features.

## Backend Architecture

The backend is a modular REST API developed with Express.js and TypeScript. Authentication is handled via Supabase JWT token verification, with user data synchronized to a local PostgreSQL database. The system includes a messaging infrastructure and generates unique, URL-friendly IDs for leagues using `nanoid`.

## Data Storage Solutions

PostgreSQL is the primary database, managed with Drizzle ORM for type-safe operations and Drizzle Kit for migration management.

## Timezone Management

The platform uses a **league-local string storage** approach for datetime handling to prevent incorrect UTC conversions:

- **Storage**: Timestamp columns (games.scheduledAt, scrimmages.dateTime, teamEvents.scheduledAt/endTime, tournamentMatches.scheduledTime, personalReminders.scheduledAt) use Drizzle's `{ mode: 'string' }` to store datetimes as league-local strings (e.g., "2025-01-15T18:00")
- **API Schemas**: Zod schemas accept datetime strings without Date transformation
- **Date Arithmetic**: The `parseLeagueLocalDateTime(localString, leagueTimezone)` helper in `server/dateUtils.ts` converts league-local strings to UTC Date objects when comparisons or arithmetic are needed
- **Formatting**: `formatDateInTimezone()` and related helpers use `parseLeagueLocalDateTime` to properly interpret league-local strings before formatting for display
- **Background Jobs**: Event reminder and scrimmage invite jobs fetch league timezone before parsing datetime strings
- **Frontend**: Forms send datetime strings directly without Date conversion; edit forms parse strings directly (e.g., `dateTimeStr.split('T')`) to extract date/time parts

This approach ensures times remain consistent across storage, display, and calculations regardless of server timezone.

## Authentication and Authorization

Supabase Authentication manages user authentication via email/password and JWT tokens. The backend validates these tokens using a Supabase service role key. A role-based access control system (`free_tier`, `player_pro`, `commissioner`, `secondary_commissioner`) is enforced at both API and UI levels, with real-time subscription enforcement via Stripe webhooks.

## Tournament System Implementation

The tournament system supports various formats with a universal state machine approach for double elimination and intelligent bye handling. It includes phase 2 bracket generators for triple elimination, 3-game guarantee, consolation, and compass draw, and integrates Round Robin + Playoffs with record-based playoff seeding. The frontend features a `BracketView` component for SVG bracket rendering with visual hierarchy, dynamic spacing, connector arrows, and zoom/pan controls. A custom bracket builder provides a drag-and-drop interface for designing tournament structures.

Standalone tournaments operate on a commissioner-pays model ($10 per team via Stripe) with players receiving free, time-limited access to tournament-specific features. Standalone tournament creation is open to all authenticated users via a multi-step wizard, supporting manual team entry and CSV import.

## Photo Album System

A mobile-optimized photo album feature allows users to upload, view, and download photos from tournaments and leagues. Tournament photo galleries are accessible to approved participants within a time-limited window, featuring a Google Photos-inspired UI. League photo galleries are a premium, subscription-gated feature. Both systems enforce access control, file type restrictions (JPEG, PNG, GIF, WebP), and 10MB file size limits.

## Feature Specifications

Key features include subscription gating, payment management, a "Needs Attention" notification system, CSV import for players and schedules, bulk delete operations, facility linking, recurring scrimmages, and automation for finalizing scrimmages and invoicing. Player management, league migration requests, career stats, and team-scoped messages/payments are also supported.

A comprehensive scrimmage notification system includes in-app push notifications (via a `NotificationCenter` component) and email notifications for invites, reminders, approvals, and cancellations. Recurring scrimmage invitations are scheduled automatically. A unified event reminder system sends push notifications for both games and scrimmages 2 days before (6 PM) and 2 hours before the event.

The platform allows scrimmage creators to designate co-hosts with granular permissions (`canApproveRequests`, `canSendReminders`, `canManagePayments`).

## Mobile App (Expo)

The `/mobile` folder contains a native Expo React Native app that provides push notification support via OneSignal, using external IDs for targeted notifications.

# External Dependencies

## Third-Party Services

-   **Supabase Authentication**: User authentication and session management.
-   **Supabase Storage**: Cloud storage for user-uploaded media.
-   **Neon Database**: PostgreSQL hosting.
-   **Stripe**: Payment processing and subscription management.
-   **Resend**: Email delivery service.
-   **OneSignal**: Push notification service for mobile app.

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

## Recent Changes (Feb 2026)

### Real-Time Message Loading Fix
- Fixed critical issue where new messages wouldn't appear when navigating to a conversation thread (required force-closing the app)
- Root cause: Global `staleTime: Infinity` in queryClient meant message/conversation queries never auto-refetched on mount
- Added `staleTime: 0` and `refetchOnMount: 'always'` to conversations, messages, and payment requests queries in Messages.tsx
- Stabilized WebSocket connection: removed `selectedConversation` from dependency array, using a ref instead so WS stays connected across conversation switches (no more disconnects/reconnects when switching threads)
- WebSocket now invalidates messages for ANY conversation receiving new messages (not just the currently viewed one)
- Added automatic WebSocket reconnection with 3-second delay on unexpected disconnects

### Unified WebSocket Connection for Real-Time Messaging
- Consolidated two competing WebSocket connections (one in useNotificationWebSocket, one in Messages.tsx) into a single app-wide WebSocketProvider context (`client/src/context/WebSocketContext.tsx`)
- The old approach caused the server's `activeConnections` map to be overwritten (only one connection per user), so whichever connected last won and the other stopped receiving events
- New messages, read receipts, poll events, and notifications are now handled globally regardless of which page the user is on
- Messages.tsx uses the shared context's `subscribe()` API for page-specific events (typing indicators, online status) and `send()` for outgoing typing indicators
- Old `useNotificationWebSocket` hook is deprecated (file retained but no longer imported)

### "The Wall" (formerly "News") Feature Updates
- Renamed "News" screen to "The Wall" in Dashboard card and page header
- Updated posting permissions: Any league member with Player Pro or Commissioner tier can now post (previously required commissioner or team captain role)
- Pinning posts is restricted to Commissioner tier only (enforced on both frontend and backend)
- Added announcement comments system:
  - New `announcement_comments` table in schema with relations
  - Backend API routes: GET/POST `/api/announcements/:id/comments`, GET `/api/announcements/:id/comment-count`
  - Comment count shown on each post card with a comment icon
  - Clicking a post opens a detail view showing the full post and its comments
  - Comment input for Player Pro or Commissioner tier users
  - Comment counts are included in announcement list API responses
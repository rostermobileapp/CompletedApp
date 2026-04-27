# Overview

Rosters is a free, comprehensive sports team management platform designed to streamline operations for various sports. It offers league and team organization, game scheduling, messaging, and advanced tournament/playoff management. Operating on a freemium model with subscription-gated features, Rosters aims to be a robust solution for sports enthusiasts and administrators.

The platform includes a sophisticated tournament system supporting diverse formats like single elimination, double elimination, round robin, triple elimination, 3-game guarantee, consolation, compass draw, and a custom bracket builder. This system features canonical bracket generation with configurable bye policies, automatic match creation, scheduling, score tracking, format recommendations, and touch-optimized SVG-based bracket visualization with zoom/pan controls.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is a mobile-first, responsive single-page application built with React and TypeScript, utilizing `shadcn/ui` (Radix UI), `React Query` for server state, `React Context` for client-side state, and `Wouter` for routing. It features an Apple Fitness+ inspired landing page, dark-themed components, a fixed bottom navigation bar, and global slide-out menu, supporting user-controlled light/dark modes and gracefully presenting premium features.

For desktop browsers (viewport ≥1024px and not running inside a Capacitor/Natively wrapper), the app switches to a three-column desktop shell (`DesktopAppShell`): a 240px left primary sidebar (Home / My Team / Messages / Payments / Profile), a permanent 280px secondary menu column (`DesktopMenuColumn`) showing all 8 action items (Schedule Scrimmage, Invite Groups, Scrimmage Management, Create a Team, Create a League, League Management, Tournaments, Scorekeeper) with the same permission/lock logic as the mobile `SlideOutMenu`, and a wide main content area with a sticky team/league selector header. Mobile (<1024px) and native wrappers continue to render the existing single-column layout with the slide-out menu behind a hamburger.

## Backend Architecture

The backend is a modular REST API developed with Express.js and TypeScript. Authentication uses Supabase JWT token verification, synchronizing user data to a local PostgreSQL database. It includes a messaging infrastructure and uses `nanoid` for unique, URL-friendly league IDs.

## Data Storage Solutions

PostgreSQL serves as the primary database, managed with Drizzle ORM for type-safe operations and Drizzle Kit for migration management.

## Timezone Management

The platform uses a league-local string storage approach for datetime handling to prevent incorrect UTC conversions. Datetimes are stored as league-local strings in timestamp columns using Drizzle's `{ mode: 'string' }`. API schemas accept these strings directly, and helper functions convert them to UTC Date objects for arithmetic or formatting when needed.

## Authentication and Authorization

Supabase Authentication handles user authentication via email/password and JWT tokens. The backend validates these tokens. A role-based access control system (`free_tier`, `player_pro`, `commissioner`, `secondary_commissioner`) is enforced at both API and UI levels, with real-time subscription enforcement via Stripe webhooks.

## Tournament System Implementation

The tournament system supports various formats with a universal state machine approach for double elimination and intelligent bye handling. It includes phase 2 bracket generators for complex formats and integrates Round Robin + Playoffs with record-based playoff seeding. The frontend features a `BracketView` component for SVG bracket rendering with visual hierarchy, dynamic spacing, connector arrows, and zoom/pan controls. A custom bracket builder provides a drag-and-drop interface. Standalone tournaments operate on a commissioner-pays model ($10 per team via Stripe) with free, time-limited player access.

## Photo Album System

A mobile-optimized photo album feature allows users to upload, view, and download photos from tournaments and leagues. Tournament photo galleries are time-limited for participants, while league photo galleries are a premium feature. Both enforce access control, file type restrictions (JPEG, PNG, GIF, WebP), and 10MB file size limits.

## Feature Specifications

Key features include subscription gating, payment management, a "Needs Attention" notification system, CSV import for players and schedules, bulk delete operations, facility linking, recurring scrimmages, and automation for finalizing scrimmages and invoicing. Player management, league migration requests, career stats, and team-scoped messages/payments are also supported.

A comprehensive scrimmage notification system includes in-app push notifications (via a `NotificationCenter` component) and email notifications for invites, reminders, approvals, and cancellations. A unified event reminder system sends push notifications for games and scrimmages. Scrimmage creators can designate co-hosts with granular permissions.

## Mobile App (Expo)

A native Expo React Native app in the `/mobile` folder provides push notification support via OneSignal, using external IDs for targeted notifications.

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
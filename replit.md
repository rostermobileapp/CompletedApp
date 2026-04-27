# Overview

Rosters is a free, comprehensive sports team management platform designed to streamline operations for various sports. It offers league and team organization, game scheduling, messaging, and advanced tournament/playoff management. Operating on a freemium model with subscription-gated features, Roster aims to be a robust solution for sports enthusiasts and administrators.

The platform includes a sophisticated tournament system supporting diverse formats like single elimination, double elimination, round robin, triple elimination, 3-game guarantee, consolation, compass draw, and a custom bracket builder. This system features canonical bracket generation with configurable bye policies, automatic match creation, scheduling, score tracking, format recommendations, and touch-optimized SVG-based bracket visualization with zoom/pan controls.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is a mobile-first, responsive single-page application built with React and TypeScript, using `shadcn/ui` (Radix UI) for components, `React Query` for server state, `React Context` for client-side state, and `Wouter` for routing. The UI/UX emphasizes a mobile-first, dark-themed design with intuitive navigation, a fixed bottom navigation bar, and a global slide-out menu, supporting user-controlled light/dark modes and gracefully presenting premium features. The `/app` route serves as a clean, marketing-free entry point for the iOS native wrapper, ensuring authenticated users land directly on the Dashboard or are routed to onboarding, avoiding marketing content for App Store compliance.

## Backend Architecture

The backend is a modular REST API developed with Express.js and TypeScript. Authentication uses Supabase JWT verification, with user data synchronized to a local PostgreSQL database. The system includes messaging infrastructure and generates unique, URL-friendly IDs using `nanoid`.

## Data Storage Solutions

PostgreSQL is the primary database, managed with Drizzle ORM for type-safe operations and Drizzle Kit for migration management.

## Timezone Management

The platform uses a **league-local string storage** approach for datetime handling to prevent incorrect UTC conversions. Datetimes are stored as league-local strings in the database, and Zod schemas accept these strings directly. A helper `parseLeagueLocalDateTime` converts these strings to UTC Date objects for arithmetic and comparisons, ensuring consistency across storage, display, and calculations.

## Authentication and Authorization

Supabase Authentication manages user authentication. The backend validates JWT tokens with a Supabase service role key. A role-based access control system (`free_tier`, `player_pro`, `commissioner`, `secondary_commissioner`) is enforced at both API and UI levels, with real-time subscription enforcement via Stripe webhooks.

## Tournament System Implementation

The tournament system supports various formats with a universal state machine for double elimination and intelligent bye handling. It includes bracket generators for triple elimination, 3-game guarantee, consolation, and compass draw, and integrates Round Robin + Playoffs with record-based playoff seeding. The frontend features a `BracketView` component for SVG bracket rendering with zoom/pan controls. A custom bracket builder provides a drag-and-drop interface for designing tournament structures. Standalone tournaments operate on a commissioner-pays model, with players receiving free, time-limited access.

## Photo Album System

A mobile-optimized photo album feature allows users to upload, view, and download photos. Tournament photo galleries are accessible to approved participants within a time-limited window, featuring a Google Photos-inspired UI. League photo galleries are a premium, subscription-gated feature. Both systems enforce access control, file type restrictions, and file size limits.

## Feature Specifications

Key features include subscription gating, payment management, a "Needs Attention" notification system, CSV import for players and schedules, bulk delete, facility linking, recurring scrimmages, and automation for finalizing scrimmages and invoicing. Player management, league migration requests, career stats, and team-scoped messages/payments are supported. A comprehensive scrimmage notification system includes in-app push notifications (via a `NotificationCenter`) and email notifications. A unified event reminder system sends push notifications for games and scrimmages. Scrimmage creators can designate co-hosts with granular permissions.

## Multi-Step Onboarding Flow

A 4-screen onboarding flow guides new users after account creation, collecting basic information, additional details (timezone, competitive level, payment handles), and use case selection (Join a Team, Create & Manage a Team, Create & Manage a League). All data persists to the user profile, and a progress indicator tracks completion. Users who complete onboarding are not shown the flow again.

## iOS In-App Purchases (IAP)

The iOS app uses `NativelyPurchases` for StoreKit 2 IAP, integrating directly with Apple's App Store Server API. The backend handles verification of JWS payloads (preferred for StoreKit 2) or transaction IDs, supporting subscription product IDs for Player Pro and Commissioner tiers.

## Mobile App (Expo)

The `/mobile` folder contains a native Expo React Native app that provides push notification support via OneSignal, using external IDs for targeted notifications.

## Unified WebSocket Connection

A single app-wide `WebSocketProvider` context (`client/src/context/WebSocketContext.tsx`) consolidates WebSocket connections for real-time messaging, ensuring new messages, read receipts, poll events, and notifications are handled globally. This prevents connection conflicts and ensures consistent real-time updates across the application.

## "The Wall" (formerly "News") Feature Updates

"The Wall" screen allows any league member with Player Pro or Commissioner tier to post, with pinning restricted to Commissioner tier. An announcement comments system has been added, allowing users with appropriate tiers to view and post comments on announcements. Comment counts are displayed on post cards, and clicking a post reveals a detail view with comments.

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
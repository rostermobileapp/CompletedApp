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

## Direct Message Scoping

Direct message threads are strictly scoped to the dashboard's `(leagueId, teamId, tournamentId)` selection that was active when the thread was created. Two users can therefore have multiple separate DM threads — one per scope tuple — and switching the dashboard selector switches which thread is visible. The conversations table stores the full tuple; the `POST /api/conversations/direct` route normalizes scope server-side (tournament wins outright; team selection always canonicalizes leagueId from the team record), and `messagingService.findDirectConversation` uses exact `isNull`/`eq` matching per field so duplicate detection and visibility always agree.

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
-   **framer-motion**: Used for the bottom-nav active-tab spring morph.

## Design System — Depth & Elevation (Mobile)

Approved design language for the mobile home screen as of Apr 2026. See
`docs/design/elevation.md` for the full reference and rollout guide.

-   **Tokens** (defined in `client/src/index.css` `:root` and `.dark`):
    -   `--elev-rest` — soft drop shadow for cards at rest
    -   `--elev-lift` — pronounced shadow for floating/active elements
    -   `--elev-inset` — sunken inset shadow for inputs / recessed surfaces
    -   `--hairline` — 1px border color, replaces `border-border` on cards
-   **Utilities**: `.elev-rest`, `.elev-lift`, `.elev-inset`, `.hairline`
-   **Light mode**: black-based shadows
    -   rest: `0 1px 2px /.10` + `0 6px 16px -2px /.14`
    -   lift: `0 6px 12px -2px /.20` + `0 18px 36px -8px /.30`
    -   inset: `inset 0 2px 4px /.10` + `inset 0 1px 2px /.06` (dark inset)
    -   hairline: black @ 8%
-   **Dark mode**: inverted to a soft white halo (dark-on-dark disappears)
    -   rest: `0 1px 2px /.12` + `0 8px 22px -2px /.22`
    -   lift: `0 8px 18px -2px /.28` + `0 24px 48px -8px /.34`
    -   inset: `inset 0 1px 0 white/.16` (bright top rim) +
        `inset 0 3px 8px -1px black/.45` (soft inner darken)
    -   hairline: white @ 18%
-   **Active bottom-nav tab**: lifted into a circular "pill" using
    `--elev-lift`; morphs between tabs via framer-motion `<LayoutGroup>`
    + shared `layoutId="active-nav-pill"` (spring 520/30/0.9). App is
    wrapped in `<MotionConfig reducedMotion="user">` for a11y.
-   **App-wide rollout (Apr 2026)**: depth tokens are now baked into
    the shared shadcn primitives (`Card`, `Input`, `Textarea`,
    `Select`, `Dialog`, `AlertDialog`, `Sheet`, `Drawer`, `Popover`,
    `DropdownMenu`, `ContextMenu`, `Menubar`, `HoverCard`, `Tooltip`,
    `NavigationMenu`, `Command`, `Toast`, `Alert`) so every screen
    inherits the depth treatment automatically. Active items in the
    desktop sidebar (`DesktopAppShell.tsx`) also get `elev-lift`.
-   **Themed accent glow** (`.alerts-glow`, `.bracket-glow`): pulse uses
    `rgb(59, 130, 246)` (theme primary blue), not red.
-   **Nesting rule**: elevation IS applied to nested cards (poll cards
    inside threads, message bubbles, file preview chips, creator
    panels inside the message composer, etc.). The earlier "outermost
    only" rule was retired by user request — stack depth on every
    card-shaped surface.
-   **Currently applied to**: home cards in `Dashboard.tsx`,
    `BottomNavigation.tsx`, `ScheduleCalendarMobile.tsx`, and the full
    Messages page (conversation list, in-thread poll/payment cards,
    message bubbles, composer creator panels, file-preview chips).
    Broader rollout to shared shadcn primitives, desktop sidebar, and
    modals is still pending.

## Draft Tool

The league draft tool (`client/src/components/DraftSetupWizard.tsx`,
`client/src/pages/DraftRoom.tsx`, `server/draftEngine.ts`,
`server/draftRoutes.ts`) supports a multi-step setup wizard (Goalies →
Format → Order → Buddies → Notes → Review), real-time WebSocket-driven
pick room, and a captain READY lobby (`awaiting_captains` status) that
sits between commissioner "Start" and the first pick.

Key behaviors:

-   **Captain READY lobby**: `/api/drafts/:id/start` transitions the
    draft to `awaiting_captains` and notifies each captain via the
    Alerts/Notifications system. Captains call `/captain-ready` from
    the lobby UI; the commissioner calls `/begin` (which delegates to
    `startDraft`) once everyone is ready.
-   **Buzzer rule (`halve_next`)**: First timer expiry grants a 30-second
    extension to the captain on the clock and flags their NEXT turn to
    be halved (state stored in `buzzerExtensionState` jsonb). Second
    expiry auto-picks a random available player.
-   **Persistent re-entry**: A site-wide `ActiveDraftsBanner` renders on
    every screen except `/draft/:id`, queries
    `/api/user/active-drafts`, and lets users return to any draft they
    are commissioner or captain of.
-   **Wizard hydration**: Notes and other config hydrate from the
    persisted draft exactly once (guarded by `useRef`) so background
    refetches do not clobber in-progress edits.

## Development and Build Tools

-   **Vite**: Fast build tool and development server.
-   **React Query (TanStack Query)**: Server state management.
-   **Wouter**: Lightweight client-side routing.
-   **Drizzle ORM**: Type-safe database operations.
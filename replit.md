# Overview

Rosters is a free, comprehensive sports team management platform designed for various sports. It offers league and team organization, game scheduling, and messaging functionalities, aiming to streamline sports team management.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is a mobile-first, responsive single-page application built with React and TypeScript. It uses `shadcn/ui` components based on Radix UI for accessible interfaces, `React Query` for server state management, and `React Context` for client-side state. `Wouter` handles lightweight client-side routing. The application features a subscription-gating system that conditionally renders features based on user subscription tiers, supporting a freemium model.

## Backend Architecture

The backend is a REST API developed with Express.js and TypeScript. It employs a modular design for authentication, database operations, and route handling, with a storage abstraction layer for maintainability. Authentication uses Replit's OpenID Connect via Passport.js, with secure user sessions stored in PostgreSQL. Middleware is implemented for request logging and error handling.

## Data Storage Solutions

PostgreSQL is the primary database, utilizing Drizzle ORM for type-safe operations. The schema includes entities for users, leagues, teams, games, memberships, and messaging, with Drizzle Kit managing migrations. Session storage is also PostgreSQL-based, using `connect-pg-simple`.

## Authentication and Authorization

User authentication relies on Replit's OpenID Connect provider with session-based authentication. Role-based access control is implemented through subscription tiers (free, player_plus, commissioner) with hierarchical permissions. Authorization is enforced at both the API and UI levels to ensure security and manage feature access.

### Recent Fixes
- **User Upsert Email Conflict Handling** (October 2025): Updated the `upsertUser` function in the storage layer to gracefully handle email unique constraint violations. The function now checks for existing users by email before inserting, preventing server crashes when OIDC authentication attempts to create users with duplicate emails but different IDs. This ensures robust handling of authentication scenarios during both production use and testing.

## UI/UX Decisions

The UI/UX focuses on a mobile-first responsive design, leveraging `shadcn/ui` components for a consistent and accessible user experience. Recent design updates include:
- Landing page redesign with an Apple Fitness+ inspired aesthetic, large typography, parallax scrolling, and rounded cards with backdrop-blur, specifically targeting sports enthusiasts with relevant messaging.
- Game Schedule section buttons (Import Schedules, Schedule Game, Delete All Games) display horizontally on mobile devices instead of vertically, improving space efficiency and user experience.
- **Player Substitution Components Redesign** (October 2025): All player substitution request components redesigned with a consistent red/black color theme matching the "Record Scores" card on league management screen. Updated components include SubstituteRequestModal, SubstituteRequestsDashboard, SubstitutePlayerConfirmationInterface, and CommissionerApprovalInterface. Color palette uses red backgrounds (bg-red-50/dark:bg-red-950), black badges (bg-[#000000]), red borders (border-red-200/dark:border-red-700), and neutral gray for success/approved states instead of green. All previous blue, green, yellow, orange, and purple colors replaced with red/black/gray variants for consistent theming across light and dark modes.
- **Stats Page Redesign** (October 2025): Complete redesign of the Stats page to match NHL.com mobile interface with dark theme (#000000 background, #00A9FF accents). Features tab navigation (Skaters and Goalies), circular player avatars, card-based stat layouts, and mobile-optimized responsive design. Removed Defense category tab. Goalie stats now display Wins, Goals Against Average (formatted to 2 decimals), and Shutouts, calculated from game data in the gameGoalies table. Stats include league membership data (positions, jersey numbers) for complete player information display. **Season Filtering Fix** (October 2025): Fixed critical bug where goalie stats would not display when filtering by season. Updated backend `getGoalieStats` method to return stats for ALL seasons when no seasonId is provided (previously returned only games with NULL seasonId, causing empty results). This fix ensures goalie stats display correctly when users select a specific season or view all seasons.

## Feature Specifications

Key features include:
- **Subscription-gating system**: Conditional rendering of features based on subscription tiers.
- **Payment Request and Tracking**: Allows creation, management, and tracking of payment requests among league members, with integration for scrimmage-related payments.
- **Universal Needs Attention System**: A persistent notification bar on the dashboard for all users, displaying pending tasks.
- **Team Captain Announcements**: Extends the announcement system to allow team captains to post team-specific announcements with visibility controls.
- **CSV Import System**: Bulk import functionality for players and schedules with flexible column header matching, automatic team creation, and detailed error reporting. Includes downloadable CSV templates:
  - Player import template (`/player-import-template.csv`) with example data and field descriptions (Player Full Name, Team, Skill Level, Email, Jersey #, Player Type)
  - Schedule import template (`/schedule-import-template.csv`) with example data and field descriptions (Date, Time, Home Team, Away Team) - template has instructions on lines 1-2, headers on line 3, and blank data rows starting at line 4
- **Bulk Delete Operations**: Commissioner-only feature for deleting all players, teams, or games in a league with confirmation dialogs to prevent accidental data loss.
- **Facility Linking**: Commissioners can link leagues to facilities within the league management edit screen. Replaced the legacy "League Address" field with a facility selector dropdown that allows selecting existing facilities or creating new ones inline through a modal form.
- **Customizable Navigation**: Bottom navigation bar with 4 default shortcuts (My Team, Messages, Home, Profile) plus a customizable 5th slot. Users can add shortcuts from available options (Schedule, League Management, Scrimmages), reorder via long-press drag-and-drop, and delete custom shortcuts. Scrimmages shortcut includes a submenu for quick access to Schedule/Manage Scrimmages. Home shortcut is locked in center position with visual lock indicator and cannot be reordered. Preferences persist across sessions via user profile storage. League Management shortcut uses reactive query parameter parsing to properly navigate between league selection and management views.
- **Recurring Scrimmages**: Allows users to schedule scrimmages that repeat on specific days at certain times, similar to an alarm clock interface. Supports daily, weekly (with specific day selection), and monthly recurrence patterns. Users can configure ending conditions by date or occurrence count. The backend generates parent-child scrimmage instances with proper database linking, using anchor-based weekly recurrence logic to ensure correct occurrence generation. End date comparisons use date-only logic (ignoring time) to ensure inclusive boundary behavior.

# External Dependencies

## Third-Party Services

- **Replit Authentication**: For user authentication and session management.
- **Neon Database**: PostgreSQL hosting.
- **Stripe**: For payment processing and subscription management.
- **Google Cloud Storage**: For user-uploaded content.

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
# Overview

Rosters is a comprehensive sports team management platform that provides league and team organization, game scheduling, and messaging features. The application targets sports teams and leagues across multiple sports including hockey, basketball, soccer, baseball, and more. All features are completely free and accessible to all users in this beta environment.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is built as a single-page application using React with TypeScript, featuring a mobile-first responsive design. The UI leverages shadcn/ui components built on Radix UI primitives for accessible, customizable interfaces. State management is handled through React Query for server state and React Context for client-side state like subscription tiers. Navigation uses Wouter for lightweight client-side routing, with a bottom navigation pattern optimized for mobile use.

The application implements a subscription-gating system where features are conditionally rendered based on user subscription tiers. This allows for a freemium model where basic features are available to all users while advanced functionality requires paid subscriptions.

## Backend Architecture

The server follows a REST API pattern built with Express.js and TypeScript. The architecture separates concerns with dedicated modules for authentication, database operations, and route handling. A storage abstraction layer provides clean interfaces for all database operations, making the system maintainable and testable.

Authentication is handled through Replit's OpenID Connect integration with Passport.js, providing secure user sessions stored in PostgreSQL. The system includes middleware for request logging and error handling.

## Data Storage Solutions

The application uses PostgreSQL as the primary database with Drizzle ORM for type-safe database operations. The schema includes comprehensive entities for users, leagues, teams, games, memberships, and messaging. Drizzle Kit handles database migrations and schema management.

Session storage is implemented using PostgreSQL with connect-pg-simple for Express sessions. The database design supports complex relationships between users, teams, leagues, and games with proper foreign key constraints and indexing.

## Authentication and Authorization

User authentication leverages Replit's OpenID Connect provider with session-based authentication. The system includes role-based access control through subscription tiers (free, player_plus, commissioner) with hierarchical permissions. Authentication state is managed client-side through React Query with automatic token handling.

Authorization is implemented at both the API level (middleware checks) and UI level (conditional rendering based on subscription status). This ensures security while providing clear upgrade paths for users.

# Recent Changes

## Stripe Customer Synchronization (October 2025)

Fixed critical customer synchronization issue where users' email addresses were not being synced to Stripe, preventing them from accessing the billing portal:

- **Automatic Customer Creation**: Added `/api/stripe/create-portal-session` endpoint that creates Stripe customers on-demand when users access subscription management
- **Customer Data Sync**: Stripe customers are created with user's email, full name, and userId metadata for proper identification
- **Database Persistence**: Customer IDs are saved to `users.stripe_customer_id` for future reference
- **Billing Portal Integration**: Users are redirected to personalized Stripe billing portal sessions instead of static login links
- **Webhook Enhancement**: Existing webhook handler can now properly match subscription events to users via customer ID

**Setup Required**: For this feature to work in production, you must configure a valid Stripe secret key:
1. Get your Stripe secret key from the Stripe Dashboard (starts with `sk_live_` for production or `sk_test_` for testing)
2. Set the `STRIPE_SECRET_KEY` environment variable in Replit
3. Optionally set `STRIPE_WEBHOOK_SECRET` for secure webhook signature verification

## Landing Page Redesign with Pricing (September 2025)

Redesigned the landing page with an Apple Fitness+ inspired aesthetic and hockey-focused messaging:

- **Visual Design**: Large typography (text-5xl to text-8xl), parallax scrolling effects, rounded cards with backdrop-blur, and clean spacing
- **Hockey-First Messaging**: Direct, Tucker Carlson-style copy targeting beer league hockey players with headline "Your Beer League Team, Organized" and tagline "Enough chaos—play hockey"
- **Pricing Section**: Added comprehensive pricing display with three tiers:
  - **Free ($0)**: Basic features for casual players (league joining, roster viewing, basic messaging, game notifications)
  - **Player Plus ($8/month)**: Advanced features marked as "Most Popular" (all Free features plus advanced stats, scrimmage scheduling, team statistics, priority support)
  - **Commissioner ($12/month)**: League management features (all Player Plus features plus league creation/management, commissioner dashboard, league statistics, advanced team management)
- **Responsive Design**: Fully optimized for both desktop (1920x1080) and mobile (375x667) viewports with cards stacking vertically on mobile
- **CTA Optimization**: Updated call-to-action buttons to "Download Roster" with direct messaging

## Universal Needs Attention System (September 2025)

Implemented a universal "Needs Attention" task management system that replaced the previous commissioner-only todo system. This system provides a persistent black notification bar on the dashboard for all users, displaying pending tasks that require user action. The system includes:

- **Universal Access**: Available to all users regardless of subscription tier
- **Single-line Interface**: Compact notification bar matching the league selection dropdown design
- **Red Badge Notifications**: Clear visual indicator showing the number of pending tasks
- **Modal Details**: Expandable modal window showing detailed task breakdown including pending member approvals and score verifications
- **Real-time Updates**: Automatic refresh every 30 seconds to keep task counts current

The system maintains strict team boundaries and role-based functionality while providing a unified interface for task management across all user types.

## Team Captain Announcements Feature (September 2025)

Extended the announcements system to allow both commissioners and team captains to post announcements with team-based visibility controls. This empowers team captains to communicate directly with their teams while maintaining commissioner oversight of league-wide announcements.

- **Dual Posting Permissions**: Both commissioners and team captains can create announcements
- **Team-Based Visibility**: Commissioner posts (teamId = null) are visible to all league members, while team captain posts (teamId = specific team) are only visible to that team's members
- **Role-Based Badges**: Announcements display "Commissioner" or "Team Captain" badges based on the author's role
- **Edit/Delete Permissions**: Authors can edit/delete their own posts, commissioners can manage all posts
- **Database Schema**: Added teamId field to announcements table to support team-specific visibility filtering
- **Backward Compatibility**: Existing commissioner announcements continue to work with null teamId

This feature provides team captains with autonomy for team-specific communications while preserving the league-wide broadcast capability for commissioners.

## Announcements System Fixes (September 2025)

Fixed multiple critical issues in the commissioner announcements functionality:

- **Image Upload Functionality**: Resolved bug where "Add Images" button wasn't opening file picker. Fixed EnhancedMediaUploader component to properly handle clicks on children elements, restoring complete image upload workflow with drag-and-drop interface
- **Poll System Verification**: Confirmed poll creation, submission, and voting functionality works correctly end-to-end with proper API responses
- **Delete Posts**: Fixed foreign key constraint errors by adding proper cleanup for announcement_read_status and announcement_visibility tables
- **Edit Posts**: Resolved HTTP method mismatch (PUT → PATCH) to align with server API endpoints
- **Reaction Updates**: Fixed visibility filtering issues that were causing "Failed to update reaction" errors

All core announcement features now function properly including post creation, editing, deletion, reactions, polls, and media uploads.

# External Dependencies

## Third-Party Services

- **Replit Authentication**: OpenID Connect integration for user authentication and session management
- **Neon Database**: PostgreSQL hosting through @neondatabase/serverless for scalable database operations
- **Stripe**: Payment processing and subscription management for Player Plus and Commissioner tiers
- **Google Cloud Storage**: File storage and management for user-uploaded content like team photos and documents

## UI and Component Libraries

- **Radix UI**: Accessible headless UI components providing the foundation for all interactive elements
- **shadcn/ui**: Pre-built component library built on Radix UI for consistent design system
- **Tailwind CSS**: Utility-first CSS framework for responsive design and theming
- **Lucide React**: Icon library providing consistent iconography throughout the application

## Development and Build Tools

- **Vite**: Fast build tool and development server with TypeScript support
- **React Query (TanStack Query)**: Server state management with caching, synchronization, and error handling
- **Wouter**: Lightweight client-side routing for single-page application navigation
- **Drizzle ORM**: Type-safe database operations with automatic TypeScript inference
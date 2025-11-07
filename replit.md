# Overview

Rosters is a free, comprehensive sports team management platform designed for various sports. Its primary purpose is to streamline sports team management by offering league and team organization, game scheduling, and messaging functionalities. The platform supports a freemium model with subscription-gated features, aiming to provide a robust solution for sports enthusiasts and administrators.

## Recent Changes

**November 7, 2025**: Password Reset Feature
- Implemented comprehensive password reset functionality for users who forget their passwords
- Created dedicated ForgotPassword page (/forgot-password) where users can request password reset links via email
- Created ResetPassword page (/reset-password) for setting new passwords using tokens from email links
- Updated AuthModal to include a "Forgot password?" link in sign-in mode that navigates to the forgot password page
- Leverages Supabase's built-in password reset functionality (resetPasswordForEmail and updateUser methods)
- Token validation uses Supabase's PASSWORD_RECOVERY event for reliable detection of valid reset links
- Includes proper error handling, loading states, and user feedback throughout the flow
- **Router Fix**: Added /reset-password route to BOTH authenticated and unauthenticated routing to prevent "Page Not Found" errors when Supabase authenticates users during password recovery flow
- Vercel deployment configuration updated to use `npm run build` for proper frontend-only builds
- **Deployment Requirements**:
  - Supabase redirect URL must be whitelisted: Add production URL + `/reset-password` to Supabase Dashboard → Authentication → URL Configuration
  - Vercel Authentication must be disabled to allow password reset email links to work
  - Custom domain recommended to hide personal information from deployment URLs

**November 6, 2025**: Image Storage Migration to Supabase Storage
- Migrated all image storage from Google Cloud Storage to Supabase Storage
- Updated storage service to use Supabase Storage APIs for profile images, team logos, message attachments, and announcement media
- All upload endpoints now return both `uploadURL` (signed URL for upload) and `path` (normalized path for database storage)
- Frontend components updated to use the `path` returned from upload APIs
- Storage buckets required in Supabase:
  - `private` bucket for storing all user-uploaded content (profile images, team logos, message attachments, announcement media)
- Bucket setup required: Create a bucket named "private" in Supabase Storage dashboard before uploading images

**November 3, 2025**: Dashboard Card Consistency & Navigation Fixes
- Fixed Teams page black screen caused by React Hooks order violation - all hooks now called before conditional returns
- Updated News and Standings cards to match Stats card behavior - all three cards now always clickable with identical styling
- Fixed Announcements page navigation issue where authentication loading caused immediate redirect
- Added loading state to Announcements page to wait for auth before rendering
- Updated Announcements empty state to match Stats page design with centered layout and "Find a League" button
- Added pointer-events-none to AnnouncementBadge to prevent click interference

**November 2, 2025**: Subscription Role Persistence Fix (RESOLVED)
- Fixed critical bug where user subscription tier upgrades were not persisting in the database
- Root causes identified and resolved:
  1. **Duplicate role columns**: Users table contained duplicate "role" columns from both Supabase auth.users and app schema - Drizzle ORM was updating the correct enum column but selecting the wrong VARCHAR column
  2. **Authentication overwriting role**: Every API request was calling `upsertUser()` with `role: 'free_tier'`, overwriting paid subscriptions
  3. **Column name mismatch**: Raw SQL queries returned snake_case column names but TypeScript expected camelCase
- Implemented comprehensive fixes:
  - Modified `storage.getUser()` to use raw SQL with proper column aliases (snake_case → camelCase)
  - Modified `/api/stripe/sync-subscription` to use `sql.raw()` for direct database updates
  - Removed role parameter from authentication middleware to prevent overwriting existing roles
  - Added Supabase user metadata sync: subscription tier now stored in both PostgreSQL (`role` column) and Supabase metadata (`subscription_tier`)
- Temporary permission middleware disabled to prevent automatic downgrades
- Testing confirmed: Subscription upgrades and downgrades now properly sync and persist
- Note: Proper long-term fix requires database migration to separate Supabase auth data from application user profile data

**November 2, 2025**: Stripe Subscription Routing Fix
- Fixed issue where clicking "Upgrade Plan" was incorrectly routing to billing portal instead of checkout
- Root cause: Users with stale database roles (e.g., cancelled subscriptions not updated to free_tier) were treated as paid users
- Modified button logic to use button text ("Upgrade Plan" vs "Manage Subscription") instead of user role to determine routing
- Added automatic subscription sync on page load that checks Stripe and corrects role mismatches
- Ensures "Upgrade Plan" always goes to Stripe Checkout with pricing, "Manage Subscription" goes to billing portal
- Sync runs silently in background without disrupting user experience

**November 2, 2025**: Stripe Subscription Price ID Fix
- Fixed 405/400 errors when upgrading subscriptions via Stripe
- Removed hardcoded test price IDs from frontend Subscription.tsx
- Created new GET endpoint `/api/stripe/prices` to serve configured price IDs from environment variables
- Frontend now dynamically fetches price IDs via React Query on subscription page load
- Price IDs remain server-side for security while exposed only as needed to frontend
- Upgrade buttons disabled until price configuration loads
- Clear error messages if pricing unavailable or unconfigured

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is a mobile-first, responsive single-page application built with React and TypeScript. It utilizes `shadcn/ui` (based on Radix UI) for components, `React Query` for server state, `React Context` for client-side state, and `Wouter` for routing. It incorporates a freemium model with a subscription-gating system.

## Backend Architecture

The backend is a REST API developed with Express.js and TypeScript, featuring a modular design for authentication, database operations, and route handling. Authentication relies on Supabase JWT token verification, with the backend validating tokens using a Supabase service role key. User data is synchronized to a local PostgreSQL database upon authentication. The messaging system is designed to handle both direct team memberships and league-assigned team memberships for group conversations, ensuring all relevant members are included. Unique, URL-friendly IDs are generated for leagues using `nanoid`.

## Data Storage Solutions

PostgreSQL serves as the primary database, managed with Drizzle ORM for type-safe operations. The schema encompasses users, leagues, teams, games, memberships, and messaging. Drizzle Kit is used for migration management, and session storage is also PostgreSQL-based.

## Authentication and Authorization

Supabase Authentication handles user authentication via email/password and JWT tokens. The frontend uses the Supabase client for session management and automatic token inclusion in API requests, while the backend validates these tokens. New users are assigned a 'free_tier' role by default. Role-based access control (free_tier, player_pro, commissioner, secondary_commissioner) is enforced at both API and UI levels, with real-time subscription enforcement via Stripe webhooks and proactive verification.

## UI/UX Decisions

The UI/UX prioritizes a mobile-first responsive design using `shadcn/ui`. Design elements include an Apple Fitness+ inspired landing page, horizontal button layouts, dark-themed components, NHL.com mobile-inspired stats page redesign, and streamlined stats management. Premium features are gracefully presented to free-tier users. A fixed 5-item bottom navigation bar and a global slide-out hamburger menu provide intuitive navigation. The application supports user-controlled light and dark modes, with theme preferences stored in localStorage and dynamically applied using CSS custom properties. League cards prominently display unique IDs, and the league list includes a search function for these IDs. User profiles display a 6-character alphanumeric display ID.

## Feature Specifications

Key features include:
- **Subscription-Gating System**: Conditional rendering based on user subscription tiers.
- **Payment Management**: Tools for payment requests and tracking among league members.
- **Universal Needs Attention System**: Persistent notifications for pending tasks.
- **Team Captain Announcements**: Team-specific announcements with visibility controls.
- **CSV Import System**: Bulk import for players and schedules with flexible column matching.
- **Bulk Delete Operations**: Commissioner-only feature for players, teams, or games.
- **Facility Linking**: Commissioners can link leagues to facilities.
- **Recurring Scrimmages**: Scheduling scrimmages with various recurrence patterns.
- **Substitute Game Display**: Approved substitute games appear on player calendars.
- **Finalize & Invoice for Scrimmages**: Automation for finalizing rosters, sending notifications, and creating payment requests for scrimmages.
- **Standalone Team Creation**: Users can create teams independently of leagues.
- **Player Management**: Manual and CSV bulk import options for players.
- **League Migration**: Teams can request to join leagues, with commissioner approval.
- **Profile "Your Teams" Section**: Allows users to view and leave teams, with captain-specific deletion options.
- **Messages Scroll to First Unread**: Automatically scrolls to the newest unread message in conversations.
- **Dashboard Enhancements**: localStorage persistence for selections, unified selectors, and dynamic display of approved scrimmages and team records.
- **Profile Career Stats**: Aggregated career stats for users across all leagues.
- **Team-Scoped Messages and Payments**: Filtering of messages and payments based on the currently selected dashboard team.
- **Dashboard-Teams Page Synchronization**: Bidirectional synchronization of team selection between Dashboard and Teams page.
- **Calendar Team Filtering**: Calendar/Schedule page respects Dashboard team selection for displaying games.
- **Email Notifications for Scrimmage Invites**: Automated email notifications for invited players using Resend.
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
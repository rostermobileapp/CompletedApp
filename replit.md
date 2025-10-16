# Overview

Rosters is a free, comprehensive sports team management platform designed for various sports. It offers league and team organization, game scheduling, and messaging functionalities, aiming to streamline sports team management.

# Recent Changes

## October 16, 2025 - Enhanced Standalone Team Creation  
Significantly enhanced the team creation experience with multiple new options for customization and player management:

**Core Team Creation Features:**
- **Standalone Team Creation**: Users can create teams without being part of a league via "Create a Team" menu option
- **Unique Team IDs**: Each team gets a unique 6-character alphanumeric ID in ABC123 format (3 letters + 3 numbers) for easy identification and sharing
- **Team Photo Upload**: Integrated object storage for uploading team logos/photos during creation
- **Facility Assignment**: Select existing facilities or create new ones inline during team setup with facility dropdown and creation dialog

**Player Management Options:**
- **Manual Player Addition**: Add players one-by-one with firstName, lastName, email (optional), jerseyNumber, and position fields after team creation
  - Email is optional - players can be added without an account
  - If email matches existing user: creates team membership
  - If no email or user doesn't exist: creates placeholder player
  - Placeholder players stored separately until they create accounts
- **CSV Player Import**: Bulk import players using CSV format (firstName, lastName, email, jerseyNumber, position) directly on the team creation page
- Both methods auto-approve manually added players as team members

**League Migration:**
- **Team-to-League Requests**: Team creators can request to join their entire team to a league with all members
- **Commissioner Approval Flow**: League commissioners see pending team join requests in League Management and can approve/reject them
- **Automatic Member Migration**: When approved, the team's leagueId is updated and all team members automatically become league members
- **Profile Integration**: Teams display in Profile page "Your Teams" section with status indicators (Standalone/Part of a league) and request-to-join functionality

**Technical Implementation:**
- Schema: Added `facilityId` to teams table, maintained `logoUrl` for photos
- Backend: Enhanced `createStandaloneTeam` to accept photoUrl and facilityId, added `addManualPlayer` storage method
- API Routes: POST `/api/teams/:teamId/players/manual` for manual player addition
- Fixed "View Team" button to navigate to `/teams` page

## October 16, 2025 - Profile "Your Teams" Section with Leave Functionality
Added a "Your Teams" section to the Profile page that allows users to view and leave their team memberships:
- **Teams Display**: Shows all teams the user is a member of (both direct team memberships and league-assigned teams)
- **Leave Team Feature**: Users can leave teams with a confirmation dialog, similar to the "Leave League" functionality
- **Team Captain Protection**: Team captains cannot leave their team and must transfer the captain role first
- **Comprehensive Cleanup**: Leaving a team removes team memberships, clears game RSVPs, and removes beverage duty assignments
- Backend implementation includes the `/api/teams/:teamId/leave` endpoint and `leaveTeam` storage method

## October 15, 2025 - Messages Scroll to First Unread
Updated the messages thread view to automatically scroll to the newest unread message instead of the newest message overall when opening a conversation:
- **Smart Scroll Positioning**: When opening a conversation, the view now scrolls to the first unread message (messages not from the current user without read receipts)
- **Fallback Behavior**: If no unread messages exist, the view scrolls to the bottom to show the newest messages (preserving previous behavior)
- **Smooth UX**: Uses smooth scrolling animation and positions the first unread message at the top of the viewport for easy visibility

## October 15, 2025 - Fixed Bottom Navigation Bar
Removed the customizable navigation feature and replaced it with a fixed 5-item bottom navigation bar for consistency and simplicity:
- **Fixed Navigation Items**: Teams, Messages, Home (center with logo), Profile, and Payments (far right)
- **Removed Features**: Edit mode, drag-and-drop reordering, add/delete shortcuts, and navigation preference storage
- **Payments Shortcut**: New fixed shortcut to /payment-requests for quick access to payment management
- **Preserved Functionality**: Unread message badge and active state highlighting remain functional

## October 15, 2025 - Dashboard Scrimmage Display & Button Relocation
- **Dashboard Fix**: Dashboard now correctly displays approved scrimmages by fetching both scrimmage invites AND scrimmage requests (filtered by status='approved')
- **Button Relocation**: Moved "Finalize & Invoice" button from scrimmage details view to main scrimmage card for immediate access without expanding details
- **Loading State Fix**: Implemented per-scrimmage loading state isolation using mutation.variables check, ensuring only the active scrimmage button shows loading state when multiple scrimmages are present
- **Enhanced Feedback**: Success toast now includes the specific scrimmage title: "Confirmation notifications have been sent for '{scrimmageTitle}'"

## October 15, 2025 - Finalize & Invoice Feature for Scrimmages
Implemented an automated "Finalize & Invoice" feature for scrimmages that streamlines the roster confirmation and payment process:
- **Automatic Notifications**: Sends confirmation notifications to approved players with scrimmage details, and "scrimmage full" notices to non-approved players
- **Automated Payment Requests**: Automatically creates payment requests from the organizer to all approved players when a scrimmage has a cost
- **Schedule Integration**: Scrimmages automatically appear on approved players' schedules via existing calendar filtering
- **UI Updates**: Changed button from "Finalize Roster & Send Notifications" to "Finalize & Invoice" with contextual descriptions
- Backend endpoint `/api/scrimmages/:id/finalize` now handles all three operations atomically

## October 15, 2025 - Scrimmage Management Screen Fix
Fixed a critical route ordering bug in Express that caused the Scrimmage Management Screen to display "User not found" errors. The issue was resolved by moving specific `/api/users/scrimmages`, `/api/users/scrimmage-requests`, and `/api/users/scrimmage-invites` routes before the generic `/api/users/:userId` route. Express was incorrectly matching "scrimmages" as a userId parameter, resulting in 404 errors.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is a mobile-first, responsive single-page application built with React and TypeScript, utilizing `shadcn/ui` (based on Radix UI) for components, `React Query` for server state, `React Context` for client-side state, and `Wouter` for routing. It supports a freemium model with a subscription-gating system.

## Backend Architecture

The backend is a REST API developed with Express.js and TypeScript, featuring a modular design for authentication, database operations, and route handling. Authentication uses Replit's OpenID Connect via Passport.js with secure user sessions stored in PostgreSQL. Middleware handles request logging and error handling.

## Data Storage Solutions

PostgreSQL is the primary database, using Drizzle ORM for type-safe operations. The schema includes entities for users, leagues, teams, games, memberships, and messaging, with Drizzle Kit managing migrations. Session storage is also PostgreSQL-based.

## Authentication and Authorization

Authentication uses Replit's OpenID Connect with session-based methods. Role-based access control is implemented via subscription tiers (free, player_plus, commissioner) with hierarchical permissions, enforced at both API and UI levels. A dual-layer system (Stripe webhooks and proactive verification) ensures real-time enforcement of subscription cancellations.

## UI/UX Decisions

The UI/UX emphasizes a mobile-first responsive design using `shadcn/ui`. Recent design updates include an Apple Fitness+ inspired landing page, horizontal button layouts for game schedules on mobile, redesigned dark-themed player substitution components, an NHL.com mobile-inspired Stats page redesign with tab navigation and season filtering, and streamlined Stats Management. Premium features are presented with an elegant dialog for free-tier users, providing a clear upgrade path without cluttering the UI.

## Feature Specifications

Key features include:
- **Subscription-gating system**: Conditional rendering based on user tiers.
- **Payment Request and Tracking**: Management of payment requests among league members.
- **Universal Needs Attention System**: Persistent notification bar for pending tasks.
- **Team Captain Announcements**: Team-specific announcements with visibility controls.
- **CSV Import System**: Bulk import for players and schedules with flexible column matching, automatic team creation, and detailed error reporting. Downloadable templates are provided.
- **Bulk Delete Operations**: Commissioner-only feature for deleting players, teams, or games with confirmation.
- **Facility Linking**: Commissioners can link leagues to facilities via a selector dropdown or inline creation.
- **Fixed Bottom Navigation**: A bottom navigation bar with 5 fixed shortcuts (Teams, Messages, Home, Profile, Payments) providing quick access to core features. Includes unread message badge and active state highlighting.
- **Slide-Out Navigation Menu**: A global hamburger menu in the top-right corner providing permission-gated access to features like Schedule Scrimmage, Scrimmage Management, Create a League, League Management, and Payments.
- **Recurring Scrimmages**: Scheduling scrimmages with daily, weekly, or monthly recurrence patterns, including end conditions by date or occurrence count.
- **Substitute Game Display on Schedule**: Approved substitute games appear on a player's calendar with special formatting (orange "Substitute" badge, "Subbing for [Team Name]").
- **Finalize & Invoice for Scrimmages**: One-click automation that finalizes scrimmage rosters, sends targeted notifications (confirmations to approved players, "full" notices to others), and automatically creates payment requests when scrimmages have a cost. Integrates seamlessly with player schedules.

# External Dependencies

## Third-Party Services

- **Replit Authentication**: User authentication and session management.
- **Neon Database**: PostgreSQL hosting.
- **Stripe**: Payment processing and subscription management.
- **Google Cloud Storage**: User-uploaded content.

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
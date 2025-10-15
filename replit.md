# Overview

Rosters is a free, comprehensive sports team management platform designed for various sports. It offers league and team organization, game scheduling, and messaging functionalities, aiming to streamline sports team management.

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
- **Customizable Navigation**: A bottom navigation bar with default and customizable slots, persistent preferences, and specific handling for "League Management" and "Scrimmages" shortcuts.
- **Slide-Out Navigation Menu**: A global hamburger menu in the top-right corner providing permission-gated access to features like Schedule Scrimmage, Scrimmage Management, Create a League, League Management, and Payments.
- **Recurring Scrimmages**: Scheduling scrimmages with daily, weekly, or monthly recurrence patterns, including end conditions by date or occurrence count.
- **Substitute Game Display on Schedule**: Approved substitute games appear on a player's calendar with special formatting (orange "Substitute" badge, "Subbing for [Team Name]").

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
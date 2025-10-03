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

## UI/UX Decisions

The UI/UX focuses on a mobile-first responsive design, leveraging `shadcn/ui` components for a consistent and accessible user experience. Recent design updates include a landing page redesign with an Apple Fitness+ inspired aesthetic, large typography, parallax scrolling, and rounded cards with backdrop-blur, specifically targeting sports enthusiasts with relevant messaging.

## Feature Specifications

Key features include:
- **Subscription-gating system**: Conditional rendering of features based on subscription tiers.
- **Payment Request and Tracking**: Allows creation, management, and tracking of payment requests among league members, with integration for scrimmage-related payments.
- **Universal Needs Attention System**: A persistent notification bar on the dashboard for all users, displaying pending tasks.
- **Team Captain Announcements**: Extends the announcement system to allow team captains to post team-specific announcements with visibility controls.
- **CSV Import System**: Bulk import functionality for players and schedules with flexible column header matching, automatic team creation, and detailed error reporting.
- **Bulk Delete Operations**: Commissioner-only feature for deleting all players, teams, or games in a league with confirmation dialogs to prevent accidental data loss.

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
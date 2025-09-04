# Overview

Rosters is a comprehensive sports team management platform that provides league and team organization, game scheduling, messaging, and subscription-based features. The application targets sports teams and leagues across multiple sports including hockey, basketball, soccer, baseball, and more. It offers tiered subscription plans (Free, Player Plus, Commissioner) that unlock progressively advanced features for team coordination and league management.

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
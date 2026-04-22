# Overview

OilTracker is a professional oil trading platform that provides real-time market data, price tracking, and team collaboration features for oil commodity trading. The application enables traders to monitor oil grades (RBD Palm Oil, RBD Palm Stearin, etc.), view price charts, and communicate through an integrated chat system. It's designed for different user roles including admins, senior buyers, junior buyers, and viewers.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management and API caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation
- **Charts**: Recharts for data visualization and market price charts

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Development Setup**: ESBuild for production bundling, tsx for development execution
- **Storage**: In-memory storage implementation with interface for easy database swapping
- **Session Management**: Express sessions with PostgreSQL session store support
- **API Design**: RESTful endpoints with proper error handling and request logging

## Database Design
- **ORM**: Drizzle ORM configured for PostgreSQL
- **Schema**: Defined in shared schema with tables for users, oil grades, market data, and chat messages
- **Migrations**: Drizzle Kit for database migrations and schema management
- **Connection**: Neon Database serverless PostgreSQL connection

## Authentication & Authorization
- **Strategy**: Email/password authentication with role-based access control
- **Roles**: Four-tier system (admin, senior, junior, viewer) with different permission levels
- **Session Storage**: Server-side session management with PostgreSQL backing
- **Client State**: JWT-like token storage in localStorage for client-side auth state

## Data Models
- **Users**: Profile management with role-based permissions
- **Oil Grades**: Product catalog for different oil types and specifications
- **Market Data**: Time-series price data with USD/TND conversion rates
- **Chat Messages**: Real-time team communication with user attribution

## Real-time Features
- **Market Data**: Periodic polling for price updates every 5-10 seconds
- **Chat System**: Live messaging with automatic refresh intervals
- **Price Alerts**: Visual indicators for market status and price changes

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting for production data storage
- **Drizzle ORM**: Type-safe database queries and schema management
- **connect-pg-simple**: PostgreSQL session store for Express sessions

## UI/UX Libraries
- **Radix UI**: Accessible component primitives for complex UI interactions
- **Tailwind CSS**: Utility-first CSS framework with custom trading theme
- **Lucide React**: Icon library for consistent iconography
- **Recharts**: Charting library for market data visualization

## Development Tools
- **Vite**: Fast development server and build tool with hot module replacement
- **TypeScript**: Type safety across the entire application stack
- **ESBuild**: Fast JavaScript bundler for production builds
- **Replit Integration**: Development environment plugins and runtime error handling

## Validation & Forms
- **Zod**: Schema validation for API endpoints and form data
- **React Hook Form**: Performant form management with validation integration
- **@hookform/resolvers**: Bridge between React Hook Form and Zod validation

## Styling & Animation
- **class-variance-authority**: Type-safe CSS class composition
- **clsx**: Utility for conditional CSS classes
- **date-fns**: Date manipulation and formatting for timestamps
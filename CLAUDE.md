# Bulk Charges Builder

## Project Overview
A modern Next.js application for building and submitting bulk late fee charges to AppFolio. Rebuilt from a Python/FastAPI application with improved UI/UX.

## Tech Stack
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Table
- Zustand for state management

## Key Business Logic

### Late Fee Calculation
- **Cook County (Group A)**: $1000 threshold
- **Chicago (Group B)**: $500 threshold
- Formula: If 0-30 > 0 and total > threshold → (total - threshold) * 0.05 + $10
- Formula: If 0-30 > 0 and total <= threshold → $10
- If 0-30 == 0 → $0

### Occupancy Mapping
V2 occupancy_id → tenant_integration_id (via tenant directory) → V0 occupancy_id (via V0 tenants)

## Project Structure
- `/src/app/api/` - API proxy routes for AppFolio (V2 and V0)
- `/src/lib/calculations/` - Business logic (late fees, occupancy mapping)
- `/src/lib/appfolio/` - Constants (property groups)
- `/src/store/` - Zustand state management
- `/src/components/` - UI components

## Environment Variables
All credentials in Vercel env vars (server-side only):
- V2_BASE, V2_USER, V2_PASS, V2_PROPERTY_IDS
- V0_BASE, V0_DEV_ID, V0_CLIENT_ID, V0_CLIENT_SECRET
- BULK_GL_ACCOUNT_ID, TABLE_GL_ACCOUNT_NUMBER, FILTER_GL_ACCOUNT

## Commands
- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm run lint` - Run ESLint

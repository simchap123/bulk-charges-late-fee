# Bulk Charges Builder

A modern Next.js application for building and submitting bulk late fee charges to AppFolio.

## Features

- Fetch aged receivables from AppFolio V2 API
- Calculate late fees based on property group rules:
  - **Cook County (Group A)**: $1000 threshold, 5% + $10 base
  - **Chicago (Group B)**: $500 threshold, 5% + $10 base
- Map V2 occupancy IDs to V0 occupancy IDs
- Filter, sort, and select charges
- Export to CSV
- Submit bulk charges to AppFolio V0 API
- Dark/Light mode support

## Tech Stack

- **Next.js 14+** with App Router
- **TypeScript** for type safety
- **Tailwind CSS + shadcn/ui** for modern UI
- **TanStack Table** for powerful data tables
- **Zustand** for state management

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- AppFolio API credentials

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd bulk-charges-builder
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment example and configure:
   ```bash
   cp .env.example .env.local
   ```

4. Edit `.env.local` with your AppFolio credentials.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Environment Variables

All API credentials are stored as environment variables and are only accessible server-side:

| Variable | Description |
|----------|-------------|
| `V2_BASE` | AppFolio V2 API base URL |
| `V2_USER` | V2 API username |
| `V2_PASS` | V2 API password |
| `V2_PROPERTY_IDS` | Comma-separated property IDs to fetch |
| `V0_BASE` | AppFolio V0 API base URL |
| `V0_DEV_ID` | V0 Developer ID |
| `V0_CLIENT_ID` | V0 Client ID |
| `V0_CLIENT_SECRET` | V0 Client Secret |
| `BULK_GL_ACCOUNT_ID` | GL Account ID for bulk charges |
| `TABLE_GL_ACCOUNT_NUMBER` | GL Account number displayed in table |
| `FILTER_GL_ACCOUNT` | GL Account for filtering aged receivables |

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy

## License

Private - All rights reserved

# Raatap

Raatap matches hosts (people already driving somewhere) with riders heading the
same way, so they can carpool. A rider joins a host's journey at whatever
point along the route works for them, and only pays for the segment of the
host's route their own trip actually overlaps with.

Built with [Next.js](https://nextjs.org) and [Supabase](https://supabase.com)
(Postgres + PostGIS for route matching).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

To run the app locally, set the following in your `.env` or `.env.local` file:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`: Supabase project credentials.
- `LOCATIONIQ_API_KEY`: Get this from [LocationIQ](https://locationiq.com/) for location search/geocoding.
- `NEXT_PUBLIC_MAPTILER_API_KEY`: Get this from [MapTiler](https://maptiler.com/) for map rendering tiles.
- `RESEND_API_KEY`: Get this from [Resend](https://resend.com/) for transactional email.
- `NEXT_PUBLIC_ADMIN_EMAIL` / `ADMIN_PASSWORD`: Credentials for the `/admin` dashboard.

## Database

Schema and matching logic live in `supabase/migrations/`. Apply pending migrations with:

```bash
npx supabase db push --linked
```

## Deploy

Deployed on [Vercel](https://vercel.com). Pushing to a branch creates a preview deployment; merging to `main` deploys to production.

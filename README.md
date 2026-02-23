# neuralclasw-frontend

Standalone Next.js frontend for NeuralClub one-click deployment.

## Features

- Animated blue/cyan NeuralClub UI (`/`, `/pricing`, `/login`, `/register`, `/onboard`, `/dashboard`)
- Working auth with cookie sessions + Prisma user table
- DB-backed deployment records per user
- Railway owner-mode deploy: each user deploy creates a new service instance in your Railway project
- Stripe intentionally disabled for testing

## Environment variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Required:

- `DATABASE_URL`
- `DIRECT_URL`
- `AUTH_SESSION_SECRET`
- `RAILWAY_OWNER_MODE=true`
- `RAILWAY_API_TOKEN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_SERVICE_ID`
- `RAILWAY_BASE_ENVIRONMENT_ID`
- `RAILWAY_TEMPLATE_SERVICE_NAME_HINT` (example: `worker` or `gateway`)

Optional:

- `RAILWAY_GRAPHQL_ENDPOINT`
- `RAILWAY_REFERRAL_CODE`
- `RAILWAY_SOURCE_IMAGE` (explicit Docker image for worker template)

Fallback template mode (only if owner mode is off):

- `RAILWAY_TEMPLATE_SLUG` or `RAILWAY_DEPLOY_URL`

## Setup

```bash
cd neuralclasw-frontend
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

## Railway Worker Template (Required for real agent deploys)

Create a second Railway service in the same project for agent runtime:

1. Create new service -> Source Repo `placeparks/neuralclaw`
2. Set Root Directory to `neuralclasw-frontend/worker-template`
3. Deploy (it uses `worker-template/Dockerfile`)
4. Name it with a clear hint, e.g. `neuralclaw-worker-template`
5. Copy that service ID into frontend env:
   - `RAILWAY_SERVICE_ID=<worker-template-service-id>`
   - `RAILWAY_TEMPLATE_SERVICE_NAME_HINT=worker`

Do not use your frontend service ID as `RAILWAY_SERVICE_ID`. Cloned user instances must come from this worker template.

## Behavior

- Register/login writes users to Postgres via Prisma.
- Deploy action creates a deployment row tied to the logged-in user.
- In owner mode, backend clones a new Railway service from your template service, applies user-specific vars, and triggers deployment.
- Owner mode includes a template safety check: template service name must include `RAILWAY_TEMPLATE_SERVICE_NAME_HINT` unless `RAILWAY_SOURCE_IMAGE` is set.
- Dashboard shows user-specific deployment history and Railway console link.

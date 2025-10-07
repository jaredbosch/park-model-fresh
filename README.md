# Mobile Home Park Model

This project is a Create React App that models the operations of a mobile home park. It now includes Supabase-backed authentication and persistence so users can sign in, save their underwriting reports, and reload them later.

The app is deployed as a static React site and uses the `api/save-report.js` serverless function when running on Vercel.

## Prerequisites

- Node.js 18+
- npm 9+
- A Supabase project (Database + Authentication enabled)
- Optional: Resend account for notification emails
- Optional: OpenAI account for text embeddings
- [Vercel CLI](https://vercel.com/docs/cli) if you plan to preview locally with the Vercel runtime

## Environment variables

| Location | Variable | Description |
| --- | --- | --- |
| React app | `REACT_APP_SUPABASE_URL` | Supabase project URL |
| React app | `REACT_APP_SUPABASE_ANON_KEY` | Supabase anon/public API key |
| Vercel function | `SUPABASE_URL` | Supabase project URL |
| Vercel function | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (keep private) |
| Vercel function | `OPENAI_API_KEY` | Optional, required to generate embeddings when saving reports |
| Vercel function | `RESEND_API_KEY` | Optional, required to send notification emails when reports are saved |
| Vercel function | `RESEND_FROM_EMAIL` | Optional, verified sender address for Resend notification emails |
| Vercel function | `REPORT_NOTIFICATION_EMAILS` | Optional, comma-separated list of email recipients notified on save |

Create two `.env` files:

```bash
# React app runtime
cp .env.example .env.local   # create this file if it doesn't exist

# Vercel serverless runtime
cp .env.server.example .env  # create this file if it doesn't exist
```

Populate them with the variables from the table above. For CRA, any variables that need to be exposed to the browser must be prefixed with `REACT_APP_`.

> **Security note:** Never commit `.env*` files. Vercel manages environment variables securely via the dashboard or CLI.

### Email notifications

With `RESEND_API_KEY` and `RESEND_FROM_EMAIL` configured the `/api/save-report` function emails a copy of every saved or updated report. Recipients come from the optional `REPORT_NOTIFICATION_EMAILS` list (comma-separated) and the report contact's email address when available. Leave these values blank to disable email delivery while still allowing Supabase persistence.

## Local development

Install dependencies and start the CRA development server:

```bash
npm install
npm start
```

The app will be available at [http://localhost:3000](http://localhost:3000). Authentication and report saving will function locally as long as the Supabase environment variables are set.

## Local testing with the Vercel runtime

To simulate production behaviour (including the `/api/save-report` function) install the Vercel CLI and run:

```bash
npm install
npm run build
vercel dev
```

`vercel dev` reads environment variables from `.env`, `.env.local`, `.env.development.local`, etc. You can sync variables from your Vercel project with:

```bash
vercel login
vercel link
vercel env pull .env.local
```

Then restart `vercel dev` so both the React app and the API route run under the same environment.

## Running tests

```bash
npm test
```

This launches the CRA test runner in watch mode.

## Production build

Build the static React bundle that Vercel will serve:

```bash
npm run build
```

The output lives in `build/`. Push your branch and open a PR to trigger a Vercel preview deployment. You can test the Supabase-powered flows in the preview URL once the environment variables are set in the Vercel dashboard.

## Deploying to Vercel

Once you are satisfied with your changes locally:

1. Commit the changes to your git branch.
2. Push the branch to GitHub (or your connected Git provider). For example:

   ```bash
   git push origin <branch-name>
   ```

3. Vercel automatically detects the push, builds the project, and publishes a new deployment for that branch. You can monitor the progress from the Vercel dashboard or the Git provider's pull request view.

If you are merging to the production branch (commonly `main`), Vercel will promote the resulting deployment to your production URL once the build succeeds.

## Troubleshooting

- **Supabase not configured:** The UI will warn you if `REACT_APP_SUPABASE_URL` or `REACT_APP_SUPABASE_ANON_KEY` are missing. Ensure they are present in `.env.local` before running locally or configure them in Vercel > Project Settings > Environment Variables.
- **Report saves fail:** Check the serverless logs (`vercel logs <deployment-url>`) to confirm the `SUPABASE_SERVICE_ROLE_KEY` is available. The API now surfaces a descriptive error when the credentials are missing.
- **Emails/embeddings skipped:** The serverless function logs warnings if `RESEND_API_KEY` or `OPENAI_API_KEY` are not defined. These features are optional.


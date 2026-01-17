# Astro on Netlify Platform Starter

[Live Demo](https://astro-platform-starter.netlify.app/)

A modern starter based on Astro.js, Tailwind, and [Netlify Core Primitives](https://docs.netlify.com/core/overview/#develop) (Edge Functions, Image CDN, Blob Store).

## Astro Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Deploying to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/astro-platform-starter)

## Developing Locally

| Prerequisites                                                                |
| :--------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v18.14+.                                      |
| (optional) [nvm](https://github.com/nvm-sh/nvm) for Node version management. |

1. Clone this repository, then run `npm install` in its root directory.

2. For the starter to have full functionality locally (e.g. edge functions, blob store), please ensure you have an up-to-date version of Netlify CLI. Run:

```
npm install netlify-cli@latest -g
```

3. Link your local repository to the deployed Netlify site. This will ensure you're using the same runtime version for both local development and your deployed site.

```
netlify link
```

4. Then, run the Astro.js development server via Netlify CLI:

```
netlify dev
```

If your browser doesn't navigate to the site automatically, visit [localhost:8888](http://localhost:8888).

## Capturing inbound support emails (Resend → Astro/Netlify)

This repo includes an inbound webhook handler that stores inbound emails in Netlify Blobs.

### What’s implemented

- Webhook endpoint (Resend “email.received”): `/api/resend/inbound`
- Storage: Netlify Blobs store named `support-emails`
- Listing API: `/api/support-emails?category=feedback|errors`
- Detail API: `/api/support-email/:key`

### Netlify environment variables

Set these in Netlify Site settings → Build & deploy → Environment:

- `RESEND_API_KEY` – used to fetch the full inbound email from the Resend Receiving API.
- `RESEND_WEBHOOK_SECRET` – the Svix signing secret for your Resend webhook (used to verify `svix-*` headers).
- `SUPPORT_EMAILS_ADMIN_TOKEN` (recommended) – if set, the list/detail endpoints require `Authorization: Bearer <token>`.

### Resend setup

In Resend:

1. Verify the domain `fossilgeo.uk` (DNS records shown in Resend).
2. Enable Email Receiving / Inbound parsing for the domain (Resend will show the required inbound MX/DNS records).
3. Create an inbound webhook for event `email.received` pointing to:
   - `https://<your-netlify-site>/api/resend/inbound`
4. (Optional) Add routes/filters in Resend if you only want to accept specific recipients.

### DNS / MX notes

- Inbound email delivery depends on MX records.
- If `fossilgeo.uk` currently uses another email provider for inbound mail, switching MX to Resend will move inbound delivery to Resend.
- If you only want `feedback@fossilgeo.uk` and `errors@fossilgeo.uk` handled by Resend while keeping other mailboxes elsewhere, you’ll typically need mailbox-level routing supported by your current provider (catch-all/forwarding) or use a subdomain such as `support.fossilgeo.uk` for Resend receiving.

### Viewing stored emails

Once an inbound email is received and stored:

- List keys:
  - `GET /api/support-emails?category=feedback`
  - `GET /api/support-emails?category=errors`
- Fetch one:
  - `GET /api/support-email/<key>`

If `SUPPORT_EMAILS_ADMIN_TOKEN` is set, include:

- `Authorization: Bearer <SUPPORT_EMAILS_ADMIN_TOKEN>`

## Admin area Basic Auth

This repo includes a Netlify Edge Function that protects `/admin/*` with HTTP Basic Auth.

Set one of the following in Netlify Site settings → Build & deploy → Environment:

- `ADMIN_BASIC_AUTH` – format `username:password`
- OR `ADMIN_USER` and `ADMIN_PASS`

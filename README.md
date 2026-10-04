# Zukhti Home CRM

Team workspace for Zukhti Home, a turnkey interior design company. It covers leads, projects and stages, BOQ and quotes, payments, orders, and an AI voice update desk for the site team.

Built with Next.js 15, Postgres (Drizzle ORM) and Tailwind. It's designed to run on Vercel.

## What's in this version (Phases 1–2)

| Area | What it does |
| --- | --- |
| **Login & roles** | Owner, Admin, Designer, Site supervisor, Procurement, Accounts. Each role sees only what it needs. Non-admin staff see only their own office's projects. |
| **Team & offices** | Add people, reset passwords, disable access. Set currency and tax per office (Mumbai GST 18%, Dubai VAT 5%, China). |
| **Today** | Follow-ups due, active projects, payments due, visits this week, latest site updates. |
| **Leads** | Pipeline board from New to Won. Log calls and meetings, set the next follow-up, open WhatsApp in one tap. *Convert to client* creates the project with 8 standard stages and a payment schedule. |
| **Projects** | Stage tracker with % progress, site update timeline with photos, client contact, site visits, project details. |
| **BOQ & quotes** | Room-by-room BOQ from the rate library or custom items. Shows internal cost and margin. Creates versioned client quotes (print or save as PDF) with tax and payment schedule. |
| **Payments** | Milestones linked to stages; amounts follow the BOQ total. Mark invoiced or paid, with reference. Shows received vs outstanding. |
| **Orders** | Track items from ordered → in production → shipped → customs → delivered, with ETA. |
| **Rate library** | Standard cost and sell rates per item. |
| **Voice desk** | See below. |
| **Designs** | Upload renders or PDF drawings per room. Uploading the same room and title again saves a new version. Keep a design as an internal draft or share it for client approval, and see the client's decision and comments. |
| **Invoices** | Issue numbered invoices from payment milestones, numbered per office and year, e.g. `MUM-2026-0007`. Each invoice is printable and shows the taxable value and GST or VAT separately. |
| **Client portal** | See below. |

### Voice update desk (`/voice`)

1. Pick the project and tap the mic. Speak in English, Hindi, Hinglish or Arabic, or type.
2. Add photos with the camera or from the gallery. They're shrunk on the phone before upload.
3. The AI turns the update into stage progress, payments, orders, visits, design notes and issues. It only uses the speaker's role permissions, e.g. accounts can record payments but not change stages.
4. A review card shows exactly what will be saved. Edit or remove anything, and answer any clarifying question.
5. **Send-to-client toggle**: the AI drafts a friendly client message in the client's language. You choose which photos to share and can edit the text. It's on by default for site, design and admin, and off for procurement and accounts.
6. Confirm. Stages, project %, payments, orders and visits update, and the update appears on the project timeline with photos, transcript and the original voice note.

Without AI keys, the desk runs in **basic mode**: typed updates work, and stage percentages are picked up from keywords.

### Client portal (`/portal/…`)

Each client gets a private link with no password. Turn it on from **Project → Overview → Client portal**, then copy it or send it on WhatsApp. **New link** replaces the old one, and **Turn off** disables it.

On the portal, the client sees:
- overall progress, stages and expected handover
- upcoming visits
- site updates and the photos that were shared with them
- designs, which they can **approve** or **request changes** on
- the payment schedule, with paid and next-due amounts
- quotes, which they can accept, and invoices to download

The portal never shows costs, margins, vendor names, internal notes, issues or draft designs. Updates sent from the voice desk include the portal link when the portal is on. Design responses show up on the team's **Today** page.

## Set up and deploy on Vercel

1. **Import the repo** in Vercel (New Project → this repo). Framework: Next.js.
2. **Database:** in the Vercel project → Storage → add **Neon Postgres** and connect it to the project. It sets the database variables automatically. No extra connection string is needed.
3. **Photo storage:** Storage → add **Blob** and connect it to the project. Its settings are added automatically.
4. **Environment variables** (Settings → Environment Variables), see `.env.example`:
   - `AUTH_SECRET`: a long random string (`openssl rand -base64 32`)
   - `OPENAI_API_KEY`: speech-to-text for voice notes
   - `ANTHROPIC_API_KEY`: understanding updates and writing client messages (`ANTHROPIC_MODEL` defaults to `claude-sonnet-5-5`)
   - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`: optional for now; client updates are saved as *queued* until these are set
   - `APP_URL`: optional, your live address (e.g. `https://crm.zukhtihome.com`) used in portal links; otherwise taken from the request
5. **Deploy.** Database tables are created automatically on each deploy (`vercel-build` runs the migrations).
6. **Create the owner login:** open your live site. On a fresh install it goes to a one-time **setup** page. Enter your `AUTH_SECRET` value as the setup code, then your name, email and password. The three offices are created and you're signed in. The setup page stops working once this first account exists. Add your team under **Team**.

   (Alternative from a terminal: `npm run create-owner -- email "Name" "password"` with `DATABASE_URL` in `.env`.)

## Run locally

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm run db:migrate
npm run db:seed             # demo data: owner@zukhti.com / zukhti123 (also admin@, designer@, site@, procurement@, accounts@, dubai@)
npm run dev
```

Don't run `db:seed` on the live database, because the demo logins share a known password.

## Notes

- **WhatsApp:** free-form messages only reach clients who have messaged your business number in the last 24 hours. Outside that window, WhatsApp requires a pre-approved template. Templates and the client auto-reply assistant are Phase 3.
- **Voice notes, photos and design files** are stored in Vercel Blob with unguessable links. Anyone with the link can open the file.
- **Portal links** work like a private link: anyone who has the link can see that client's projects. Use **New link** if one is shared by mistake.
- **Schema changes:** edit `src/db/schema.ts`, run `npm run db:generate`, and commit the new file in `drizzle/`.

## Not built yet

- WhatsApp auto-reply assistant for client questions (Phase 3)
- Offline recording on weak site signal, and GPS-based project suggestion on the voice desk
- Procurement vendor database, multi-currency conversion, AI BOQ drafting (Phase 4)

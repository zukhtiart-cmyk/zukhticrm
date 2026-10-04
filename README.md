# Zukhti Home CRM

Team workspace for Zukhti Home, a turnkey interior design company. It covers leads, projects and stages, BOQ and quotes, payments, orders, and an AI voice update desk for the site team.

Built with Next.js 15, Postgres (Drizzle ORM) and Tailwind. It's designed to run on Vercel.

## What's in this version (Phases 1–5)

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
| **Procurement** (Phase 4) | Vendor list (China, India, UAE) with currency and lead time. Raise numbered purchase orders (`PO-2026-0001`) from BOQ lines in the vendor's currency, print them, and track shipment, container number and port. |
| **Exchange rates** (Phase 4) | Set on the Rates page. Each PO keeps the rate from the day it was raised. |
| **True margin** (Phase 4) | The BOQ margin switches from estimated cost to actual PO cost, converted to the project currency, as lines get ordered. |
| **Owner dashboard** (Phase 4) | Contract value, collected, due now, average margin, open leads, late orders, per-office figures, projects needing attention and the evening site summary. Totals are in INR-equivalent. |
| **Site expenses** (Phase 5) | Supervisors, designers and procurement log cash spent on site with a photo of the bill (Voice Desk → Expenses). Owner, admin and accounts approve or reject, then mark reimbursed. Nobody but the owner approves their own expense. |
| **Contractors** (Phase 5) | Carpenters, painters, electricians… with rates and payment details. Numbered, printable work orders (`WO-2026-0001`) per project and stage. Running bills (RA1, RA2…) can't exceed the work order; accounts approves and marks them paid with a UTR. |
| **Payments to contractors & labour** | Owner and accounts only (Voice Desk → Payments, or *Payments out* in the CRM). Record every payout — advance, wages, or payment of an approved bill — with mode (UPI, bank, cash, cheque), reference and receipt, against a project. Each contractor or labourer has an account showing approved bills, payments and the running balance (due to them, or advance with them). Optional WhatsApp confirmation to the person. Admins can approve bills but not pay them; other roles never see payment amounts. |
| **Site costs** (Phase 5) | Project tab comparing the BOQ cost budget with what's committed (purchase orders + contractor work orders + approved expenses). Flags overruns and spending ahead of progress on the dashboard. |
| **Snags & handover** (Phase 5) | Room-by-room snag list with before/after photos: supervisors mark fixed, designers or admins verify. Warranties and care instructions per project. *Mark handed over* is blocked while snags are open (unless overridden) and can WhatsApp the client their handover pack. Clients see the pack in the portal and report new snags there. A maintenance (AMC) reminder goes to the client on WhatsApp after 6 or 12 months. |
| **AI helpers** (Phase 4) | *Draft BOQ with AI* from a brief or floor plan (image/PDF), using your rate library; you tick the lines to keep. *Draft a follow-up* on each lead, sent on WhatsApp or opened in your own WhatsApp. An evening site summary at 7 pm IST for owners and admins. |
| **Rate library** | Standard cost and sell rates per item. |
| **Voice desk** | See below. |
| **Designs** | Upload renders or PDF drawings per room. Uploading the same room and title again saves a new version. Keep a design as an internal draft or share it for client approval, and see the client's decision and comments. |
| **Invoices** | Issue numbered invoices from payment milestones, numbered per office and year, e.g. `MUM-2026-0007`. Each invoice is printable and shows the taxable value and GST or VAT separately. |
| **Client portal** | See below. |

### Voice Desk (`/desk`)

The Voice Desk is a separate, phone-friendly app with its own sign-in page at **`/desk/login`**. Save it to your phone's home screen.

- **Site supervisors, procurement and accounts** use only the Voice Desk. If they open the CRM, they're sent to the desk.
- **Owner, admin and designers** keep the full CRM and can open the desk from it.
- **No signal on site?** Record as usual: the update and photos are kept on the phone and listed as *Saved on this phone*. Tap **Send now** when back online. Open the desk once with signal so it also opens offline.
- **Nearest site:** tap *Nearest site* to pick the project you're standing at (within 1 km). The first time at a site, tap *Save my current location as the site*.
- **Procurement** tab (procurement, owner, admin): vendors, purchase orders and shipments.
- **Expenses**, **Contractors** and **Snags** tabs (Phase 5), shown to the roles that use them. Accounts sees everything waiting for approval at the top.
- Each role is shown what it records and a snapshot of the project before speaking:

| Role | Records | Sees before speaking |
| --- | --- | --- |
| Site supervisor | Stage progress, work done, issues, photos | Stage list with % |
| Designer | Design approvals and changes, visits and meetings | Stage list with % |
| Procurement | Orders and deliveries, with dates (all offices) | Orders with status and ETA |
| Accounts | Payments received against milestones | Payment schedule and what's paid |
| Owner / admin | Everything | Everything |

How an update works:
1. Pick the project and tap the mic. Speak in English, Hindi, Hinglish or Arabic, or type.
2. Add photos with the camera or from the gallery. They're shrunk on the phone before upload.
3. The AI turns the update into structured changes, using only the speaker's role permissions.
4. A review card shows exactly what will be saved. Edit or remove anything, and answer any clarifying question.
5. **Send-to-client toggle**: the AI drafts a friendly client message in the client's language. You choose the photos and can edit the text. It's on by default for site, design and admin, and off for procurement and accounts.
6. Confirm. The project updates, and the desk shows **My recent updates**.

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

### WhatsApp assistant (Phase 3)

When a client messages your WhatsApp Business number, the app finds them by phone number and answers from their live project data. It covers:
- **Status:** stage, % complete, latest update, next stage, handover date
- **Photos:** latest site photos (client-visible ones only)
- **Payments:** paid so far and next payment due
- **Designs:** designs waiting for their approval
- **Deliveries:** furniture and fittings status, with dates
- **Visits:** next scheduled visit

How it behaves:
- **Several projects:** a client with more than one active project is asked which one, and can say "change project" any time.
- **Asking for a person:** "talk", "manager", complaints, delays, discounts or refunds hand the chat to the team. The client is told their project manager will reply, and the assistant pauses for that client until someone clicks **Resume assistant**.
- **Unknown numbers:** they become a new **WhatsApp lead**, get a welcome message, and are flagged for sales.
- **Media:** voice notes are transcribed if the OpenAI key is set. Photos and documents are flagged for a person.
- **Privacy:** replies only use client-safe facts. They never include vendors, costs, margins, internal notes or other clients.
- **Two modes** (Team → WhatsApp assistant): **Approve before sending** (default; drafts wait in the inbox) or **Reply automatically**.
- **Without an Anthropic key:** replies use built-in rules (status, photos, payments, designs, deliveries, visits). With the key, replies are written by AI in the client's language (English, Hindi, Hinglish or Arabic), still only from the same facts.

**WhatsApp inbox** (`/inbox`, for owner, admin and designers):
- Lists all chats, with **Needs attention** first.
- Approve or edit drafts, reply yourself, and pause or resume the assistant.
- The Today page and the menu show how many chats need you.

**Proactive messages:**
- **Voice Desk updates:** updates sent to clients go out on WhatsApp and appear in the inbox.
- **Weekly summary:** sent every **Saturday 10:00 IST**, one per active project. It can be turned off in Team settings.

**WhatsApp's 24-hour rule:** you can message a client freely only within 24 hours of their last message. Outside that window, the app uses your approved **template** if one is set up; otherwise the message is marked "queued" in the inbox.

#### Connecting WhatsApp (one time, about 30–60 minutes)

1. Go to **business.facebook.com**, create or select your Business, and verify it if asked.
2. Go to **developers.facebook.com → My Apps → Create app → Business**. Add the **WhatsApp** product.
3. In **WhatsApp → API Setup**:
   - Add your business phone number. It must not already be used in the WhatsApp app; a new number or a migrated one works.
   - Copy the **Phone number ID** into the Vercel variable `WHATSAPP_PHONE_NUMBER_ID`.
4. Create a **permanent access token**:
   - Go to Business settings → Users → **System users**. Add a system user as Admin.
   - Click **Generate token** for your app, with the permissions `whatsapp_business_messaging` and `whatsapp_business_management`.
   - Put the token in `WHATSAPP_TOKEN`.
5. In the Meta app, open **App settings → Basic** and copy the **App secret** into `WHATSAPP_APP_SECRET`.
6. Make up any long random text and put it in `WHATSAPP_VERIFY_TOKEN`. Redeploy on Vercel.
7. In **WhatsApp → Configuration → Webhook**, click **Edit**:
   - Callback URL: `https://YOUR-SITE/api/whatsapp/webhook`
   - Verify token: the same text as `WHATSAPP_VERIFY_TOKEN`
   - Click **Verify and save**, then **subscribe to `messages`**.
8. Create a message template in **WhatsApp Manager → Message templates**. Choose category **Utility** and give it a name such as `project_update`, with the body:
   > Hello {{1}}, here is an update from Zukhti Home: {{2}}

   Once it's approved, set `WHATSAPP_TEMPLATE_NAME=project_update` and `WHATSAPP_TEMPLATE_LANG=en`.
9. Add `CRON_SECRET` (any long random text) for the Saturday client summaries and the 7 pm owner summary, and `APP_URL` (your live address). For the owner summary, add your WhatsApp number under **Team**.
10. Redeploy. In the CRM, open **Team → WhatsApp assistant**: the checklist should show all ticks.
11. Test it: message your business number from a phone saved on a client (it needs a project). Then open **WhatsApp** in the CRM to see the draft.

## Set up and deploy on Vercel

1. **Import the repo** in Vercel (New Project → this repo). Framework: Next.js.
2. **Database:** in the Vercel project → Storage → add **Neon Postgres** and connect it to the project. It sets the database variables automatically. No extra connection string is needed.
3. **Photo storage:** Storage → add **Blob** and connect it to the project. Its settings are added automatically.
4. **Environment variables** (Settings → Environment Variables), see `.env.example`:
   - `AUTH_SECRET`: a long random string (`openssl rand -base64 32`)
   - `OPENAI_API_KEY`: speech-to-text for voice notes
   - `ANTHROPIC_API_KEY`: understanding updates, client messages, AI BOQ drafts, lead follow-ups and the daily summary (`ANTHROPIC_MODEL` defaults to `claude-sonnet-5-5`). Without it, follow-ups use templates and the summary is a plain list.
   - `CRON_SECRET`: protects the scheduled jobs (weekly client summary; the daily job sends the owner summary and clients' maintenance reminders)
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

- **WhatsApp:** free-form messages only reach clients who have messaged your business number in the last 24 hours. Outside that window, the app uses your approved template (see Phase 3 setup).
- **Voice notes, photos and design files** are stored in Vercel Blob with unguessable links. Anyone with the link can open the file.
- **Portal links** work like a private link: anyone who has the link can see that client's projects. Use **New link** if one is shared by mistake.
- **Schema changes:** edit `src/db/schema.ts`, run `npm run db:generate`, and commit the new file in `drizzle/`.

## Ideas for later

- Tally / Zoho Books export of invoices and payments
- Vendor portal for China suppliers to update production and shipping themselves

# Height Stones — website

A new front end for [heightstones.com](https://www.heightstones.com), built with Next.js 15 (App Router) and plain CSS.

## The idea

The site reads like a **core sample drilled through a quarry**. A depth gauge on the left shows how far down you've scrolled and which "stratum" you're in. The eight stones are stacked as geological beds.

**Every stone surface is generated live with WebGL** (`lib/stone-gl.ts`): marble veins, granite crystals, sandstone bedding, slate cleavage, travertine pores and onyx banding. Your cursor acts as a **raking lamp**: polished marble gleams, sandblasted granite shows its tooth, and onyx glows where the light passes. The **Slab Lab** lets visitors pick a stone, finish and thickness, judge it under the lamp, and send a sample request with a specimen code.

## Pages

| Route | What it is |
| --- | --- |
| `/` | Hero slab, numbers, the strata, Slab Lab, collections, seven checks, services, offices with live local time, enquiry |
| `/stones/[slug]` | One page per stone (8): live hero, varieties, uses, catalogue photos, every finish rendered, Slab Lab, next stone |
| `/collections/[slug]` | Paving & landscaping, garden ornaments (with catalogue photos), wall panels & mosaics, interior articles |
| `/api/enquiry` | Emails enquiries to the sales desk |

Text lives in `lib/data.ts`. Catalogue photos (from the current site, resized to WebP) are in `public/photos/` and listed in `lib/photos.ts`. Clicking a photo opens the enquiry form with that variety filled in.

## Run it

```bash
cd heightstones-site
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
```

### Deploy on Vercel

1. Create a new Vercel project from this repository and set **Root Directory** to `heightstones-site`.
2. Add the environment variables below and deploy.
3. Point `heightstones.com` at the project under *Settings → Domains*.

### Enquiry email

Enquiries are sent with [Resend](https://resend.com) (free for up to 3,000 emails a month):

1. Sign up, add the domain `heightstones.com`, and add the DNS records it gives you.
2. Create an API key.
3. Set these in Vercel (see `.env.example`):

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | the key from Resend |
| `ENQUIRY_TO` | inboxes to receive enquiries, comma-separated (default `ramakant@heightstones.com`) |
| `ENQUIRY_FROM` | e.g. `Height Stones website <website@heightstones.com>` |

Replies go straight to the customer, because their address is set as reply-to. Until the key is set, the form still works: it opens the visitor's own email app with the enquiry filled in. A hidden spam-trap field quietly drops bot submissions.

## Before launch

- **Seven checks**: the current site mentions a "7 step quality check policy" but doesn't list the steps. The steps in `CHECKS` are a sensible quarry-to-crate sequence. Replace them with your real ones.
- **Photos**: the catalogue images are small (at most 800 px) and carry the old watermarks. Higher-resolution originals would look sharper; drop them into `public/photos/` with the same file names.
- Browsers without WebGL 2 fall back to a flat colour gradient for each stone.

# Jennifer Schumacher — Website (static build)

Static, self-contained site. No build step, no dependencies. Deploy the contents of this folder to any static host (Vercel, Netlify, Cloudflare Pages, S3, etc.).

## Deploy to Vercel
1. Drag this whole folder into Vercel (or `vercel deploy` from inside it).
2. No framework preset needed — it's plain static HTML. Output/root = this folder.
3. `vercel.json` enables clean URLs (`/about` instead of `/about.html`).

## Pages
- `index.html` — Home
- `about.html` — About
- `buy.html` — Buy a Home
- `sell.html` — Sell Your Home
- `listings.html` — Featured Listings
- `property-mountainview.html` — Live listing detail (4945 E Mountain View Rd)
- `property.html` — Listing detail template
- `journal.html` — The Journal (blog index)
- `post-arcadia.html` — Example blog post

## Assets
- `assets/` — all photography
- `support.js` — client-side rendering runtime (required; keep alongside the HTML)

## Contact details baked in
- Phone / text: (480) 322-2593
- Email: jennifer@schumacherliving.com
- Russ Lyon Sotheby's International Realty, 6900 E. Camelback Rd., Suite 110, Scottsdale, AZ 85251

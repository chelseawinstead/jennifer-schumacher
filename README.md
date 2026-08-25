# Jennifer Schumacher — schumacherliving.com

The published website. Plain static HTML: no framework, no build step on the
host, no CMS. Everything in this repo root is generated from a Claude Design
export by `tools/build.py`; the only hand-written code lives in `tools/`.

Jennifer designs and edits the site in her own Claude Design document. When she
has changes, she exports the site, and that export is rebuilt into this repo.

---

## Refreshing the site from a new export

1. In Claude Design, export the site. You get a folder (usually
   `~/Downloads/site`) containing `index.html`, `SiteNav.dc.html`,
   `SiteFooter.dc.html`, `support.js`, `images/` and one folder per page.
2. From the repo root:

   ```
   python3 tools/refresh.py ~/Downloads/site
   ```

3. Check what changed, then ship it:

   ```
   git status
   git add -A
   git commit -m "Rebuild from Claude Design export"
   git push
   ```

Vercel deploys on push. Nothing else to do — no build command, no install step.

`refresh.py` only replaces the generated paths (`index.html`, `images/`,
`about/`, `listings/`, and so on). It never touches `tools/`, `README.md` or
your git history.

### Checking a build before you push

```
node tools/verify.mjs . /tmp/shots
```

Serves the site the way Vercel does, walks every route, and reports broken
images, dead links, console errors, unexpected outside requests, and whether
the contact modal and property film still work. Full-page screenshots land in
`/tmp/shots`. Needs `npm install playwright` once.

---

## What the build actually does

The Claude Design export is already complete, correct HTML — every headline,
paragraph and photo is right there in the file. But it ships `support.js`,
which downloads React, ReactDOM and Babel from unpkg.com on every page load in
order to do four small things:

1. move each page's `<helmet>` contents into `<head>`
2. expand `<dc-import name="SiteNav">` / `SiteFooter` into the shared markup
3. resolve `<sc-if>` blocks and `{{ value }}` placeholders
4. turn `style-hover="..."` attributes into hover styles

That is about a megabyte of framework, fetched from a third-party CDN, to
render text the browser already had. If unpkg is slow, blocked, or down, the
page is blank.

`tools/build.py` does all four at build time instead. The three genuinely
interactive pieces — the Buy/Sell/Little Black Book contact modals, the
click-to-play property film, and the footer's copy-email link — are handled by
`tools/site.js`, about 4KB of plain JavaScript with no dependencies.

The result renders completely with JavaScript switched off, and the only
outside request left is Google Fonts.

Along the way the build also:

- **publishes listings under their street address** rather than Claude Design's
  internal slugs, and rewrites every link, canonical tag and sitemap entry to
  match. Old URLs 301-redirect via `vercel.json`.
- **re-encodes the photography.** Exports run about 54MB, with single images
  over 5MB and several photographs saved as 2MB PNGs. Everything is capped at
  2000px wide and re-encoded (photographic PNGs become JPEGs, logos keep their
  transparency), which brings the site to roughly 17MB. Images the pages don't
  reference are left out.
- **defers hidden video embeds.** The property film's YouTube iframe sits
  inside a hidden block, so the browser used to load it on page view — every
  visitor hit YouTube whether or not they pressed play. It now loads on click.
- **applies `tools/fixes.css`**, a short, commented list of layout bugs that
  ship in the export itself. Today that is the homepage's "Affiliations &
  recognition" row, which ran ~460px past the edge of a phone screen. Fix these
  in the Design document when you can and delete them from here.

### Route map

| Published URL | Claude Design slug |
| --- | --- |
| `/listings/4945-e-mountain-view-road` | same |
| `/listings/20320-e-sunset-court` | `paradise-valley-estate` |
| `/listings/1823-e-watford-court` | `watford-court` |
| `/listings/4020-n-scottsdale-road` | `grayhawk-residence` |
| `/listings/7618-n-19th-drive` | `old-town-residence` |

When Jennifer adds or renames a listing in Claude Design, add a line to
`ROUTES` in `tools/build.py` and a redirect in `tools/vercel.json`.

---

## Vercel settings

Framework preset **Other**, build command **none**, output directory **`.`**
(the repo root), install command **none**. This repo previously held an Astro
project, so if the project still has the Astro preset saved, change it.

`vercel.json` sets clean URLs, no trailing slash, long cache headers on
`/images`, and the listing redirects.

## Contact points

Phone and text: (480) 322-2593. The Buy and Sell forms open the visitor's mail
client to `jennifer@schumacherliving.com`; the Little Black Book signup goes to
`info@schumacherliving.com`. Swap in a form service if you want submissions
captured server-side.

Canonical URLs, `robots.txt` and `sitemap.xml` all use
`https://www.schumacherliving.com` — change `SITE_URL` in `tools/build.py` if
the live domain differs.

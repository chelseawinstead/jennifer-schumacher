#!/usr/bin/env python3
"""
Rebuild the pages the team's content drives.

    python3 tools/render_content.py

This is the half of the build that does not need the Claude Design export:
listing pages, the Listings page, the homepage cards, the sitemap, and the
photos uploaded through the form. It runs on GitHub every time someone saves a
listing, because Vercel serves this repo as-is and would otherwise keep showing
the pages exactly as they were.

The full build (tools/refresh.py) still owns everything that comes from the
export - the design itself. This only ever rewrites content into the shapes the
export already produced.
"""

import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import listings as listing_tpl          # noqa: E402
import cards as listing_cards           # noqa: E402

CONTENT = os.path.join(REPO, "content")
TEMPLATE = os.path.join(HERE, "listing-template.html")
SITE_URL = "https://www.schumacherliving.com"

MAX_WIDTH = 2000
JPEG_QUALITY = 82

# Pages the export owns; their routes go in the sitemap ahead of the listings.
STATIC_ROUTES = ["", "about", "buy", "sell", "listings", "journal"]


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def load_listings():
    import yaml
    folder = os.path.join(CONTENT, "listings")
    if not os.path.isdir(folder):
        return []
    out = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith((".yml", ".yaml")):
            continue
        data = yaml.safe_load(read(os.path.join(folder, name))) or {}
        for group in ("seo", "cardart"):
            for key, value in (data.pop(group, None) or {}).items():
                if value not in (None, "", []):
                    data.setdefault(key, value)
        if str(data.get("state", "Published")).strip().lower() != "published":
            continue          # drafts and archived listings are not on the site
        if not data.get("slug"):
            street = (data.get("address") or "").split(",")[0]
            data["slug"] = (re.sub(r"[^a-z0-9]+", "-", street.lower()).strip("-")
                            or os.path.splitext(name)[0])
        out.append(data)
    return out


def bring_in_photos(wanted):
    """Copy photos uploaded through the form into images/, capped at 2000px.

    A listing photo arrives straight off a camera at several megabytes. The
    export's images go through the same cap in tools/build.py; these have to
    go through it too or the site grows every time someone posts.
    """
    src_dir = os.path.join(CONTENT, "images")
    if not os.path.isdir(src_dir):
        return []
    from PIL import Image, ImageOps
    out_dir = os.path.join(REPO, "images")
    os.makedirs(out_dir, exist_ok=True)
    brought = []
    for name in sorted(os.listdir(src_dir)):
        if name.startswith(".") or name not in wanted:
            continue
        src, dest = os.path.join(src_dir, name), os.path.join(out_dir, name)
        if os.path.exists(dest) and os.path.getmtime(dest) >= os.path.getmtime(src):
            continue
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            if im.width > MAX_WIDTH:
                im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)),
                               Image.LANCZOS)
            if name.lower().endswith(".png"):
                im.save(dest, "PNG", optimize=True)
            else:
                im.convert("RGB").save(dest, "JPEG", quality=JPEG_QUALITY,
                                       optimize=True, progressive=True)
        brought.append(name)
    return brought


def photos_of(data):
    names = {listing_tpl.photo_src((d.get("hero") or {}).get("src", "")) for d in data}
    for d in data:
        for key in ("card", "card_home"):
            if d.get(key):
                names.add(listing_tpl.photo_src(d[key]))
        for photo in d.get("gallery") or []:
            names.add(listing_tpl.photo_src(photo.get("src", "")))
    return {n for n in names if n}


def main():
    data = load_listings()
    if not os.path.isfile(TEMPLATE):
        sys.exit("%s is missing — run tools/refresh.py once to create it" % TEMPLATE)
    template = read(TEMPLATE)

    brought = bring_in_photos(photos_of(data))

    live = set()
    for listing in data:
        route = "listings/%s" % listing["slug"]
        write(os.path.join(REPO, route, "index.html"),
              listing_tpl.render(template, listing))
        live.add(route)

    # A listing that is no longer published keeps no page behind it.
    retired = []
    listings_dir = os.path.join(REPO, "listings")
    for name in sorted(os.listdir(listings_dir)):
        page = os.path.join(listings_dir, name, "index.html")
        if os.path.isfile(page) and "listings/%s" % name not in live:
            shutil.rmtree(os.path.join(listings_dir, name))
            retired.append(name)

    for rel, fill in (("listings/index.html", listing_cards.render_listings_index),
                      ("index.html", listing_cards.render_home)):
        path = os.path.join(REPO, rel)
        write(path, fill(read(path), data))

    # Same order tools/build.py writes, so the two builders never disagree
    # about the sitemap and rewrite each other's work.
    routes = (STATIC_ROUTES + sorted(journal_routes())
              + sorted("listings/%s" % d["slug"] for d in data))
    urls = "\n".join(
        '  <url><loc>%s/%s</loc><changefreq>weekly</changefreq>'
        '<priority>%s</priority></url>' % (SITE_URL, r, "1.0" if r == "" else "0.8")
        for r in routes)
    write(os.path.join(REPO, "sitemap.xml"),
          '<?xml version="1.0" encoding="UTF-8"?>\n'
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + urls + "\n</urlset>\n")

    print("%d listing(s) published%s" % (len(data),
          (", %d retired: %s" % (len(retired), ", ".join(retired))) if retired else ""))
    if brought:
        print("photos brought in: %s" % ", ".join(brought))


def journal_routes():
    folder = os.path.join(REPO, "journal")
    if not os.path.isdir(folder):
        return []
    return ["journal/%s" % n for n in os.listdir(folder)
            if os.path.isfile(os.path.join(folder, n, "index.html"))]


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Turn a Claude Design site export into a fully static website.

The export ships real, complete HTML inside <x-dc> wrappers, but relies on
support.js — which pulls React, ReactDOM and Babel from unpkg.com at runtime —
to do four small jobs:

  1. move <helmet> contents into <head>
  2. expand <dc-import name="SiteNav|SiteFooter"> into the shared markup
  3. resolve <sc-if> blocks and {{ value }} placeholders
  4. turn style-hover="..." attributes into hover styles

This script does 1, 2 and the static half of 3 and 4 at build time, and hands
the genuinely interactive parts (contact modals, click-to-play video, the
footer's copy-email link) to a ~4KB vanilla site.js. The result needs no
framework, no CDN and no JavaScript at all to render.

Usage:  python3 tools/build.py <export-dir> <output-dir>
"""

import html
import json
import os
import re
import shutil
import sys
from collections import OrderedDict

# --------------------------------------------------------------------------
# Route map: Claude Design's slugs -> the URLs we actually publish.
# Listing pages are published under their real street address.
# --------------------------------------------------------------------------
# The listing whose exported page supplies the template every listing is built
# from. It needs a hero film and captioned gallery photos, so the branches the
# other listings need are present to fill or remove.
LISTING_TEMPLATE = "listings/2300-e-campbell-ave-202"

# Listing content, held apart from the design. When content/listings is absent
# the build falls back to taking listings straight from the export, which is
# how the site worked before the team had a form.
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(REPO, "content")

ROUTES = {
    "listings/paradise-valley-estate": "listings/20320-e-sunset-court",
    "listings/watford-court": "listings/1823-e-watford-court",
    "listings/grayhawk-residence": "listings/4020-n-scottsdale-road",
    "listings/old-town-residence": "listings/7618-n-19th-drive",
}

SITE_URL = "https://www.schumacherliving.com"

# Values the export's page logic computes that are constant for a static
# build. Anything not listed here stays dynamic and is driven by site.js.
STATIC_VALUES = {
    # watford-court: props.heroVideo defaults to false, so the hero is the
    # still image and the video branch never renders.
    "heroIsVideo": False,
    "heroIsImage": True,
}

# --------------------------------------------------------------------------


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def find_block(src, tag, start=0):
    """Find <tag ...> ... </tag> handling nesting. Returns (open_start,
    inner_start, inner_end, close_end) or None."""
    open_re = re.compile(r"<%s(\s[^>]*)?>" % tag, re.S)
    close = "</%s>" % tag
    m = open_re.search(src, start)
    if not m:
        return None
    depth = 1
    pos = m.end()
    while depth:
        nxt_open = open_re.search(src, pos)
        nxt_close = src.find(close, pos)
        if nxt_close == -1:
            raise ValueError("unclosed <%s>" % tag)
        if nxt_open and nxt_open.start() < nxt_close:
            depth += 1
            pos = nxt_open.end()
        else:
            depth -= 1
            pos = nxt_close + len(close)
    return m.start(), m.end(), pos - len(close), pos


def attrs_of(tag_text):
    return dict(re.findall(r'([a-zA-Z-]+)="([^"]*)"', tag_text))


def extract_component(path):
    """Pull the <helmet> and the body markup out of a .dc.html component."""
    src = read(path)
    helmet = ""
    hb = find_block(src, "helmet")
    if hb:
        helmet = src[hb[1]:hb[2]]
        src = src[:hb[0]] + src[hb[3]:]
    xb = find_block(src, "x-dc")
    body = src[xb[1]:xb[2]] if xb else ""
    return helmet.strip(), body.strip()


# --------------------------------------------------------------------------
# sc-if resolution
# --------------------------------------------------------------------------

def resolve_conditionals(markup, values):
    """Resolve <sc-if value="{{ name }}"> blocks.

    Names with a known static value are unwrapped (true) or deleted (false).
    Everything else becomes <div data-if="name"> for site.js to toggle.
    """
    out = markup
    while True:
        blk = find_block(out, "sc-if")
        if not blk:
            break
        o_start, o_end, i_end, c_end = blk
        tag = out[o_start:o_end]
        name_m = re.search(r'value="\{\{\s*([A-Za-z0-9_]+)\s*\}\}"', tag)
        name = name_m.group(1) if name_m else None
        # The export records each condition's starting value; blocks that
        # start visible are emitted visible so the page reads correctly
        # before (or without) any JavaScript.
        starts_open = "hint-placeholder-val=\"{{ true }}\"" in tag
        inner = out[o_end:i_end]
        if name in values:
            replacement = inner if values[name] else ""
        else:
            if not starts_open:
                inner = defer_iframes(inner)
            replacement = '<div data-if="%s"%s>%s</div>' % (
                name, " data-open" if starts_open else "", inner)
        out = out[:o_start] + replacement + out[c_end:]
    return out


# --------------------------------------------------------------------------
# {{ value }} bindings
# --------------------------------------------------------------------------

EVENT_MAP = {"onClick": "click", "onChange": "input", "onInput": "input"}


def resolve_bindings(markup, values):
    """Replace {{ }} placeholders with static text or data- hooks."""

    # style="{{ someStyle }}" — nav active-link styling, always static.
    def style_sub(m):
        name = m.group(1)
        val = values.get(name, "")
        return 'style="%s"' % val if val else ""

    markup = re.sub(r'style="\{\{\s*([A-Za-z0-9_]+)\s*\}\}"', style_sub, markup)

    # Event handlers -> data-on-<event>
    def event_sub(m):
        attr, name = m.group(1), m.group(2)
        return 'data-on-%s="%s"' % (EVENT_MAP[attr], name)

    markup = re.sub(
        r'\b(%s)="\{\{\s*([A-Za-z0-9_]+)\s*\}\}"' % "|".join(EVENT_MAP),
        event_sub, markup)

    # Controlled input values -> data-model
    markup = re.sub(r'\bvalue="\{\{\s*([A-Za-z0-9_]+)\s*\}\}"',
                    lambda m: 'data-model="%s"' % m.group(1), markup)

    # iframe src that is only known once the video plays
    markup = re.sub(r'\bsrc="\{\{\s*([A-Za-z0-9_]+)\s*\}\}"',
                    lambda m: 'data-src-from="%s"' % m.group(1), markup)

    # Remaining placeholders are text nodes.
    markup = re.sub(r'\{\{\s*([A-Za-z0-9_]+)\s*\}\}',
                    lambda m: '<span data-text="%s"></span>' % m.group(1),
                    markup)
    return markup


# --------------------------------------------------------------------------
# style-hover -> real CSS
# --------------------------------------------------------------------------

def extract_hover_styles(markup, css_rules):
    """style-hover="background: #04305e;" becomes a class with a :hover rule."""
    def sub(m):
        decls = html.unescape(m.group(1)).strip().rstrip(";")
        if not decls:
            return ""
        key = decls
        if key not in css_rules:
            css_rules[key] = "hv%d" % (len(css_rules) + 1)
        cls = css_rules[key]
        return "__HOVERCLASS__%s__" % cls

    markup = re.sub(r'\sstyle-hover="([^"]*)"', sub, markup)

    # Fold the marker into the element's class attribute.
    def fold(m):
        tag = m.group(0)
        classes = re.findall(r"__HOVERCLASS__([A-Za-z0-9]+)__", tag)
        if not classes:
            return tag
        tag = re.sub(r"__HOVERCLASS__[A-Za-z0-9]+__", "", tag)
        existing = re.search(r'\sclass="([^"]*)"', tag)
        if existing:
            merged = (existing.group(1) + " " + " ".join(classes)).strip()
            tag = tag[:existing.start()] + ' class="%s"' % merged + tag[existing.end():]
        else:
            tag = tag[:-1].rstrip() + ' class="%s">' % " ".join(classes)
        return tag

    return re.sub(r"<[a-zA-Z][^>]*>", fold, markup)


# --------------------------------------------------------------------------
# Page logic -> a small JSON config for site.js
# --------------------------------------------------------------------------

def page_config(logic_js):
    """Read the mail details out of the export's DCLogic class so the vanilla
    modal sends exactly the same message the React version did."""
    if not logic_js:
        return None
    cfg = {}
    m = re.search(r"mailto:([^'\"?]+)\?subject='\s*\+\s*encodeURIComponent\('([^']+)'\)", logic_js)
    if m:
        cfg["mailTo"] = m.group(1)
        cfg["mailSubject"] = m.group(2)
    fields = re.findall(r"set([A-Z][a-z]+):", logic_js)
    if fields:
        cfg["fields"] = [f[0].lower() + f[1:] for f in fields]
    if "phone" in logic_js and "setPhone" in logic_js:
        cfg["phoneRequired"] = True
    m = re.search(r"url\s*=\s*this\.props\.heroVideoUrl\s*\?\?\s*'([^']+)'", logic_js)
    if m:
        vid = re.search(r"(?:youtu\.be/|v=|embed/|shorts/)([A-Za-z0-9_-]{6,})", m.group(1))
        if vid:
            cfg["videoEmbedUrl"] = (
                "https://www.youtube-nocookie.com/embed/%s?autoplay=1&rel=0" % vid.group(1))
    return cfg or None


# --------------------------------------------------------------------------
# Link rewriting
# --------------------------------------------------------------------------

FIXES_CSS = ""
IMAGE_RENAME = {}


def rewrite_images(markup):
    """Point pages at re-encoded filenames (photographic .png -> .jpg)."""
    for old, new in IMAGE_RENAME.items():
        markup = markup.replace("images/" + old, "images/" + new)
    return markup


def merge_helmets(blocks):
    """Fold every <helmet> on the page into one <head>.

    <style> elements are carried across whole — deduplicating line by line
    would strip a shared closing brace or a repeated <style> tag and silently
    swallow the rules that follow into the previous @media block.
    """
    seen_tags, seen_css = set(), set()
    out = []
    for block in blocks:
        pos = 0
        while True:
            sb = find_block(block, "style", pos)
            head_part = block[pos:sb[0]] if sb else block[pos:]
            for line in head_part.splitlines():
                key = line.strip()
                if key and key not in seen_tags:
                    seen_tags.add(key)
                    out.append(key)
            if not sb:
                break
            css = block[sb[0]:sb[3]]
            if css not in seen_css:
                seen_css.add(css)
                out.append(css)
            pos = sb[3]
    return "\n".join(out).strip()


def defer_iframes(markup):
    """Stop hidden video embeds from loading on page view.

    An <iframe src="https://youtube..."> inside a block that starts hidden
    still fetches on page load, which means every visitor hits YouTube before
    they have asked to watch anything. Park the URL in data-src-lazy and let
    site.js promote it when the block is revealed.
    """
    return re.sub(r'(<iframe\b[^>]*?)\ssrc="(https?://[^"]+)"',
                  r'\1 data-src-lazy="\2"', markup)


PLAY_PATH = "M25 15 0 30V0z"


def _matching_close(markup, start, tag="span"):
    """End index of the </tag> that closes the <tag at start."""
    depth, i = 0, start
    opener = re.compile(r"<%s\b" % tag)
    closer = re.compile(r"</%s>" % tag)
    while i < len(markup):
        o, c = opener.search(markup, i), closer.search(markup, i)
        if not c:
            return None
        if o and o.start() < c.start():
            depth, i = depth + 1, o.end()
        else:
            depth, i = depth - 1, c.end()
            if depth == 0:
                return i
    return None


def drop_orphan_play_badge(markup):
    """Remove a play badge that has no film behind it.

    A listing hero is meant to ship as an image branch with a play badge and a
    hidden video branch that site.js reveals on click. If the video branch is
    missing from the export - which is how a hero looks after the click binding
    is lost in the Design document - the badge is left over a still with nothing
    to click. Ship the still on its own rather than a button that does nothing.

    The badge comes back by itself as soon as the export carries a video branch
    again, so this never has to be undone.
    """
    if PLAY_PATH not in markup or 'data-on-click="openVideo"' in markup:
        return markup
    while True:
        i = markup.find(PLAY_PATH)
        if i < 0:
            return markup
        start = markup.rfind("<span", 0, i)
        if start < 0:
            return markup
        # Widen to the span that covers the hero, so the centering wrapper goes
        # too and no empty overlay is left behind.
        while True:
            outer = markup.rfind("<span", 0, start)
            if outer < 0:
                break
            close = _matching_close(markup, outer)
            if close is None or close < i:
                break
            start = outer
            if re.search(r"inset:\s*0", markup[outer:markup.find(">", outer)]):
                break
        end = _matching_close(markup, start)
        if end is None:
            return markup
        markup = markup[:start] + markup[end:]


def rewrite_links(markup):
    """Point old design slugs at the published address-based routes.

    Every page carries a relative <base>, so internal links are always written
    from the site root ("listings/watford-court") regardless of page depth.
    """
    for old, new in ROUTES.items():
        markup = markup.replace('href="%s"' % old, 'href="%s"' % new)
        # canonical and og:url tags carry the absolute form
        markup = markup.replace("%s/%s" % (SITE_URL, old), "%s/%s" % (SITE_URL, new))
    return markup


# --------------------------------------------------------------------------
# Build one page
# --------------------------------------------------------------------------

def build_page(src_path, rel_route, components, out_root, report):
    src = read(src_path)

    head_m = re.search(r"<head>(.*?)</head>", src, re.S)
    head = rewrite_images(rewrite_links(head_m.group(1)))

    # The page's own logic class, then strip every dc script.
    logic_m = re.search(r'<script type="text/x-dc"[^>]*>(.*?)</script>', src, re.S)
    logic = logic_m.group(1) if logic_m else ""
    cfg = page_config(logic)

    xb = find_block(src, "x-dc")
    body = src[xb[1]:xb[2]]

    helmets = []
    hb = find_block(body, "helmet")
    if hb:
        helmets.append(body[hb[1]:hb[2]])
        body = body[:hb[0]] + body[hb[3]:]

    values = dict(STATIC_VALUES)

    # ---- expand dc-import ------------------------------------------------
    def expand(markup):
        while True:
            m = re.search(r"<dc-import\b[^>]*>(?:</dc-import>)?", markup)
            if not m:
                break
            a = attrs_of(m.group(0))
            name = a.get("name")
            helmet, comp_body = components[name]
            comp_values = {}
            if name == "SiteNav":
                cp = a.get("current-page", "p-home")
                active = ("color:#002349;border-bottom:1px solid #002349;"
                          "padding-bottom:3px;")
                def match(pid):
                    return cp == pid or (pid in ("p-listings", "p-journal")
                                         and cp.startswith(pid))
                for key, pid in (("homeStyle", "p-home"), ("aboutStyle", "p-about"),
                                 ("buyStyle", "p-buy"), ("sellStyle", "p-sell"),
                                 ("listingsStyle", "p-listings"),
                                 ("journalStyle", "p-journal")):
                    comp_values[key] = active if match(pid) else ""
                comp_values["showSocial"] = not a.get("hide-social")
            piece = resolve_conditionals(comp_body, comp_values)
            piece = resolve_bindings(piece, comp_values)
            if helmet:
                helmets.append(helmet)
            markup = markup[:m.start()] + piece + markup[m.end():]
        return markup

    body = expand(body)
    body = resolve_conditionals(body, values)
    body = resolve_bindings(body, values)

    hover_rules = OrderedDict()
    body = extract_hover_styles(body, hover_rules)

    # ---- head ------------------------------------------------------------
    head = re.sub(r'\s*<script src="[^"]*support\.js"></script>', "", head)
    head = head.rstrip() + "\n" + merge_helmets(helmets) + "\n"

    if hover_rules:
        rules = "\n".join(".%s:hover{%s !important}" % (cls, decls)
                          for decls, cls in hover_rules.items())
        head += "<style>\n%s\n</style>\n" % rules

    head += ("<style>[data-if]{display:none}"
             "[data-if][data-open]{display:contents}</style>\n")
    head += "<style>\n%s</style>\n" % FIXES_CSS

    # Every page carries a relative <base>, so plain "site.js" resolves to the
    # site root from any depth.
    if cfg:
        head += ('<script type="application/json" id="page-config">%s</script>\n'
                 % json.dumps(cfg))
    head += '<script src="site.js" defer></script>\n'

    # ---- assemble --------------------------------------------------------
    body = drop_orphan_play_badge(body)
    body = rewrite_images(rewrite_links(body))
    lang = re.search(r'<html([^>]*)>', src).group(1)
    page = ("<!DOCTYPE html>\n<html%s>\n<head>%s</head>\n<body>\n%s\n</body>\n</html>\n"
            % (lang, head, body.strip()))

    out_dir = os.path.join(out_root, rel_route) if rel_route else out_root
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(page)
    report.append((rel_route or "/", len(page)))


# --------------------------------------------------------------------------


MAX_WIDTH = 2000
JPEG_QUALITY = 82


def image_sources(export):
    """Where photographs come from, in order of precedence.

    The export brings Jennifer's design imagery; content/images holds photos
    the team uploaded through the form. Both go through the same re-encode, so
    a 6MB photo straight off a camera lands on the site at the same size as
    everything else.
    """
    dirs = [os.path.join(export, "images")]
    uploaded = os.path.join(CONTENT, "images")
    if os.path.isdir(uploaded):
        dirs.append(uploaded)
    return dirs


def image_index(dirs):
    """filename -> full path, with later directories winning."""
    found = {}
    for d in dirs:
        for name in sorted(os.listdir(d)):
            if not name.startswith("."):
                found[name] = os.path.join(d, name)
    return found


def plan_images(src_dir):
    """Decide what each source image becomes.

    Photographs saved as PNG are enormous for what they are — three of the
    19th Drive shots are 2MB each — so anything without real transparency is
    re-encoded as JPEG and the pages are pointed at the new filename. Logos
    and marks keep their alpha channel and stay PNG.
    """
    from PIL import Image

    rename = {}
    for name, path in sorted(src_dir.items()):
        stem, ext = os.path.splitext(name)
        if ext.lower() != ".png":
            continue
        with Image.open(path) as im:
            alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
            if alpha:
                im = im.convert("RGBA")
                alpha = im.getchannel("A").getextrema()[0] < 255
        if not alpha:
            rename[name] = stem + ".jpg"
    return rename


def write_images(src_dir, out_dir, rename, keep):
    """Re-encode the images the pages actually reference."""
    from PIL import Image, ImageOps

    os.makedirs(out_dir, exist_ok=True)
    before = after = 0
    dropped = []
    for name, src in sorted(src_dir.items()):
        target = rename.get(name, name)
        if target not in keep:
            dropped.append(name)
            continue
        before += os.path.getsize(src)
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            if im.width > MAX_WIDTH:
                im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)),
                               Image.LANCZOS)
            dest = os.path.join(out_dir, target)
            if target.lower().endswith(".png"):
                im.save(dest, "PNG", optimize=True)
            else:
                im.convert("RGB").save(dest, "JPEG", quality=JPEG_QUALITY,
                                       optimize=True, progressive=True)
        after += os.path.getsize(dest)
    return before, after, dropped


def load_listings():
    """Every listing's content, in the order they should appear."""
    folder = os.path.join(CONTENT, "listings")
    if not os.path.isdir(folder):
        return []
    import yaml
    out = []
    for name in sorted(os.listdir(folder)):
        if name.endswith((".yml", ".yaml")):
            with open(os.path.join(folder, name), encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
            # The form keeps some fields in collapsed groups; everything
            # downstream expects them at the top level.
            for group in ("seo", "cardart"):
                for key, value in (data.pop(group, None) or {}).items():
                    if value not in (None, "", []):
                        data.setdefault(key, value)
            data.setdefault("slug", os.path.splitext(name)[0])
            out.append(data)
    return out


def main():
    global FIXES_CSS
    export, out = sys.argv[1], sys.argv[2]
    FIXES_CSS = read(os.path.join(os.path.dirname(__file__), "fixes.css"))
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)

    components = {
        "SiteNav": extract_component(os.path.join(export, "SiteNav.dc.html")),
        "SiteFooter": extract_component(os.path.join(export, "SiteFooter.dc.html")),
    }

    pages = [("index.html", "")]
    for name in ("about", "buy", "sell", "listings", "journal"):
        pages.append(("%s/index.html" % name, name))
    listing_content = load_listings()
    for group in ("listings", "journal"):
        if group == "listings" and listing_content:
            # Only the template listing is built from the export; the rest are
            # rendered from content/listings further down.
            route = ROUTES.get(LISTING_TEMPLATE, LISTING_TEMPLATE)
            pages.append(("%s/index.html" % LISTING_TEMPLATE, route))
            continue
        for entry in sorted(os.listdir(os.path.join(export, group))):
            p = os.path.join(export, group, entry, "index.html")
            if os.path.isfile(p):
                route = "%s/%s" % (group, entry)
                pages.append(("%s/index.html" % route, ROUTES.get(route, route)))

    global IMAGE_RENAME
    all_images = image_index(image_sources(export))
    IMAGE_RENAME = plan_images(all_images)

    report = []
    for src_rel, route in pages:
        build_page(os.path.join(export, src_rel), route, components, out, report)

    listing_routes = []
    if listing_content:
        import listings as listing_tpl
        tpl_route = ROUTES.get(LISTING_TEMPLATE, LISTING_TEMPLATE)
        template = read(os.path.join(out, tpl_route, "index.html"))
        # the export-built template page is about to be replaced by its own
        # content file, so it should be listed once, not twice
        report[:] = [r for r in report if r[0] != tpl_route]
        for data in listing_content:
            page = listing_tpl.render(template, data)
            route = "listings/%s" % data["slug"]
            os.makedirs(os.path.join(out, route), exist_ok=True)
            with open(os.path.join(out, route, "index.html"), "w",
                      encoding="utf-8") as fh:
                fh.write(page)
            listing_routes.append(route)
            report.append((route, len(page)))
        pages = [p for p in pages if p[1] != tpl_route]
        pages += [("", r) for r in listing_routes]

        # The cards on the homepage and the Listings page are written from the
        # same content as the listing pages, so a price changed in one place is
        # right in all three.
        import cards as listing_cards
        for rel, fill in (("listings/index.html", listing_cards.render_listings_index),
                          ("index.html", listing_cards.render_home)):
            path = os.path.join(out, rel)
            filled = fill(read(path), listing_content)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(filled)

    for name in ("404.html", "robots.txt"):
        shutil.copy(os.path.join(export, name), os.path.join(out, name))
    fix_404 = os.path.join(out, "404.html")
    with open(fix_404, "w", encoding="utf-8") as fh:
        fh.write(rewrite_images(rewrite_links(read(os.path.join(export, "404.html")))))

    # Only ship what the pages actually reference.
    used = set()
    scan = ["404.html"] + [os.path.join(r, "index.html") if r else "index.html"
                           for _, r in pages]
    for path in scan:
        for ref in re.findall(r"images/([A-Za-z0-9._-]+)", read(os.path.join(out, path))):
            used.add(ref)
    before, after, dropped = write_images(all_images,
                                          os.path.join(out, "images"),
                                          IMAGE_RENAME, used)
    print("  images: %.1f MB -> %.1f MB (%d shipped, %d unreferenced left out)"
          % (before / 1e6, after / 1e6, len(used), len(dropped)))
    if dropped:
        print("          unreferenced: %s" % ", ".join(dropped))

    # sitemap, regenerated so it matches the published routes
    routes = [""] + [r for _, r in pages[1:]]
    urls = "\n".join(
        '  <url><loc>%s/%s</loc><changefreq>weekly</changefreq>'
        '<priority>%s</priority></url>' % (SITE_URL, r, "1.0" if r == "" else "0.8")
        for r in routes)
    with open(os.path.join(out, "sitemap.xml"), "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                 + urls + "\n</urlset>\n")

    shutil.copy(os.path.join(os.path.dirname(__file__), "site.js"),
                os.path.join(out, "site.js"))
    shutil.copy(os.path.join(os.path.dirname(__file__), "vercel.json"),
                os.path.join(out, "vercel.json"))

    for route, size in report:
        print("  %-46s %6.1f KB" % (route, size / 1024))
    print("\n%d pages written to %s" % (len(report), out))


if __name__ == "__main__":
    main()

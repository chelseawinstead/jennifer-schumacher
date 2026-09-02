"""
Listing content, held apart from the listing template.

A listing page is the same page six times over with fifteen things swapped.
This module names those fifteen things. It reads them out of a built listing
page (`extract`), and it writes them into one (`render`), using the same
anchors in both directions — so a page can be taken apart and put back
together and come out byte for byte identical. `selftest.py` checks exactly
that, and it is the reason this is safe to run against the live site.

Once the content lives in content/listings/*.yml, the export supplies the
template and the team supplies the words. Neither can overwrite the other.
"""

import re

BRAND = "Jennifer Schumacher"
SITE_URL = "https://www.schumacherliving.com"


# --------------------------------------------------------------------------
# Anchors — each one finds a single value, group 1
# --------------------------------------------------------------------------

SCALARS = {
    "title": r"<title>(.*?)</title>",
    "meta_description": r'<meta name="description" content="(.*?)">',
    "slug": r'<link rel="canonical" href="%s/listings/(.*?)">' % re.escape(SITE_URL),
    "status": (r'<div style="font-size: 12px; letter-spacing: \.22em; text-transform: '
               r'uppercase; color: #9a968d; margin-bottom: 10px;">(.*?)</div>'),
    "price": (r"<div style=\"font-family: 'Cormorant Garamond', serif; font-size: 46px; "
              r"color: #14181d; line-height: 1;\">(.*?)</div>"),
    "address": r'<div style="font-size: 16px; margin-top: 12px; color: #6b6b66;">(.*?)</div>',
    "lede": r'font-style: italic; margin: 0 0 32px;">(.*?)</p>',
}

# The spec row. Most listings show four figures; Mountain View shows five
# (it has a Lot). So it is a list, and the grid's column count follows it.
SPECGRID_RE = r'<div class="specgrid" style="display: grid; grid-template-columns: repeat\((\d+),1fr\);'
SPEC_ITEM_RE = (r"<div style=\"font-family: 'Cormorant Garamond', serif; font-size: 30px; "
                r"color: #14181d;\">(.*?)</div>\n"
                r"<div style=\"font-size: 11px; letter-spacing: \.2em; text-transform: uppercase; "
                r"color: #9a968d; margin-top: 8px;\">(.*?)</div>")
SPEC_FIRST = '<div style>\n%s\n</div>'
SPEC_REST = '<div style="border-left: 1px solid #ececec; padding-left: 30px;">\n%s\n</div>'
SPEC_BODY = ("<div style=\"font-family: 'Cormorant Garamond', serif; font-size: 30px; "
             "color: #14181d;\">%s</div>\n"
             "<div style=\"font-size: 11px; letter-spacing: .2em; text-transform: uppercase; "
             "color: #9a968d; margin-top: 8px;\">%s</div>")

HERO_RE = r'(<header\b.*?<img src="images/)([^"]+)(" alt=")([^"]*)(")'
FILM_RE = r"(youtube\.com/embed/)([A-Za-z0-9_-]+)(\?)"

# The body sits between the italic lede and the end of its section. Some pages
# wrap it in .prose and some do not; render always writes the wrapper, which is
# the one place output is deliberately tidier than the export.
BODY_RE = r'(font-style: italic; margin: 0 0 32px;">.*?</p>\n)(.*?)(\n</div>\n</section>)'
PARA_RE = r"<p>(.*?)</p>"

FIGURE_RE = r'<figure style="margin: 0;">.*?</figure>'
GALLERY_RE = r'(<figure style="margin: 0;">.*</figure>)'
FIG_SRC_RE = r'<img src="images/([^"]+)" alt="([^"]*)"'
FIG_CAP_RE = r"<figcaption[^>]*>(.*?)</figcaption>"
CAPTION_TPL = ('<figcaption style="font-size: 12px; color: #9a968d; font-weight: 300; '
               'padding: 10px 2px 0;">%s</figcaption>\n')

PLAY_PATH = "M25 15 0 30V0z"


def _one(pattern, html, what):
    m = re.search(pattern, html, re.S)
    if not m:
        raise ValueError("could not find %s" % what)
    return m


# --------------------------------------------------------------------------
# Page -> content
# --------------------------------------------------------------------------

def extract(html):
    """Read a built listing page back into its fields."""
    data = {}
    for key, pattern in SCALARS.items():
        # The export pads some of these with spaces inside the tag. Whitespace
        # there is invisible on the page but not in a form field, so it is
        # dropped on the way in.
        data[key] = _one(pattern, html, key).group(1).strip()

    specs = re.findall(SPEC_ITEM_RE, html, re.S)
    if not specs:
        raise ValueError("could not find the spec row")
    data["specs"] = [{"value": v, "label": l} for v, l in specs]

    hero = _one(HERO_RE, html, "hero image")
    data["hero"] = {"src": hero.group(2), "alt": hero.group(4)}

    film = re.search(FILM_RE, html)
    data["film"] = film.group(2) if film else None

    body = _one(BODY_RE, html, "description")
    data["body"] = "\n\n".join(p.strip() for p in re.findall(PARA_RE, body.group(2), re.S))

    data["gallery"] = []
    for fig in re.findall(FIGURE_RE, html, re.S):
        src = _one(FIG_SRC_RE, fig, "gallery image")
        cap = re.search(FIG_CAP_RE, fig, re.S)
        data["gallery"].append({
            "src": src.group(1),
            "alt": src.group(2),
            "caption": cap.group(1) if cap else "",
        })
    return data


# --------------------------------------------------------------------------
# Content -> page
# --------------------------------------------------------------------------

def _sub_once(pattern, repl, html, what):
    out, n = re.subn(pattern, repl, html, count=1, flags=re.S)
    if n != 1:
        raise ValueError("could not place %s" % what)
    return out


def _lit(s):
    """A replacement string that never re-reads backslashes or \\1."""
    return s.replace("\\", "\\\\")


def render(template, data):
    """Fill the template with one listing's content."""
    d = with_defaults(data)
    html = template

    for key, pattern in SCALARS.items():
        value = d[key]
        html = _sub_once(pattern,
                         lambda m, v=value: m.group(0).replace(m.group(1), v, 1),
                         html, key)

    html = _spec_grid(html, d["specs"])

    html = _sub_once(HERO_RE,
                     lambda m: m.group(1) + _lit(photo_src(d["hero"]["src"])) + m.group(3)
                               + _lit(d["hero"]["alt"]) + m.group(5),
                     html, "hero image")

    # The film. No film means no video branch and no play badge, rather than a
    # button with nothing behind it.
    film = film_id(d["film"])
    if film:
        html = re.sub(FILM_RE, lambda m: m.group(1) + _lit(film) + m.group(3), html)
    else:
        html = drop_film(html)

    body_html = "<div class=\"prose\">\n%s\n</div>" % "\n".join(
        "<p>%s</p>" % p for p in paragraphs(d["body"]))
    html = _sub_once(BODY_RE,
                     lambda m: m.group(1) + _lit(body_html) + m.group(3),
                     html, "description")

    figure_tpl = _one(FIGURE_RE, template, "gallery figure").group(0)
    figures = "".join(_figure(figure_tpl, photo) for photo in d["gallery"])
    html = _sub_once(GALLERY_RE, lambda m: _lit(figures), html, "gallery")
    html = name_the_listing(html, d["title_plain"])
    return html


def name_the_listing(html, name):
    """Put the address into the page config the contact form mails out.

    Without this a showing request arrives as a name, an email and a phone
    number with no way to tell which home it is about.
    """
    return re.sub(r'(<script type="application/json" id="page-config">)(\{.*?\})(</script>)',
                  lambda m: m.group(1) + _add_listing(m.group(2), name) + m.group(3),
                  html, count=1, flags=re.S)


def _add_listing(config_json, name):
    import json
    try:
        cfg = json.loads(config_json)
    except ValueError:
        return config_json
    if not cfg.get("mailTo"):
        return config_json
    ordered = {"listing": name}
    ordered.update(cfg)
    return json.dumps(ordered)


def _spec_grid(html, specs):
    """Rewrite the whole spec row, so a listing can show four figures or five."""
    m = _one(SPECGRID_RE, html, "the spec row")
    open_end = html.find(">", m.start())
    end = _close(html, m.start(), "div")
    if end is None:
        raise ValueError("the spec row is not closed")
    items = []
    for i, spec in enumerate(specs):
        body = SPEC_BODY % (spec["value"], spec["label"])
        items.append((SPEC_FIRST if i == 0 else SPEC_REST) % body)
    grid_open = html[m.start():open_end + 1].replace(
        "repeat(%s,1fr)" % m.group(1), "repeat(%d,1fr)" % len(specs), 1)
    return html[:m.start()] + grid_open + "\n" + "".join(items) + "\n</div>" + html[end:]


def _figure(figure_tpl, photo):
    fig = _sub_once(FIG_SRC_RE,
                    lambda m: '<img src="images/%s" alt="%s"'
                              % (_lit(photo_src(photo["src"])), _lit(photo["alt"])),
                    figure_tpl, "gallery image")
    has_caption = re.search(FIG_CAP_RE, fig, re.S)
    if photo["caption"] and has_caption:
        fig = _sub_once(FIG_CAP_RE,
                        lambda m: m.group(0).replace(m.group(1), _lit(photo["caption"]), 1),
                        fig, "gallery caption")
    elif photo["caption"]:
        fig = fig.replace("</figure>", CAPTION_TPL % _lit(photo["caption"]) + "</figure>", 1)
    elif has_caption:
        # An uncaptioned photo gets no caption element, rather than an empty
        # one holding open a line of space under the picture.
        fig = re.sub(FIG_CAP_RE + r"\n?", "", fig, count=1, flags=re.S)
    return fig


def drop_film(html):
    """Strip the hero's video branch and its play badge."""
    html = re.sub(r'<div data-if="videoOpen">.*?</div>\n', "", html, count=1, flags=re.S)
    html = re.sub(r'\sdata-on-click="openVideo" role="button" aria-label="[^"]*"', "", html, count=1)
    # the badge itself
    i = html.find(PLAY_PATH)
    if i < 0:
        return html
    start = html.rfind("<span", 0, i)
    while True:
        outer = html.rfind("<span", 0, start)
        if outer < 0:
            break
        close = _close(html, outer)
        if close is None or close < i:
            break
        start = outer
        if re.search(r"inset:\s*0", html[outer:html.find(">", outer)]):
            break
    end = _close(html, start)
    return html[:start] + html[end:] if end else html


def _close(html, start, tag="span"):
    depth, i = 0, start
    opener, closer = re.compile(r"<%s\b" % tag), re.compile(r"</%s>" % tag)
    while i < len(html):
        o, c = opener.search(html, i), closer.search(html, i)
        if not c:
            return None
        if o and o.start() < c.start():
            depth, i = depth + 1, o.end()
        else:
            depth, i = depth - 1, c.end()
            if depth == 0:
                return i
    return None


# --------------------------------------------------------------------------
# What the form doesn't have to ask for
# --------------------------------------------------------------------------

def paragraphs(body):
    """The description, however it was written, as one paragraph per entry.

    The form gives the team a single box and a blank line between paragraphs,
    which is how anyone writes prose without being taught a syntax.
    """
    if isinstance(body, list):
        return [p.strip() for p in body if p.strip()]
    return [p.strip() for p in re.split(r"\n\s*\n", body or "") if p.strip()]


YOUTUBE_ID = r"[A-Za-z0-9_-]{6,}"


def film_id(value):
    """The YouTube id, from whatever anyone pastes in.

    Nobody should have to know what a video id is, or where in a URL it
    hides. watch?v=, youtu.be/, /embed/, /shorts/, /live/, with or without
    a timestamp or a share tag - all of them, plus a bare id, come out the
    same.
    """
    value = (value or "").strip()
    if not value:
        return None
    for pattern in (r"[?&]v=(%s)" % YOUTUBE_ID,
                    r"youtu\.be/(%s)" % YOUTUBE_ID,
                    r"/embed/(%s)" % YOUTUBE_ID,
                    r"/shorts/(%s)" % YOUTUBE_ID,
                    r"/live/(%s)" % YOUTUBE_ID):
        m = re.search(pattern, value)
        if m:
            return m.group(1)
    if re.fullmatch(YOUTUBE_ID, value):
        return value
    # Something that is neither a bare id nor a link we recognise: better to
    # show no film than to build a broken embed.
    return None


def photo_src(value):
    """Accept a bare filename or whatever path the form recorded."""
    return re.sub(r"^/?(?:images/)?", "", (value or "").strip())


def slugify(text):
    text = re.sub(r"[^a-z0-9]+", "-", text.lower())
    return text.strip("-")


def street_of(address):
    return address.split(",")[0].strip()


def city_of(address):
    parts = [p.strip() for p in address.split(",")]
    return parts[-2] if len(parts) >= 3 else (parts[-1] if parts else "")


def with_defaults(data):
    """Fill in everything a new listing shouldn't have to be asked for."""
    d = dict(data)
    # The form keeps the page title, web address and search description in a
    # collapsed group; they belong at the top level here.
    for key, value in (d.pop("seo", None) or {}).items():
        if value not in (None, ""):
            d.setdefault(key, value)
    d.setdefault("status", "For sale")
    d.setdefault("film", None)
    d.setdefault("body", "")
    d.setdefault("gallery", [])
    address = (d.get("address") or "").strip()
    d.setdefault("slug", slugify(street_of(address)))
    d.setdefault("title_plain", address)
    d.setdefault("title", "%s | %s" % (d["title_plain"], BRAND))
    d.setdefault("specs", [])
    by_label = {s["label"].lower(): s["value"] for s in d["specs"]}
    d.setdefault("meta_description",
                 "%s bed, %s bath, %s with a %s car garage in %s."
                 % (by_label.get("bedrooms", ""), by_label.get("bathrooms", ""),
                    by_label.get("interior", ""), by_label.get("car garage", ""),
                    city_of(address)))
    d.setdefault("hero", {"src": "", "alt": street_of(address)})
    return d

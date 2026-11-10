"""
Little Black Book posts, held apart from the post template.

Same idea as listings.py: every post page is the same page with a dozen things
swapped. This module names those things, reads them out of a built post page
(`extract`) and writes them into one (`render`), with the same anchors both
ways, so a page can be taken apart and put back together byte for byte.
`selftest.py` checks that for every post.

The words live in content/journal/<web-address>.yml, written by the form at
/admin. Jennifer's Claude Design document supplies the look of a post page and
of the Little Black Book page; the form supplies what is on them. The file name
is the web address, so retitling a post never breaks a link to it.
"""

import html as htmllib
import re

SITE_URL = "https://www.schumacherliving.com"
DEFAULT_AUTHOR = "Jennifer Schumacher"
TITLE_SUFFIX = " | The Little Black Book"
WORDS_PER_MINUTE = 200


def esc(text):
    """Escape text the way the export does: ' as &#39;, & as &amp;."""
    return htmllib.escape(text or "", quote=True).replace("&#x27;", "&#39;")


def unesc(text):
    return htmllib.unescape(text or "")


# --------------------------------------------------------------------------
# Anchors on a post page
# --------------------------------------------------------------------------

HEAD = {
    # (pattern, field, escaped?)
    "title": r"<title>(.*?)</title>",
    "og_title": r'<meta property="og:title" content="(.*?)">',
    "meta_description": r'<meta name="description" content="(.*?)">',
    "og_description": r'<meta property="og:description" content="(.*?)">',
    "canonical": r'<link rel="canonical" href="%s/journal/(.*?)">' % re.escape(SITE_URL),
    "og_url": r'<meta property="og:url" content="%s/journal/(.*?)">' % re.escape(SITE_URL),
}

CATEGORY_RE = (r'(<a href="journal" class="navlink">← Little Black Book</a>'
               r' &nbsp;·&nbsp; )(.*?)( </div>)')
PLACE_RE = (r'(<header style="padding: 64px 64px 48px;.*?<span style="font-size: 12px; '
            r'letter-spacing: \.3em; text-transform: uppercase; color: #002349;">)(.*?)(</span>)')
H1_RE = (r"(<h1 style=\"font-family: 'Cormorant Garamond', serif; font-weight: 400; "
         r"font-size: 60px;[^\"]*\">)(.*?)(</h1>)")
INTRO_RE = (r'(<p style="font-size: 18px; line-height: 1\.7; color: #55585c; '
            r'font-weight: 300; margin: 0 auto; max-width: 640px;">)(.*?)(</p>)')
BYLINE_RE = r'(\nBy )(.*?)( &nbsp;·&nbsp; )(\d+)( min read </div>)'

# The wide photo and its optional caption, as one block.
HERO_BLOCK_RE = (r'<div style="padding: 0 64px;">\n<div style="height: 560px; overflow: hidden;">\n'
                 r'<img src="images/([^"]+)" alt="([^"]*)" style="([^"]*)">\n</div>\n'
                 r'(?:<div style="font-size: 12px; color: #9a968d; font-weight: 300; '
                 r'padding: 12px 2px 0;">(.*?)</div>\n)?</div>\n')
HERO_IMG_STYLE = "width: 100%; height: 100%; object-fit: cover; display: block;"
HERO_TPL = ('<div style="padding: 0 64px;">\n<div style="height: 560px; overflow: hidden;">\n'
            '<img src="images/%s" alt="%s" style="%s">\n</div>\n%s</div>\n')
CAPTION_TPL = ('<div style="font-size: 12px; color: #9a968d; font-weight: 300; '
               'padding: 12px 2px 0;">%s</div>\n')

# The italic opening line, then the article itself.
BODY_RE = (r'(<div style="max-width: 720px; margin: 0 auto; padding: 64px 64px 64px;">\n)'
           r'(?:<p style="font-family: \'Cormorant Garamond\', serif; font-size: 26px;[^"]*">'
           r'(.*?)</p>\n)?<div class="prose">(.*?)</div>\n(</div>\n</article>)')
LEDE_TPL = ("<p style=\"font-family: 'Cormorant Garamond', serif; font-size: 26px; "
            "line-height: 1.5; color: #24272b; font-style: italic; margin: 0 0 40px;\">%s</p>\n")

# "More from the Little Black Book"
RELATED_RE = (r'(More from the Little Black Book</div>\n<div style="display: grid; '
              r'grid-template-columns: repeat\(3,1fr\); gap: 40px 28px;">\n)(.*?)(\n</div>\n</section>)')

# A small card - the related row and the grid on the Little Black Book page.
CARD_RE = r'<a href="journal/[a-z0-9-]+" class="card" style="display: block;">.*?</a>'
CARD_IMG_STYLE = "width:100%;height:100%;object-fit:cover;display:block;"
CARD_TPL = ('<a href="journal/%(slug)s" class="card" style="display: block;">\n'
            '<div style="aspect-ratio: 4/3; overflow: hidden;">\n'
            '<img src="images/%(photo)s" alt="%(alt)s" style="%(style)s">\n</div>\n'
            '<div style="padding: 22px 2px;">\n'
            '<div style="font-size: 11px; letter-spacing: .22em; text-transform: uppercase; '
            'color: #9a968d; margin-bottom: 8px;">%(kicker)s</div>\n'
            "<div style=\"font-family: 'Cormorant Garamond', serif; font-size: 25px; "
            'color: #14181d; line-height: 1.15;">%(title)s</div>\n</div>\n</a>')

# The Little Black Book page: the big block on top, then the grid.
FEATURED_RE = (r'(<section style="padding: 0 64px 20px;">\n)'
               r'(<a href="journal/.*?</a>)(\n</section>)')
GRID_RE = (r'(<section style="padding: 56px 64px 96px;">\n<div style="display: grid; '
           r'grid-template-columns: repeat\(3,1fr\); gap: 40px 28px;">\n)(.*?)(\n</div>\n</section>)')


def _one(pattern, text, what):
    m = re.search(pattern, text, re.S)
    if not m:
        raise ValueError("could not find %s" % what)
    return m


def _lit(s):
    return s.replace("\\", "\\\\")


def _swap(pattern, value, text, what, group=2):
    """Replace capture group `group` of the first match."""
    m = _one(pattern, text, what)
    return text[:m.start(group)] + value + text[m.end(group):]


# --------------------------------------------------------------------------
# The article body: Markdown in the form, HTML on the page
# --------------------------------------------------------------------------

def slugify(text):
    text = unesc(re.sub(r"<[^>]+>", "", text or "")).lower()
    text = re.sub(r"['’]", "", text)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def photo_src(value):
    return (value or "").strip().rstrip("/").split("/")[-1]


def body_html(markdown_text):
    """The form's rich-text box, as the page's prose markup.

    Headings get an id (so a guide can link to its own #evening), photos
    dropped into the article point at images/, and apostrophes are written
    the way the rest of the page writes them.
    """
    import markdown
    out = markdown.markdown(markdown_text or "", extensions=["sane_lists"],
                            output_format="html")

    def heading(m):
        return '<%s id="%s">%s</%s>' % (m.group(1), slugify(m.group(2)), m.group(2), m.group(1))
    out = re.sub(r"<(h[23])>(.*?)</\1>", heading, out)
    # A one-paragraph quote takes the quote style, not the paragraph style.
    out = re.sub(r"<blockquote>\s*<p>(.*?)</p>\s*</blockquote>", r"<blockquote>\1</blockquote>",
                 out, flags=re.S)

    def image(m):
        src = m.group(2)
        if not re.match(r"(https?:)?//", src):
            src = "images/" + photo_src(src)
        return m.group(1) + src + m.group(3)
    out = re.sub(r'(<img[^>]*?src=")([^"]+)(")', image, out)
    # Links out of the site open in a new tab; links within it do not.
    out = re.sub(r'<a href="(https?://(?!www\.schumacherliving\.com)[^"]+)">',
                 r'<a href="\1" target="_blank" rel="noopener">', out)
    return "\n" + out.replace("'", "&#39;").strip("\n") + "\n" if out.strip() else "\n"


def body_markdown(prose):
    """The page's prose markup, as Markdown - only for moving posts into the form."""
    blocks = []
    for tag, inner in re.findall(r"<(p|h2|h3)[^>]*>(.*?)</\1>", prose, re.S):
        text = re.sub(r"</?strong>", "**", inner)
        text = re.sub(r"</?em>", "*", text)
        text = unesc(text)
        blocks.append({"p": "", "h2": "## ", "h3": "### "}[tag] + text)
    return "\n\n".join(blocks)


def words_in(markdown_text):
    return len(re.findall(r"[A-Za-z0-9’']+", markdown_text or ""))


def read_minutes(data):
    if str(data.get("read_time") or "").strip():
        return re.sub(r"[^0-9]", "", str(data["read_time"])) or "1"
    words = words_in(data.get("body")) + words_in(data.get("lede")) + words_in(data.get("intro"))
    return str(max(1, round(words / WORDS_PER_MINUTE)))


# --------------------------------------------------------------------------
# Page -> content (moving the existing posts into the form, and selftest)
# --------------------------------------------------------------------------

def extract(page):
    d = {}
    title_tag = unesc(_one(HEAD["title"], page, "title").group(1))
    d["seo_title"] = title_tag[:-len(TITLE_SUFFIX)] if title_tag.endswith(TITLE_SUFFIX) else title_tag
    d["meta_description"] = unesc(_one(HEAD["meta_description"], page, "description").group(1))
    d["slug"] = _one(HEAD["canonical"], page, "canonical").group(1)
    d["category"] = unesc(_one(CATEGORY_RE, page, "category").group(2))
    d["place"] = unesc(_one(PLACE_RE, page, "place").group(2))
    d["title"] = unesc(_one(H1_RE, page, "headline").group(2))
    d["intro"] = unesc(_one(INTRO_RE, page, "intro").group(2))
    by = _one(BYLINE_RE, page, "byline")
    d["author"] = unesc(by.group(2))
    d["read_time"] = by.group(4)
    hero = _one(HERO_BLOCK_RE, page, "hero photo")
    zoom = re.search(r"transform: scale\(([\d.]+)\)", hero.group(3))
    d["hero"] = {"src": hero.group(1), "alt": unesc(hero.group(2)),
                 "caption": unesc(hero.group(4) or ""),
                 "zoom": zoom.group(1) if zoom else ""}
    body = _one(BODY_RE, page, "article")
    d["lede"] = unesc(body.group(2) or "")
    d["body"] = body_markdown(body.group(3))
    d["_prose"] = body.group(3)
    return d


def extract_card(card):
    style = _one(r'<img src="images/[^"]+" alt="[^"]*" style="([^"]*)"', card, "card photo").group(1)
    pos = re.search(r"object-position:([^;]+);", style)
    return pos.group(1) if pos else ""


# --------------------------------------------------------------------------
# Content -> page
# --------------------------------------------------------------------------

def with_defaults(data, slug=None):
    """Fill in everything a post shouldn't have to be asked for."""
    d = dict(data)
    for group in ("seo", "photo_tuning"):
        for key, value in (d.pop(group, None) or {}).items():
            if value not in (None, ""):
                d.setdefault(key, value)
    for key in ("title", "intro", "category", "place", "lede", "body"):
        d[key] = str(d.get(key) or "").strip()
    d["slug"] = slugify(d.get("slug") or "") or slug or slugify(d["title"])
    d["author"] = str(d.get("author") or "").strip() or DEFAULT_AUTHOR
    d["category"] = d["category"] or "Neighborhood guide"
    plain = d["title"].rstrip(".")
    d["seo_title"] = str(d.get("seo_title") or "").strip() or plain
    d["meta_description"] = str(d.get("meta_description") or "").strip() or d["intro"]
    hero = dict(d.get("hero") or {})
    hero["src"] = photo_src(hero.get("src"))
    hero["caption"] = str(hero.get("caption") or "").strip()
    hero["alt"] = (str(d.get("alt") or hero.get("alt") or "").strip() or hero["caption"]
                   or d["place"] or plain)
    hero["zoom"] = str(d.get("zoom") or hero.get("zoom") or "").strip()
    d["hero"] = hero
    d["focus"] = str(d.get("focus") or "").strip()
    d["read_minutes"] = read_minutes(d)
    return d


def render(template, data, others):
    """One post page. `others` are the other published posts, newest first."""
    d = data
    page = template
    head_title = esc(d["seo_title"] + TITLE_SUFFIX)
    for key, value in (("title", head_title), ("og_title", head_title),
                       ("meta_description", esc(d["meta_description"])),
                       ("og_description", esc(d["meta_description"])),
                       ("canonical", d["slug"]), ("og_url", d["slug"])):
        page = _swap(HEAD[key], value, page, key, group=1)

    page = _swap(CATEGORY_RE, esc(d["category"]), page, "category")
    page = _swap(PLACE_RE, esc(d["place"]), page, "place")
    page = _swap(H1_RE, esc(d["title"]), page, "headline")
    page = _swap(INTRO_RE, esc(d["intro"]), page, "intro")
    page = _swap(BYLINE_RE, esc(d["author"]), page, "byline")
    page = _swap(BYLINE_RE, d["read_minutes"], page, "read time", group=4)

    style = HERO_IMG_STYLE
    if d["hero"]["zoom"] and d["hero"]["zoom"] not in ("1", "1.0"):
        style = style[:-1] + "; transform: scale(%s);" % d["hero"]["zoom"]
    caption = CAPTION_TPL % esc(d["hero"]["caption"]) if d["hero"]["caption"] else ""
    hero = HERO_TPL % (d["hero"]["src"], esc(d["hero"]["alt"]), style, caption)
    m = _one(HERO_BLOCK_RE, page, "hero photo")
    page = page[:m.start()] + hero + page[m.end():]

    m = _one(BODY_RE, page, "article")
    lede = LEDE_TPL % esc(d["lede"]) if d["lede"] else ""
    prose = d.get("_prose") if d.get("_prose") is not None else body_html(d["body"])
    page = (page[:m.start()] + m.group(1) + lede + '<div class="prose">' + prose
            + "</div>\n" + m.group(4) + page[m.end():])

    related = "".join(card(o) for o in others[:3])
    if related:
        page = _swap(RELATED_RE, related, page, "related posts")
    else:
        page = drop_related(page)
    return page


def drop_related(page):
    """No other posts yet: no "More from" row with nothing in it."""
    i = page.find("More from the Little Black Book")
    if i < 0:
        return page
    start = page.rfind("<section", 0, i)
    end = page.find("</section>", i) + len("</section>\n")
    return page[:start] + page[end:]


def card(d):
    style = CARD_IMG_STYLE
    if d.get("focus"):
        style = style.replace("display:block;", "object-position:%s;display:block;" % d["focus"])
    return CARD_TPL % {"slug": d["slug"], "photo": d["hero"]["src"],
                       "alt": esc(d["hero"]["alt"]), "style": style,
                       "kicker": esc(d["place"] or d["category"]), "title": esc(d["title"])}


def render_index(page, posts):
    """The Little Black Book page: the featured post on top, the rest below."""
    if not posts:
        return page
    star = featured_of(posts)
    m = _one(FEATURED_RE, page, "featured post")
    block = m.group(2)
    block = re.sub(r'<a href="journal/[a-z0-9-]+"', '<a href="journal/%s"' % star["slug"], block, count=1)
    style = CARD_IMG_STYLE
    if star.get("focus"):
        style = style.replace("display:block;", "object-position:%s;display:block;" % star["focus"])
    block = re.sub(r'<img src="images/[^"]+" alt="[^"]*" style="[^"]*">',
                   lambda x: _lit('<img src="images/%s" alt="%s" style="%s">'
                                  % (star["hero"]["src"], esc(star["hero"]["alt"]), style)),
                   block, count=1)
    kicker = " · ".join(x for x in (star["category"], star["place"]) if x)
    block = _swap(r'(<span style="font-size: 12px; letter-spacing: \.24em;[^"]*">)(.*?)(</span>)',
                  esc(kicker), block, "featured kicker")
    block = _swap(r'(<h2 style="font-family: \'Cormorant Garamond\'[^"]*">)(.*?)(</h2>)',
                  esc(star["title"]), block, "featured headline")
    block = _swap(r'(<p style="font-size: 16px;[^"]*">)(.*?)(</p>)',
                  esc(star["intro"]), block, "featured intro")
    page = page[:m.start(2)] + block + page[m.end(2):]

    rest = [p for p in posts if p is not star]
    grid = "".join(card(p) for p in rest)
    m = _one(GRID_RE, page, "post grid")
    return page[:m.start(2)] + grid + page[m.end(2):]


# --------------------------------------------------------------------------
# Ordering
# --------------------------------------------------------------------------

def in_order(posts):
    """Newest first, by the date on the form."""
    return sorted(posts, key=lambda d: (str(d.get("date") or ""), d["slug"]), reverse=True)


def featured_of(posts):
    for d in posts:
        if d.get("featured"):
            return d
    return posts[0] if posts else None


def others_for(post, posts):
    """The row under a post: newest first, featured first, never itself."""
    star = featured_of(posts)
    ordered = ([star] if star else []) + [p for p in posts if p is not star]
    return [p for p in ordered if p["slug"] != post["slug"]]

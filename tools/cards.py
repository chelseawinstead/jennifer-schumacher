"""
The listing cards on the homepage and the Listings page.

A listing's price and address appear in up to three places: its own page, its
card on the Listings page, and its card on the homepage. Written by hand, those
three drift apart the first time a price moves. So they are all written from the
same content file, and a price is only ever typed once.

Which listing gets the big block at the top of the Listings page is `featured`
in that listing's content file. Everything else is ordered by price, most
expensive first, which is the order the site has always been in - and the three
priciest are the ones the homepage shows.
"""

import re

# --------------------------------------------------------------------------
# The regions rebuilt on each page
# --------------------------------------------------------------------------

# The big block at the top of the Listings page.
FEATURED_RE = r'(<section style="padding: 0 64px 20px;">)(.*?)(</section>)'
# The two-column grid underneath it.
GRID_RE = (r'(<section style="padding: 70px 64px 90px;">\s*'
           r'<div style="display: grid; grid-template-columns: repeat\(2,1fr\); gap: 40px;">\s*)'
           r'(<a href="listings/.*?</a>)(\s*</div>)')
# The three across the homepage.
HOME_RE = (r'(<div style="display: grid; grid-template-columns: repeat\(3,1fr\); gap: 28px;">\s*)'
           r'(<a href="listings/.*?</a>)(\s*</div>)')

CARD_RE = r'<a href="listings/[a-z0-9-]+"[^>]*>.*?</a>'
LINK_RE = r'(<a href=")listings/[a-z0-9-]+(")'
IMG_RE = r'(<img src="images/)[^"]+(" alt=")[^"]*(")'

# Text inside a card, by the style that identifies it.
KICKER_RE = r'(color: #9a968d; margin-bottom: (?:6|8)px;">)(.*?)(</div>)'
PRICE_RE = (r"(<div style=\"font-family: 'Cormorant Garamond', serif; font-size: "
            r"(?:26|30|40)px; color: #14181d;[^\"]*\">)(.*?)(</div>)")
META_RE = r'(<div style="font-size: 1[45]px;[^"]*color: #6b6b66;[^"]*">)(.*?)(</div>)'
HOME_SPECS_RE = (r'(<div style="font-size: 12px; letter-spacing: \.1em; text-transform: '
                 r'uppercase; color: #9a968d;">)(.*?)(</div>)')

SEP = " &nbsp;·&nbsp; "


def _lit(s):
    return s.replace("\\", "\\\\")


def _swap(pattern, value, html, count=1):
    return re.sub(pattern,
                  lambda m: m.group(1) + _lit(value) + m.group(3),
                  html, count=count, flags=re.S)


# --------------------------------------------------------------------------
# The one-line summary of a home
# --------------------------------------------------------------------------

SHORT = {"bedrooms": "Bed", "bathrooms": "Bath", "car garage": "Car Garage"}
CARD_SPECS = ["bedrooms", "bathrooms", "interior", "car garage"]


def specs_line(listing):
    """"5 Bed · 5.5 Bath · 5,338 sf · 5 Car Garage" — Lot is left off a card."""
    import listings as listing_tpl
    by_label = {f["label"].strip().lower(): f["value"].strip()
                for f in listing_tpl.figures_of(listing)}
    parts = []
    for label in CARD_SPECS:
        value = by_label.get(label)
        if not value:
            continue
        word = SHORT.get(label)
        parts.append("%s %s" % (value, word) if word else value)
    return " · ".join(parts)


def street(listing):
    """The street line — everything before the city."""
    import listings as listing_tpl
    return listing_tpl.street_of(listing)


def photo_alt(listing):
    """Cards describe the photo by the property it shows."""
    return street(listing)


def address_line(listing):
    import listings as listing_tpl
    return listing_tpl.address_of(listing)


def city(listing):
    import listings as listing_tpl
    return listing_tpl.city_of_listing(listing)


def city_state(listing):
    """"Paradise Valley, AZ" — the address without street number or zip."""
    import listings as listing_tpl
    place = listing_tpl.city_of_listing(listing)
    state = (listing.get("state_code") or "").strip()
    if not state:
        parts = [p.strip() for p in (listing.get("address") or "").split(",")]
        state = re.sub(r"\s*\d{5}$", "", parts[-1]).strip() if len(parts) >= 3 else ""
    return "%s, %s" % (place, state) if place and state else place


def kicker_of(listing):
    """The line above the price on the featured block."""
    if listing.get("kicker"):
        return listing["kicker"]
    place = city(listing)
    status = (listing.get("status") or "").strip()
    return "%s · %s" % (status, place) if place else status


def card_kicker_of(listing):
    """The small line on a grid card — the city, unless one is written in."""
    return listing.get("card_kicker") or city(listing)


def card_photo(listing):
    """Just the filename, same as the listing page does it.

    Missing this is what put images//content/images/NAME.jpg on the cards
    while the listing's own page was fine - the two were reading the stored
    path in different ways.
    """
    import listings as listing_tpl
    return listing_tpl.photo_src(
        listing.get("card") or (listing.get("hero") or {}).get("src", ""))


def home_photo(listing):
    import listings as listing_tpl
    return listing_tpl.photo_src(listing.get("card_home") or "") or card_photo(listing)


# --------------------------------------------------------------------------
# Ordering
# --------------------------------------------------------------------------

def price_of(listing):
    """"$1,895,000" -> 1895000. Anything unreadable sorts to the bottom."""
    digits = re.sub(r"[^0-9]", "", listing.get("price") or "")
    return int(digits) if digits else -1


def in_order(listings):
    """Most expensive first."""
    return sorted(listings, key=lambda d: (-price_of(d), d.get("slug", "")))


def featured_of(listings):
    ordered = in_order(listings)
    for d in ordered:
        if d.get("featured"):
            return d
    return ordered[0] if ordered else None


# --------------------------------------------------------------------------
# Building one card
# --------------------------------------------------------------------------

def _card(template, listing, photo, kicker, meta, specs=None, alt=None):
    card = re.sub(LINK_RE,
                  lambda m: m.group(1) + _lit("listings/" + listing["slug"]) + m.group(2),
                  template, flags=re.S)
    card = re.sub(IMG_RE,
                  lambda m: (m.group(1) + _lit(photo) + m.group(2)
                             + _lit(alt if alt is not None else photo_alt(listing))
                             + m.group(3)),
                  card, count=1, flags=re.S)
    if kicker is not None:
        card = _swap(KICKER_RE, kicker, card)
    import listings as listing_tpl
    card = _swap(PRICE_RE, listing_tpl.money(listing.get("price", "")), card)
    card = _swap(META_RE, meta, card)
    if specs is not None:
        card = _swap(HOME_SPECS_RE, specs, card)
    return card


def render_listings_index(html, listings):
    """The featured block and the grid underneath it."""
    listings = in_order(listings)
    star = featured_of(listings)
    if not star:
        return html

    def featured(m):
        block = m.group(2)
        block = re.sub(LINK_RE,
                       lambda x: x.group(1) + _lit("listings/" + star["slug"]) + x.group(2),
                       block, flags=re.S)
        block = re.sub(IMG_RE,
                       lambda x: (x.group(1) + _lit(card_photo(star)) + x.group(2)
                                  + _lit(photo_alt(star)) + x.group(3)),
                       block, count=1, flags=re.S)
        block = _swap(KICKER_RE, kicker_of(star), block)
        import listings as listing_tpl
        block = _swap(PRICE_RE, listing_tpl.money(star.get("price", "")), block)
        block = _swap(META_RE,
                      address_line(star) + SEP + specs_line(star),
                      block)
        return m.group(1) + block + m.group(3)

    html = re.sub(FEATURED_RE, featured, html, count=1, flags=re.S)

    rest = [d for d in listings if d is not star]

    def grid(m):
        template = re.search(CARD_RE, m.group(2), re.S).group(0)
        cards = "".join(
            _card(template, d, card_photo(d), card_kicker_of(d),
                  "%s · %s" % (street(d), specs_line(d)))
            for d in rest)
        return m.group(1) + cards + m.group(3)

    return re.sub(GRID_RE, grid, html, count=1, flags=re.S)


def render_home(html, listings, limit=3):
    """The three across the homepage."""
    picks = in_order(listings)[:limit]
    if not picks:
        return html

    def grid(m):
        template = re.search(CARD_RE, m.group(2), re.S).group(0)
        cards = "".join(
            _card(template, d, home_photo(d), None,
                  "%s · %s" % (street(d), city_state(d)),
                  specs=specs_line(d),
                  alt=address_line(d))
            for d in picks)
        return m.group(1) + cards + m.group(3)

    return re.sub(HOME_RE, grid, html, count=1, flags=re.S)

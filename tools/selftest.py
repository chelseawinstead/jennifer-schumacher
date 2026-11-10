#!/usr/bin/env python3
"""
Take every listing page apart and put it back together.

    python3 tools/selftest.py

Round-trip: extract a page's content, render it back into that same page as
template, and compare. Anything that does not come out byte for byte identical
is content the field list is losing, and the migration is not safe until this
prints clean.
"""
import glob, os, sys, difflib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import listings

fails = 0
for path in sorted(glob.glob("listings/*/index.html")):
    name = os.path.basename(os.path.dirname(path))
    original = open(path).read()
    try:
        data = listings.extract(original)
        rebuilt = listings.render(original, data)
    except Exception as e:
        print("  %-34s ERROR  %s" % (name, e)); fails += 1; continue
    # The rebuilt page deliberately carries one thing the live page does not:
    # the listing's address in the page config, so a showing request says which
    # home it is about. Hold the original to that same standard.
    expected = listings.name_the_listing(
        original, listings.with_defaults(data)["title_plain"])
    if rebuilt == expected:
        print("  %-34s ok     %d photos, %d paragraphs%s"
              % (name, len(data["gallery"]), len(listings.paragraphs(data["body"])),
                 ", film" if data["film"] else ", no film"))
    else:
        fails += 1
        d = list(difflib.unified_diff(expected.split("\n"), rebuilt.split("\n"),
                                      "live", "rebuilt", lineterm="", n=0))
        print("  %-34s DIFFERS (%d diff lines)" % (name, len(d)))
        for line in d[:14]:
            print("      " + line[:170])

# Little Black Book posts: render each post from its content file into the
# shared template and compare with the page on the site.
import yaml, journal
posts = []
for f in sorted(glob.glob("content/journal/*.yml")):
    posts.append(journal.with_defaults(yaml.safe_load(open(f)) or {},
                                       os.path.splitext(os.path.basename(f))[0]))
posts = [p for p in journal.in_order(posts)]
tpl_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "journal-template.html")
if posts and os.path.isfile(tpl_path):
    tpl = open(tpl_path).read()
    for p in posts:
        path = "journal/%s/index.html" % p["slug"]
        if not os.path.isfile(path):
            print("  %-34s new    not on the site yet" % p["slug"]); continue
        live = open(path).read()
        rebuilt = journal.render(tpl, p, journal.others_for(p, posts))
        if rebuilt == live:
            print("  %-34s ok     post" % p["slug"])
        else:
            fails += 1
            print("  %-34s DIFFERS" % p["slug"])
print()
print("round-trip clean" if not fails else "%d page(s) do not round-trip" % fails)
sys.exit(1 if fails else 0)

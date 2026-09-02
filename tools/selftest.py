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
print()
print("round-trip clean" if not fails else "%d page(s) do not round-trip" % fails)
sys.exit(1 if fails else 0)

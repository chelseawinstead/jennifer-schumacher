#!/usr/bin/env python3
"""
Rebuild the published site from a fresh Claude Design export.

    python3 tools/refresh.py ~/Downloads/site

Builds into a scratch directory, then swaps the generated files at the repo
root. Only the paths listed in GENERATED are ever touched, so tools/, .git,
README.md and anything else you keep here are safe.
"""

import os
import shutil
import subprocess
import sys
import tempfile

GENERATED = ["index.html", "404.html", "robots.txt", "sitemap.xml", "vercel.json",
             "site.js", "images", "about", "buy", "sell", "listings", "journal"]

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python3 tools/refresh.py <path-to-claude-design-export>")
    export = os.path.abspath(os.path.expanduser(sys.argv[1]))
    if not os.path.isfile(os.path.join(export, "SiteNav.dc.html")):
        sys.exit("%s does not look like a Claude Design export "
                 "(no SiteNav.dc.html)" % export)

    tmp = tempfile.mkdtemp(prefix="schumacher-build-")
    out = os.path.join(tmp, "site")
    subprocess.check_call([sys.executable, os.path.join(HERE, "build.py"),
                           export, out])

    for name in GENERATED:
        old = os.path.join(REPO, name)
        if os.path.isdir(old):
            shutil.rmtree(old)
        elif os.path.exists(old):
            os.remove(old)

    for name in sorted(os.listdir(out)):
        shutil.move(os.path.join(out, name), os.path.join(REPO, name))
    shutil.rmtree(tmp, ignore_errors=True)

    print("\nRepo root updated. Review with `git status`, then commit and push.")


if __name__ == "__main__":
    main()

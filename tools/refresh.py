#!/usr/bin/env python3
"""
Rebuild the published site from a fresh Claude Design export.

    python3 tools/refresh.py ~/Downloads/site

Builds into a scratch directory, then copies the result over the generated
files at the repo root and clears out anything the new build no longer uses.
Only the paths listed in GENERATED are ever touched, so tools/, .git,
README.md and anything else you keep here are safe.
"""

import datetime
import os
import shutil
import subprocess
import sys
import tempfile

GENERATED = ["index.html", "404.html", "robots.txt", "sitemap.xml", "vercel.json",
             "site.js", "images", "about", "buy", "sell", "listings", "journal"]

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def files_under(root, names):
    """Every file inside the generated paths, relative to root."""
    found = set()
    for name in names:
        path = os.path.join(root, name)
        if os.path.isfile(path):
            found.add(name)
        elif os.path.isdir(path):
            for dirpath, _, filenames in os.walk(path):
                for f in filenames:
                    found.add(os.path.relpath(os.path.join(dirpath, f), root))
    return found


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

    before = files_under(REPO, GENERATED)

    # Copy the new build over the old one. Overwriting in place (rather than
    # deleting first) means a partial failure can't leave the repo empty.
    for name in sorted(os.listdir(out)):
        src, dst = os.path.join(out, name), os.path.join(REPO, name)
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dst)

    # Anything the previous build shipped that this one doesn't — a retired
    # listing, a photo Jennifer swapped out — has to go, or git keeps
    # publishing it.
    stale = sorted(before - files_under(out, GENERATED))
    stranded, retired = [], []
    # Deleting outright is not always allowed - running this through the
    # desktop bridge, os.remove fails on every file in the repo. A retired
    # listing that cannot be removed keeps its page and its photos published,
    # so anything undeletable is moved into _to_delete instead, which git and
    # Vercel both ignore. Same outcome, and the files are still there if the
    # removal turns out to be a mistake.
    grave = os.path.join(REPO, "_to_delete",
                         "retired-" + datetime.date.today().isoformat())
    for rel in stale:
        path = os.path.join(REPO, rel)
        try:
            os.remove(path)
            continue
        except OSError:
            pass
        try:
            dest = os.path.join(grave, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            os.rename(path, dest)
            retired.append(rel)
        except OSError:
            stranded.append(rel)

    shutil.rmtree(tmp, ignore_errors=True)

    if stale:
        print("\nRemoved %d file(s) the new export no longer uses:" % len(stale))
        for rel in stale:
            if rel in stranded:
                note = "  (COULD NOT REMOVE - delete this one by hand)"
            elif rel in retired:
                note = "  (moved to _to_delete)"
            else:
                note = ""
            print("  %s%s" % (rel, note))
    if retired:
        print("\n%d file(s) could not be deleted here, so they were moved into "
              "_to_delete/ — git sees them as gone, which is what matters." % len(retired))
    if stranded:
        print("\nDelete the file(s) marked above by hand before committing — "
              "they are still tracked and would keep being published.")

    print("\nRepo root updated. Review with `git status`, then commit and push.")


if __name__ == "__main__":
    main()

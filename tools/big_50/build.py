#!/usr/bin/env python3
"""
Build Jennifer's Big 5-0 pages (private RSVP + party chat).

    python3 tools/big_50/build.py

Copies the hand-written pages into /big-50. big-50/ is not in refresh.py's
GENERATED list, so a Claude Design refresh never touches these pages, and the
two images live inside big-50/ (not images/) so a refresh can't delete them.
"""
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, "big-50")

PAGES = {"invite.html": "index.html", "party.html": "party/index.html", "team.html": "team/index.html"}


def main():
    for src, dst in PAGES.items():
        path = os.path.join(OUT, dst)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        shutil.copyfile(os.path.join(HERE, src), path)
    for img in ("og.jpg", "hero.jpg"):
        shutil.copyfile(os.path.join(HERE, img), os.path.join(OUT, img))
    print("built big-50/ (invite, party, team)")


if __name__ == "__main__":
    main()

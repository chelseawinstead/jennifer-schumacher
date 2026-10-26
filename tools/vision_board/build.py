#!/usr/bin/env python3
"""
Build the Vision Board pages by wrapping their content in the site's own
header and footer, taken from about/index.html.

    python3 tools/vision_board/build.py

Re-run it after any refresh.py so the nav and footer match the latest
Claude Design export. vision-board/ is not in refresh.py's GENERATED list,
so a refresh never deletes these pages.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SHELL = os.path.join(REPO, "about", "index.html")

TITLE = "Vision Board Crew 2027 | Jennifer Schumacher"
DESC = ("Vision Board Crew 2027, January 8-9 at the ANdAZ Resort in Scottsdale. "
        "Register and reserve one of 50 seats.")


def shell_parts(html):
    head_end = html.index("</head>")
    head = html[:head_end]
    # the page content starts at the first header/section after the social row
    social = html.index('class="social-row"')
    start = re.search(r"\n<(header|section|main)\b", html[social:]).start() + social + 1
    foot = html.index("<footer")
    return head, html[head_end:start], html[foot:]


def fix_head(head, canonical, noindex):
    head = re.sub(r"<title>.*?</title>", "<title>%s</title>" % TITLE, head, flags=re.S)
    head = re.sub(r'(<meta name="description" content=")[^"]*', r"\g<1>" + DESC, head)
    head = re.sub(r'(<meta property="og:title" content=")[^"]*', r"\g<1>" + TITLE, head)
    head = re.sub(r'(<meta property="og:description" content=")[^"]*', r"\g<1>" + DESC, head)
    head = re.sub(r'(<meta property="og:url" content=")[^"]*', r"\g<1>" + canonical, head)
    head = re.sub(r'(<link rel="canonical" href=")[^"]*', r"\g<1>" + canonical, head)
    if noindex:
        head = head.replace("<meta charset=\"utf-8\">",
                            "<meta charset=\"utf-8\">\n<meta name=\"robots\" content=\"noindex, nofollow\">", 1)
    return head


def main():
    html = open(SHELL, encoding="utf-8").read()
    head, nav, footer = shell_parts(html)
    # no nav item is "current" on this page
    nav = re.sub(r'(class="navlink") style="color:#002349;border-bottom:1px solid #002349;padding-bottom:3px;"',
                 r"\1", nav)

    content = open(os.path.join(HERE, "register-content.html"), encoding="utf-8").read()
    out_dir = os.path.join(REPO, "vision-board")
    os.makedirs(out_dir, exist_ok=True)
    page = fix_head(head, "https://www.schumacherliving.com/vision-board", noindex=True) + nav + content + "\n" + footer
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)

    team = open(os.path.join(HERE, "team.html"), encoding="utf-8").read()
    os.makedirs(os.path.join(out_dir, "team"), exist_ok=True)
    with open(os.path.join(out_dir, "team", "index.html"), "w", encoding="utf-8") as f:
        f.write(team)
    print("built vision-board/index.html (%d bytes) and vision-board/team/index.html" % len(page))


if __name__ == "__main__":
    sys.exit(main())

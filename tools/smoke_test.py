"""Browser smoke test for Aman.

Plays full games by clicking, at desktop and phone widths, and fails on any console
error, page error, or sideways scroll. It checks that the page works, not that it looks right.

Setup:  pip install playwright && playwright install chromium
Run:    python3 tools/smoke_test.py
"""
import pathlib
import random
import sys

from playwright.sync_api import sync_playwright

PAGE = (pathlib.Path(__file__).resolve().parent.parent / "public" / "index.html").as_uri()
errors = []
failures = []


def check(name, ok):
    print(("ok   " if ok else "FAIL ") + name)
    if not ok:
        failures.append(name)


def skip(pg):
    if pg.locator("[data-do=skip]").count():
        pg.locator("[data-do=skip]").click()


def game_over(pg):
    return pg.locator(".dlg [data-do=new].primary").count() > 0 and pg.locator(".dlg h3").count() > 0 and \
        pg.locator(".dlg h3").first.inner_text().strip().lower() in ("victory", "partial result", "defeat")


def dialogs(pg):
    """Dismiss playback and answer any decision dialog at random."""
    skip(pg)
    while pg.locator(".dlg").count() and not game_over(pg):
        buttons = pg.locator(".dlg button:not([disabled])")
        buttons.nth(random.randrange(buttons.count())).click()
        skip(pg)


def follow_adviser(pg):
    dialogs(pg)
    for _ in range(6):
        picks = pg.locator(".adv .act[aria-disabled=false]")
        if not picks.count():
            break
        picks.first.click()
        dialogs(pg)


def random_play(pg, limit=600):
    for _ in range(limit):
        if game_over(pg):
            return True
        skip(pg)
        if pg.locator(".dlg").count():
            dialogs(pg)
            continue
        r = random.random()
        if r < 0.2:
            pg.locator(".pill").nth(random.randrange(5)).click()
        elif r < 0.7:
            acts = pg.locator(".act[aria-disabled=false]")
            if acts.count():
                acts.nth(random.randrange(acts.count())).click()
        elif r < 0.8 and pg.locator(".sugg").count():
            pg.locator(".sugg").first.dispatch_event("click")
        elif r < 0.85:
            tabs = pg.locator(".views button")
            tabs.nth(random.randrange(tabs.count())).click()
        else:
            pg.locator("[data-do=end]").click()
    return game_over(pg)


with sync_playwright() as p:
    browser = p.chromium.launch()
    pg = browser.new_page(viewport={"width": 1280, "height": 900})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    random.seed(4)

    pg.goto(PAGE)
    pg.wait_for_timeout(600)
    check("welcome guide shows on first visit", pg.locator(".dlg h3").inner_text().strip().lower() == "welcome")
    pg.locator(".dlg .primary").click()
    check("welcome guide closes", pg.locator(".dlg").count() == 0)

    pg.locator("[data-do=help]").click()
    check("How to win opens", pg.locator(".dlg").count() == 1)
    pg.keyboard.press("Escape")
    check("Escape closes it", pg.locator(".dlg").count() == 0)

    follow_adviser(pg)
    pg.locator("[data-do=end]").click()
    pg.wait_for_timeout(500)
    check("season playback shows a caption", pg.locator(".caption").count() == 1)
    pg.wait_for_timeout(9000)
    check("playback finishes on its own", pg.locator(".caption").count() == 0)

    for _ in range(4):
        follow_adviser(pg)
        pg.locator("[data-do=end]").click()
        dialogs(pg)
    check("council suggestions are drawn on the map", pg.locator(".sugg").count() > 0)

    pg.locator(".pill").nth(0).click()
    check("power dossier opens", pg.locator(".portrait").count() == 1 and pg.locator(".dial").count() == 1)
    pg.locator("[data-do=asknew]").click()
    check("New game asks for confirmation mid-game", "abandon" in pg.locator(".dlg h2").inner_text().lower())
    pg.locator(".dlg .ghost").click()

    check("a random game reaches an ending", random_play(pg))

    pg.set_viewport_size({"width": 400, "height": 800})
    if game_over(pg):
        pg.locator(".dlg [data-do=new].primary").click()
    pg.locator(".pill").nth(3).click()
    check("no sideways scroll at phone width", pg.evaluate("document.documentElement.scrollWidth") <= 400)
    check("a random game at phone width reaches an ending", random_play(pg))

    browser.close()

check("no console or page errors", not errors)
for e in errors:
    print("   ", e)
sys.exit(1 if failures else 0)

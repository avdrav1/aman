"""Browser smoke test for Aman.

Plays full games by clicking, at desktop and phone widths, and fails on any console
error, page error, or sideways scroll. One game follows the adviser through all three
acts; others click at random. It checks that the page works, not that it looks right.

Setup:  pip install playwright && playwright install chromium
Run:    python3 tools/smoke_test.py
"""
import pathlib
import random
import sys

from playwright.sync_api import TimeoutError as PwTimeout, sync_playwright

PAGE = (pathlib.Path(__file__).resolve().parent.parent / "public" / "index.html").as_uri()
errors = []
failures = []
seen = set()  # dialog headings seen during play
VERBOSE = "-v" in sys.argv


def check(name, ok):
    print(("ok   " if ok else "FAIL ") + name)
    if not ok:
        failures.append(name)


def click(loc):
    if VERBOSE: print("  click", loc, flush=True)
    """Click if it is still there. The page re-renders often, so a target can vanish mid-click."""
    try:
        loc.click(timeout=3000)
        return True
    except PwTimeout:
        return False


def skip(pg):
    if pg.locator("[data-do=skip]").count():
        click(pg.locator("[data-do=skip]").first)


def game_over(pg):
    return pg.locator(".dlg [data-do=new].primary").count() > 0 and pg.locator(".dlg h3").count() > 0 and \
        pg.locator(".dlg h3").first.inner_text().strip().lower() in ("victory", "partial result", "defeat")


def act_now(pg):
    t = pg.locator(".top .track")
    return int(t.get_attribute("data-act")) if t.count() else 0


def dialogs(pg):
    """Dismiss playback and answer any decision dialog at random."""
    skip(pg)
    for _ in range(40):
        if not pg.locator(".dlg").count() or game_over(pg):
            return
        head = pg.locator(".dlg .actno, .dlg h3").first
        if head.count():
            seen.add(head.inner_text().strip().lower())
        if pg.locator(".dlg .seats .seat").count() > 1:
            seen.add("seats")
        buttons = pg.locator(".dlg button:not([disabled]):visible")
        if buttons.count():
            click(buttons.nth(random.randrange(buttons.count())))
        skip(pg)


def follow_adviser(pg, picks=8):
    dialogs(pg)
    for _ in range(picks):
        if game_over(pg):
            return
        p = pg.locator(".adv .act[aria-disabled=false]:visible")
        if not p.count():
            break
        click(p.first)
        dialogs(pg)


def end_season(pg):
    b = pg.locator("[data-do=end]:not([disabled])")
    if b.count():
        click(b.first)
    dialogs(pg)


def adviser_game(pg, seasons=45):
    """Follow the adviser to the end. Returns the highest act reached."""
    top = 1
    for _ in range(seasons):
        if game_over(pg):
            break
        follow_adviser(pg)
        top = max(top, act_now(pg))
        end_season(pg)
        top = max(top, act_now(pg))
    return top


def random_play(pg, limit=900):
    for _ in range(limit):
        if game_over(pg):
            return True
        skip(pg)
        if pg.locator(".dlg").count():
            dialogs(pg)
            continue
        r = random.random()
        if r < 0.2:
            click(pg.locator(".pill").nth(random.randrange(5)))
        elif r < 0.7:
            acts = pg.locator(".act[aria-disabled=false]:visible")
            if acts.count():
                click(acts.nth(random.randrange(acts.count())))
        elif r < 0.8 and pg.locator(".sugg").count():
            pg.locator(".sugg").first.dispatch_event("click")
        elif r < 0.85:
            tabs = pg.locator(".views button")
            click(tabs.nth(random.randrange(tabs.count())))
        else:
            click(pg.locator("[data-do=end]"))
    return game_over(pg)


def no_sideways(pg):
    return pg.evaluate("document.documentElement.scrollWidth") <= pg.viewport_size["width"]


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
    check("the track shows three acts", pg.locator(".top .track .ag").count() == 3 and act_now(pg) == 1)

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
        end_season(pg)
    check("council suggestions are drawn on the map", pg.locator(".sugg").count() > 0)

    pg.locator(".pill").nth(0).click()
    check("power dossier opens", pg.locator(".portrait").count() == 1 and pg.locator(".dial").count() == 1)
    pg.locator("[data-do=asknew]").click()
    check("New game asks for confirmation mid-game", "abandon" in pg.locator(".dlg h2").inner_text().lower())
    pg.locator(".dlg .ghost").click()

    # one game following the adviser through the acts; try a second game if the first ends early
    reached = adviser_game(pg)
    if reached < 3:
        if game_over(pg):
            pg.locator(".dlg [data-do=new].primary").click()
        reached = max(reached, adviser_game(pg))
    check("an adviser game reaches Act 3 by clicking", reached == 3)
    check("the Act 2 title card showed", "act 2 of 3" in seen)
    check("the Act 3 title card showed", "act 3 of 3" in seen)
    check("a council vote showed member seats", "seats" in seen)
    if not game_over(pg):
        adviser_game(pg)
    check("the adviser game reaches an ending", game_over(pg))
    pg.set_viewport_size({"width": 400, "height": 800})
    check("no sideways scroll at phone width, game over", no_sideways(pg))
    pg.set_viewport_size({"width": 1280, "height": 900})
    pg.locator(".dlg [data-do=new].primary").click()

    check("a random game reaches an ending", random_play(pg))

    pg.set_viewport_size({"width": 400, "height": 800})
    if game_over(pg):
        pg.locator(".dlg [data-do=new].primary").click()
    pg.locator(".pill").nth(3).click()
    check("no sideways scroll at phone width", no_sideways(pg))
    check("a random game at phone width reaches an ending", random_play(pg))

    browser.close()

check("no console or page errors", not errors)
for e in errors:
    print("   ", e)
sys.exit(1 if failures else 0)

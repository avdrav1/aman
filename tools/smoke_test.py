"""Browser smoke test for Aman.

Plays full games by clicking, at desktop and phone widths, and fails on any console
error, page error, or sideways scroll. It also checks the attention pins and chips, by mouse
and by touch, the dispute scene, the council chamber, the trust sparklines, and the ending chart.
One game follows the adviser through all three
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


def settle(pg):
    """Wait out the short beat in which a battle round plays out."""
    pg.wait_for_function("!document.querySelector('.panel.battle.resolving')", timeout=5000)


def finish_battle(pg):
    """A battle on the map, entered from a crisis: pick moves at random until it is decided, then continue."""
    if not pg.locator(".panel.battle").count():
        return False
    for _ in range(6):
        done = pg.locator(".panel.battle [data-do=battle][data-c=finish]")
        if done.count() and click(done):
            seen.add("battle fought")
            return True
        moves = pg.locator(".panel.battle [data-do=bmove]:not([disabled])")
        if not moves.count():
            break
        click(moves.nth(random.randrange(moves.count())))
        settle(pg)
    return True


def dialogs(pg):
    """Dismiss playback and answer any decision dialog at random."""
    skip(pg)
    for _ in range(40):
        finish_battle(pg)
        if not pg.locator(".dlg").count() or game_over(pg):
            return
        head = pg.locator(".dlg .actno, .dlg h3").first
        if head.count():
            seen.add(head.inner_text().strip().lower())
        if pg.locator(".dlg .chamber .seat").count() >= 6:
            seen.add("seats")
        if pg.locator(".dlg .chamber.result").count():
            seen.add("vote result")
        if pg.locator(".dlg .scene").count():
            seen.add("dispute scene")
            if pg.locator(".dlg .scene .portrait").count() == 2 and pg.locator(".dlg .dcard").count() == 4:
                seen.add("dispute scene ok")
        buttons = pg.locator(".dlg button:not([disabled]):visible")
        if buttons.count():
            click(buttons.nth(random.randrange(buttons.count())))
        skip(pg)


def follow_adviser(pg, picks=16):
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
        if finish_battle(pg) or pg.locator(".dlg").count():
            dialogs(pg)
            continue
        r = random.random()
        if r < 0.2:
            click(pg.locator(".pc").nth(random.randrange(RIVALS)))
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


def attention_checks(pg):
    """The attention chips match the pins on the map, pins explain themselves, and chips light pins."""
    skip(pg)
    chips = pg.locator(".achip")
    total = sum(int(chips.nth(i).locator("b").inner_text()) for i in range(chips.count()))
    pins = pg.locator(".map .pin:not(.done)")
    check("attention chips count the pins on the map", chips.count() > 0 and total == pins.count())
    check("the full sentences sit in a details list", pg.locator(".attlist li").count() >= total)
    pg.locator(".map .pin:not(.done):not(.memring)").first.hover(force=True)
    check("hovering a pin shows its sentence", pg.locator("#tip").is_visible() and len(pg.locator("#tip p").first.inner_text()) > 10)
    ring = pg.locator(".map .memring.pin")
    if ring.count():
        # a memory ring is a dashed circle around the node: point at its edge, not its middle
        bb = ring.first.bounding_box()
        cx, cy, r = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, bb["width"] / 2 - 3
        for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            pg.mouse.move(cx + dx * r, cy + dy * r)
            if pg.locator("#tip").is_visible() and "one " in pg.locator("#tip").inner_text():
                break
        check("hovering a memory ring shows its sentence", pg.locator("#tip").is_visible() and ("favor" in pg.locator("#tip").inner_text() or "slight" in pg.locator("#tip").inner_text()))
    k = chips.first.get_attribute("data-hl")
    chips.first.hover()
    lit = pg.locator(".map svg.hl .pin.lit")
    check("hovering a chip lights its pins", lit.count() > 0 and all(lit.nth(i).get_attribute("data-k") == k for i in range(lit.count())))
    pg.mouse.move(2, 2)
    check("council suggestion rows keep the reason off screen", pg.locator(".sug small").count() == 0 and pg.locator(".sug .sr").count() > 0)
    pg.locator(".sug .act").first.hover()
    check("hovering a suggestion shows its reason", pg.locator("#sugwhy").inner_text() != "Point at a suggestion to see why.")
    check("the map draws terrain and a weather badge", pg.locator(".map .terrain .t-mtn").count() == 1 and pg.locator(".map .wxbadge").count() == 1)


def touch_checks(browser):
    """At phone width with touch, the first tap on a pin shows the sentence; Open in the tip opens the power."""
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    tp = ctx.new_page()
    tp.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    tp.on("pageerror", lambda e: errors.append(str(e)))
    tp.goto(PAGE)
    tp.wait_for_timeout(400)
    if tp.locator(".dlg .primary").count():
        tp.locator(".dlg .primary").tap()
    for _ in range(6):
        if tp.locator(".map .pin:not(.done)").count():
            break
        b = tp.locator("[data-do=end]:not([disabled])")
        if b.count():
            b.first.tap()
        tp.wait_for_timeout(200)
        dialogs(tp)
    # let the season playback finish first: its next step re-renders the map and closes any tip
    for _ in range(30):
        if not tp.locator("[data-do=skip]").count():
            break
        tp.locator("[data-do=skip]").first.tap()
        tp.wait_for_timeout(100)
    pin = tp.locator(".map .pin:not(.done)").first
    check("a pin shows on the phone map", pin.count() == 1)
    if pin.count():
        pin.evaluate("e => e.scrollIntoView({ block: 'center' })")
        pin.tap(force=True)
        check("a tap on a pin shows its sentence and stays on the season", tp.locator("#tip").is_visible() and tp.locator(".portrait").count() == 0)
        open_btn = tp.locator("#tip button")
        if open_btn.count():
            open_btn.tap()
            check("Open in the tip opens the power", tp.locator(".portrait").count() == 1)
    check("no sideways scroll at phone width with touch", tp.evaluate("document.documentElement.scrollWidth") <= 390)
    ctx.close()


# Opens a new game on a rogue crisis next to six members, by patching Aman.create as the engine loads.
FORCE_CRISIS = """
(function () { var A; Object.defineProperty(window, 'Aman', { configurable: true, get: function () { return A; }, set: function (v) {
  A = v; var c = v.create; v.create = function (seed) { var S = c(seed);
    ['ganga', 'himal', 'narmada', 'mahanadi', 'aravalli', 'seaboard'].forEach(function (id) { S.factions[id].member = true; S.factions[id].trust = 62; });
    S.factions.yamuna.grip = 3; S.crisis = 'yamuna'; S.phase = 'crisis'; return S; }; } }); })();
"""


def battle_checks(browser, width, motion="no-preference"):
    """The battle on the map: entered from a crisis, three rounds of moves, and Continue applies the result."""
    bp = browser.new_page(viewport={"width": width, "height": 900}, reduced_motion=motion)
    bp.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    bp.on("pageerror", lambda e: errors.append(str(e)))
    bp.add_init_script(FORCE_CRISIS)
    bp.goto(PAGE)
    bp.wait_for_timeout(400)
    while bp.locator(".dlg [data-do=closemodal]").count():
        bp.locator(".dlg [data-do=closemodal]").last.click()
    w = " at %d px" % width + (", reduced motion" if motion == "reduce" else "")
    check("a rogue crisis offers to defend the towns" + w, bp.locator(".dlg [data-do=crisis][data-c=battle]").count() == 1)
    bp.locator(".dlg [data-do=crisis][data-c=battle]").click()
    check("the battle opens beside the map, with no dialog" + w, bp.locator(".panel.battle").count() == 1 and bp.locator(".dlg").count() == 0 and bp.locator(".mapwrap > svg").count() == 1)
    check("the map shows the strike, the target, and the supply line" + w, bp.locator(".map .bt-strike").count() == 1 and bp.locator(".map .bt-target").count() == 1 and bp.locator(".map .bt-supply").count() == 1)
    check("the panel offers hold, move out, cut, and auto-resolve" + w, bp.locator(".panel.battle [data-do=bmove]").count() == 3 and bp.locator(".panel.battle [data-c=auto]").count() == 1)
    check("allies march to the strike" + w, bp.locator(".map .bt-ally").count() >= 1 and bp.locator(".bt-allies .mf").count() >= 1)
    check("the towns at stake show beside the place, with a tug of war in the panel" + w, bp.locator(".map .bt-houses.risk").count() == 1 and bp.locator(".bt-tug .knot").count() == 1)
    bp.locator(".panel.battle [data-do=bmove][data-c=hold]").hover()
    check("pointing at a move previews it on the map" + w, bp.locator(".mapwrap[data-pv=hold]").count() == 1)
    bp.locator(".panel.battle [data-do=bmove][data-c=evac]").click()
    if motion == "reduce":
        check("under reduced motion the round shows at once" + w, bp.locator(".panel.battle.resolving").count() == 0)
    else:
        check("a round plays out before its result shows" + w, bp.locator(".panel.battle.resolving").count() == 1 and bp.locator(".bt-score .rd.evac").count() == 0)
        settle(bp)
    check("moving people out loses the round and earns trust" + w, bp.locator(".bt-score .rd.evac").count() == 1 and bp.locator(".map .bt-mark.evac").count() == 1)
    check("auto-resolve goes once a round is played" + w, bp.locator(".panel.battle [data-c=auto]").count() == 0)
    for _ in range(2):
        if bp.locator(".panel.battle [data-c=finish]").count():
            break
        bp.locator(".panel.battle [data-do=bmove][data-c=hold]").click()
        settle(bp)
    check("the battle is decided within three rounds" + w, bp.locator(".panel.battle [data-c=finish]").count() == 1)
    bp.locator(".panel.battle [data-c=finish]").click()
    check("Continue ends the battle and the season goes on" + w, bp.locator(".panel.battle").count() == 0 and bp.locator(".map .btl").count() == 0)
    check("no sideways scroll in the battle" + w, bp.evaluate("document.documentElement.scrollWidth") <= width)
    bp.close()


def A_UNLOCKED_RELATIONS(pg):
    return pg.locator("[data-do=view][data-v=relations]").count() > 0


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
    RIVALS = pg.evaluate("Aman.ORDER.length")
    PAIRS = pg.evaluate("Aman.PAIRS.length")
    check("the top strip has a chip per rival, %d" % RIVALS, pg.locator(".pc").count() == RIVALS)
    check("the map draws a node per rival", pg.locator(".map .node").count() == RIVALS)
    check("every power has a color token", pg.evaluate("Aman.ORDER.every(function (id) { return getComputedStyle(document.documentElement).getPropertyValue('--hue-' + id).trim().length > 0; })"))
    check("welcome guide shows on first visit", pg.locator(".dlg h3").inner_text().strip().lower() == "welcome")
    pg.locator(".dlg .primary").click()
    check("welcome guide closes", pg.locator(".dlg").count() == 0)
    check("the track shows three acts", pg.locator(".top .track .ag").count() == 3 and act_now(pg) == 1)

    battle_checks(browser, 1280)
    battle_checks(browser, 390, "reduce")

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
    check("each power chip carries a trust sparkline", pg.locator(".pc .spk svg path.ln").count() == RIVALS)
    pg.locator("[data-do=view][data-v=record]").click()
    check("the Record tab shows the trust chart", pg.locator(".hchart path.tl:not(.mem)").count() == RIVALS)
    pg.locator(".hnames .hp").nth(2).hover()
    check("pointing at a name brings its line forward", pg.locator(".hchart.focus .pl.on").count() == 1)
    if A_UNLOCKED_RELATIONS(pg):
        pg.locator("[data-do=view][data-v=relations]").click()
        check("the Relations tab draws every pair on the map", pg.locator(".relnet .rl2").count() == PAIRS)
        pg.locator(".relnet .rl2").first.dispatch_event("click")
        check("selecting a pair line flashes its row", pg.locator(".row.flash").count() == 1)
    pg.locator("[data-do=view][data-v=home]").click()
    attention_checks(pg)

    label = pg.locator(".top .track").get_attribute("aria-label")
    log_len = pg.evaluate("JSON.parse(localStorage.getItem('aman-save')).S.log.length")
    pg.reload()
    pg.wait_for_timeout(600)
    check("a reload resumes the same season", pg.locator(".top .track").get_attribute("aria-label") == label and pg.locator(".dlg").count() == 0)
    check("the resumed game keeps its log", pg.evaluate("JSON.parse(localStorage.getItem('aman-save')).S.log.length") == log_len)
    check("the resumed game says welcome back", "Welcome back" in pg.locator("body").inner_text())
    check("no analytics are sent from localhost", pg.evaluate("performance.getEntriesByType('resource').every(function (r) { return r.name.indexOf('/api/event') < 0; })"))

    pg.locator(".pc").nth(0).click()
    check("power dossier opens", pg.locator(".portrait").count() == 1 and pg.locator(".dial").count() == 1)
    check("the dossier shows what the power remembers", pg.locator(".sec .memtrack i").count() == 7)
    check("each memory reads as a favor or a slight", pg.evaluate("Array.prototype.every.call(document.querySelectorAll('.memlist li'), function (l) { return l.classList.contains('pos') || l.classList.contains('neg'); })"))
    pg.locator("[data-do=asknew]").click()
    check("New game asks for confirmation mid-game", "abandon" in pg.locator(".dlg h2").inner_text().lower())
    pg.locator(".dlg .ghost").click()

    # one game following the adviser through the acts; try a second game if the first ends early
    # dialogs are answered at random, so a game can stall in Act 2; allow a few tries
    reached = adviser_game(pg)
    for _ in range(3):
        if reached == 3:
            break
        if game_over(pg):
            pg.locator(".dlg [data-do=new].primary").click()
        reached = max(reached, adviser_game(pg))
    check("an adviser game reaches Act 3 by clicking", reached == 3)
    check("the Act 2 title card showed", "act 2 of 3" in seen)
    check("the Act 3 title card showed", "act 3 of 3" in seen)
    check("a council vote showed the chamber, a seat per power and you", "seats" in seen)
    check("the chamber lit the votes after a choice", "vote result" in seen)
    check("a dispute showed as a scene: two leaders and four cards", "dispute scene ok" in seen)
    if not game_over(pg):
        adviser_game(pg)
    check("the adviser game reaches an ending", game_over(pg))
    check("a finished game clears its save", pg.evaluate("localStorage.getItem('aman-save') === null"))
    check("the ending draws a trust line per power", pg.locator(".dlg .hchart path.tl:not(.mem)").count() == RIVALS)
    check("the ending shows a seal slot per rival", pg.locator(".dlg .endseals span").count() in (0, RIVALS))
    check("the ending chart marks events", pg.locator(".dlg .hchart .hm").count() > 0)
    if pg.locator(".dlg .hchart .hm").count():
        pg.locator(".dlg .hchart .hm").first.hover(force=True)
        check("hovering a chart marker reads it out", "Point at" not in pg.locator("#hread").inner_text())
    pg.set_viewport_size({"width": 400, "height": 800})
    check("no sideways scroll at phone width, game over", no_sideways(pg))
    pg.set_viewport_size({"width": 1280, "height": 900})
    pg.locator(".dlg [data-do=new].primary").click()

    check("a random game reaches an ending", random_play(pg))

    pg.set_viewport_size({"width": 400, "height": 800})
    if game_over(pg):
        pg.locator(".dlg [data-do=new].primary").click()
    pg.locator(".pc").nth(3).click()
    check("no sideways scroll at phone width", no_sideways(pg))
    check("a random game at phone width reaches an ending", random_play(pg))

    touch_checks(browser)

    browser.close()

check("no console or page errors", not errors)
for e in errors:
    print("   ", e)
sys.exit(1 if failures else 0)

#!/usr/bin/env python3
"""Build the Aman map from Natural Earth data.

Downloads Natural Earth land, river centerlines, and physical regions (public domain) into
tools/.cache/,
projects them into the map's 460 x 520 SVG frame, simplifies them, and writes the
result into public/index.html between the GENERATED MAP marker comments.

Run from the repository root:

    python3 tools/build_map.py           # print the generated block
    python3 tools/build_map.py --write   # replace the block in public/index.html

Stdlib only. Delete tools/.cache/ to force a fresh download.

Sensitivity rule: this script uses ONLY the land, river, and physical-region layers. From the
physical regions it keeps only mountain ranges, deserts, plateaus, and the Ganges plain, and it
draws them as scattered marks, never as outlines or labels. Never add an admin, boundary, or
country layer. The map draws no borders; territory is a soft glow.

Everything placed on the map is named here as a longitude and latitude, so changing the
projection or frame moves it all together. index.html keeps only pixel offsets for labels.
"""
import json
import math
import pathlib
import re
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache"
PAGE = ROOT / "public" / "index.html"
BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
LAND_FILE = "ne_50m_land.geojson"
RIVER_FILE = "ne_10m_rivers_lake_centerlines.geojson"
REGION_FILE = "ne_10m_geography_regions_polys.geojson"
BEGIN = "// BEGIN GENERATED MAP"
END = "// END GENERATED MAP"

W, H = 460, 520                     # SVG frame
LON0, LAT0, PAR1, PAR2 = 81.0, 21.0, 12.0, 30.0   # Lambert conformal conic
# The frame is fitted so these points sit inside it with this much padding (px). The north point
# leaves room above Peshawar for its label, the south point room below Colombo.
FIT = [(66.0, 21.0), (93.6, 24.0), (73.0, 36.3), (80.6, 5.0)]
FIT_PAD = 4
LAND_TOL, RIVER_TOL = 0.7, 0.55     # Douglas-Peucker tolerance in px
MIN_ISLAND = 6.0                    # drop islands smaller than this many square px

# Rivers: Natural Earth name, a point near the source, a point near the mouth.
RIVERS = {
    "indus": ("Indus", (79.7, 32.4), (67.5, 24.0)),
    "ganga": ("Ganges", (79.8, 30.9), (90.4, 22.8)),
    "karnali": ("Ghäghara", (80.9, 30.5), (84.7, 25.7)),
    "brahma": (("Dihang", "Brahmaputra"), (94.4, 29.3), (90.25, 23.46)),
    "yamuna": ("Yamuna", (78.45, 31.0), (81.88, 25.42)),
    "narmada": ("Narmada", (81.75, 22.67), (72.6, 21.65)),
    "mahanadi": ("Mahäna Nadï", (81.9, 20.1), (86.7, 20.3)),
    "godavari": ("Godävari", (73.7, 20.0), (82.3, 16.7)),
    "krishna": ("Krishna", (73.8, 18.0), (80.9, 16.0)),
    "cauvery": ("Cauvery", (75.5, 12.4), (79.85, 11.1)),
}
# cut the Ganges at Patna and the Indus at the Panjnad confluence, so each reach can carry its own state
SPLIT = {"ganga": ((85.14, 25.61), "gangaUp", "gangaLow"), "indus": ((71.0, 29.3), "indusUp", "indusLow")}
# Rivers whose width shows a power's need: river -> (power id, need key). Width 2 + 1.5 per pip.
# Every other river keeps a fixed width (px) and minor ones draw faint.
RIVER_STATE = {"indusUp": ("indus", "water"), "indusLow": ("lindus", "flow"), "gangaLow": ("delta", "flow"),
               "narmada": ("narmada", "water"), "cauvery": ("coromandel", "water")}
RIVER_W = {"gangaUp": 3.5, "karnali": 3.0, "brahma": 2.6, "yamuna": 2.0, "godavari": 1.5, "krishna": 1.5, "mahanadi": 1.5}
MINOR = ["godavari", "krishna", "mahanadi"]

# Named places that are not seats. A third value snaps the point onto that river.
PLACES = {
    "co": (68.4, 15.6),                                   # the Company, offshore
    "patna": (85.14, 25.61),
    "dam": (81.5, 29.3, "karnali"),                       # Karnali gorge, far west Nepal
    "gorge": (93.2, 27.9, "brahma"),                      # the Brahmaputra gorges
    "sarovar": (73.75, 21.83, "narmada"),                 # the lower Narmada dams
    "kalabagh": (71.5, 32.9, "indusUp"),                  # an upper Indus barrage
    "sealIndus": (70.5, 28.6, "indusLow"),
    "sealFlow": (87.0, 25.25, "gangaLow"),                # Bhagalpur, above Farakka
    "sealShield": (87.5, 18.2),                           # in the bay, off the Mahanadi coast
    "jabalpur": (80.0, 23.2), "nagpur": (79.09, 21.15),
    # river labels. The Brahmaputra has none: the Brahmaputra League's name sits on it.
    "lblIndus": (70.2, 29.8), "lblGanges": (85.6, 24.9),
}
# Lines drawn when a project is built: project -> (class, [runs of place or power ids]).
PATHS = {
    "rail": ("rail", [["passes", "indus", "yamuna", "ganga", "patna", "brahma"], ["yamuna", "narmada", "nagpur", "deccan", "coromandel"], ["patna", "mahanadi"]]),
    "hydro": ("power", [["dam", "yamuna"], ["dam", "jabalpur", "deccan"]]),
    "solar": ("power", [["aravalli", "yamuna"], ["aravalli", "seaboard"], ["aravalli", "narmada", "deccan"]]),
}
SEALS = {"induswater": "sealIndus", "flow": "sealFlow", "shield": "sealShield"}
# Works a power's plan builds: plan key -> (place, glyph, a project that builds the same thing).
WORKS = {"dams": ("dam", "dam", "hydro"), "gorgedams": ("gorge", "dam", None), "narmadadams": ("sarovar", "dam", None),
         "barrage": ("kalabagh", "dam", None)}

# Territory glows: a soft sphere of influence around each seat, never a country's outline. The
# radius is a share of the distance to the nearest other seat, between these bounds in degrees of
# latitude, so crowded seats get small glows and none is sized to a real country's extent. The
# realistic-map framing (land shape, seat cities) is flagged for the regional review.
GLOW_SHARE, GLOW_MIN, GLOW_MAX = 0.55, 1.2, 2.3
# Nodes: each power's node starts on its seat and is pushed apart until no two are closer than
# NODE_GAP px, held near the seat by a spring. A node moved more than LEADER px gets a thin line
# back to its seat.
NODE_GAP, LEADER = 58, 5
LABEL_CH = 7.2                       # px per character of a label at its phone size (13px semibold), an estimate

# Terrain: physical regions only, by Natural Earth feature class. Each becomes a scatter of small
# marks (ridges, stipple, dashes) with no outline, so no shape on the map reads as a region's edge.
# "Punjab" is classed as a desert in Natural Earth but names a cultural region split by a modern
# border; it is left out. The Ganges plain is kept only as an invisible mask for weather (winter
# fog, parched ground in a failed monsoon), together with the Thar.
TERRAIN_CLASSES = {"Range/mtn": "mtn", "Desert": "desert", "Plateau": "plateau"}
TERRAIN_SKIP = {"PUNJAB"}
PLAIN_NAMES = {"GANGES PLAIN", "THAR DESERT"}
# Weather anchors. The monsoon arrives from the southwest, over the Arabian Sea, and sweeps
# northeast across the peninsula; clouds travel along lanes parallel to this line.
WX = {
    "monsoonFrom": (65.0, 8.0), "monsoonTo": (93.0, 30.5),
    # spring heat shimmer: the Thar, the Deccan, the central plain
    "heat1": (71.4, 27.2), "heat2": (73.2, 25.0), "heat3": (77.2, 19.6), "heat4": (79.6, 23.6), "heat5": (75.6, 15.6),
}
# Winter fog banks lie along these river reaches, one every FOG_STEP px.
FOG_RIVERS, FOG_STEP = ["gangaUp", "gangaLow", "indusUp"], 34


def seats():
    """Every power's id, short name, and seat, read from the engine so the two never disagree."""
    js = ("const A=require(%s);console.log(JSON.stringify([A.PLAYER].concat(A.POWERS).map(function(p){"
          "return [p.id,p.short,p.lon,p.lat]})))" % json.dumps(str(ROOT / "public" / "engine.js")))
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout
    return [(i, s, lon, lat) for i, s, lon, lat in json.loads(out)]


def fetch(name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print("downloading " + name, file=sys.stderr)
        with urllib.request.urlopen(BASE + name) as r:
            path.write_bytes(r.read())
    return json.loads(path.read_text(encoding="utf-8"))


# ---------- projection ----------
def _t(phi):
    return math.tan(math.pi / 4 + math.radians(phi) / 2)


N = math.log(math.cos(math.radians(PAR1)) / math.cos(math.radians(PAR2))) / math.log(_t(PAR2) / _t(PAR1))
F = math.cos(math.radians(PAR1)) * _t(PAR1) ** N / N
RHO0 = F / _t(LAT0) ** N


def lcc(lon, lat):
    rho = F / _t(lat) ** N
    th = N * math.radians(lon - LON0)
    return rho * math.sin(th), RHO0 - rho * math.cos(th)


def _fit():
    pts = [lcc(*p) for p in FIT]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    s = min((W - 2 * FIT_PAD) / (x1 - x0), (H - 2 * FIT_PAD) / (y1 - y0))
    return s, (W - s * (x0 + x1)) / 2, (H + s * (y0 + y1)) / 2


SCALE, OX, OY = _fit()


def proj(lon, lat):
    x, y = lcc(lon, lat)
    return OX + SCALE * x, OY - SCALE * y


def px_per_deg(lat):
    a, b = proj(LON0, lat - 0.5), proj(LON0, lat + 0.5)
    return math.hypot(a[0] - b[0], a[1] - b[1])


# ---------- geometry ----------
def clip_rect(poly, x0, y0, x1, y1):
    """Sutherland-Hodgman: clip a closed ring to an axis-aligned rectangle."""
    def cut(pts, inside, inter):
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
        return out

    def ix(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))

    def iy(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)

    for inside, inter in ((lambda p: p[0] >= x0, ix(x0)), (lambda p: p[0] <= x1, ix(x1)),
                          (lambda p: p[1] >= y0, iy(y0)), (lambda p: p[1] <= y1, iy(y1))):
        if not poly:
            break
        poly = cut(poly, inside, inter)
    return poly


def dp(pts, tol):
    """Douglas-Peucker, iterative."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if L else math.hypot(px - ax, py - ay)
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def area(ring):
    return abs(sum(ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1] for i in range(len(ring)))) / 2


def fmt(v):
    s = ("%.1f" % v).rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


def path(pts, closed=False):
    d = "M" + " L".join(fmt(x) + " " + fmt(y) for x, y in pts)
    return d + (" Z" if closed else "")


# ---------- layers ----------
def land():
    rings = []
    for ft in fetch(LAND_FILE)["features"]:
        g = ft["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for k, ring in enumerate(poly):
                lons = [p[0] for p in ring]
                lats = [p[1] for p in ring]
                if max(lons) < 50 or min(lons) > 110 or max(lats) < -5 or min(lats) > 50:
                    continue
                geo = clip_rect([(p[0], p[1]) for p in ring], 40, -5, 120, 50)
                if len(geo) < 3:
                    continue
                pts = clip_rect([proj(*p) for p in geo], -6, -6, W + 6, H + 6)
                if len(pts) < 3 or area(pts) < MIN_ISLAND:
                    continue
                if k:
                    print("note: ring %d is a hole" % k, file=sys.stderr)
                pts = dp(pts + [pts[0]], LAND_TOL)[:-1]
                if len(pts) >= 3:
                    rings.append(pts)
    rings.sort(key=area, reverse=True)
    return " ".join(path(r, True) for r in rings)


def river_parts(names):
    names = (names,) if isinstance(names, str) else names
    parts = []
    for ft in fetch(RIVER_FILE)["features"]:
        g = ft["geometry"]
        if not g or ft["properties"].get("name") not in names:
            continue
        for line in (g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]):
            if len(line) >= 2:
                parts.append([(p[0], p[1]) for p in line])
    return parts


def chain(parts, src, mouth, tol=0.6):
    """Join line parts from near src toward mouth, greedily."""
    def d(a, b):
        return math.hypot(a[0] - b[0], a[1] - b[1])

    parts = list(parts)
    best = min(parts, key=lambda l: min(d(l[0], src), d(l[-1], src)))
    parts.remove(best)
    line = best if d(best[0], src) <= d(best[-1], src) else best[::-1]
    while d(line[-1], mouth) > 0.05:
        cands = []
        for l in parts:
            for seg in (l, l[::-1]):
                if d(seg[0], line[-1]) <= tol:
                    cands.append((d(seg[-1], mouth), seg, l))
        cands = [c for c in cands if c[0] < d(line[-1], mouth)]
        if not cands:
            break
        _, seg, l = min(cands, key=lambda c: c[0])
        parts.remove(l)
        line = line + seg[1:]
    return line


def rivers():
    out = {}
    for key, (names, src, mouth) in RIVERS.items():
        out[key] = chain(river_parts(names), src, mouth)
    for key, (at, a, b) in SPLIT.items():
        line = out.pop(key)
        i = min(range(len(line)), key=lambda k: math.hypot(line[k][0] - at[0], line[k][1] - at[1]))
        out[a], out[b] = line[:i + 1], line[i:]
    return out


def in_frame(line, pad=8):
    """Drop the parts of a projected line that run outside the frame. Returns a list of runs."""
    def inside(q):
        return -pad <= q[0] <= W + pad and -pad <= q[1] <= H + pad
    runs, cur = [], []
    for i, q in enumerate(line):
        near = inside(q) or (i and inside(line[i - 1])) or (i + 1 < len(line) and inside(line[i + 1]))
        if near:
            cur.append(q)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= 2]


def snap(lon, lat, line):
    """Nearest vertex of a river line to a point, in projected px."""
    p = proj(lon, lat)
    return min((proj(*q) for q in line), key=lambda q: math.hypot(q[0] - p[0], q[1] - p[1]))


def inside(pt, rings):
    """Even-odd point-in-polygon over a list of rings (so holes count)."""
    x, y = pt
    c = False
    for ring in rings:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                c = not c
            j = i
    return c


def edge_dist(pt, rings):
    best = 1e9
    for ring in rings:
        for i in range(len(ring)):
            ax, ay = ring[i - 1]
            bx, by = ring[i]
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy
            t = 0 if not L2 else max(0, min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / L2))
            best = min(best, math.hypot(pt[0] - ax - t * dx, pt[1] - ay - t * dy))
    return best


def jitter(i, j, k):
    """A fixed pseudo-random number in [0, 1) for grid cell (i, j), so the build repeats."""
    h = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791)
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return (h & 0xFFFF) / 65536.0


def regions():
    """Projected rings of the kept physical regions: {class: [(rank, rings)]}, plus the weather mask."""
    out = {v: [] for v in TERRAIN_CLASSES.values()}
    plain = []
    for ft in fetch(REGION_FILE)["features"]:
        pr, g = ft["properties"], ft["geometry"]
        name, cla = pr.get("NAME"), pr.get("FEATURECLA")
        if name in TERRAIN_SKIP or not g:
            continue
        kind = TERRAIN_CLASSES.get(cla)
        if not kind and name not in PLAIN_NAMES:
            continue
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            rings = []
            for ring in poly:
                pts = clip_rect([proj(*p[:2]) for p in ring], -10, -10, W + 10, H + 10)
                if len(pts) >= 3:
                    rings.append(pts)
            if not rings or area(rings[0]) < 20:
                continue
            if kind:
                out[kind].append((pr.get("SCALERANK", 5), rings))
            if name in PLAIN_NAMES:
                plain.append(rings)
    return out, plain


def terrain():
    reg, plain = regions()
    mtn_rings = [r for _, rr in reg["mtn"] for r in [rr]]

    def in_mtn(q):
        return any(inside(q, rr) for rr in mtn_rings)

    marks = {"mtn": [], "desert": [], "plateau": []}
    # ridges: a staggered grid of small chevrons, bigger in the great ranges
    for rank, rr in reg["mtn"]:
        big = rank <= 2
        sx, sy = (10.0, 7.0) if big else (8.0, 6.5)
        w, h = (3.6, 2.6) if big else (2.8, 2.0)
        ys = [p[1] for ring in rr for p in ring]
        xs = [p[0] for ring in rr for p in ring]
        j = 0
        y = min(ys) + sy / 2
        while y < max(ys):
            x = min(xs) + (sx / 2 if j % 2 else 0)
            i = 0
            while x < max(xs):
                q = (x + (jitter(i, j, 1) - 0.5) * 2.5, y + (jitter(i, j, 2) - 0.5) * 2)
                if -2 < q[0] < W + 2 and -2 < q[1] < H + 2 and inside(q, rr) and edge_dist(q, rr) > 1.2:
                    marks["mtn"].append("M%s %sl%s -%s %s %s" % (fmt(q[0] - w), fmt(q[1] + h / 2), fmt(w), fmt(h), fmt(w), fmt(h)))
                x += sx
                i += 1
            y += sy
            j += 1
    # deserts: jittered stipple; plateaus: sparse short dashes. Neither draws inside a range.
    for kind, step, keep in (("desert", 5.5, 0.75), ("plateau", 11.0, 0.8)):
        for rank, rr in reg[kind]:
            ys = [p[1] for ring in rr for p in ring]
            xs = [p[0] for ring in rr for p in ring]
            j = 0
            y = min(ys)
            while y < max(ys):
                x = min(xs) + (step / 2 if j % 2 else 0)
                i = 0
                while x < max(xs):
                    q = (x + (jitter(i, j, 3) - 0.5) * step * 0.7, y + (jitter(i, j, 4) - 0.5) * step * 0.6)
                    if jitter(i, j, 5) < keep and 0 < q[0] < W and 0 < q[1] < H and inside(q, rr) and edge_dist(q, rr) > step * 0.4 and not in_mtn(q):
                        if kind == "desert":
                            marks[kind].append("M%s %sh.1" % (fmt(q[0]), fmt(q[1])))
                        else:
                            marks[kind].append("M%s %sh4" % (fmt(q[0] - 2), fmt(q[1])))
                    x += step
                    i += 1
                y += step * 0.8
                j += 1
    mask = " ".join(path(dp(r + [r[0]], 1.0)[:-1], True) for rr in plain for r in rr if len(r) >= 3)
    return {k: "".join(v) for k, v in marks.items()}, mask


def relax(pts, fixed=()):
    """Push nodes apart to NODE_GAP px, each held near its seat by a spring. pts: {id: (x, y)}."""
    pos = {k: list(v) for k, v in pts.items()}
    for _ in range(400):
        moved = 0.0
        for a in pos:
            fx = (pts[a][0] - pos[a][0]) * 0.03
            fy = (pts[a][1] - pos[a][1]) * 0.03
            for b in list(pos) + list(fixed):
                if a == b:
                    continue
                q = pos[b] if b in pos else fixed[b]
                dx, dy = pos[a][0] - q[0], pos[a][1] - q[1]
                d = math.hypot(dx, dy) or 0.01
                if d < NODE_GAP:
                    push = (NODE_GAP - d) * (0.5 if b in pos else 1.0)
                    fx += dx / d * push * 0.5
                    fy += dy / d * push * 0.5
            pos[a][0] = min(W - 26, max(26, pos[a][0] + fx))
            pos[a][1] = min(H - 40, max(36, pos[a][1] + fy))
            moved += abs(fx) + abs(fy)
        if moved < 0.01:
            break
    return {k: (v[0], v[1]) for k, v in pos.items()}


def footprint(x, y, flip=False):
    """What a node draws around itself, as rects: the ring and its side badges, the badges above, the gate
    dots and strain below. Flipped, the badges trade sides (FLIP in the page)."""
    r = [(x - 25, y - 25, x + 26, y + 22), (x - 9, y - 35, x + 27, y - 25), (x - 15, y + 22, x + 15, y + 33)]
    return [(2 * x - b[2], b[1], 2 * x - b[0], b[3]) for b in r] if flip else r


def choose_flips(node):
    """Mirror a node's badges when that keeps them off its neighbors."""
    flip = {k: False for k in node}
    for _ in range(3):
        for k in node:
            def clash(f):
                return sum(overlap(a, b) for o in node if o != k for a in footprint(*node[k], f) for b in footprint(*node[o], flip[o]))
            flip[k] = clash(True) < clash(False) - 1
    return flip


def label_spots(x, y, w):
    """Candidate label boxes around a node: (dx, dy, anchor, box, penalty). The box leaves a line
    for a tag such as Holdout: under the name, or above it when the name sits above the node."""
    h = 24
    def box(x0, top):
        return (x0, top, x0 + w, top + h)
    return [
        (29, 4, "start", box(x + 29, y - 7), 0),
        (-29, 4, "end", box(x - 29 - w, y - 7), 0.5),
        (0, 43, "middle", box(x - w / 2, y + 34), 1),
        (0, -38, "middle", box(x - w / 2, y - 60), 1.5),
        (24, -26, "start", box(x + 24, y - 37), 2),
        (-24, -26, "end", box(x - 24 - w, y - 37), 2.5),
        (22, 30, "start", box(x + 22, y + 19), 2),
        (-22, 30, "end", box(x - 22 - w, y + 19), 2.5),
    ]


def overlap(a, b):
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return w * h if w > 0 and h > 0 else 0.0


def place_labels(node, text, fixed, flip):
    """Greedy, then a few passes of local repair: each label takes its cheapest spot."""
    ids = list(node)
    foot = {k: footprint(*node[k], flip[k]) for k in ids}
    choice = {}

    def cost(k, spot):
        b = spot[3]
        c = spot[4] * 40
        for o in ids:
            for r in foot[o]:
                c += overlap(b, r) * (3 if o != k else 6)
            if o != k and o in choice:
                c += overlap(b, choice[o][3]) * 6
        for r in fixed:
            c += overlap(b, r) * 4
        out = max(0, -b[0]) + max(0, b[2] - W) + max(0, -b[1]) + max(0, b[3] - H)
        return c + out * 400

    def crowd(k):
        return -sum(1 / (math.dist(node[k], node[o]) + 1) for o in ids if o != k)

    for k in sorted(ids, key=crowd):
        w = len(text[k]) * LABEL_CH
        choice[k] = min(label_spots(*node[k], w), key=lambda sp: cost(k, sp))
    for _ in range(6):
        for k in ids:
            w = len(text[k]) * LABEL_CH
            choice[k] = min(label_spots(*node[k], w), key=lambda sp: cost(k, sp))
    bad = [(k, round(cost(k, choice[k]))) for k in ids if cost(k, choice[k]) > choice[k][4] * 40 + 1]
    if bad:
        print("note: labels that still touch something: %s" % bad, file=sys.stderr)
    return {k: (v[0], v[1], v[2], round(len(text[k]) * LABEL_CH)) for k, v in choice.items()}


def build():
    riv = rivers()
    pt = {}
    for k, v in PLACES.items():
        pt[k] = snap(v[0], v[1], riv[v[2]]) if len(v) == 3 else proj(v[0], v[1])
    seat_ll = {i: (lon, lat) for i, _, lon, lat in seats()}
    shorts = {i: s for i, s, _, _ in seats()}
    seat = {k: proj(*v) for k, v in seat_ll.items()}
    node = relax(seat, {"co": pt["co"]})
    text = {k: ("You: " + v if k == "deccan" else v) for k, v in shorts.items()}
    co = pt["co"]
    fixed = [(co[0] - 34, co[1] - 16, co[0] + 34, co[1] + 50), (0, H - 26, 190, H)]
    for k, anchor, name in (("lblIndus", "end", "Indus"), ("lblGanges", "middle", "Ganges")):
        x, y = pt[k]
        w = len(name) * 5.4
        x0 = x - w if anchor == "end" else x - w / 2 if anchor == "middle" else x
        fixed.append((x0, y - 9, x0 + w, y + 2))
    flip = choose_flips(node)
    for k in list(SEALS.values()) + [v[0] for v in WORKS.values()]:
        x, y = pt[k]
        fixed.append((x - 7, y - 7, x + 7, y + 7))
    lbl = place_labels(node, text, fixed, flip)
    zone = {}
    for k, (lon, lat) in seat_ll.items():
        near = min(math.dist(seat[k], seat[o]) for o in seat if o != k) / px_per_deg(lat)
        r = max(GLOW_MIN, min(GLOW_MAX, near * GLOW_SHARE)) * px_per_deg(lat)
        zone[k] = (seat[k][0], seat[k][1], r)
    where = dict(pt)
    where.update(node)
    paths = {k: (cls, [[where[p] for p in run] for run in runs]) for k, (cls, runs) in PATHS.items()}
    fog = []
    for k in FOG_RIVERS:
        line = [proj(*q) for q in riv[k]]
        acc, last = FOG_STEP / 2, line[0]
        for q in line[1:]:
            acc += math.dist(q, last)
            last = q
            if acc >= FOG_STEP and 0 < q[0] < W and 0 < q[1] < H:
                fog.append((q[0], q[1], 30 + 14 * jitter(len(fog), 1, 7)))
                acc = 0

    def arr(v):
        return "[" + ", ".join(str(round(c)) for c in v) + "]"

    def obj(d, f=arr):
        return "{ " + ", ".join(k + ": " + f(v) for k, v in d.items()) + " }"

    L = [BEGIN + " (tools/build_map.py; rerun it instead of editing by hand)",
         "  // Natural Earth land, rivers, and physical regions only, Lambert conic, %dx%d frame. No borders." % (W, H),
         "  var MAPW = %d, MAPH = %d;" % (W, H),
         "  var LAND = '" + land() + "';",
         "  var RIV = {"]
    keys = list(riv)
    for i, k in enumerate(keys):
        d = " ".join(path(dp(run, RIVER_TOL)) for run in in_frame([proj(*p) for p in riv[k]]))
        L.append("    " + k + ": '" + d + "'" + ("," if i < len(keys) - 1 else ""))
    L.append("  };")
    L.append("  // river -> [power, need] whose pips set its width; fixed widths for the rest; minor rivers draw faint")
    L.append("  var RIVSTATE = " + obj(RIVER_STATE, lambda v: json.dumps(list(v))) + ";")
    L.append("  var RIVW = " + obj(RIVER_W, lambda v: str(v)) + ", MINOR = " + json.dumps(MINOR) + ";")
    L.append("  // seats from the engine's lat/lon; nodes pushed apart from them; label [dx, dy, anchor, width]")
    L.append("  var SEAT = " + obj(seat) + ";")
    L.append("  var NODE = " + obj(node) + ";")
    L.append("  var LBL = " + obj(lbl, lambda v: "[%d, %d, '%s', %d]" % v) + ";")
    L.append("  var ZONE = " + obj(zone) + ";")
    L.append("  var PT = " + obj(pt) + ";")
    L.append("  var PATHS = " + obj(paths, lambda v: "['%s', [" % v[0] + ", ".join("[" + ", ".join(arr(q) for q in run) + "]" for run in v[1]) + "]]") + ";")
    L.append("  var SEALS = " + obj(SEALS, lambda v: arr(pt[v])) + ";")
    L.append("  var WORKS = " + obj(WORKS, lambda v: "{ at: %s, glyph: '%s', project: %s }" % (arr(pt[v[0]]), v[1], json.dumps(v[2]))) + ";")
    L.append("  var LEADER = %d, FLIP = %s;   // FLIP: nodes whose badges sit mirrored, clear of a neighbor" % (LEADER, json.dumps(sorted(k for k, v in flip.items() if v))))
    marks, mask = terrain()
    L.append("  // Physical relief as marks only: ridges for ranges, stipple for deserts, dashes for plateaus.")
    L.append("  var TERRAIN = { " + ", ".join(k + ": '" + v + "'" for k, v in marks.items()) + " };")
    L.append("  var PLAIN = '" + mask + "';   // Ganges plain and Thar: a mask for fog and parched ground")
    L.append("  var WX = { " + ", ".join(k + ": " + arr(proj(*v)) for k, v in WX.items()) + " };")
    L.append("  var FOG = [" + ", ".join(arr(f) for f in fog) + "];")
    L.append("  " + END)
    return "\n".join(L)


def main():
    block = build()
    if "--write" not in sys.argv:
        print(block)
        return
    html = PAGE.read_text(encoding="utf-8")
    pat = re.compile(r"[ \t]*" + re.escape(BEGIN) + r".*?" + re.escape(END), re.S)
    if not pat.search(html):
        sys.exit("markers not found in " + str(PAGE))
    PAGE.write_text(pat.sub(lambda m: "  " + block, html, count=1), encoding="utf-8")
    print("wrote %s (%d bytes of map)" % (PAGE.relative_to(ROOT), len(block)), file=sys.stderr)


if __name__ == "__main__":
    main()

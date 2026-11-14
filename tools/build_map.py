#!/usr/bin/env python3
"""Build the Aman map from Natural Earth data.

Downloads Natural Earth land, river centerlines, and physical regions (public domain) into
tools/.cache/,
projects them into the map's 400 x 420 SVG frame, simplifies them, and writes the
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

W, H = 400, 420                     # SVG frame
LON0, LAT0, PAR1, PAR2 = 81.0, 21.0, 12.0, 30.0   # Lambert conformal conic
# The frame is fitted so these points sit inside it with this much padding (px).
FIT = [(66.4, 21.0), (94.0, 24.0), (74.3, 34.4), (80.6, 5.7)]
FIT_PAD = 4
LAND_TOL, RIVER_TOL = 0.7, 0.55     # Douglas-Peucker tolerance in px
MIN_ISLAND = 6.0                    # drop islands smaller than this many square px

# Rivers: Natural Earth name, a point near the source, a point near the mouth.
RIVERS = {
    "indus": ("Indus", (79.7, 32.4), (67.5, 24.0)),
    "ganga": ("Ganges", (79.8, 30.9), (90.4, 22.8)),
    "karnali": ("Ghäghara", (80.9, 30.5), (84.7, 25.7)),
    "brahma": (("Dihang", "Brahmaputra"), (94.4, 29.3), (90.25, 23.46)),
    "godavari": ("Godävari", (73.7, 20.0), (82.3, 16.7)),
    "krishna": ("Krishna", (73.8, 18.0), (80.9, 16.0)),
}
SPLIT = {"ganga": ((85.14, 25.61), "gangaUp", "gangaLow")}   # cut the Ganges at Patna

# Named places. A third value snaps the point onto that river.
PLACES = {
    # seat cities
    "lahore": (74.34, 31.55), "kathmandu": (85.32, 27.71), "patna": (85.14, 25.61),
    "dhaka": (90.41, 23.81), "kochi": (76.27, 9.93), "colombo": (79.86, 6.93),
    "hyderabad": (78.47, 17.39),
    # where each power's node sits. Patna is about 30 px from Kathmandu at this scale, too
    # close for two nodes, so the Gangetic Union sits mid-plain near Lucknow. The coast sits
    # at the tip of the peninsula, between Kochi and Colombo.
    "indus": (74.34, 31.55), "himal": (85.32, 27.71), "ganga": (80.9, 26.7),
    "delta": (90.41, 23.81), "coast": (77.9, 8.9), "home": (78.47, 17.39),
    "co": (68.6, 16.0),                                   # the Company, offshore
    "dam": (81.5, 29.3, "karnali"),                       # Karnali gorge, far west Nepal
    "fort": (76.9, 31.0),                                 # Indus League's eastern edge
    "sealIndus": (71.0, 29.9, "indus"),
    "sealFlow": (87.0, 25.25, "gangaLow"),                # Bhagalpur, above Farakka
    # rail: Ganga Union, Nagpur, you, Bengaluru, the coast
    "rail1": (79.09, 21.15), "rail2": (77.59, 12.97),
    # hydro lines: dam, Jabalpur, you, Chennai, the coast
    "hydro1": (80.0, 23.2), "hydro2": (80.27, 13.08),
    # river labels
    "lblIndus": (68.0, 26.4), "lblGanges": (84.0, 24.6), "lblBrahma": (91.0, 26.6),
}
# Territory glows: a soft sphere of influence around each power's seat, never a country's
# outline. Each one is centered on the power's node with a radius in degrees of latitude.
# Do not size a glow to fit a real country's extent. The realistic-map framing (land shape,
# seat cities) is flagged for the regional review the design doc calls for.
GLOW_R = {"indus": 2.2, "himal": 1.6, "ganga": 2.0, "delta": 1.7, "coast": 2.0, "home": 2.4}
ZONES = {k: (PLACES[k][0], PLACES[k][1], r, r) for k, r in GLOW_R.items()}

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
    "monsoonFrom": (66.0, 9.0), "monsoonTo": (92.0, 30.0),
    # spring heat shimmer: the Thar, the Deccan, the central plain
    "heat1": (71.4, 27.2), "heat2": (73.2, 25.0), "heat3": (77.2, 19.6), "heat4": (79.6, 23.6), "heat5": (75.6, 15.6),
}


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


def build():
    riv = rivers()
    pt = {}
    for k, v in PLACES.items():
        pt[k] = snap(v[0], v[1], riv[v[2]]) if len(v) == 3 else proj(v[0], v[1])
    zone = {}
    for k, (lon, lat, rx, ry) in ZONES.items():
        x, y = proj(lon, lat)
        s = px_per_deg(lat)
        zone[k] = (x, y, rx * s, ry * s)   # circles: equal radii in px

    def arr(v):
        return "[" + ", ".join(str(round(c)) for c in v) + "]"

    L = [BEGIN + " (tools/build_map.py; rerun it instead of editing by hand)",
         "  // Natural Earth land, rivers, and physical regions only, Lambert conic, %dx%d frame. No borders." % (W, H),
         "  var LAND = '" + land() + "';",
         "  var RIV = {"]
    keys = list(riv)
    for i, k in enumerate(keys):
        d = " ".join(path(dp(run, RIVER_TOL)) for run in in_frame([proj(*p) for p in riv[k]]))
        L.append("    " + k + ": '" + d + "'" + ("," if i < len(keys) - 1 else ""))
    L.append("  };")
    L.append("  var PT = { " + ", ".join(k + ": " + arr(v) for k, v in pt.items()) + " };")
    L.append("  var ZONE = { " + ", ".join(k + ": " + arr(v) for k, v in zone.items()) + " };")
    marks, mask = terrain()
    L.append("  // Physical relief as marks only: ridges for ranges, stipple for deserts, dashes for plateaus.")
    L.append("  var TERRAIN = { " + ", ".join(k + ": '" + v + "'" for k, v in marks.items()) + " };")
    L.append("  var PLAIN = '" + mask + "';   // Ganges plain and Thar: a mask for fog and parched ground")
    L.append("  var WX = { " + ", ".join(k + ": " + arr(proj(*v)) for k, v in WX.items()) + " };")
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

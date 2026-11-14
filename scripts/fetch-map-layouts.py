#!/usr/bin/env python3
"""Map layouts and pictures for the map pages, from maplestory.io's Classic World (MCW) client data.

For every map a monster lives on (data/monsters.json locations) this writes
  data/map-layouts.json  - bounds, platforms (footholds), ropes/ladders, portals and monster spawn points, in game
                           coordinates, for the map diagram (and later analyses such as "flat maps")
  assets/maps/<id>.webp  - the rendered map, scaled to at most 900 px on its longer side

Run by hand when maps change (new areas open); pictures already on disk are kept unless --force.
Requires Pillow with WebP support.  Usage: python3 scripts/fetch-map-layouts.py [--force] [id ...]
"""
import io, json, os, sys, time, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://maplestory.io/api/MCW/1/map/"
UA = {"User-Agent": "gms-hub map data (https://gms-hub.com)"}
MAX_SIDE, QUALITY = 900, 55


def get(url, timeout=90, tries=3):
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # network hiccups and 5xx: wait and retry, then give up on this map
            if n == tries - 1:
                print(f"  failed {url}: {e}", file=sys.stderr)
                return None
            time.sleep(3 * (n + 1))


def layout(d):
    vr = d.get("vrBounds") or {}
    fh = [[f["x1"], f["y1"], f["x2"], f["y2"]] for f in (d.get("footholds") or {}).values() if f]
    xs = [v for f in fh for v in (f[0], f[2])]
    ys = [v for f in fh for v in (f[1], f[3])]
    # The diagram frame: the camera bounds, widened to every platform so nothing falls outside.
    left = min([vr.get("left", 0)] + xs) if xs else vr.get("left", 0)
    top = min([vr.get("top", 0)] + ys) if ys else vr.get("top", 0)
    right = max([vr.get("right", 0)] + xs) if xs else vr.get("right", 0)
    bottom = max([vr.get("bottom", 0)] + ys) if ys else vr.get("bottom", 0)
    return {
        "name": d.get("name"),
        "street": d.get("streetName"),
        "town": bool(d.get("isTown")),
        "returnMap": (d.get("returnMap") or {}).get("id") if isinstance(d.get("returnMap"), dict) else d.get("returnMap"),
        "bounds": [left, top, right - left, bottom - top],
        "fh": fh,
        "ropes": [[r["x"], r["y1"], r["y2"], 1 if r.get("isLadder") else 0] for r in d.get("ladderRopes") or [] if r],
        # Only portals that lead somewhere (not spawn points or in-map markers).
        "portals": [[p["x"], p["y"], p["toMap"]] for p in d.get("portals") or [] if p and p.get("toMap") not in (None, 999999999)],
        "spawns": [[m["id"], m["x"], m["y"]] for m in d.get("mobs") or [] if m and not m.get("hidden")],
    }


def main():
    args = sys.argv[1:]
    force = "--force" in args
    only = {int(a) for a in args if a.isdigit()}
    monsters = json.load(open(os.path.join(ROOT, "data/monsters.json")))["monsters"]
    ids = sorted({l["id"] for m in monsters for l in m.get("locations") or []})
    if only:
        ids = [i for i in ids if i in only]
    out_path = os.path.join(ROOT, "data/map-layouts.json")
    out = json.load(open(out_path))["maps"] if os.path.exists(out_path) else {}
    os.makedirs(os.path.join(ROOT, "assets/maps"), exist_ok=True)
    for n, mid in enumerate(ids, 1):
        raw = get(API + str(mid), timeout=60)
        if not raw:
            continue
        lay = layout(json.loads(raw))
        pic = os.path.join(ROOT, f"assets/maps/{mid}.webp")
        if force or not os.path.exists(pic):
            png = get(API + f"{mid}/render", timeout=180)
            if png:
                im = Image.open(io.BytesIO(png))
                w, h = im.size
                s = min(1, MAX_SIDE / max(w, h))
                im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS).save(pic, "WEBP", quality=QUALITY, method=6)
        if os.path.exists(pic):
            lay["picture"] = list(Image.open(pic).size)
        out[str(mid)] = lay
        print(f"{n}/{len(ids)} {mid} {lay['name']}: {len(lay['fh'])} platforms, {len(lay['spawns'])} spawns", flush=True)
        time.sleep(0.5)  # be gentle with maplestory.io
    json.dump({"source": "maplestory.io MCW client data", "updated": time.strftime("%Y-%m-%d"), "maps": out},
              open(out_path, "w"), separators=(",", ":"))
    print(f"map-layouts.json: {len(out)} maps")


if __name__ == "__main__":
    main()

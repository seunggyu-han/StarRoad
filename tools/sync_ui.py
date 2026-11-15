import base64
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
ui = root / "ui"
leaflet = ui / "vendor/leaflet"

def read(path):
    return path.read_text(encoding="utf-8-sig")

script = "\n".join([read(leaflet / "leaflet.js").split("//# sourceMappingURL=")[0],
                    *(read(ui / name) for name in ("constellation.js", "night-sky.js", "star-art.js", "route-map.js", "app.js"))])
digest = base64.b64encode(hashlib.sha256(script.encode("utf-8")).digest()).decode("ascii")
policy = (f"default-src 'none'; script-src 'sha256-{digest}'; style-src 'unsafe-inline'; "
          "img-src data: blob: https://tile.openstreetmap.org; font-src data:; frame-src 'none'; object-src 'none'; "
          "base-uri 'none'; form-action 'none'")
font = ui / "fonts/StarRoadDisplay.ttf"
style = read(ui / "style.css").replace('url("fonts/StarRoadDisplay.ttf")',
    'url("data:font/ttf;base64,' + base64.b64encode(font.read_bytes()).decode("ascii") + '")')
parts = [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="'+policy+'">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>StarRoad · 내 별자리</title><style>',
    read(leaflet / "leaflet.css"), style,
    "</style></head><body>", read(ui / "lettering.svg"), read(ui / "fragment.html"),
]
maps = {"rl-offline-map":"gangnam-map", "rl-seoul-overview":"seoul-overview", "rl-drive-course":"gangnam-course",
        "sr-jeju":"jeju-map", "sr-land":"atlas-land", "sr-examples":"preview-drives"}
for key, filename in maps.items():
    data = read(ui / (filename + ".json")).replace("<", r"\u003c")
    parts.append(f'<script type="application/json" id="{key}">{data}</script>')
parts += ['<script type="application/json" id="rl-map-license">'+json.dumps(read(leaflet/"LICENSE"))+'</script>',
          "<script>"+script+"</script></body></html>"]
page = "\n".join(parts)
for file in ["ui/index.html", "app/src/main/assets/index.html"]:
    (root / file).write_bytes(page.encode("utf-8"))
print("Updated StarRoad browser and Android screens.")

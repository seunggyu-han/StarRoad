"""Extract roads and water for the Seoul overview. Uses pyosmium and Shapely."""
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "work/toolchain/osm-reader"))
import osmium
from shapely import from_wkb, get_parts, line_merge, union_all, STRtree
from shapely.geometry import LineString, box

BOUNDS = (126.64, 37.40, 127.44, 37.65)
REGION = box(*BOUNDS)
MAJOR_ROADS = ("motorway", "trunk", "primary", "secondary")
DISTRICTS = {"성동구","광진구","중구","용산구","강남구","서초구","동작구","송파구","종로구"}


def points(coords):
    return [[round(lat, 5), round(lon, 5)] for lon, lat in coords]


def main(source, river_source):
    factory = osmium.geom.WKBFactory()
    roads = defaultdict(list)
    features, labels, water_ids = [], {}, set()
    def add_water(obj):
        identity = (obj.from_way(), obj.orig_id())
        if identity in water_ids:
            return
        try:
            area = from_wkb(bytes.fromhex(factory.create_multipolygon(obj)))
        except (RuntimeError, ValueError):
            return
        if area.area < .00003 or not area.intersects(REGION):
            return
        water_ids.add(identity)
        for polygon in get_parts(area.intersection(REGION).simplify(.00009)):
            if polygon.geom_type=="Polygon" and polygon.area>.000025:
                rings = [points(polygon.exterior.coords)]
                rings.extend(points(ring.coords) for ring in polygon.interiors)
                features.append(["water", rings])
    selection = osmium.filter.TagFilter(
        *(("highway", kind) for kind in MAJOR_ROADS),
        ("natural", "water"), ("waterway", "riverbank"), ("waterway", "river"), ("place", "suburb"),
        ("place", "borough"), ("place", "city_district"))
    processor = osmium.FileProcessor(source).with_areas(osmium.filter.TagFilter(
        ("natural","water"), ("waterway","riverbank"))).with_filter(selection)
    for obj in processor:
        name = obj.tags.get("name:ko") or obj.tags.get("name","")
        if obj.is_node():
            if name in DISTRICTS and REGION.contains(from_wkb(bytes.fromhex(factory.create_point(obj)))):
                labels[name] = [round(obj.location.lat,5),round(obj.location.lon,5)]
        elif obj.is_way() and (kind := obj.tags.get("highway")) in MAJOR_ROADS:
            coords = [(node.lon,node.lat) for node in obj.nodes if node.location.valid()]
            if len(coords) < 2:
                continue
            line = LineString(coords)
            if line.intersects(REGION):
                roads[kind,name].extend(p for p in get_parts(line.intersection(REGION)) if p.geom_type=="LineString")
        elif obj.is_area() and (obj.tags.get("natural")=="water" or obj.tags.get("waterway")=="riverbank"):
            add_water(obj)
    # The Han River polygon extends beyond the city extract. Use its complete OSM relation.
    for obj in osmium.FileProcessor(river_source).with_areas().with_filter(osmium.filter.EntityFilter(osmium.osm.AREA)):
        if not obj.from_way() and obj.orig_id()==152336:
            add_water(obj)
    assert (False,152336) in water_ids
    lines = defaultdict(list)
    for (kind,name), pieces in roads.items():
        style = "major" if kind in ("motorway","trunk") else "street" if kind=="secondary" else "artery"
        for line in get_parts(line_merge(union_all(pieces)).simplify(.00010)):
            if line.geom_type=="LineString" and line.length >= .00065:
                lines[style].append(line)
    # Clip and group lines by map grid so Leaflet can skip entire offscreen areas.
    for style, segments in lines.items():
        index = STRtree(segments)
        for col in range(10):
            for row in range(5):
                west, south = BOUNDS[0]+col*.08, BOUNDS[1]+row*.05
                cell = box(west,south,west+.08,south+.05)
                parts = []
                for i in index.query(cell,predicate="intersects"):
                    for line in get_parts(segments[i].intersection(cell)):
                        if line.geom_type=="LineString" and line.length>.00001:
                            parts.append(points(line.coords))
                if parts:
                    features.append([style,parts])
    features.sort(key=lambda item:["water","street","artery","major"].index(item[0]))
    assert sum(kind=="water" for kind, _ in features)>0 and len(features)>40
    result = dict(source="© OpenStreetMap contributors", license="ODbL-1.0",
                  bounds=[[BOUNDS[1],BOUNDS[0]],[BOUNDS[3],BOUNDS[2]]],features=features,labels=sorted(labels.items()))
    (ROOT/"ui/seoul-overview.json").write_text(json.dumps(result,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("Overview:",len(features),"features,",len(labels),"district names")


if __name__=="__main__":
    main(*sys.argv[1:3])

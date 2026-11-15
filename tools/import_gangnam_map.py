"""Create the offline street layer from the public Gangnam Station OSM extract."""
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def make_map(osm):
    bounds = osm.find("bounds").attrib
    box = [[float(bounds["minlat"]), float(bounds["minlon"])],
           [float(bounds["maxlat"]), float(bounds["maxlon"])]]
    nodes, features, labels = {}, [], {}
    for node in osm.iter("node"):
        point = [round(float(node.get("lat")), 6), round(float(node.get("lon")), 6)]
        nodes[node.get("id")] = point
        tags = {t.get("k"): t.get("v") for t in node.iter("tag")}
        name = tags.get("name:ko") or tags.get("name")
        if tags.get("railway") == "station" and name:
            labels[name.removesuffix("역") + "역"] = point
    roads = {}
    for way in osm.iter("way"):
        tags = {t.get("k"): t.get("v") for t in way.iter("tag")}
        road = tags.get("highway", "")
        if road in ("primary", "secondary", "tertiary", "trunk", "motorway"):
            kind = "artery"
        elif road in ("residential", "unclassified", "living_street", "service", "tertiary_link", "primary_link", "secondary_link"):
            kind = "street"
        elif tags.get("leisure") in ("park", "garden") or tags.get("landuse") in ("grass", "forest"):
            kind = "park"
        elif tags.get("natural") == "water":
            kind = "water"
        elif "building" in tags:
            kind = "building"
        else:
            continue
        points = [nodes[n.get("ref")] for n in way.iter("nd") if n.get("ref") in nodes]
        if len(points) < 2:
            continue
        if kind in ("building", "water", "park") and points[0] != points[-1]:
            continue
        features.append([kind, points])
        name = tags.get("name:ko") or tags.get("name")
        if kind == "artery" and name:
            middle = points[len(points)//2]
            if box[0][0] < middle[0] < box[1][0] and box[0][1] < middle[1] < box[1][1]:
                roads.setdefault(name, []).append(middle)
    for name, points in roads.items():
        labels.setdefault(name, points[len(points)//2])
    order = ["park", "water", "building", "street", "artery"]
    return dict(source="© OpenStreetMap contributors", license="ODbL-1.0",
                bounds=box, features=sorted(features, key=lambda f: order.index(f[0])),
                labels=[[name, point] for name, point in labels.items()])

def make_course(osm):
    # OSM way, first node, last node in driving order. Preserve every intervening bend.
    legs = [
        ("129733424", "2477260918", "1430674331"),
        ("256787796", "1430674331", "1430656087"),
        ("417750337", "1430656087", "1326174791"),
        ("26163000", "1326174791", "1326174819"),
        ("117790062", "1326174819", "2477260918"),
    ]
    nodes = {n.get("id"): [float(n.get("lat")), float(n.get("lon"))] for n in osm.findall("node")}
    ways = {w.get("id"): w for w in osm.findall("way")}
    points, streets = [], []
    for rel in osm.findall("relation"):
        tags = {t.get("k"): t.get("v") for t in rel.findall("tag")}
        if tags.get("type") != "restriction":
            continue
        members = {(m.get("role"), m.get("type"), m.get("ref")) for m in rel.findall("member")}
        restriction = tags.get("restriction:motorcar") or tags.get("restriction:motor_vehicle") or tags.get("restriction", "")
        for i, (outgoing, junction, _) in enumerate(legs):
            incoming = legs[i-1][0]
            if ("via","node",junction) not in members or ("from","way",incoming) not in members:
                continue
            targets_outgoing = ("to","way",outgoing) in members
            if (restriction.startswith("no_") and targets_outgoing) or (restriction.startswith("only_") and not targets_outgoing):
                raise ValueError(f"Prohibited turn on course at node {junction}")
    for i, (way_id, start, end) in enumerate(legs):
        if start != legs[i-1][2]:
            raise ValueError("The driving loop must join at the same OSM nodes")
        way = ways[way_id]
        tags = {t.get("k"): t.get("v") for t in way.findall("tag")}
        refs = [n.get("ref") for n in way.findall("nd")]
        first, last = refs.index(start), refs.index(end)
        direction = tags.get("oneway", "no")
        if (tags.get("highway") not in ("residential","tertiary","unclassified","living_street") or
            any(tags.get(k) in ("private","no","destination") for k in ("access","vehicle","motor_vehicle","motorcar")) or
            (direction in ("yes","1","true") and last < first) or (direction == "-1" and last > first)):
            raise ValueError(f"Recheck vehicle access and direction on way {way_id}")
        step = 1 if last > first else -1
        vertices = [nodes[refs[j]] for j in range(first, last + step, step)]
        if not points:
            points.append([round(c, 6) for c in vertices[0]])
        streets.append(dict(way=int(way_id), version=int(way.get("version")), name=tags["name"], start=len(points)-1))
        for a, b in zip(vertices, vertices[1:]):
            metres = math.hypot(b[0]-a[0], (b[1]-a[1])*math.cos(math.radians((a[0]+b[0])/2))) * 111195
            count = max(1, math.ceil(metres / 6))
            for k in range(1, count+1):
                points.append([round(x+(y-x)*k/count, 6) for x, y in zip(a, b)])
    return dict(name="강남역 골목 한 바퀴", source="© OpenStreetMap contributors", license="ODbL-1.0",
                legs=streets, points=points)


if __name__ == "__main__":
    ui = Path(__file__).resolve().parents[1] / "ui"
    osm = ET.parse(sys.argv[1]).getroot()
    map_data, course = make_map(osm), make_course(osm)
    for file, data in [("gangnam-map.json", map_data), ("gangnam-course.json", course)]:
        (ui/file).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(map_data['features'])} map features, {len(course['points'])} driving fixes")

"""Render and validate the physical board at its printed millimetre dimensions."""
import argparse
import html
import importlib.util
import json
import math
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('concepts', ROOT / 'scripts/generate-map-concepts.py')
concepts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(concepts)

MAP_X, MAP_Y, MAP_WIDTH, MAP_HEIGHT = 78, 34, 264, 210
SLOT_RADIUS, SLOT_PITCH = 6.5, 15
GREEN, INK = '#287a43', '#19354b'
COLORS = {'Urban': '#e6b6a6', 'Industrial Belt': '#dbeaca', 'Outlying': '#f5e7ac', 'Centre': '#e4dfea'}


def print_point(point):
    x, y = point
    return MAP_X + (x - 40) * MAP_WIDTH / 1108, MAP_Y + (y - 105) * MAP_HEIGHT / 583


def border_distance(point, polygon):
    x, y = point
    distances = []
    for (ax, ay), (bx, by) in zip(polygon, polygon[1:] + polygon[:1]):
        dx, dy = bx - ax, by - ay
        t = max(0, min(1, ((x-ax)*dx + (y-ay)*dy) / (dx*dx + dy*dy)))
        distances.append(math.hypot(x-ax-t*dx, y-ay-t*dy))
    return min(distances)


def slot_centres(capacity, label):
    x, y = label
    columns = 3 if capacity in (3, 6) else 2
    return [(x + (i % columns - (columns-1)/2) * SLOT_PITCH, y + 10 + (i // columns) * SLOT_PITCH) for i in range(capacity)]


def text(x, y, value, size=3.5, anchor='middle', weight='normal'):
    return f'<text x="{x:g}" y="{y:g}" font-size="{size:g}" text-anchor="{anchor}" font-weight="{weight}">{html.escape(value)}</text>'


def support_slot(x, y, retained):
    color = GREEN if retained else INK
    stroke = 1 if retained else .35
    svg = f'<circle class="support-slot" cx="{x:g}" cy="{y:g}" r="{SLOT_RADIUS}" fill="white" stroke="{color}" stroke-width="{stroke}" data-retained="{str(retained).lower()}"/>'
    if retained:
        svg += f'<path d="M{x-2.6:g},{y:g} l1.8,2 l3.5,-4" fill="none" stroke="{GREEN}" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"/>'
    return svg


def render(study):
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297" role="img" aria-labelledby="title desc">',
           '<title id="title">Bellwether — cube-fit physical board</title>',
           '<desc id="desc">Continuous land with 51 support slots sized for 8 mm cubes, four 63 by 88 mm policy wells and a six-year tracker. Shared borders define adjacency; point contacts do not. Green checks show the retained count; survivors are chosen randomly.</desc>',
           f'<style>text{{font-family:Arial,sans-serif;fill:{INK}}}</style>',
           '<rect width="420" height="297" fill="white"/>',
           text(8, 13, 'BELLWETHER', 7, 'start', 'bold')]
    all_slots = []
    for key, node in study['nodes'].items():
        district = study['districts'][key]
        polygon = [print_point(p) for p in node['polygon']]
        label = node['print_label']
        centres = slot_centres(district['capacity'], label)
        retained = district['capacity'] if key == 'X' else district['capacity'] // 2
        points = ' '.join(f'{x:.6f},{y:.6f}' for x, y in polygon)
        svg.append(f'<g data-district="{key}"><polygon points="{points}" fill="{COLORS[district["region"]]}" stroke="{INK}" stroke-width=".45" stroke-linejoin="round"/>')
        name = 'Bellwether Centre' if key == 'X' else district['name']
        svg.append(text(*label, name, weight='bold'))
        for index, centre in enumerate(centres):
            assert concepts.inside(centre, polygon) and border_distance(centre, polygon) >= 7.5, (key, 'slot/border clearance')
            assert all(math.dist(centre, other) >= SLOT_PITCH for other in all_slots), (key, 'slot spacing')
            all_slots.append(centre)
            svg.append(support_slot(*centre, index < retained))
        svg.append('</g>')
    assert len(all_slots) == 51
    for x, y, region, capacity, votes in [(8, 44, 'Urban', 18, 9), (8, 154, 'Outlying', 16, 8), (349, 44, 'Industrial Belt', 14, 7), (349, 154, 'Centre', 3, 3)]:
        svg.append(f'<g data-policy-region="{region}"><rect x="{x}" y="{y-10}" width="63" height="8" rx="1" fill="{COLORS[region]}"/>')
        svg.append(text(x+31.5, y-4.5, region, 4, weight='bold'))
        svg.append(f'<rect class="policy-well" x="{x}" y="{y}" width="63" height="88" rx="3" fill="#fffefa" stroke="{INK}" stroke-width=".35" stroke-dasharray="2 1.5"/>')
        svg.append(text(x+31.5, y+41, 'Pending policy', 3.5))
        svg.append(text(x+31.5, y+47, f'{capacity} Support / {votes} votes', 3))
        svg.append('</g>')
    svg.append(text(78, 255, 'ROUND / YEAR', 3.5, 'start', 'bold'))
    for year in range(1, 7):
        x = 78 + (year-1)*26
        fill = '#e4dfea' if year % 2 == 0 else '#f2f5f6'
        svg.append(f'<rect class="year-well" x="{x}" y="260" width="24" height="24" rx="1.5" fill="{fill}" stroke="{INK}" stroke-width=".35"/>')
        svg.append(text(x+12, 271, str(year), 6, weight='bold'))
        if year % 2 == 0:
            svg.append(text(x+12, 280, f'Election {year//2}', 2.8))
    svg.append('</svg>\n')
    return '\n'.join(svg)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    study = json.loads((ROOT / 'docs/components/physical-map.json').read_text())
    concepts.DISTRICTS = study['districts']
    edges, graph = concepts.border_edges(study, allow_bottlenecks=True)
    expected = {'Urban': [6, 6, 6], 'Industrial Belt': [2, 2, 4, 6], 'Outlying': [2, 2, 2, 2, 2, 2, 4], 'Centre': [3]}
    for region, capacities in expected.items():
        keys = {k for k, d in study['districts'].items() if d['region'] == region}
        assert sorted(study['districts'][k]['capacity'] for k in keys) == capacities
        assert len(concepts.components({k: graph[k] & keys for k in keys})) == 1
    assert not study['required'] and not study['water_labels']
    area = sum(abs(sum(x1*y2-x2*y1 for (x1,y1),(x2,y2) in zip(node['polygon'], node['polygon'][1:] + node['polygon'][:1]))) / 2 for node in study['nodes'].values())
    assert area == 1108 * 583, 'Districts must cover the whole land rectangle'
    assert 2 * SLOT_RADIUS - 1 >= 12, 'Retained ring must accommodate a 12 mm diagonal'
    svg = render(study)
    path = ROOT / 'docs/assets/policy-district-map.svg'
    if args.check:
        assert path.read_text() == svg, f'{path} is stale'
    else:
        path.write_text(svg)
    print(f'Physical map: 264 × 210 mm, 13 mm slots, four 63 × 88 mm policy wells; {len(edges)} adjacencies.')


if __name__ == '__main__':
    main()

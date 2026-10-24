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

MAP_X, MAP_Y, MAP_WIDTH, MAP_HEIGHT = 20, 25, 380, 264
INK = '#19354b'
COLORS = {2: '#dbe6cd', 4: '#ead499', 6: '#e6b6a6', 3: '#e4dfea'}


def print_point(point):
    x, y = point
    return MAP_X + (x - 40) * MAP_WIDTH / 1108, MAP_Y + (y - 105) * MAP_HEIGHT / 583


def shared_segments(pa, pb):
    segments = set()
    for a, b in zip(pa, pa[1:] + pa[:1]):
        for c, d in zip(pb, pb[1:] + pb[:1]):
            if abs(concepts.cross(a, b, c)) >= concepts.EPS or abs(concepts.cross(a, b, d)) >= concepts.EPS:
                continue
            points = {tuple(p) for p in (a, b, c, d)
                      if concepts.on_segment(a, b, p) and concepts.on_segment(c, d, p)}
            if len(points) >= 2:
                start, end = min(points), max(points)
                if math.dist(start, end) > concepts.EPS:
                    segments.add((start, end))
    return sorted(segments)


def region_borders(study):
    districts = study['districts']
    nodes = list(study['nodes'].items())
    for i, (a, node) in enumerate(nodes):
        for b, other in nodes[i+1:]:
            if districts[a]['region'] != districts[b]['region']:
                yield from shared_segments(node['polygon'], other['polygon'])


def text(x, y, value, size=3.5, anchor='middle', weight='normal'):
    return f'<text x="{x:g}" y="{y:g}" font-size="{size:g}" text-anchor="{anchor}" font-weight="{weight}">{html.escape(value)}</text>'


def render(study):
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297" role="img" aria-labelledby="title desc">',
           '<title id="title">Bellwether — district capacity physical board</title>',
           '<desc id="desc">Continuous land with district retention/capacity labels, district-type colours, thick scoring-region borders, four side labels for policies beside the board and a six-year tracker over the bottom edge. Shared borders define adjacency; point contacts do not.</desc>',
           f'<style>text{{font-family:Arial,sans-serif;fill:{INK}}}</style>',
           '<rect width="420" height="297" fill="white"/>',
           text(8, 13, 'BELLWETHER', 7, 'start', 'bold')]
    for key, node in study['nodes'].items():
        district = study['districts'][key]
        polygon = [print_point(p) for p in node['polygon']]
        label = node['print_label']
        retained = district['capacity'] if key == 'X' else district['capacity'] // 2
        points = ' '.join(f'{x:.6f},{y:.6f}' for x, y in polygon)
        svg.append(f'<g data-district="{key}"><polygon points="{points}" fill="{COLORS[district["capacity"]]}" stroke="{INK}" stroke-width=".3" stroke-linejoin="round"/>')
        name = 'Bellwether Centre' if key == 'X' else district['name']
        svg.append(text(label[0], label[1]-5.5, f'{retained}/{district["capacity"]}', 4, weight='bold'))
        svg.append(text(*label, name, weight='bold'))
        svg.append('</g>')
    for start, end in region_borders(study):
        a, b = print_point(start), print_point(end)
        svg.append(f'<path class="region-border" d="M{a[0]:.6f},{a[1]:.6f} L{b[0]:.6f},{b[1]:.6f}" fill="none" stroke="{INK}" stroke-width="1.1" stroke-linecap="round"/>')
    for x, y, angle, region in [(10, 75, -90, 'Urban'), (10, 205, -90, 'Outlying'), (410, 75, 90, 'Industrial Belt'), (410, 205, 90, 'Centre')]:
        svg.append(f'<g data-policy-region="{region}" transform="rotate({angle} {x} {y})">')
        svg.append(text(x, y, region, 4, weight='bold'))
        svg.append('</g>')
    svg.append(text(251, 270, 'ROUND / YEAR', 3, 'start', 'bold'))
    for year in range(1, 7):
        x = 251 + (year-1)*16
        fill = '#e4dfea' if year % 2 == 0 else '#f2f5f6'
        svg.append(f'<rect class="year-well" x="{x}" y="273" width="15" height="15" rx="1" fill="{fill}" stroke="{INK}" stroke-width=".35"/>')
        svg.append(text(x+7.5, 280, str(year), 5, weight='bold'))
        if year % 2 == 0:
            svg.append(text(x+7.5, 286, f'Election {year//2}', 2.3))
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
    svg = render(study)
    path = ROOT / 'docs/assets/policy-district-map.svg'
    if args.check:
        assert path.read_text() == svg, f'{path} is stale'
    else:
        path.write_text(svg)
    print(f'Physical map: 380 × 264 mm, district retention/capacity labels, four policy side labels, 15 mm Year spaces; {len(edges)} adjacencies.')


if __name__ == '__main__':
    main()

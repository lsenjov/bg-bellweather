"""Render the physical prototype independently of the app map."""
import argparse
import importlib.util
import json
import re
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('default_map', ROOT / 'scripts/generate-default-map.py')
default_map = importlib.util.module_from_spec(spec)
spec.loader.exec_module(default_map)
concepts = default_map.concepts


def retained_slots(match):
    key, group = match.group(1), match.group(0)
    circles = list(re.finditer(r'<circle cx="([^"]+)" cy="([^"]+)"[^>]*/>', group))
    retained = len(circles) if key == 'X' else len(circles) // 2
    for circle in reversed(circles[:retained]):
        x, y = map(float, circle.groups())
        slot = circle.group(0).replace('stroke="#19354b" stroke-width="1.2"', 'stroke="#287a43" stroke-width="3" data-retained="true"')
        tick = f'<path d="M{x-4:g},{y:g} l3,3 l5,-6" fill="none" stroke="#287a43" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
        group = group[:circle.start()] + slot + tick + group[circle.end():]
    group = re.sub(r' · \d+ votes?', '', group)
    return re.sub(r'<text class="detail"[^>]*>\d+ votes?</text>', '', group)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    study = json.loads((ROOT / 'docs/components/physical-map.json').read_text())
    concepts.DISTRICTS = study['districts']
    concepts.COLORS['Industrial Belt'] = concepts.COLORS['Mixed']
    edges, graph = concepts.border_edges(study, allow_bottlenecks=True)
    expected = {'Urban': [6, 6, 6], 'Industrial Belt': [2, 2, 4, 6], 'Outlying': [2, 2, 2, 2, 2, 2, 4], 'Centre': [3]}
    for region, capacities in expected.items():
        keys = {k for k, d in study['districts'].items() if d['region'] == region}
        assert sorted(study['districts'][k]['capacity'] for k in keys) == capacities
        assert len(concepts.components({k: graph[k] & keys for k in keys})) == 1
    assert not study['required'] and not study['water_labels']
    area = sum(abs(sum(x1*y2-x2*y1 for (x1,y1),(x2,y2) in zip(node['polygon'], node['polygon'][1:] + node['polygon'][:1]))) / 2 for node in study['nodes'].values())
    assert area == 1108 * 583, 'Districts must cover the whole land rectangle'
    svg = concepts.render_border_map(study, edges, concepts.graph_facts(study, edges, graph))
    for before, after in {
        'Island chain — landscape A4 prototype': 'Bellweather — physical district map',
        'ISLAND CHAIN': 'BELLWEATHER',
        '08 / Inland waterways · A4 landscape': 'Physical prototype / September 2026 · A3 landscape',
        'width="297mm" height="210mm"': 'width="420mm" height="297mm"',
        'Urban districts share continuous land. Bellweather occupies an island among inland lakes and rivers. Shared borders and marked bridges define adjacency for all effects; water otherwise severs adjacency.': 'Continuous land: shared borders define adjacency for every effect. Point contacts do not count.',
        'fill="#d9edf5"': 'fill="#f4f1e8"',
        'Three regions of eighteen Support; district elections.': 'Urban 18 Support, Industrial Belt 14, Outlying 16, Centre 3. One policy per region.',
        'Mixed 18 / 9 votes': 'Industrial Belt 14 / 7 votes',
        'Outlying 18 / 9 votes': 'Outlying 16 / 8 votes',
        'Bellweather 3 / separate': 'Centre 3 / 3 votes',
        'Centre · separate': 'Centre · no thinning',
        'Industrial Belt · ': '',
        concepts.COLORS['Urban']: '#e6b6a6',
    }.items():
        svg = svg.replace(before, after)
    svg = re.sub(r'<g data-district="([^"]+)">.*?</g>', retained_slots, svg, flags=re.S)
    legend = '<g aria-label="Retained Support reminder"><circle cx="46" cy="89" r="6" fill="white" stroke="#287a43" stroke-width="3"/><path d="M43,89 l2,2 l4,-5" fill="none" stroke="#287a43" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><text x="60" y="93" font-size="12">Green check slots show how many survive; choose survivors randomly. Centre keeps all.</text></g>'
    svg = svg.replace('<rect x="40" y="105"', legend + '\n<rect x="40" y="105"')
    old = default_map.map_trackers()
    old = re.sub(r'<text x="766".*?</text><text x="1024".*?</text>', '', old)
    old = old.split('<path d="M690,736')[0]
    svg = svg.split('<text x="36" y="758"')[0] + old + '<text x="885" y="746" font-size="15" font-weight="700">ONE POLICY PER REGION</text><text x="885" y="774" font-size="13">Thin outside Centre · Each Support votes</text><text x="885" y="800" font-size="13">For &gt; Against passes · Ties fail</text></g>\n</svg>\n'
    path = ROOT / 'docs/assets/policy-district-map.svg'
    if args.check:
        assert path.read_text() == svg, f'{path} is stale'
    else:
        path.write_text(svg)
    print(f'Physical map: 15 districts, 51 spaces, {len(edges)} adjacencies, 24 maximum outer votes/removals.')


if __name__ == '__main__':
    main()

"""Generate the default map content from the approved inland study."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('concepts', ROOT/'scripts/generate-map-concepts.py')
concepts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(concepts)


def coalition_summary():
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="49mm" height="98mm" viewBox="0 0 490 980" role="img" aria-labelledby="title"><title id="title">Bellweather Coalition summary</title><rect x="5" y="5" width="480" height="970" fill="white" stroke="#19354b"/><g font-family="Arial,sans-serif" fill="#19354b" text-anchor="middle"><text x="245" y="55" font-size="29" font-weight="bold">Coalitions</text>']
    for y in (170, 350, 530):
        svg.append(f'<path d="M 140,{y} H350" stroke="#19354b" stroke-width="10"/>')
        for x in (140, 350):
            svg.append(f'<circle cx="{x}" cy="{y}" r="70" fill="#f4f4ef" stroke="#19354b" stroke-width="3"/>')
    svg.append('<rect x="15" y="635" width="460" height="325" fill="none" stroke="#19354b" stroke-width="3"/><text x="245" y="672" font-size="24">No coalition</text>')
    for y in (745, 885):
        for x in (95, 245, 395):
            svg.append(f'<circle cx="{x}" cy="{y}" r="70" fill="#f4f4ef" stroke="#19354b" stroke-width="2"/>')
    return ''.join(svg) + '</g></svg>\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    study = next(s for s in concepts.DATA['studies'] if s['id'] == 8)
    edges, graph = concepts.border_edges(study)
    ids = {k: 'bellweather-centre' if k == 'X' else concepts.DISTRICTS[k]['name'].lower().replace(' ', '-') for k in study['nodes']}
    districts = []
    for key, node in study['nodes'].items():
        d = concepts.district(study, key)
        districts.append(dict(id=ids[key], name='Bellweather Centre' if key == 'X' else d['name'], capacity=d['capacity'], regionId=None if key == 'X' else d['region'].lower(), adjacentDistrictIds=[ids[k] for k in sorted(graph[key])], polygon=node['polygon'], label=[node['x'], node['y']]))
    bridges = [dict(districtIds=[ids[e['a']],ids[e['b']]], points=e['points']) for e in edges if e['kind']=='bridge']
    content = '''import { deepFreeze } from "./immutable.js";

export const REGION_IDS = deepFreeze(["urban", "mixed", "outlying"] as const);
export type RegionId = (typeof REGION_IDS)[number];
export const REGION_NAMES = deepFreeze({ urban: "Urban", mixed: "Mixed", outlying: "Outlying" });

export const DISTRICT_IDS = deepFreeze('''+json.dumps(list(ids.values()), indent=2)+''' as const);
export type DistrictId = (typeof DISTRICT_IDS)[number];

export interface DistrictDefinition {
  readonly id: DistrictId;
  readonly name: string;
  readonly capacity: 2 | 3 | 4 | 6;
  readonly regionId: RegionId | null;
  readonly adjacentDistrictIds: readonly DistrictId[];
  readonly polygon: readonly (readonly [number, number])[];
  readonly label: readonly [number, number];
}

export const DISTRICTS = deepFreeze('''+json.dumps(districts,indent=2)+''' as const satisfies readonly DistrictDefinition[]);

export const DISTRICTS_BY_ID = Object.freeze(
  Object.fromEntries(DISTRICTS.map((district) => [district.id, district])) as {
    readonly [Id in DistrictId]: Extract<(typeof DISTRICTS)[number], { readonly id: Id }>;
  }
);

export const MAP_BRIDGES = deepFreeze('''+json.dumps(bridges,indent=2)+''' as const);
'''
    svg = concepts.render_border_map(study, edges, concepts.graph_facts(study,edges,graph)).replace('Island chain — landscape A4 prototype','Bellweather — inland district map').replace('ISLAND CHAIN','BELLWEATHER').replace('08 / Inland waterways · A4 landscape','R24 / Inland regions · A4 landscape')
    for path, value in [(ROOT/'packages/content/src/districts.ts',content),(ROOT/'docs/assets/inland-district-map.svg',svg),(ROOT/'docs/assets/coalition-summary.svg',coalition_summary())]:
        if args.check:
            assert path.read_text()==value, f'{path} is stale'
        else:
            path.write_text(value)


if __name__ == '__main__':
    main()

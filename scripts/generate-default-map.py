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
    for path, value in [(ROOT/'packages/content/src/districts.ts',content),(ROOT/'docs/assets/inland-district-map.svg',svg)]:
        if args.check:
            assert path.read_text()==value, f'{path} is stale'
        else:
            path.write_text(value)


if __name__ == '__main__':
    main()

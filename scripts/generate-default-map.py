"""Generate the default map content from the current physical board."""
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
    study = json.loads((ROOT / 'docs/components/physical-map.json').read_text())
    concepts.DISTRICTS = study['districts']
    edges, graph = concepts.border_edges(study, allow_bottlenecks=True)
    ids = {k: 'bellwether-centre' if k == 'X' else concepts.DISTRICTS[k]['name'].lower().replace(' ', '-') for k in study['nodes']}
    districts = []
    for key, node in study['nodes'].items():
        d = study['districts'][key]
        districts.append(dict(id=ids[key], name='Bellwether Centre' if key == 'X' else d['name'], capacity=d['capacity'], regionId='centre' if key == 'X' else d['region'].lower().replace(' ', '-'), adjacentDistrictIds=[ids[k] for k in sorted(graph[key])], polygon=node['polygon'], label=[node['x'], node['y']]))
    content = '''import { deepFreeze } from "./immutable.js";

export const REGION_IDS = deepFreeze(["urban", "industrial-belt", "outlying", "centre"] as const);
export type RegionId = (typeof REGION_IDS)[number];
export const REGION_NAMES = deepFreeze({ urban: "Urban", "industrial-belt": "Industrial Belt", outlying: "Outlying", centre: "Bellwether Centre" });

export const DISTRICT_IDS = deepFreeze('''+json.dumps(list(ids.values()), indent=2)+''' as const);
export type DistrictId = (typeof DISTRICT_IDS)[number];

export interface DistrictDefinition {
  readonly id: DistrictId;
  readonly name: string;
  readonly capacity: 2 | 3 | 4 | 6;
  readonly regionId: RegionId;
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

'''
    for path, value in [(ROOT/'packages/content/src/districts.ts',content.rstrip() + '\n')]:
        if args.check:
            assert path.read_text()==value, f'{path} is stale'
        else:
            path.write_text(value)


if __name__ == '__main__':
    main()

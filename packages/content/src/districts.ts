import { deepFreeze } from "./immutable.js";

export const REGION_IDS = deepFreeze(["urban", "industrial-belt", "outlying", "centre"] as const);
export type RegionId = (typeof REGION_IDS)[number];
export const REGION_NAMES = deepFreeze({ urban: "Urban", "industrial-belt": "Industrial Belt", outlying: "Outlying", centre: "Bellwether Centre" });

export const DISTRICT_IDS = deepFreeze([
  "harbormouth",
  "grand-market",
  "ironwood",
  "northgate",
  "canal-ward",
  "crown-road",
  "meadow",
  "westfield",
  "eastfield",
  "marsh",
  "heath",
  "downs",
  "vale",
  "coast",
  "bellwether-centre"
] as const);
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

export const DISTRICTS = deepFreeze([
  {
    "id": "harbormouth",
    "name": "Harbormouth",
    "capacity": 6,
    "regionId": "urban",
    "adjacentDistrictIds": [
      "grand-market",
      "ironwood"
    ],
    "polygon": [
      [
        260,
        215
      ],
      [
        65,
        230
      ],
      [
        40,
        230
      ],
      [
        40,
        105
      ],
      [
        280,
        105
      ],
      [
        280,
        130
      ]
    ],
    "label": [
      165,
      165
    ]
  },
  {
    "id": "grand-market",
    "name": "Grand Market",
    "capacity": 6,
    "regionId": "urban",
    "adjacentDistrictIds": [
      "harbormouth",
      "ironwood",
      "crown-road",
      "bellwether-centre"
    ],
    "polygon": [
      [
        260,
        215
      ],
      [
        280,
        130
      ],
      [
        280,
        105
      ],
      [
        600,
        105
      ],
      [
        610,
        230
      ],
      [
        500,
        300
      ],
      [
        435,
        260
      ]
    ],
    "label": [
      360,
      170
    ]
  },
  {
    "id": "ironwood",
    "name": "Ironwood",
    "capacity": 6,
    "regionId": "urban",
    "adjacentDistrictIds": [
      "harbormouth",
      "grand-market",
      "heath",
      "downs",
      "bellwether-centre"
    ],
    "polygon": [
      [
        260,
        215
      ],
      [
        435,
        260
      ],
      [
        500,
        300
      ],
      [
        500,
        350
      ],
      [
        400,
        380
      ],
      [
        230,
        365
      ],
      [
        40,
        340
      ],
      [
        40,
        230
      ],
      [
        65,
        230
      ]
    ],
    "label": [
      290,
      262
    ]
  },
  {
    "id": "northgate",
    "name": "Northgate",
    "capacity": 6,
    "regionId": "industrial-belt",
    "adjacentDistrictIds": [
      "canal-ward",
      "crown-road"
    ],
    "polygon": [
      [
        920,
        105
      ],
      [
        1148,
        105
      ],
      [
        1148,
        260
      ],
      [
        920,
        260
      ]
    ],
    "label": [
      1034,
      163
    ]
  },
  {
    "id": "canal-ward",
    "name": "Canal Ward",
    "capacity": 4,
    "regionId": "industrial-belt",
    "adjacentDistrictIds": [
      "northgate",
      "crown-road",
      "meadow",
      "bellwether-centre"
    ],
    "polygon": [
      [
        920,
        260
      ],
      [
        1148,
        260
      ],
      [
        1148,
        400
      ],
      [
        950,
        400
      ],
      [
        750,
        480
      ],
      [
        680,
        300
      ],
      [
        800,
        300
      ]
    ],
    "label": [
      900,
      340
    ]
  },
  {
    "id": "crown-road",
    "name": "Crown Road",
    "capacity": 2,
    "regionId": "industrial-belt",
    "adjacentDistrictIds": [
      "grand-market",
      "northgate",
      "canal-ward",
      "bellwether-centre"
    ],
    "polygon": [
      [
        600,
        105
      ],
      [
        920,
        105
      ],
      [
        920,
        260
      ],
      [
        800,
        300
      ],
      [
        680,
        300
      ],
      [
        610,
        230
      ]
    ],
    "label": [
      760,
      200
    ]
  },
  {
    "id": "meadow",
    "name": "Meadow",
    "capacity": 2,
    "regionId": "industrial-belt",
    "adjacentDistrictIds": [
      "canal-ward",
      "westfield",
      "eastfield"
    ],
    "polygon": [
      [
        950,
        400
      ],
      [
        1148,
        400
      ],
      [
        1148,
        688
      ],
      [
        995,
        688
      ],
      [
        980,
        570
      ],
      [
        800,
        520
      ],
      [
        750,
        480
      ]
    ],
    "label": [
      1060,
      470
    ]
  },
  {
    "id": "westfield",
    "name": "Westfield",
    "capacity": 2,
    "regionId": "outlying",
    "adjacentDistrictIds": [
      "meadow",
      "eastfield",
      "marsh",
      "downs",
      "vale",
      "bellwether-centre"
    ],
    "polygon": [
      [
        650,
        490
      ],
      [
        750,
        480
      ],
      [
        800,
        520
      ],
      [
        700,
        600
      ],
      [
        520,
        550
      ],
      [
        480,
        550
      ],
      [
        500,
        520
      ],
      [
        500,
        470
      ]
    ],
    "label": [
      640,
      528
    ]
  },
  {
    "id": "eastfield",
    "name": "Eastfield",
    "capacity": 4,
    "regionId": "outlying",
    "adjacentDistrictIds": [
      "meadow",
      "westfield",
      "marsh"
    ],
    "polygon": [
      [
        800,
        520
      ],
      [
        980,
        570
      ],
      [
        995,
        688
      ],
      [
        710,
        688
      ],
      [
        700,
        600
      ]
    ],
    "label": [
      850,
      603
    ]
  },
  {
    "id": "marsh",
    "name": "Marsh",
    "capacity": 2,
    "regionId": "outlying",
    "adjacentDistrictIds": [
      "westfield",
      "eastfield",
      "vale"
    ],
    "polygon": [
      [
        700,
        600
      ],
      [
        710,
        688
      ],
      [
        460,
        688
      ],
      [
        500,
        630
      ],
      [
        520,
        550
      ]
    ],
    "label": [
      600,
      620
    ]
  },
  {
    "id": "heath",
    "name": "Heath",
    "capacity": 2,
    "regionId": "outlying",
    "adjacentDistrictIds": [
      "ironwood",
      "downs",
      "coast"
    ],
    "polygon": [
      [
        40,
        340
      ],
      [
        230,
        365
      ],
      [
        265,
        390
      ],
      [
        235,
        515
      ],
      [
        60,
        440
      ],
      [
        40,
        440
      ]
    ],
    "label": [
      158,
      429
    ]
  },
  {
    "id": "downs",
    "name": "Downs",
    "capacity": 2,
    "regionId": "outlying",
    "adjacentDistrictIds": [
      "ironwood",
      "westfield",
      "heath",
      "vale",
      "bellwether-centre"
    ],
    "polygon": [
      [
        400,
        380
      ],
      [
        500,
        470
      ],
      [
        500,
        520
      ],
      [
        480,
        550
      ],
      [
        430,
        570
      ],
      [
        235,
        515
      ],
      [
        265,
        390
      ],
      [
        230,
        365
      ]
    ],
    "label": [
      365,
      448
    ]
  },
  {
    "id": "vale",
    "name": "Vale",
    "capacity": 2,
    "regionId": "outlying",
    "adjacentDistrictIds": [
      "westfield",
      "marsh",
      "downs",
      "coast"
    ],
    "polygon": [
      [
        235,
        515
      ],
      [
        430,
        570
      ],
      [
        480,
        550
      ],
      [
        520,
        550
      ],
      [
        500,
        630
      ],
      [
        460,
        688
      ],
      [
        235,
        688
      ],
      [
        235,
        665
      ]
    ],
    "label": [
      314,
      572
    ]
  },
  {
    "id": "coast",
    "name": "Coast",
    "capacity": 2,
    "regionId": "outlying",
    "adjacentDistrictIds": [
      "heath",
      "vale"
    ],
    "polygon": [
      [
        235,
        515
      ],
      [
        235,
        665
      ],
      [
        235,
        688
      ],
      [
        40,
        688
      ],
      [
        40,
        440
      ],
      [
        60,
        440
      ]
    ],
    "label": [
      144,
      571
    ]
  },
  {
    "id": "bellwether-centre",
    "name": "Bellwether Centre",
    "capacity": 3,
    "regionId": "centre",
    "adjacentDistrictIds": [
      "grand-market",
      "ironwood",
      "canal-ward",
      "crown-road",
      "westfield",
      "downs"
    ],
    "polygon": [
      [
        500,
        300
      ],
      [
        610,
        230
      ],
      [
        680,
        300
      ],
      [
        750,
        480
      ],
      [
        650,
        490
      ],
      [
        500,
        470
      ],
      [
        400,
        380
      ],
      [
        500,
        350
      ]
    ],
    "label": [
      590,
      390
    ]
  }
] as const satisfies readonly DistrictDefinition[]);

export const DISTRICTS_BY_ID = Object.freeze(
  Object.fromEntries(DISTRICTS.map((district) => [district.id, district])) as {
    readonly [Id in DistrictId]: Extract<(typeof DISTRICTS)[number], { readonly id: Id }>;
  }
);

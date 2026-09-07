import { deepFreeze } from "./immutable.js";

export const REGION_IDS = deepFreeze(["urban", "mixed", "outlying"] as const);
export type RegionId = (typeof REGION_IDS)[number];
export const REGION_NAMES = deepFreeze({ urban: "Urban", mixed: "Mixed", outlying: "Outlying" });

export const DISTRICT_IDS = deepFreeze([
  "harbormouth",
  "grand-market",
  "ironwood",
  "northgate",
  "canal-ward",
  "crown-road",
  "orchard",
  "meadow",
  "westfield",
  "eastfield",
  "marsh",
  "heath",
  "downs",
  "vale",
  "coast",
  "bellweather-centre"
] as const);
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
      "northgate"
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
        545,
        105
      ],
      [
        540,
        150
      ],
      [
        550,
        205
      ],
      [
        500,
        265
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
      "bellweather-centre"
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
        475,
        300
      ],
      [
        420,
        345
      ],
      [
        210,
        345
      ],
      [
        40,
        320
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
    "regionId": "mixed",
    "adjacentDistrictIds": [
      "grand-market",
      "canal-ward"
    ],
    "polygon": [
      [
        760,
        225
      ],
      [
        650,
        140
      ],
      [
        620,
        140
      ],
      [
        620,
        105
      ],
      [
        1148,
        105
      ],
      [
        1148,
        210
      ],
      [
        1025,
        215
      ],
      [
        920,
        225
      ]
    ],
    "label": [
      790,
      170
    ]
  },
  {
    "id": "canal-ward",
    "name": "Canal Ward",
    "capacity": 4,
    "regionId": "mixed",
    "adjacentDistrictIds": [
      "northgate",
      "crown-road",
      "bellweather-centre"
    ],
    "polygon": [
      [
        760,
        225
      ],
      [
        920,
        225
      ],
      [
        1025,
        215
      ],
      [
        1005,
        240
      ],
      [
        880,
        340
      ],
      [
        690,
        310
      ],
      [
        650,
        140
      ]
    ],
    "label": [
      790,
      268
    ]
  },
  {
    "id": "crown-road",
    "name": "Crown Road",
    "capacity": 4,
    "regionId": "mixed",
    "adjacentDistrictIds": [
      "canal-ward",
      "orchard",
      "meadow"
    ],
    "polygon": [
      [
        997,
        409
      ],
      [
        980,
        295
      ],
      [
        1015,
        260
      ],
      [
        1148,
        240
      ],
      [
        1148,
        410
      ],
      [
        1140,
        410
      ]
    ],
    "label": [
      1060,
      353
    ]
  },
  {
    "id": "orchard",
    "name": "Orchard",
    "capacity": 2,
    "regionId": "mixed",
    "adjacentDistrictIds": [
      "crown-road",
      "meadow"
    ],
    "polygon": [
      [
        997,
        409
      ],
      [
        1140,
        410
      ],
      [
        1148,
        410
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
        995,
        550
      ]
    ],
    "label": [
      1065,
      479
    ]
  },
  {
    "id": "meadow",
    "name": "Meadow",
    "capacity": 2,
    "regionId": "mixed",
    "adjacentDistrictIds": [
      "crown-road",
      "orchard",
      "eastfield"
    ],
    "polygon": [
      [
        997,
        409
      ],
      [
        995,
        550
      ],
      [
        905,
        475
      ],
      [
        915,
        355
      ],
      [
        980,
        295
      ]
    ],
    "label": [
      954,
      439
    ]
  },
  {
    "id": "westfield",
    "name": "Westfield",
    "capacity": 2,
    "regionId": "outlying",
    "adjacentDistrictIds": [
      "eastfield",
      "marsh",
      "vale",
      "bellweather-centre"
    ],
    "polygon": [
      [
        690,
        610
      ],
      [
        515,
        530
      ],
      [
        670,
        475
      ],
      [
        785,
        495
      ]
    ],
    "label": [
      660,
      539
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
        690,
        610
      ],
      [
        785,
        495
      ],
      [
        865,
        560
      ],
      [
        930,
        595
      ],
      [
        955,
        688
      ],
      [
        710,
        688
      ],
      [
        710,
        680
      ]
    ],
    "label": [
      785,
      595
    ]
  },
  {
    "id": "marsh",
    "name": "Marsh",
    "capacity": 2,
    "regionId": "outlying",
    "adjacentDistrictIds": [
      "westfield",
      "eastfield"
    ],
    "polygon": [
      [
        690,
        610
      ],
      [
        710,
        680
      ],
      [
        710,
        688
      ],
      [
        475,
        688
      ],
      [
        475,
        625
      ],
      [
        505,
        605
      ],
      [
        515,
        530
      ]
    ],
    "label": [
      615,
      623
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
      ],
      [
        40,
        360
      ],
      [
        180,
        375
      ],
      [
        265,
        390
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
      "heath",
      "vale",
      "bellweather-centre"
    ],
    "polygon": [
      [
        235,
        515
      ],
      [
        265,
        390
      ],
      [
        390,
        410
      ],
      [
        420,
        505
      ]
    ],
    "label": [
      327,
      456
    ]
  },
  {
    "id": "vale",
    "name": "Vale",
    "capacity": 2,
    "regionId": "outlying",
    "adjacentDistrictIds": [
      "westfield",
      "downs",
      "coast"
    ],
    "polygon": [
      [
        235,
        515
      ],
      [
        420,
        505
      ],
      [
        450,
        540
      ],
      [
        430,
        620
      ],
      [
        445,
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
    "capacity": 4,
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
    "id": "bellweather-centre",
    "name": "Bellweather Centre",
    "capacity": 3,
    "regionId": null,
    "adjacentDistrictIds": [
      "ironwood",
      "canal-ward",
      "westfield",
      "downs"
    ],
    "polygon": [
      [
        535,
        340
      ],
      [
        605,
        320
      ],
      [
        650,
        365
      ],
      [
        645,
        425
      ],
      [
        565,
        455
      ],
      [
        520,
        400
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

export const MAP_BRIDGES = deepFreeze([
  {
    "districtIds": [
      "grand-market",
      "northgate"
    ],
    "points": [
      [
        410,
        140
      ],
      [
        780,
        126
      ]
    ]
  },
  {
    "districtIds": [
      "canal-ward",
      "crown-road"
    ],
    "points": [
      [
        870,
        260
      ],
      [
        1040,
        300
      ]
    ]
  },
  {
    "districtIds": [
      "meadow",
      "eastfield"
    ],
    "points": [
      [
        950,
        500
      ],
      [
        835,
        555
      ]
    ]
  },
  {
    "districtIds": [
      "westfield",
      "vale"
    ],
    "points": [
      [
        580,
        520
      ],
      [
        405,
        520
      ]
    ]
  },
  {
    "districtIds": [
      "heath",
      "ironwood"
    ],
    "points": [
      [
        150,
        400
      ],
      [
        155,
        285
      ]
    ]
  },
  {
    "districtIds": [
      "ironwood",
      "bellweather-centre"
    ],
    "points": [
      [
        400,
        280
      ],
      [
        545,
        350
      ]
    ]
  },
  {
    "districtIds": [
      "canal-ward",
      "bellweather-centre"
    ],
    "points": [
      [
        715,
        270
      ],
      [
        625,
        340
      ]
    ]
  },
  {
    "districtIds": [
      "westfield",
      "bellweather-centre"
    ],
    "points": [
      [
        600,
        525
      ],
      [
        590,
        445
      ]
    ]
  },
  {
    "districtIds": [
      "downs",
      "bellweather-centre"
    ],
    "points": [
      [
        400,
        450
      ],
      [
        530,
        405
      ]
    ]
  }
] as const);

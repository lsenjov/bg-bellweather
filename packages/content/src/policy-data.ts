export const POLICY_DATA = {
  "categories": [
    "Healthcare",
    "Transport",
    "Education",
    "Housing",
    "Environment",
    "Fiscal"
  ],
  "parties": [
    {
      "name": "Honeycomb",
      "short": "HC",
      "order": [
        "Healthcare",
        "Housing",
        "Education",
        "Environment",
        "Transport",
        "Fiscal"
      ]
    },
    {
      "name": "Old Shell",
      "short": "OS",
      "order": [
        "Environment",
        "Education",
        "Housing",
        "Healthcare",
        "Fiscal",
        "Transport"
      ]
    },
    {
      "name": "Foxglove",
      "short": "FG",
      "order": [
        "Fiscal",
        "Transport",
        "Environment",
        "Education",
        "Housing",
        "Healthcare"
      ]
    },
    {
      "name": "Riverworks",
      "short": "RW",
      "order": [
        "Transport",
        "Fiscal",
        "Healthcare",
        "Housing",
        "Education",
        "Environment"
      ]
    },
    {
      "name": "Many Wings",
      "short": "MW",
      "order": [
        "Education",
        "Environment",
        "Transport",
        "Fiscal",
        "Healthcare",
        "Housing"
      ]
    },
    {
      "name": "Night Parliament",
      "short": "NP",
      "order": [
        "Housing",
        "Healthcare",
        "Fiscal",
        "Transport",
        "Environment",
        "Education"
      ]
    }
  ],
  "scoringCards": [
    {
      "id": "S01",
      "order": [
        "Healthcare",
        "Transport",
        "Education",
        "Housing",
        "Environment",
        "Fiscal"
      ]
    },
    {
      "id": "S02",
      "order": [
        "Transport",
        "Education",
        "Housing",
        "Environment",
        "Fiscal",
        "Healthcare"
      ]
    },
    {
      "id": "S03",
      "order": [
        "Education",
        "Housing",
        "Environment",
        "Fiscal",
        "Healthcare",
        "Transport"
      ]
    },
    {
      "id": "S04",
      "order": [
        "Housing",
        "Environment",
        "Fiscal",
        "Healthcare",
        "Transport",
        "Education"
      ]
    },
    {
      "id": "S05",
      "order": [
        "Environment",
        "Fiscal",
        "Healthcare",
        "Transport",
        "Education",
        "Housing"
      ]
    },
    {
      "id": "S06",
      "order": [
        "Fiscal",
        "Healthcare",
        "Transport",
        "Education",
        "Housing",
        "Environment"
      ]
    },
    {
      "id": "S07",
      "order": [
        "Healthcare",
        "Transport",
        "Education",
        "Housing",
        "Fiscal",
        "Environment"
      ]
    },
    {
      "id": "S08",
      "order": [
        "Transport",
        "Education",
        "Housing",
        "Fiscal",
        "Environment",
        "Healthcare"
      ]
    },
    {
      "id": "S09",
      "order": [
        "Education",
        "Housing",
        "Fiscal",
        "Environment",
        "Healthcare",
        "Transport"
      ]
    },
    {
      "id": "S10",
      "order": [
        "Housing",
        "Fiscal",
        "Environment",
        "Healthcare",
        "Transport",
        "Education"
      ]
    },
    {
      "id": "S11",
      "order": [
        "Fiscal",
        "Environment",
        "Healthcare",
        "Transport",
        "Education",
        "Housing"
      ]
    },
    {
      "id": "S12",
      "order": [
        "Environment",
        "Healthcare",
        "Transport",
        "Education",
        "Housing",
        "Fiscal"
      ]
    }
  ],
  "effects": [
    {
      "id": 1,
      "name": "Grassroots Expansion",
      "text": "Rally may place its Support in a neighboring district instead of its source district."
    },
    {
      "id": 6,
      "name": "Fresh Start",
      "text": "When Organise or Rally restores a party absent from the map, place two Support instead of one, together or separately. Place both if possible; otherwise place one."
    },
    {
      "id": 7,
      "name": "Carpooling",
      "text": "Organise may move two Support together from the same source to the same destination."
    },
    {
      "id": 9,
      "name": "Established Networks",
      "text": "Organise may move between any two districts already containing acting-party Support, regardless of distance."
    },
    {
      "id": 10,
      "name": "Political Exchange",
      "text": "Organise may swap moving Support with rival Support at the destination. Each arrival needs a free spot or a rival to swap back to the source."
    },
    {
      "id": 11,
      "name": "Long-Reach Campaigns",
      "text": "Smear may target a district up to two adjacency steps from acting-party Support."
    },
    {
      "id": 14,
      "name": "Displacement",
      "text": "Instead of removing its target, Smear may move that Support to a free spot in a neighboring district."
    },
    {
      "id": 17,
      "name": "Cross-Region Campaigns",
      "text": "After Organise moves Support across a region boundary, add one acting-party Support in the source district."
    },
    {
      "id": 19,
      "name": "Muted Priorities",
      "text": "At final scoring, each firm treats its printed 6-point issue as worth 4 for both gains and losses. Party votes do not change."
    },
    {
      "id": 20,
      "name": "Broad Interests",
      "text": "At final scoring, each firm treats its printed 1-point issue as worth 3 for both gains and losses. Party votes do not change."
    },
    {
      "id": 22,
      "name": "New Constituencies",
      "text": "Rally may place its Support anywhere in its source region, provided the destination has no acting-party Support."
    },
    {
      "id": 28,
      "name": "Chain Migration",
      "text": "After Organise moves Support, move a different acting-party Support from a neighboring district into a spot vacated in the source district."
    },
    {
      "id": 29,
      "name": "Bridge Campaign",
      "text": "After Organise moves directly across a marked bridge, add one acting-party Support at its destination."
    },
    {
      "id": 30,
      "name": "Regional Express",
      "text": "Organise may move to any district in its source region, regardless of distance."
    },
    {
      "id": 35,
      "name": "Crowded Airwaves",
      "text": "Smear may target any full district, regardless of acting-party presence or distance."
    }
  ],
  "policies": [
    {
      "id": "P01",
      "plus": "Healthcare",
      "minus": "Transport",
      "effect": 6,
      "name": "Mobile Clinics"
    },
    {
      "id": "P02",
      "plus": "Transport",
      "minus": "Healthcare",
      "effect": 9,
      "name": "Transport Hubs"
    },
    {
      "id": "P03",
      "plus": "Healthcare",
      "minus": "Education",
      "effect": 35,
      "name": "Hospital Accountability"
    },
    {
      "id": "P04",
      "plus": "Education",
      "minus": "Healthcare",
      "effect": 19,
      "name": "Common Curriculum"
    },
    {
      "id": "P05",
      "plus": "Healthcare",
      "minus": "Housing",
      "effect": 28,
      "name": "Community Care Routes"
    },
    {
      "id": "P06",
      "plus": "Housing",
      "minus": "Healthcare",
      "effect": 22,
      "name": "New Estate Outreach"
    },
    {
      "id": "P07",
      "plus": "Healthcare",
      "minus": "Environment",
      "effect": 20,
      "name": "Universal Care Charter"
    },
    {
      "id": "P08",
      "plus": "Environment",
      "minus": "Healthcare",
      "effect": 14,
      "name": "Clean Air Relocation"
    },
    {
      "id": "P09",
      "plus": "Healthcare",
      "minus": "Fiscal",
      "effect": 6,
      "name": "Emergency Recruitment"
    },
    {
      "id": "P10",
      "plus": "Fiscal",
      "minus": "Healthcare",
      "effect": 19,
      "name": "Spending Restraint"
    },
    {
      "id": "P11",
      "plus": "Transport",
      "minus": "Education",
      "effect": 7,
      "name": "Shared Commuting"
    },
    {
      "id": "P12",
      "plus": "Education",
      "minus": "Transport",
      "effect": 11,
      "name": "Public Broadcasting"
    },
    {
      "id": "P13",
      "plus": "Transport",
      "minus": "Housing",
      "effect": 29,
      "name": "Bridge Construction"
    },
    {
      "id": "P14",
      "plus": "Housing",
      "minus": "Transport",
      "effect": 30,
      "name": "Neighbourhood Connections"
    },
    {
      "id": "P15",
      "plus": "Transport",
      "minus": "Environment",
      "effect": 17,
      "name": "Regional Corridors"
    },
    {
      "id": "P16",
      "plus": "Environment",
      "minus": "Transport",
      "effect": 1,
      "name": "Walkable Communities"
    },
    {
      "id": "P17",
      "plus": "Transport",
      "minus": "Fiscal",
      "effect": 29,
      "name": "Public Bridge Fund"
    },
    {
      "id": "P18",
      "plus": "Fiscal",
      "minus": "Transport",
      "effect": 9,
      "name": "Existing Infrastructure"
    },
    {
      "id": "P19",
      "plus": "Education",
      "minus": "Housing",
      "effect": 20,
      "name": "Lifelong Learning"
    },
    {
      "id": "P20",
      "plus": "Housing",
      "minus": "Education",
      "effect": 10,
      "name": "Housing Exchange"
    },
    {
      "id": "P21",
      "plus": "Education",
      "minus": "Environment",
      "effect": 11,
      "name": "Distance Learning"
    },
    {
      "id": "P22",
      "plus": "Environment",
      "minus": "Education",
      "effect": 1,
      "name": "Community Gardens"
    },
    {
      "id": "P23",
      "plus": "Education",
      "minus": "Fiscal",
      "effect": 22,
      "name": "New Campus Outreach"
    },
    {
      "id": "P24",
      "plus": "Fiscal",
      "minus": "Education",
      "effect": 35,
      "name": "Public Spending Scrutiny"
    },
    {
      "id": "P25",
      "plus": "Housing",
      "minus": "Environment",
      "effect": 28,
      "name": "Moving Chains"
    },
    {
      "id": "P26",
      "plus": "Environment",
      "minus": "Housing",
      "effect": 7,
      "name": "Shared Travel Scheme"
    },
    {
      "id": "P27",
      "plus": "Housing",
      "minus": "Fiscal",
      "effect": 30,
      "name": "Connected Neighbourhoods"
    },
    {
      "id": "P28",
      "plus": "Fiscal",
      "minus": "Housing",
      "effect": 10,
      "name": "Property Exchange"
    },
    {
      "id": "P29",
      "plus": "Environment",
      "minus": "Fiscal",
      "effect": 17,
      "name": "Green Corridors"
    },
    {
      "id": "P30",
      "plus": "Fiscal",
      "minus": "Environment",
      "effect": 14,
      "name": "Managed Relocation"
    }
  ]
} as const;

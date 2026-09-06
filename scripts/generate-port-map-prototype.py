from pathlib import Path
from collections import defaultdict
import math
import json

ROOT = Path(__file__).resolve().parents[1]
DISTRICTS = [
    ('Bellweather Centre', 'Centre', 3, 0, 100, 135, 405),
    ('Harbormouth', 'Urban', 6, 100, 215, 135, 225),
    ('Grand Market', 'Urban', 6, 100, 215, 225, 315),
    ('Ironwood', 'Urban', 6, 100, 215, 315, 405),
    ('Canal Ward', 'Mixed', 4, 215, 315, 300, 350),
    ('Crown Road', 'Mixed', 4, 215, 315, 350, 405),
    ('Orchard', 'Mixed', 2, 315, 430, 300, 340),
    ('Meadow', 'Mixed', 2, 315, 430, 340, 370),
    ('Northgate', 'Mixed', 6, 315, 430, 370, 405),
    ('Westfield', 'Outlying', 4, 215, 305, 135, 185),
    ('Marsh', 'Outlying', 2, 215, 305, 185, 245),
    ('Eastfield', 'Outlying', 4, 215, 305, 245, 300),
    ('Heath', 'Outlying', 2, 305, 430, 135, 180),
    ('Downs', 'Outlying', 2, 305, 430, 180, 225),
    ('Vale', 'Outlying', 2, 305, 430, 225, 265),
    ('Coast', 'Outlying', 2, 305, 430, 265, 300),
]
COLORS = {'Urban': '#d5e7f5', 'Mixed': '#dbeaca', 'Outlying': '#f5e7ac', 'Centre': '#e4dfea'}
CX, CY = 530, 565


def point(radius, angle):
    radians = math.radians(angle)
    return CX + radius * math.cos(radians), CY + radius * math.sin(radians)


def coordinate(radius, angle):
    x, y = point(radius, angle)
    return f'{x:.2f},{y:.2f}'


def sector(inner, outer, start, end):
    large = int(end-start > 180)
    path = f'M {coordinate(outer,start)} A {outer},{outer} 0 {large} 1 {coordinate(outer,end)}'
    if inner:
        path += f' L {coordinate(inner,end)} A {inner},{inner} 0 {large} 0 {coordinate(inner,start)}'
    else:
        path += f' L {CX},{CY}'
    return path + ' Z'


def overlap(a0, a1, b0, b1):
    return min(a1,b1) > max(a0,b0)


def connected(graph, omitted=None):
    nodes = set(graph) - {omitted}
    seen = {next(iter(nodes))}
    pending = list(seen)
    while pending:
        for neighbor in graph[pending.pop()] & nodes - seen:
            seen.add(neighbor)
            pending.append(neighbor)
    return seen == nodes


neighbors = {district[0]: set() for district in DISTRICTS}
regions = {district[0]: district[1] for district in DISTRICTS}
region_neighbors = defaultdict(set)
for index, a in enumerate(DISTRICTS):
    for b in DISTRICTS[index+1:]:
        radial = (a[4] == b[3] or b[4] == a[3]) and overlap(a[5],a[6],b[5],b[6])
        angular = (a[6] == b[5] or b[6] == a[5]) and overlap(a[3],a[4],b[3],b[4])
        if radial or angular:
            neighbors[a[0]].add(b[0])
            neighbors[b[0]].add(a[0])
            if a[1] != b[1]:
                region_neighbors[a[1]].add(b[1])
                region_neighbors[b[1]].add(a[1])

assert neighbors['Bellweather Centre'] == {'Harbormouth', 'Grand Market', 'Ironwood'}
assert not neighbors['Northgate'] & {'Harbormouth', 'Grand Market', 'Ironwood'}
assert all(len(adjacent) >= 2 for adjacent in neighbors.values())
assert connected(neighbors)
assert all(connected(neighbors, name) for name in neighbors), 'district is a sole gateway'
for name, adjacent in neighbors.items():
    for neighbor in adjacent:
        without_edge = {key: values - ({neighbor} if key == name else {name} if key == neighbor else set()) for key,values in neighbors.items()}
        assert connected(without_edge), 'connection is a sole gateway'
for region in ['Urban', 'Mixed', 'Outlying']:
    assert sum(d[2] for d in DISTRICTS if d[1] == region) == 18
    assert {'Urban', 'Mixed', 'Outlying'} - {region} <= region_neighbors[region]
    graph = {name: adjacent & {n for n in neighbors if regions[n] == region} for name,adjacent in neighbors.items() if regions[name] == region}
    assert connected(graph), f'{region} is disconnected'

for radius in range(0,430,5):
    for angle in range(135,405,5):
        covering = [d for d in DISTRICTS if d[3] <= radius+2.5 < d[4] and d[5] <= angle+2.5 < d[6]]
        assert len(covering) == 1

svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1060 1080" role="img" aria-labelledby="title desc">',
       '<title id="title">Bellweather port: a city around an open harbour</title>',
       '<desc id="desc">Land forms a 270 degree fan around a 90 degree open harbour. Only the three urban districts touch Bellweather Centre. Mixed districts follow the right shoreline and outlying districts wrap around the left and inland edge. Every pair of regions shares a land border. Water severs adjacency for all effects; there are no harbour crossings. Each region holds 18 Support; Centre holds 3 separately. Every district lies on a loop.</desc>',
       '<style>text{font-family:Arial,sans-serif;fill:#19354b}.name{font-size:15px;font-weight:700}.detail{font-size:10px}</style>',
       '<rect width="1060" height="1080" fill="white"/>',
       '<text x="40" y="45" font-size="28" font-weight="700">Bellweather port</text>',
       '<text x="40" y="73" font-size="14">Urban 18 / 9 votes    Mixed 18 / 9 votes    Outlying 18 / 9 votes    Centre 3 separate Support</text>',
       '<rect x="40" y="100" width="980" height="870" fill="#edf2e7"/>',
       '<path d="M 530,565 L 935,970 L 125,970 Z" fill="#b6deed"/>']
for name,region,capacity,inner,outer,start,end in DISTRICTS:
    svg.append(f'<path data-district="{name}" d="{sector(inner,outer,start,end)}" fill="{COLORS[region]}" stroke="#19354b" stroke-width="1.5" stroke-linejoin="round"/>')
for inner,outer,start,end in [(0,100,135,405),(100,215,135,405),(215,430,135,300),(215,430,300,405)]:
    svg.append(f'<path d="{sector(inner,outer,start,end)}" fill="none" stroke="#19354b" stroke-width="3.5" stroke-linejoin="round"/>')
outer_edge = f'M {coordinate(430,135)} A 430,430 0 1 1 {coordinate(430,405)}'
svg.append(f'<path d="{outer_edge}" fill="none" stroke="#edf2e7" stroke-width="6"/>')
svg.append(f'<path d="{outer_edge}" fill="none" stroke="#19354b" stroke-width="3" stroke-dasharray="8 5"/>')
for name,region,capacity,inner,outer,start,end in DISTRICTS:
    radius,angle = (inner+outer)/2, (start+end)/2
    if region == 'Centre':
        radius,angle = 43,270
    if name == 'Eastfield':
        radius = 260
    if name == 'Canal Ward':
        radius = 255
    if name == 'Crown Road':
        radius = 275
    x,y=point(radius,angle)
    label = 'Bellweather' if region == 'Centre' else name
    detail = 'Centre · separate' if region == 'Centre' else f'{region} · {capacity//2} '+('vote' if capacity==2 else 'votes')
    svg.append(f'<g data-support-district="{name}" text-anchor="middle"><text class="name" x="{x:.2f}" y="{y-22:.2f}">{label}</text><text class="detail" x="{x:.2f}" y="{y-6:.2f}">{detail}</text>')
    columns = 3 if capacity in (3,6) else 2
    for i in range(capacity):
        sx = x + (i%columns-(columns-1)/2)*19
        sy = y + 10 + (i//columns)*19
        for dx,dy in [(0,0),(7,0),(-7,0),(0,7),(0,-7)]:
            relative_x,relative_y = sx+dx-CX,sy+dy-CY
            support_radius = math.hypot(relative_x,relative_y)
            support_angle = math.degrees(math.atan2(relative_y,relative_x))
            if support_angle < 135: support_angle += 360
            assert inner < support_radius < outer and start < support_angle < end, (name,'Support outside district')
        svg.append(f'<circle cx="{sx:.2f}" cy="{sy:.2f}" r="7" fill="white" stroke="#19354b" stroke-width="1.3"/>')
    svg.append('</g>')
svg += ['<text x="530" y="750" text-anchor="middle" font-size="25" font-style="italic">Open harbour</text>',
        '<text x="530" y="779" text-anchor="middle" font-size="13">No crossings · no adjacency across water</text>',
        '<text x="40" y="1000" font-size="14">Thick lines: region boundaries. Thin lines: district boundaries. Circles: Support spaces.</text>',
        '<text x="40" y="1024" font-size="13">Water severs all district connections, including Smear. Land routes wrap around the port.</text>',
        '<text x="40" y="1048" font-size="13">Dashed outer edge: land continues inland. Concept only; every district lies on a loop.</text>',
        '</svg>']
(ROOT/'docs/assets/region-prototype-port.svg').write_text('\n'.join(svg)+'\n')
print(json.dumps({'connections':sum(map(len,neighbors.values()))//2,'neighbors':{k:sorted(v) for k,v in neighbors.items()}},indent=2))

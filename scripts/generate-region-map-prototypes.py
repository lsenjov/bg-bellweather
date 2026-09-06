from pathlib import Path
from collections import defaultdict
import math
import json

root = Path(__file__).resolve().parents[1]
assets = root / 'docs/assets'
capacities = dict(zip('ABCDEFGHIJKLMNOX', [6,6,6,6,4,4,2,2,4,4,2,2,2,2,2,3]))
names = dict(zip('ABCDEFGHIJKLMNOX', ['Harbormouth','Grand Market','Ironwood','Northgate','Canal Ward','Crown Road','Orchard','Meadow','Westfield','Eastfield','Marsh','Heath','Downs','Vale','Coast','Bellweather']))
def region(k):
    return 'Urban' if k in 'ABC' else 'Mixed' if k in 'DEFGH' else 'Outlying' if k in 'IJKLMNO' else 'Centre'
colors = dict(Urban='#d5e7f5', Mixed='#dbeaca', Outlying='#f5e7ac', Centre='#e4dfea')
def layout(rectangles):
    grid = [['.' for _ in range(16)] for _ in range(12)]
    for key, x0, y0, x1, y1 in rectangles:
        for y in range(y0, y1):
            for x in range(x0, x1):
                assert grid[y][x] == '.', (key, x, y, 'overlap')
                grid[y][x] = key
    assert all('.' not in row for row in grid)
    return [''.join(row) for row in grid]

studies = [
    ('compact-hub', 'Compact hub', layout([
        ('A',0,0,2,2),('B',2,0,4,2),('C',0,2,2,4),('X',2,2,4,4),
        ('E',4,0,8,4),('G',8,0,10,4),('F',10,0,14,2),('D',14,0,16,2),('H',10,2,16,4),
        ('I',0,4,4,6),('J',10,4,14,6),('K',4,4,10,8),('L',0,6,4,12),
        ('M',14,4,16,6),('M',10,6,16,9),('N',4,8,10,12),('O',10,9,16,12)
    ]),
    'A compact three-city cluster occupies the northwest. The mixed region stretches east to a distant city, above broad southern countryside.',
    'The mixed city, Northgate, is separated from the urban cities by suburbs and low-capacity districts. Players can approach along the northern region or through the southern countryside.',
    'The broad southern districts offer shortcuts across the map. Test whether these routes invite interference or make the northern contests easy to bypass.'),
    ('rural-fringe', 'Rural fringe', layout([
        ('A',6,0,8,2),('B',8,0,10,2),('C',6,2,8,4),('X',8,2,10,4),
        ('E',10,0,12,4),('F',12,0,16,2),('G',12,2,16,6),('G',10,4,12,6),
        ('H',14,6,16,10),('D',14,10,16,12),
        ('I',4,0,6,4),('J',8,4,10,8),('K',0,0,4,6),('L',4,4,6,6),('L',0,6,6,12),
        ('M',6,4,8,8),('M',6,8,10,10),('N',6,10,14,12),('O',10,6,14,10)
    ]),
    'Three small northern cities sit beside the Centre. A connected mixed region follows the eastern edge to Northgate in the far southeast; countryside wraps around the west and south.',
    'Northgate sits at the far end of the mixed region, beside rural Vale. Reaching it from the urban cluster requires crossing several districts, with a choice of eastern and rural approaches.',
    'Northgate has only two neighbors. Its remoteness could make it a defensible destination or leave it too quiet.'),
    ('city-corridor', 'City corridor', layout([
        ('A',0,8,2,10),('B',2,8,4,10),('C',0,10,4,12),('X',4,8,6,10),
        ('E',4,10,6,12),('E',6,8,8,12),('G',8,8,10,12),('F',10,8,12,10),
        ('H',12,8,16,10),('H',10,10,14,12),('D',14,10,16,12),
        ('I',0,6,2,8),('J',10,2,12,4),('K',0,0,6,6),('L',2,6,6,8),('L',6,4,8,8),
        ('M',6,0,10,4),('M',10,0,12,2),('N',8,4,12,8),('O',12,0,16,8)
    ]),
    'A small southwestern city cluster anchors a southern mixed corridor. Northgate lies at the opposite end, while scattered suburbs punctuate a much larger northern rural region.',
    'The two outlying suburbs, Westfield and Eastfield, share no border. Moving between those denser footholds requires crossing lower-capacity territory.',
    'Northgate has only one neighboring district, Meadow. That gateway could become a useful contest or shelter the city too effectively.'),
]
summary=[]
for slug,title,rows,description,play,watch in studies:
    assert len(set(map(len,rows))) == 1, (slug, list(map(len,rows)))
    w,h=len(rows[0]),len(rows)
    cells=defaultdict(set)
    for y,row in enumerate(rows):
        for x,k in enumerate(row): cells[k].add((x,y))
    assert set(cells)==set(capacities)
    for k,group in cells.items():
        seen={next(iter(group))}; pending=list(seen)
        while pending:
            x,y=pending.pop()
            for p in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if p in group and p not in seen: seen.add(p); pending.append(p)
        assert seen==group, (slug,k,'disconnected')
    for r in ['Urban','Mixed','Outlying']:
        assert sum(capacities[k] for k in cells if region(k)==r)==18
    neighbors=defaultdict(set)
    edges=[]
    for y,row in enumerate(rows):
        for x,k in enumerate(row):
            for dx,dy in [(1,0),(0,1)]:
                if x+dx<w and y+dy<h:
                    other=rows[y+dy][x+dx]
                    if other!=k:
                        neighbors[k].add(other); neighbors[other].add(k)
                        edge=((x+1,y),(x+1,y+1)) if dx else ((x,y+1),(x+1,y+1))
                        edges.append((edge,region(k)!=region(other)))
    assert {region(k) for k in neighbors['X']} == {'Urban','Mixed','Outlying'}
    assert not neighbors['D'] & set('ABC'), (slug, 'mixed city touches urban cluster')
    for r in ['Urban','Mixed','Outlying']:
        group={k for k in cells if region(k)==r}; seen={next(iter(group))}; todo=list(seen)
        while todo:
            for k in neighbors[todo.pop()] & group - seen: seen.add(k); todo.append(k)
        assert seen==group,(slug,r,'disconnected region')
    scale=65; top=90; left=35
    def point(x,y):
        ox=4*math.sin(y*1.7+x*.8) if 0<x<w else 0
        oy=4*math.sin(x*1.2-y*.7) if 0<y<h else 0
        return (left+x*scale+ox,top+y*scale+oy)
    def coords(p): return f'{p[0]:.1f},{p[1]:.1f}'
    sw=w*scale+70; sh=h*scale+160
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {sw} {sh}" role="img" aria-labelledby="title desc">',
         f'<title id="title">{title}: three regions of eighteen Support</title>',
         f'<desc id="desc">{description} Shared border segments define adjacency; corners do not. Bellweather Centre borders all three regions.</desc>',
         '<style>text{font-family:Arial,sans-serif;fill:#19354b}.name{font-size:15px;font-weight:700}.detail{font-size:11px}</style>',
         f'<rect width="{sw}" height="{sh}" fill="white"/>',
         f'<text x="35" y="34" font-size="24" font-weight="700">{title}</text>',
         '<text x="35" y="59" font-size="13">Urban: 18 / 9 votes     Mixed: 18 / 9 votes     Outlying: 18 / 9 votes     Centre: 3 separate Support</text>']
    for k,group in cells.items():
        for x,y in group:
            points=' '.join(coords(point(a,b)) for a,b in [(x,y),(x+1,y),(x+1,y+1),(x,y+1)])
            svg.append(f'<polygon points="{points}" fill="{colors[region(k)]}" stroke="{colors[region(k)]}" stroke-width="1"/>')
    for (a,b),thick in sorted(edges,key=lambda e:e[1]):
        svg.append(f'<path d="M {coords(point(*a))} L {coords(point(*b))}" stroke="#19354b" stroke-width="{4 if thick else 1.5}" fill="none"/>')
    svg.append(f'<rect x="{left}" y="{top}" width="{w*scale}" height="{h*scale}" fill="none" stroke="#19354b" stroke-width="4"/>')
    for k,group in sorted(cells.items()):
        cx=sum(x+.5 for x,y in group)/len(group); cy=sum(y+.5 for x,y in group)/len(group)
        px,py=point(cx,cy)
        label_positions = {
            ('compact-hub', 'M'): (13, 7.5),
            ('rural-fringe', 'G'): (14, 4),
            ('rural-fringe', 'L'): (3, 9),
            ('rural-fringe', 'M'): (8, 9),
            ('city-corridor', 'E'): (7, 10),
            ('city-corridor', 'H'): (14, 9),
            ('city-corridor', 'L'): (4, 7),
            ('city-corridor', 'M'): (8, 2),
        }
        if (slug, k) in label_positions:
            px, py = point(*label_positions[slug, k])
        cap=capacities[k]; label=names[k]
        svg.append(f'<g text-anchor="middle"><text class="name" x="{px:.1f}" y="{py-24:.1f}">{label}</text>')
        sub='Centre · separate' if k=='X' else f'{region(k)} · {cap//2} '+('vote' if cap==2 else 'votes')
        svg.append(f'<text class="detail" x="{px:.1f}" y="{py-8:.1f}">{sub}</text>')
        for i in range(cap):
            columns=3 if cap in (3,6) else cap
            dx=(i%columns-(columns-1)/2)*19; dy=(i//columns)*19
            svg.append(f'<circle cx="{px+dx:.1f}" cy="{py+7+dy:.1f}" r="7" fill="white" stroke="#19354b" stroke-width="1.3"/>')
        svg.append('</g>')
    svg.extend([f'<text x="35" y="{sh-35}" font-size="13">Circles = Support spaces. Heavy lines = region borders. Thin lines = district borders.</text>',
                f'<text x="35" y="{sh-15}" font-size="12">Concept only · District elections remain local · Territory size does not indicate capacity</text>','</svg>'])
    (assets/f'region-prototype-{slug}.svg').write_text('\n'.join(svg)+'\n')
    summary.append(dict(slug=slug,title=title,description=description,play=play,watch=watch,centre=', '.join(names[k] for k in sorted(neighbors['X'])),borders=sum(map(len,neighbors.values()))//2))
print(json.dumps(summary,indent=2))

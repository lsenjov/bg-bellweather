from pathlib import Path
from collections import defaultdict
import argparse
import html
import json
import math

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT/'scripts/map-atlas-concepts.json').read_text())
DISTRICTS = DATA['districts']
COLORS = {'Urban':'#d5e7f5','Mixed':'#dbeaca','Outlying':'#f5e7ac','Centre':'#e4dfea'}
MATERIALS = {'water':'#a9d9ec','wetland':'#c3e1d9','mountain':'#cfc6b8','ridge':'#d4c6b0','wall':'#8e969b','rail':'#b6bdc3','industry':'#c8cbd0','forest':'#9fbd94'}
EPS = 1e-7


def cross(a,b,c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])


def on_segment(a,b,p):
    return abs(cross(a,b,p)) < EPS and min(a[0],b[0])-EPS <= p[0] <= max(a[0],b[0])+EPS and min(a[1],b[1])-EPS <= p[1] <= max(a[1],b[1])+EPS


def intersects(a,b,c,d):
    products = (cross(a,b,c),cross(a,b,d),cross(c,d,a),cross(c,d,b))
    if products[0]*products[1] < -EPS and products[2]*products[3] < -EPS:
        return True
    return any(on_segment(x,y,p) for x,y,p in [(a,b,c),(a,b,d),(c,d,a),(c,d,b)])


def inside(point, polygon):
    x,y = point
    result = False
    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
        if on_segment(a,b,point):
            return True
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            result = not result
    return result


def hits(a,b,polygon):
    return inside(a,polygon) or inside(b,polygon) or any(intersects(a,b,c,d) for c,d in zip(polygon,polygon[1:]+polygon[:1]))


def band(a,b,width):
    length = math.dist(a,b)
    nx,ny = -(b[1]-a[1])*width/(2*length),(b[0]-a[0])*width/(2*length)
    return [(a[0]+nx,a[1]+ny),(b[0]+nx,b[1]+ny),(b[0]-nx,b[1]-ny),(a[0]-nx,a[1]-ny)]


def ellipse(t):
    return [(t['cx']+t['rx']*math.cos(i*math.tau/64),t['cy']+t['ry']*math.sin(i*math.tau/64)) for i in range(64)]


def terrain_polygons(t):
    if t['kind'] in ('polygon','land'):
        return [t['points']]
    if t['kind']=='ellipse':
        return [ellipse(t)]
    if t['kind']=='ring':
        points=ellipse(t)
        return [band(a,b,t['width']) for a,b in zip(points,points[1:]+points[:1])]
    return [band(a,b,t['width']) for a,b in zip(t['points'],t['points'][1:])]


def xy(node):
    return node['x'],node['y']


def dimensions(key):
    capacity=DISTRICTS[key]['capacity']
    return (116,84) if capacity==6 else (124,88) if capacity==4 else (128,86) if capacity==3 else (136,92)


def footprint(key,node,padding=0):
    x,y=xy(node)
    w,h=dimensions(key)
    w,h=w/2+padding,h/2+padding
    return [(x-w*.83,y-h),(x+w*.65,y-h),(x+w,y-h*.45),(x+w*.94,y+h*.72),(x+w*.35,y+h),(x-w*.7,y+h*.94),(x-w,y+h*.35),(x-w,y-h*.5)]


def components(graph):
    remaining=set(graph)
    groups=[]
    while remaining:
        seen={min(remaining)}
        pending=list(seen)
        while pending:
            for neighbor in graph[pending.pop()] & remaining - seen:
                seen.add(neighbor)
                pending.append(neighbor)
        remaining-=seen
        groups.append(sorted(seen))
    return groups


def graph_from(nodes,edges):
    graph={key:set() for key in nodes}
    for edge in edges:
        graph[edge['a']].add(edge['b'])
        graph[edge['b']].add(edge['a'])
    return graph


def build_edges(study):
    nodes=study['nodes']
    obstacles=[p for t in study['terrain'] if t['kind']!='land' and t.get('blocked',True) for p in terrain_polygons(t)]
    land=[t['points'] for t in study['terrain'] if t['kind']=='land']
    chosen=[]

    def valid(edge,required=False):
        a,b=xy(nodes[edge['a']]),xy(nodes[edge['b']])
        for key,node in nodes.items():
            if key not in (edge['a'],edge['b']) and hits(a,b,footprint(key,node,6)):
                return False,f'route {edge["a"]}-{edge["b"]} hits {key}'
        for previous in chosen:
            if {edge['a'],edge['b']} & {previous['a'],previous['b']}:
                continue
            if intersects(a,b,xy(nodes[previous['a']]),xy(nodes[previous['b']])):
                return False,f'route {edge["a"]}-{edge["b"]} crosses {previous["a"]}-{previous["b"]}'
        if not required:
            if nodes[edge['a']]['zone']!=nodes[edge['b']]['zone']:
                return False,'different land groups'
            if any(hits(a,b,p) for p in obstacles):
                return False,'blocked terrain'
            if land and any(not any(inside((a[0]+(b[0]-a[0])*i/50,a[1]+(b[1]-a[1])*i/50),p) for p in land) for i in range(51)):
                return False,'outside land'
        return True,''

    for edge in study['required']:
        assert edge['a'] in nodes and edge['b'] in nodes
        ok,reason=valid(edge,True)
        assert ok,(study['title'],reason)
        assert not any({e['a'],e['b']}=={edge['a'],edge['b']} for e in chosen)
        chosen.append(dict(edge))
    keys=list(nodes)
    candidates=sorted((math.dist(xy(nodes[a]),xy(nodes[b])),a,b) for i,a in enumerate(keys) for b in keys[i+1:])
    for connecting in (True,False):
        for distance,a,b in candidates:
            if any({e['a'],e['b']}=={a,b} for e in chosen):
                continue
            if distance>460:
                continue
            if connecting:
                groups=components(graph_from(nodes,chosen))
                if any(a in group and b in group for group in groups):
                    continue
            elif len(chosen)>=study['target_edges']:
                break
            edge=dict(a=a,b=b,kind=study.get('default_route','road'))
            ok,_=valid(edge)
            if ok:
                chosen.append(edge)
    graph=graph_from(nodes,chosen)
    assert len(components(graph))==1,(study['title'],'disconnected',components(graph))
    return chosen,graph


def hull(points):
    points=sorted(set(points))
    halves=[]
    for sequence in (points,list(reversed(points))):
        half=[]
        for p in sequence:
            while len(half)>=2 and cross(half[-2],half[-1],p)<=0:
                half.pop()
            half.append(p)
        halves.append(half[:-1])
    return halves[0]+halves[1]


def points_text(points):
    return ' '.join(f'{x:.1f},{y:.1f}' for x,y in points)


def graph_facts(study,edges,graph):
    cuts=[]
    for key in graph:
        reduced={k:v-{key} for k,v in graph.items() if k!=key}
        if len(components(reduced))>1:
            cuts.append(key)
    cut_edges=[]
    for edge in edges:
        reduced={k:set(v) for k,v in graph.items()}
        reduced[edge['a']].remove(edge['b'])
        reduced[edge['b']].remove(edge['a'])
        if len(components(reduced))>1:
            cut_edges.append([edge['a'],edge['b']])
    region_components={}
    for region in ('Urban','Mixed','Outlying'):
        keys={k for k in graph if DISTRICTS[k]['region']==region}
        region_components[region]=components({k:graph[k]&keys for k in keys})
    return dict(connections=len(edges),centre_neighbors=sorted(graph['X']),dead_ends=sorted(k for k,v in graph.items() if len(v)==1),cut_districts=sorted(cuts),cut_routes=cut_edges,region_components=region_components)


def render(study,edges,facts):
    title=html.escape(f'{study["id"]}. {study["title"]}')
    background='#d9edf5' if study.get('background')=='water' else '#e6eee3' if study.get('background')=='wetland' else '#eff1e9'
    svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1020" role="img" aria-labelledby="title desc">',f'<title id="title">{title} — experimental Bellweather map</title>',f'<desc id="desc">{html.escape(study["purpose"])} Only printed routes define adjacency for every effect. District footprints and route intersections create no additional links. Three regions hold eighteen Support each; Bellweather holds three separately.</desc>',
    '<style>text{font-family:Arial,sans-serif;fill:#19354b}.name{font-size:12px;font-weight:700}.detail{font-size:10px}.terrain{font-size:15px;font-style:italic;fill:#355564}</style>',
    '<rect width="1200" height="1020" fill="white"/>',f'<text x="40" y="44" font-size="27" font-weight="700">{title}</text>',
    '<text x="40" y="74" font-size="14">Urban 18 Support / 9 votes     Mixed 18 / 9     Outlying 18 / 9     Bellweather 3 separate</text>',
    f'<rect x="40" y="110" width="1120" height="790" rx="12" fill="{background}"/>']
    if study.get('islands'):
        groups=defaultdict(list)
        for key,node in study['nodes'].items():
            group=node['zone'] if study.get('background')=='water' else key
            groups[group].extend(footprint(key,node,15))
        for points in groups.values():
            svg.append(f'<polygon points="{points_text(hull(points))}" fill="#eef1df" stroke="#84a2a0" stroke-width="2" stroke-linejoin="round"/>')
    for t in study['terrain']:
        kind=t['kind']
        color=MATERIALS.get(t.get('material'),'#eef1df')
        if kind in ('polygon','land'):
            svg.append(f'<polygon points="{points_text(t["points"])}" fill="{color}" stroke="#71848a" stroke-width="1.5" stroke-linejoin="round"/>')
        elif kind=='ellipse':
            svg.append(f'<ellipse cx="{t["cx"]}" cy="{t["cy"]}" rx="{t["rx"]}" ry="{t["ry"]}" fill="{color}" stroke="#719cac" stroke-width="2"/>')
        elif kind=='ring':
            svg.append(f'<ellipse cx="{t["cx"]}" cy="{t["cy"]}" rx="{t["rx"]}" ry="{t["ry"]}" fill="none" stroke="{color}" stroke-width="{t["width"]}"/>')
            if t['material']=='wall':
                svg.append(f'<ellipse cx="{t["cx"]}" cy="{t["cy"]}" rx="{t["rx"]}" ry="{t["ry"]}" fill="none" stroke="#596b76" stroke-width="20" stroke-dasharray="5 16"/>')
        else:
            pts=points_text(t['points'])
            svg.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{t["width"]}" stroke-linejoin="round"/>')
            if t['material']=='rail':
                svg.append(f'<polyline points="{pts}" fill="none" stroke="#687982" stroke-width="30" stroke-dasharray="3 13"/>')
                svg.append(f'<polyline points="{pts}" fill="none" stroke="#e1e5e8" stroke-width="12"/>')
        if t.get('material') in ('mountain','ridge'):
            polys=terrain_polygons(t)
            for index,p in enumerate(polys):
                if kind=='ring' and index%5:
                    continue
                cx=sum(x for x,y in p)/len(p);cy=sum(y for x,y in p)/len(p)
                svg.append(f'<path d="M {cx-18:.1f},{cy+12:.1f} l 18,-28 l 18,28 M {cx-7:.1f},{cy-5:.1f} l 7,6 l 6,-6" fill="none" stroke="#8b8174" stroke-width="2"/>')
        if t.get('label') and kind not in ('ring',):
            if 'cx' in t:
                x,y=t['cx'],t['cy']
            else:
                x=sum(p[0] for p in t['points'])/len(t['points']);y=sum(p[1] for p in t['points'])/len(t['points'])
            svg.append(f'<text class="terrain" x="{x:.1f}" y="{y:.1f}" text-anchor="middle">{html.escape(t["label"])}</text>')
    for index,edge in enumerate(edges,1):
        a,b=xy(study['nodes'][edge['a']]),xy(study['nodes'][edge['b']])
        svg.append(f'<g data-route="{edge["a"]}-{edge["b"]}"><title>{html.escape(DISTRICTS[edge["a"]]["name"])}–{html.escape(DISTRICTS[edge["b"]]["name"])}: {edge["kind"]}</title><path d="M {a[0]},{a[1]} L {b[0]},{b[1]}" fill="none" stroke="#536975" stroke-width="10" stroke-linecap="round"/><path d="M {a[0]},{a[1]} L {b[0]},{b[1]}" fill="none" stroke="#ffffff" stroke-width="6"/></g>')
        if edge['kind'] not in ('road','market road','ridge road','embankment'):
            cx,cy=(a[0]+b[0])/2,(a[1]+b[1])/2
            barriers=[p for t in study['terrain'] if t['kind']!='land' and t.get('blocked',True) for p in terrain_polygons(t)]
            crossings=[(a[0]+(b[0]-a[0])*i/100,a[1]+(b[1]-a[1])*i/100) for i in range(1,100) if any(inside((a[0]+(b[0]-a[0])*i/100,a[1]+(b[1]-a[1])*i/100),p) for p in barriers)]
            if crossings:
                cx,cy=crossings[len(crossings)//2]
            angle=math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))
            svg.append(f'<g transform="translate({cx:.1f} {cy:.1f}) rotate({angle:.1f})" aria-label="{edge["kind"]}"><rect x="-15" y="-8" width="30" height="16" fill="#fff5d8" stroke="#19354b" stroke-width="2"/><path d="M -15,-11 h30 M -15,11 h30" stroke="#19354b" stroke-width="2"/></g>')
    for key,node in study['nodes'].items():
        d=DISTRICTS[key];x,y=xy(node)
        svg.append(f'<g data-district="{key}"><polygon points="{points_text(footprint(key,node))}" fill="{COLORS[d["region"]]}" stroke="#19354b" stroke-width="2"/><text class="name" x="{x}" y="{y-18}" text-anchor="middle">{d["name"]}</text><text class="detail" x="{x}" y="{y-3}" text-anchor="middle">{d["region"]} · '+('separate' if key=='X' else str(d['capacity']//2)+' '+('vote' if d['capacity']==2 else 'votes'))+'</text>')
        columns=3 if d['capacity'] in (3,6) else 2
        for i in range(d['capacity']):
            sx=x+(i%columns-(columns-1)/2)*13
            sy=y+11+(i//columns)*13
            assert all(inside((sx+dx,sy+dy),footprint(key,node)) for dx,dy in [(0,0),(-5,0),(5,0),(0,-5),(0,5)])
            svg.append(f'<circle cx="{sx}" cy="{sy}" r="4.5" fill="white" stroke="#19354b" stroke-width="1.1"/>')
        svg.append('</g>')
    svg.extend(['<text x="40" y="934" font-size="14">Only printed routes create adjacency. Every route joins its two endpoint districts for all effects.</text>',
        '<text x="40" y="959" font-size="13">Nearby footprints are not adjacent. Double-railed spans mark bridges, gates, passes, or viaducts.</text>',
        f'<text x="40" y="984" font-size="13">Experimental concept · {len(edges)} connections · '+('No dead ends' if not facts['dead_ends'] else f'{len(facts["dead_ends"])} dead-end districts: see study notes')+' · District elections remain local</text>','</svg>'])
    return '\n'.join(svg)+'\n'


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    assert [s['id'] for s in DATA['studies']]==list(range(1,11))+list(range(14,21))
    reports=[]
    for study in DATA['studies']:
        assert set(study['nodes'])==set(DISTRICTS)
        for region in ('Urban','Mixed','Outlying'):
            assert sum(d['capacity'] for d in DISTRICTS.values() if d['region']==region)==18
        for key,node in study['nodes'].items():
            assert all(40<=x<=1160 and 110<=y<=900 for x,y in footprint(key,node)),(study['title'],key,'outside map')
        for key,node in study['nodes'].items():
            polygon=footprint(key,node)
            for terrain in study['terrain']:
                if terrain['kind']=='land':
                    assert all(inside(p,terrain['points']) for p in polygon),(study['title'],key,'off land')
                elif terrain.get('blocked',True):
                    assert not any(any(hits(a,b,p) for a,b in zip(polygon,polygon[1:]+polygon[:1])) for p in terrain_polygons(terrain)),(study['title'],key,'overlaps obstacle')
        keys=list(study['nodes'])
        for i,a in enumerate(keys):
            for b in keys[i+1:]:
                pa,pb=footprint(a,study['nodes'][a]),footprint(b,study['nodes'][b])
                assert not any(hits(c,d,pb) for c,d in zip(pa,pa[1:]+pa[:1])),(study['title'],a,b,'district overlap')
        edges,graph=build_edges(study)
        facts=graph_facts(study,edges,graph)
        output=render(study,edges,facts)
        path=ROOT/f'docs/assets/map-atlas/{study["id"]:02d}-{study["slug"]}.svg'
        if args.check:
            assert path.read_text()==output, str(path)+' is stale'
        else:
            path.write_text(output)
        reports.append(dict(id=study['id'],slug=study['slug'],title=study['title'],edges=edges,neighbors={k:sorted(v) for k,v in graph.items()},**facts))
        print(f'{study["id"]:02d} {study["title"]}: {len(edges)} routes, {len(facts["dead_ends"])} dead ends, {len(facts["cut_districts"])} sole-gateway districts')
    report_path=ROOT/'docs/assets/map-atlas/topology.json'
    output=json.dumps(reports,indent=2)+'\n'
    if args.check:
        assert report_path.read_text()==output,'topology.json is stale'
    else:
        report_path.write_text(output)


if __name__=='__main__':
    main()

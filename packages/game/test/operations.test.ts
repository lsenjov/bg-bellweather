import { describe, expect, it } from "vitest";
import { DISTRICTS, type DistrictId, type PartyId, type LawEffectId, type BonusCardId } from "@bellwether/content";
import { resolveOperation, type OperationState, type OperationChoice } from "../src/operations.js";
const HC='honeycomb', FG='foxglove';
function state(laws: LawEffectId[]=[]): OperationState {
  return {laws,districts:Object.fromEntries(DISTRICTS.map(d=>[d.id,{id:d.id,capacity:d.capacity,neighbors:d.adjacentDistrictIds,support:{}}]))};
}
function put(s:OperationState,id:DistrictId,party:PartyId,n=1){s.districts[id]!.support[party]=n;}
function play(s:OperationState,choice:OperationChoice,bonusCardId?:BonusCardId){return resolveOperation(s,{party:HC,choice,...(bonusCardId?{bonusCardId}:{})});}
const move=(sourceDistrictId:string,destinationDistrictId:string):OperationChoice=>({operation:'organise',sourceDistrictId,destinationDistrictId});
describe('Operation baselines',()=>{
  it('moves, rallies and smears without mutating input',()=>{
    const s=state();put(s,'harbormouth',HC);put(s,'ironwood',FG);
    expect(play(s,move('harbormouth','grand-market')).state.districts['grand-market']!.support[HC]).toBe(1);
    expect(s.districts.harbormouth!.support[HC]).toBe(1);
    expect(play(s,{operation:'rally',districtId:'harbormouth'}).state.districts.harbormouth!.support[HC]).toBe(2);
    expect(play(s,{operation:'smear',districtId:'ironwood',rivalParty:FG}).state.districts.ironwood!.support[FG]).toBeUndefined();
  });
  it('restores absent parties and rejects impossible ranges or full destinations',()=>{
    const s=state();expect(play(s,{operation:'organise',destinationDistrictId:'coast'}).baselineApplied).toBe(true);
    expect(play(s,{operation:'rally',districtId:'coast'}).baselineApplied).toBe(true);
    put(s,'harbormouth',HC);put(s,'coast',FG,4);
    expect(play(s,move('harbormouth','coast')).baselineApplied).toBe(false);
    expect(play(s,{operation:'smear',districtId:'coast',rivalParty:FG}).baselineApplied).toBe(false);
    expect(play(s,{operation:'rally',districtId:'coast'}).baselineApplied).toBe(false);
  });
  it('rejects retired Court and invalid group sizes',()=>{
    const s=state();put(s,'harbormouth',HC,2);
    expect(play(s,{operation:'court'} as unknown as OperationChoice).baselineApplied).toBe(false);
    expect(play(s,{...move('harbormouth','grand-market'),count:2} as OperationChoice).baselineApplied).toBe(false);
  });
});
describe('global law permissions',()=>{
  it('extends Rally with Grassroots Expansion and New Constituencies',()=>{
    const s=state([1,22]);put(s,'ironwood',HC);
    expect(play(s,{operation:'rally',sourceDistrictId:'ironwood',districtId:'heath'}).baselineApplied).toBe(true);
    expect(play(s,{operation:'rally',sourceDistrictId:'ironwood',districtId:'grand-market'}).baselineApplied).toBe(true);
    expect(play(s,{operation:'rally',sourceDistrictId:'ironwood',districtId:'meadow'}).baselineApplied).toBe(false);
  });
  it('moves groups with Carpooling and swaps each arrival with Political Exchange',()=>{
    const s=state([7,10]);put(s,'harbormouth',HC,2);put(s,'grand-market',FG,6);
    const result=play(s,{operation:'organise',sourceDistrictId:'harbormouth',destinationDistrictId:'grand-market',count:2,swapPartyIds:[FG,FG]});
    expect(result.baselineApplied).toBe(true);expect(result.state.districts['grand-market']!.support).toEqual({[HC]:2,[FG]:4});
    expect(result.state.districts.harbormouth!.support).toEqual({[FG]:2});
    expect(result.supportChanges).toHaveLength(4);
    expect(play(s,{operation:'organise',sourceDistrictId:'harbormouth',destinationDistrictId:'grand-market',count:2,swapPartyIds:[FG]}).baselineApplied).toBe(false);
  });
  it('combines Established Networks, Regional Express and exchanges',()=>{
    const s=state([9,30,10]);put(s,'harbormouth',HC);put(s,'coast',HC);put(s,'westfield',HC);put(s,'heath',FG,2);
    expect(play(s,move('harbormouth','coast')).baselineApplied).toBe(true);
    expect(play(s,{operation:'organise',sourceDistrictId:'westfield',destinationDistrictId:'heath',swapPartyIds:[FG]}).baselineApplied).toBe(true);
    expect(play(s,move('harbormouth','meadow')).baselineApplied).toBe(false);
  });
  it('extends Smear by two adjacency steps or to a full district',()=>{
    const s=state([11,35]);put(s,'harbormouth',HC);put(s,'northgate',FG);put(s,'coast',FG,4);put(s,'meadow',FG);
    expect(play(s,{operation:'smear',districtId:'northgate',rivalParty:FG}).baselineApplied).toBe(true);
    expect(play(s,{operation:'smear',districtId:'coast',rivalParty:FG}).baselineApplied).toBe(true);
    expect(play(s,{operation:'smear',districtId:'meadow',rivalParty:FG}).baselineApplied).toBe(false);
  });
  it('displaces only into a free neighboring district',()=>{
    const s=state([14]);put(s,'harbormouth',HC);put(s,'grand-market',FG);
    const r=play(s,{operation:'smear',districtId:'grand-market',rivalParty:FG,displacementDistrictId:'northgate'});
    expect(r.baselineApplied).toBe(true);expect(r.state.districts.northgate!.support[FG]).toBe(1);
    expect(play(s,{operation:'smear',districtId:'grand-market',rivalParty:FG,displacementDistrictId:'coast'}).baselineApplied).toBe(false);
  });
});
describe('mandatory extras and ordering',()=>{
  it('requires Fresh Start once, even with duplicate laws',()=>{
    const s=state([6,6]);
    expect(play(s,{operation:'rally',districtId:'harbormouth'}).baselineApplied).toBe(false);
    const r=play(s,{operation:'rally',districtId:'harbormouth',freshStartDistrictId:'coast'});
    expect(r.baselineApplied).toBe(true);expect(r.supportChanges).toHaveLength(2);
    for(const d of Object.values(s.districts)) d.support={[FG]:d.capacity};
    s.districts.harbormouth!.support[FG]=5;
    expect(play(s,{operation:'rally',districtId:'harbormouth'}).baselineApplied).toBe(true);
  });
  it('adds one per bridge and region law, not one per moving Support',()=>{
    const s=state([7,17,29]);put(s,'grand-market',HC,2);
    const r=play(s,{operation:'organise',sourceDistrictId:'grand-market',destinationDistrictId:'northgate',count:2});
    expect(r.baselineApplied).toBe(true);expect(r.state.districts['grand-market']!.support[HC]).toBe(1);expect(r.state.districts.northgate!.support[HC]).toBe(3);
  });
  it('does not count hypothetical bridges on long-distance moves',()=>{
    const s=state([9,29]);put(s,'harbormouth',HC);put(s,'coast',HC);
    expect(play(s,move('harbormouth','coast')).state.districts.coast!.support[HC]).toBe(2);
  });
  it('requires a different Support for Chain Migration without triggering loops',()=>{
    const s=state([28,17,29]);put(s,'grand-market',HC);put(s,'harbormouth',HC);
    expect(play(s,move('grand-market','northgate')).baselineApplied).toBe(false);
    const r=play(s,{operation:'organise',sourceDistrictId:'grand-market',destinationDistrictId:'northgate',chainSourceDistrictId:'harbormouth'});
    expect(r.baselineApplied).toBe(true);expect(r.state.districts['grand-market']!.support[HC]).toBe(2);expect(r.state.districts.northgate!.support[HC]).toBe(2);
    const alone=state([28]);put(alone,'grand-market',HC);
    expect(play(alone,move('grand-market','northgate')).supportChanges).toHaveLength(1);
  });
  it('orders Bonus and law extras freely, skips impossible extras and rejects omission',()=>{
    const s=state([28]);put(s,'harbormouth',HC);put(s,'harbormouth',FG,5);put(s,'ironwood',HC);
    const choice={operation:'organise' as const,sourceDistrictId:'harbormouth',destinationDistrictId:'grand-market',chainSourceDistrictId:'ironwood'};
    const digFirst=play(s,{...choice,followUpOrder:['bonus',28]},'old-shell-dig-in');
    expect(digFirst.baselineApplied).toBe(true);expect(digFirst.state.districts.ironwood!.support[HC]).toBe(1);
    const chainFirst=play(s,{...choice,followUpOrder:[28,'bonus']},'old-shell-dig-in');
    expect(chainFirst.baselineApplied).toBe(true);expect(chainFirst.state.districts.ironwood!.support[HC]).toBeUndefined();
    expect(play(s,{...choice,followUpOrder:['bonus']},'old-shell-dig-in').baselineApplied).toBe(false);
    expect(play(s,{...choice,followUpOrder:[28,28]},'old-shell-dig-in').baselineApplied).toBe(false);
  });
});
describe('retained Operation Bonuses',()=>{
  it('resolves Waggle Route and atomically rejects unavailable extras',()=>{
    const s=state();put(s,'harbormouth',HC);put(s,'grand-market',FG,5);
    const before=structuredClone(s);const r=play(s,move('harbormouth','grand-market'),'honeycomb-waggle-route');
    expect(r.baselineApplied).toBe(false);expect(r.state).toEqual(before);expect(s).toEqual(before);
    s.districts['grand-market']!.support[FG]=4;
    expect(play(s,move('harbormouth','grand-market'),'honeycomb-waggle-route').state.districts['grand-market']!.support[HC]).toBe(2);
  });
  it('skips Dig In refill after an exchange fills its source',()=>{
    const s=state([10]);put(s,'harbormouth',HC);put(s,'harbormouth',FG,5);put(s,'grand-market',FG,6);
    expect(play(s,{operation:'organise',sourceDistrictId:'harbormouth',destinationDistrictId:'grand-market',swapPartyIds:[FG]},'old-shell-dig-in').baselineApplied).toBe(true);
  });
  it.each(['foxglove-spin','old-shell-stonewall','night-parliament-midnight-leak'] as const)('resolves %s normally after displacement',bonus=>{
    const s=state([14]);put(s,'harbormouth',HC);put(s,'grand-market',FG,2);put(s,'ironwood',FG);
    const r=play(s,{operation:'smear',districtId:'grand-market',rivalParty:FG,displacementDistrictId:'northgate',bonusDistrictId:'ironwood'},bonus);
    expect(r.baselineApplied).toBe(true);expect(r.bonusApplied).toBe(true);expect(r.state.districts.northgate!.support[FG]).toBe(1);
  });
  it('skips Midnight Leak when no neighboring rival remains',()=>{
    const s=state();put(s,'harbormouth',HC);put(s,'grand-market',FG);
    expect(play(s,{operation:'smear',districtId:'grand-market',rivalParty:FG},'night-parliament-midnight-leak').bonusApplied).toBe(true);
  });
  it('keeps Canal Network standalone, including its route and group size',()=>{
    const s=state([17,29,28]);put(s,'harbormouth',HC,3);put(s,'grand-market',HC);
    const r=play(s,{operation:'organise',sourceDistrictId:'harbormouth',destinationDistrictId:'northgate',count:3},'riverworks-canal-network');
    expect(r.baselineApplied).toBe(true);expect(r.supportChanges).toHaveLength(3);
  });
  it('resolves Public Works, Quiet Hours and Scatter the Flock',()=>{
    const s=state();put(s,'harbormouth',HC);
    expect(play(s,{operation:'rally',districtId:'harbormouth',bonusDistrictId:'grand-market'},'riverworks-public-works').bonusApplied).toBe(true);
    expect(play(s,{operation:'rally',districtId:'harbormouth',bonusDistrictId:'coast'},'night-parliament-quiet-hours').bonusApplied).toBe(true);
    expect(play(s,{operation:'rally',districtId:'harbormouth',bonusDistrictIds:['grand-market','ironwood']},'many-wings-scatter-the-flock').bonusApplied).toBe(true);
  });
});

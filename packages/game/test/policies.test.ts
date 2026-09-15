import { describe, expect, it } from "vitest";
import { PARTY_IDS, DISTRICT_IDS, POLICIES_BY_ID, votesFor } from "@bellweather/content";
import { initializeGame, executeAction, createElectionAction, projectGameState, replay, type GameState, type GameAction } from "../src/index.js";
const random={integer:()=>0};
function fresh(n=4){return initializeGame({seats:Array.from({length:n},(_,i)=>({id:`s${i}`,displayName:`S${i}`,controller:'human' as const}))},random).state;}
function election(s:GameState,number:1|2|3){s.phase={type:'election',electionNumber:number,afterYear:(number*2) as 2|4|6,resultsRecorded:false,readySeatIds:[]};return executeAction(s,createElectionAction(s,random)).state;}
function lobby(){let s=fresh();while(s.phase.type==='opening'){const seatId=s.phase.turnSeatIds[s.phase.turnIndex]!;const seat=s.seats.find(p=>p.id===seatId)!;const partyId=PARTY_IDS.find(id=>!s.parties[id])!;s=executeAction(s,{type:'open_party',seatId,firmId:seat.firmIds[0]!,partyId}).state;}for(const id of DISTRICT_IDS)s.support[id]={};return s;}
function bonus(s:GameState,id: keyof GameState['bonusCards'],choice:unknown){if(s.phase.type!=='lobby')throw Error();const seatId=s.phase.activeSeatId;s.bonusCards[id]={zone:'hand',seatId};return executeAction(s,{type:'operate',seatId,partyId:'honeycomb',play:{cardType:'bonus',bonusCardId:id,choice}}).state;}
describe('policy state and private projection',()=>{
  it.each([2,3,4,5,6])('deals one private scoring card per human at %i players',n=>{
    const s=fresh(n);expect(new Set(s.seats.map(p=>p.scoringCardId)).size).toBe(n);expect(s.policyDeck).toHaveLength(26);expect(Object.keys(s.pendingPolicies)).toHaveLength(4);
    const view=projectGameState(s,'s0');expect(view.seats[0]!.scoringCardId).toBe(s.seats[0]!.scoringCardId);expect(view.seats.slice(1).every(p=>p.scoringCardId===null)).toBe(true);
    expect(view).not.toHaveProperty('policyDeck');expect(view).not.toHaveProperty('courtSupport');expect(view).not.toHaveProperty('coalitionTargets');
  });
  it('deals without replacement and keeps scoring cards hidden until final results',()=>{
    let s=fresh();const ids=new Set(Object.values(s.pendingPolicies));
    for(const number of [1,2,3] as const){const before=structuredClone(s);s=election(s,number);const record=s.electionHistory.at(-1)!;
      expect(record.policyVotes).toHaveLength(4);expect(s.enactedPolicyIds.length+s.discardedPolicyIds.length).toBe(number*4);
      if(number<3){expect(record.scoringCards).toEqual([]);expect(s.seats.every(p=>p.points===0)).toBe(true);expect(projectGameState(s,null).seats.every(p=>p.scoringCardId===null)).toBe(true);for(const id of Object.values(s.pendingPolicies)){expect(ids.has(id)).toBe(false);ids.add(id);}}
      else {expect(s.pendingPolicies).toEqual({});expect(s.policyDeck).toHaveLength(18);expect(record.scoringCards).toHaveLength(4);expect(projectGameState(s,null).seats.every(p=>p.scoringCardId!==null)).toBe(true);}
      expect(before.policyDeck.length-s.policyDeck.length).toBe(number<3?4:0);
    }expect(ids.size).toBe(12);
  });
  it('records randomness deterministically and rejects incomplete or extra draws',()=>{
    const s=fresh();s.phase={type:'election',electionNumber:1,afterYear:2,resultsRecorded:false,readySeatIds:[]};const action=createElectionAction(s,random);
    expect(()=>executeAction(s,{...action,randomValues:[]})).toThrow('incomplete');
    expect(()=>executeAction(s,{...action,randomValues:[...action.randomValues,0]})).toThrow('unused');
    const r=executeAction(s,action);expect(replay([{type:'game_initialized',state:s},...r.events])).toEqual(r.state);
  });
});
describe('revised Unbound Bonuses',()=>{
  it('Common Cause uses Honeycomb and a same-voting partner with two free spots',()=>{
    const s=lobby();const policy=POLICIES_BY_ID[s.pendingPolicies.urban!];const partner=PARTY_IDS.find(p=>p!=='honeycomb'&&votesFor(p,policy)===votesFor('honeycomb',policy))!;s.support.harbormouth={[partner]:1};
    const result=bonus(s,'honeycomb-common-cause',{effect:'common_cause',districtId:'harbormouth',partnerPartyId:partner});expect(result.support.harbormouth).toEqual({[partner]:2,honeycomb:1});
    s.support.harbormouth={[partner]:5};expect(()=>bonus(s,'honeycomb-common-cause',{effect:'common_cause',districtId:'harbormouth',partnerPartyId:partner})).toThrow('two free');expect(s.support.harbormouth).toEqual({[partner]:5});
  });
  it('Whisper Network moves a rival neighbor without Court',()=>{
    const s=lobby();s.support.harbormouth={honeycomb:1,foxglove:1};const r=bonus(s,'foxglove-whisper-network',{effect:'whisper_network',sourceDistrictId:'harbormouth',destinationDistrictId:'grand-market',rivalPartyId:'foxglove'});expect(r.support['grand-market'].foxglove).toBe(1);expect(r).not.toHaveProperty('courtSupport');
  });
  it('Joint Campaign gathers only the selected policy side, preserving capacity',()=>{
    const s=lobby();const policy=POLICIES_BY_ID[s.pendingPolicies.mixed!];const party=PARTY_IDS.find(p=>votesFor(p,policy))!;s.support['grand-market']={[party]:3};const r=bonus(s,'many-wings-joint-campaign',{effect:'joint_campaign',regionId:'mixed',forPolicy:true,destinationDistrictId:'northgate',moves:Array.from({length:3},()=>({sourceDistrictId:'grand-market',partyId:party}))});expect(r.support.northgate[party]).toBe(3);expect(r.support['grand-market'][party]).toBeUndefined();
  });
  it('Institutional Memory places each side party once and requires all available placements',()=>{
    const s=lobby();const parties=PARTY_IDS.filter(p=>votesFor(p,POLICIES_BY_ID[s.pendingPolicies.urban!]));const placements=parties.map(partyId=>({partyId,destinationDistrictId:'harbormouth'}));const r=bonus(s,'old-shell-institutional-memory',{effect:'institutional_memory',regionId:'urban',forPolicy:true,placements});expect(Object.values(r.support.harbormouth)).toEqual([1,1,1]);expect(()=>bonus(s,'old-shell-institutional-memory',{effect:'institutional_memory',regionId:'urban',forPolicy:true,placements:placements.slice(1)})).toThrow('one of each');
  });
  it('rejects malformed/unavailable Unbound targets without mutating Support',()=>{
    const s=lobby();const before=structuredClone(s.support);expect(()=>bonus(s,'foxglove-whisper-network',{effect:'whisper_network',sourceDistrictId:'missing',destinationDistrictId:'grand-market',rivalPartyId:'foxglove'})).toThrow('district');expect(s.support).toEqual(before);
  });
});

import { describe, expect, it } from "vitest";
import { POLICIES, POLICIES_BY_ID, REGION_IDS, SCORING_CARDS, PARTY_IDS, votesFor, type PolicyId } from "@bellwether/content";
import { initializeGame, toOperationState } from "../src/index.js";
import { recordElectionDraws, scoreElectionDay, scorePolicies, finalCardRankBonuses } from "../src/election.js";
const config = {seats:[0,1].map(i=>({id:String(i),displayName:String(i),controller:"human" as const}))};
const fresh = () => initializeGame(config,{integer:()=>0}).state;
describe("policy elections",()=>{
  it("projects a pending scoring law without activating it", () => {
    const policy = POLICIES.find(policy => policy.effect === 19)!;
    const order = [policy.plus, ...SCORING_CARDS[0]!.order.filter(category => category !== policy.plus && category !== policy.minus), policy.minus];
    const card = {...SCORING_CARDS[0]!, order};
    expect(scorePolicies(card, [policy.id], [])[0]!.net).toBe(5);
    expect(scorePolicies(card, [policy.id], [policy.id])[0]!.net).toBe(3);
  });
  it("thins every non-Centre district and never draws Centre",()=>{
    const state=fresh();state.support['bellwether-centre']={honeycomb:3};
    const draws=recordElectionDraws(toOperationState(state).districts,()=>0);
    expect(Object.keys(draws)).toHaveLength(15); expect(draws['bellwether-centre']).toBeUndefined();
    expect(draws.harbormouth!.parties).toHaveLength(3); expect(state.support['bellwether-centre']).toEqual({honeycomb:3});
    expect(()=>recordElectionDraws(toOperationState(state).districts,()=>1)).toThrow();
  });
  it("counts tokens rather than parties, passes strict majorities and fails empty/tied regions",()=>{
    const state=fresh();for(const id of Object.keys(state.support)) state.support[id as keyof typeof state.support]={};
    const policy=POLICIES_BY_ID[state.pendingPolicies.centre!];
    const yes=PARTY_IDS.find(p=>votesFor(p,policy))!; const no=PARTY_IDS.find(p=>!votesFor(p,policy))!;
    state.support['bellwether-centre']={[yes]:2,[no]:1};
    const input={state:toOperationState(state),pendingPolicies:state.pendingPolicies,enactedPolicyIds:[],players:[],random:()=>0,finalElection:false};
    const result=scoreElectionDay(input);
    expect(result.policyVotes.find(v=>v.regionId==='centre')).toMatchObject({forVotes:2,againstVotes:1,passed:true});
    expect(result.policyVotes.filter(v=>v.regionId!=='centre').every(v=>!v.passed)).toBe(true);
    input.state.districts['bellwether-centre']!.support={[yes]:1,[no]:1};
    expect(scoreElectionDay(input).policyVotes.find(v=>v.regionId==='centre')!.passed).toBe(false);
  });
  it("scores all enacted cards with final-election laws, including losses",()=>{
    const card=SCORING_CARDS[0]!;
    const target=POLICIES.find(p=>p.plus===card.order[0]&&p.minus===card.order[5])!;
    const muted=POLICIES.find(p=>p.effect===19)!;const broad=POLICIES.find(p=>p.effect===20)!;
    expect(scorePolicies(card,[target.id])[0]).toMatchObject({gain:6,loss:1,net:5});
    expect(scorePolicies(card,[target.id,muted.id,broad.id])[0]).toMatchObject({gain:4,loss:3,net:1});
    const reverse=POLICIES.find(p=>p.minus===target.plus&&p.plus===target.minus)!;
    expect(scorePolicies(card,[reverse.id])[0]!.net).toBe(-3);
    const duplicate=POLICIES.find(p=>p.effect===19&&p.id!==muted.id)!;
    expect(scorePolicies(card,[target.id,muted.id,broad.id,duplicate.id])[0]!.net).toBe(1);
  });
  it("activates scoring laws passed in the final vote before calculating points",()=>{
    const state=fresh();const muted=POLICIES.find(p=>p.effect===19)!;
    state.pendingPolicies.centre=muted.id;state.support['bellwether-centre']={[PARTY_IDS.find(p=>votesFor(p,muted))!]:3};
    const players=state.seats.map((s,i)=>({id:s.id,position:i,points:0,card:SCORING_CARDS[i]!,finalCardCount:i+1}));
    const result=scoreElectionDay({state:toOperationState(state),pendingPolicies:state.pendingPolicies,enactedPolicyIds:[],players,random:()=>0,finalElection:true});
    const passed=result.policyVotes.filter(v=>v.passed).map(v=>v.policyId);
    expect(passed).toContain(muted.id);
    expect(result.scores[0]!.policyScores).toEqual(scorePolicies(players[0]!.card,passed));
    expect(result.scores[1]!.finalCardRankBonus).toBe(1);
  });
  it("uses the highest occupied rank for tied hands",()=>{
    expect([...finalCardRankBonuses([5,8,8,10].map((n,i)=>({id:String(i),finalCardCount:n}))).values()]).toEqual([0,2,2,3]);
  });
});

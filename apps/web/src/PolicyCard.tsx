import { PARTIES, POLICIES_BY_ID, LAW_EFFECTS, votesFor, type PolicyId } from "@bellweather/content";
import type { CSSProperties } from "react";
import { PartyEmblem } from "./PartyEmblem.js";

export function PolicyCard({ policyId }: { policyId: PolicyId }) {
  const card = POLICIES_BY_ID[policyId];
  const effect = LAW_EFFECTS.find(effect => effect.id === card.effect)!;
  return <article className="policy-card" aria-label={`${card.name}: plus ${card.plus}, minus ${card.minus}`}>
    <header><span>Policy proposal</span><small>{card.id}</small></header>
    <h3>{card.name}</h3>
    {[true, false].map(forPolicy => <section className="policy-vote-row" key={String(forPolicy)}>
      <h4><span>{forPolicy ? "+" : "−"} {forPolicy ? card.plus : card.minus}</span><small>{forPolicy ? "For" : "Against"}</small></h4>
      <div className="policy-party-tiles">{PARTIES.filter(party => votesFor(party.id, card) === forPolicy).map(party =>
        <div className="policy-party-tile" key={party.id} style={{"--party": party.color} as CSSProperties}>
          <PartyEmblem partyId={party.id} /><span>{party.shortName}</span>
        </div>
      )}</div>
    </section>)}
    <div className="policy-effect"><strong>{effect.name}</strong><p>{effect.text}</p></div>
  </article>;
}

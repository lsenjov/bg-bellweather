import { PARTIES_BY_ID, POLICIES_BY_ID, LAW_EFFECTS, type PartyId, type PolicyId } from "@bellwether/content";
import type { CSSProperties } from "react";
import { PartyEmblem } from "./PartyEmblem.js";

export function PolicyCard({ policyId, projectedScore, recipientPartyId }: { policyId: PolicyId; projectedScore: number | null; recipientPartyId?: PartyId }) {
  const card = POLICIES_BY_ID[policyId];
  const effect = LAW_EFFECTS.find(effect => effect.id === card.effect)!;
  return <article className="policy-card" aria-label={`${card.name}: plus ${card.plus}, minus ${card.minus}`}>
    <header><span>{effect.scope} policy</span>{projectedScore !== null && <strong className="policy-projected-score" title="Your projected end-game score using currently enacted laws. Later scoring laws may change it.">{projectedScore > 0 ? "+" : projectedScore < 0 ? "−" : ""}{Math.abs(projectedScore)} points</strong>}<small>{card.id}</small></header>
    <h3>{card.name}</h3>
    {recipientPartyId && <p className="policy-recipient">Awarded to {PARTIES_BY_ID[recipientPartyId].shortName}</p>}
    {[true, false].map(forPolicy => <section className="policy-vote-row" key={String(forPolicy)}>
      <h4><span>{forPolicy ? "+" : "−"} {forPolicy ? card.plus : card.minus}</span><small>{forPolicy ? "For" : "Against"}</small></h4>
      <div className="policy-party-tiles">{(forPolicy ? card.forPartyIds : card.againstPartyIds).map(id => PARTIES_BY_ID[id]).map(party =>
        <div className="policy-party-tile" key={party.id} style={{"--party": party.color} as CSSProperties}>
          <PartyEmblem partyId={party.id} /><span>{party.shortName}</span>
        </div>
      )}</div>
    </section>)}
    <div className="policy-effect"><strong>{effect.name}</strong><p>{effect.text}</p></div>
  </article>;
}

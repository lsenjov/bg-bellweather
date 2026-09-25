import { POLICY_DATA } from "./policy-data.js";
import { deepFreeze } from "./immutable.js";
import type { PartyId } from "./parties.js";

export const PROMISE_CATEGORIES = deepFreeze(POLICY_DATA.categories);
export type PromiseCategory = (typeof PROMISE_CATEGORIES)[number];
export type PolicyId = (typeof POLICY_DATA.policies)[number]["id"];
export type LawEffectId = (typeof POLICY_DATA.effects)[number]["id"];
export interface PolicyCard {
  readonly id: PolicyId;
  readonly plus: PromiseCategory;
  readonly minus: PromiseCategory;
  readonly effect: LawEffectId;
  readonly name: string;
  readonly forPartyIds: readonly PartyId[];
  readonly againstPartyIds: readonly PartyId[];
}
export const POLICIES: readonly PolicyCard[] = deepFreeze(POLICY_DATA.policies);
export const POLICY_IDS = deepFreeze(POLICIES.map(card => card.id));
export const POLICIES_BY_ID = deepFreeze(Object.fromEntries(POLICIES.map(card => [card.id, card])) as Record<PolicyId, PolicyCard>);
export const LAW_EFFECTS = deepFreeze(POLICY_DATA.effects);
export type PolicyRecipients = Partial<Record<PolicyId, PartyId>>;
export function policyScope(policy: PolicyCard): "Party" | "Global" {
  return LAW_EFFECTS.find(effect => effect.id === policy.effect)!.scope;
}
export const PARTY_PRIORITIES = deepFreeze(Object.fromEntries(POLICY_DATA.parties.map(party => [party.name.toLowerCase().replaceAll(" ", "-"), party.order as readonly PromiseCategory[]])) as Record<PartyId, readonly PromiseCategory[]>);
export function votesFor(partyId: PartyId, policy: PolicyCard): boolean {
  const order = PARTY_PRIORITIES[partyId];
  return order.indexOf(policy.plus) < order.indexOf(policy.minus);
}
export function activeLawEffects(policyIds: readonly PolicyId[]): LawEffectId[] {
  return [...new Set(policyIds.map(id => POLICIES_BY_ID[id].effect))];
}
export function partyLawEffects(policyIds: readonly PolicyId[], recipients: PolicyRecipients, partyId: PartyId): LawEffectId[] {
  return activeLawEffects(policyIds.filter(id => policyScope(POLICIES_BY_ID[id]) === "Party" && recipients[id] === partyId));
}

import { POLICY_DATA } from "./policy-data.js";
import { deepFreeze } from "./immutable.js";
import type { PromiseCategory } from "./policies.js";

export type ScoringCardId = (typeof POLICY_DATA.scoringCards)[number]["id"];
export interface ScoringCard { readonly id: ScoringCardId; readonly order: readonly PromiseCategory[]; }
export const SCORING_CARDS: readonly ScoringCard[] = deepFreeze(POLICY_DATA.scoringCards);
export const SCORING_CARD_IDS = deepFreeze(SCORING_CARDS.map(card => card.id));
export const SCORING_CARDS_BY_ID = deepFreeze(Object.fromEntries(SCORING_CARDS.map(card => [card.id, card])) as Record<ScoringCardId, ScoringCard>);

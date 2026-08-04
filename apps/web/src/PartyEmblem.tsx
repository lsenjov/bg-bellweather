import type { PartyId } from "@bellweather/content";

const PARTY_EMBLEM_PATHS: Record<PartyId, string> = {
  honeycomb: "M32 7l21 12v26L32 57 11 45V19z",
  "old-shell": "M9 48c0-20 10-34 27-34 13 0 21 9 21 21 0 13-9 21-21 21-10 0-17-6-17-15 0-8 6-14 14-14 7 0 12 4 12 10 0 5-4 9-9 9-4 0-7-2-7-6",
  foxglove: "M12 10l15 10h10l15-10-5 19c5 5 7 10 7 16-7 8-14 12-22 12S17 53 10 45c0-6 2-11 7-16zM24 38l8 6 8-6M23 31h1M40 31h1",
  riverworks: "M7 16h42l8 9-8 9H7l8-9zM7 38h42l8 9-8 9H7l8-9zM21 16v18M43 38v18",
  "many-wings": "M5 18q8-8 16 0M25 12q8-8 16 0M43 20q8-8 16 0M13 37q8-8 16 0M35 43q8-8 16 0",
  "night-parliament": "M8 12l13 8h22l13-8-4 20v17L40 57H24L12 49V32zM17 30a9 9 0 1 0 18 0 9 9 0 1 0-18 0M29 30a9 9 0 1 0 18 0 9 9 0 1 0-18 0M28 44l4 5 4-5"
};

export function PartyEmblem({ partyId, className }: { partyId: PartyId; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d={PARTY_EMBLEM_PATHS[partyId]} />
    </svg>
  );
}

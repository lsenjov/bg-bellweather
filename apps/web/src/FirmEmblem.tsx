import type { FirmId } from "@bellweather/content";

export const FIRM_ACCENTS: Record<FirmId, string> = {
  "one-fell-swoop": "#efcfca",
  pairliament: "#d4e1eb",
  triumvirat: "#eeddb8",
  "ivy-league": "#d8e4d1",
  "vested-interests": "#e5d4e1",
  "vip-access": "#cfe4df"
};

export function FirmEmblem({
  firmId,
  className
}: {
  firmId: FirmId;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      {firmId === "one-fell-swoop" && (
        <path d="M7 46C23 42 37 31 53 10c-3 17-11 31-24 42M13 41l8 14M23 36l8 13M34 28l7 11" />
      )}
      {firmId === "pairliament" && (
        <path d="M7 15h21v21H17l-8 8 3-8H7zM57 15H36v21h11l8 8-3-8h5zM14 24h8M42 24h8" />
      )}
      {firmId === "triumvirat" && (
        <>
          <path d="M15 15c13 0 15 16 5 21-9 5-7 18 5 18M32 10c14 6 12 21 1 24-11 4-11 17 0 20M49 15c-13 0-15 16-5 21 9 5 7 18-5 18" />
          <circle cx="15" cy="15" r="3" />
          <circle cx="32" cy="10" r="3" />
          <circle cx="49" cy="15" r="3" />
        </>
      )}
      {firmId === "ivy-league" && (
        <path d="M31 55C33 40 32 24 32 9M31 23C18 25 12 17 13 8c11-1 19 5 18 15M33 31c13 2 20-6 20-15-11-2-19 4-20 15M31 41c-12 2-18-4-19-12 10-2 18 3 19 12M33 47c11 1 17-5 17-12-9-1-16 4-17 12" />
      )}
      {firmId === "vested-interests" && (
        <>
          <path d="M18 8l14 19L46 8l8 10-5 38H15l-5-38zM18 8v17l14 31 14-31V8" />
          <circle cx="32" cy="31" r="1.8" />
          <circle cx="32" cy="37" r="1.8" />
          <circle cx="32" cy="43" r="1.8" />
          <circle cx="32" cy="49" r="1.8" />
          <circle cx="32" cy="55" r="1.8" />
        </>
      )}
      {firmId === "vip-access" && (
        <path d="M18 9h28v7l5 5v22l-5 5v7H18v-7l-5-5V21l5-5zM25 20v24M39 20v24M25 32h14M20 9h4M28 9h4M36 9h4M44 9h2" />
      )}
    </svg>
  );
}

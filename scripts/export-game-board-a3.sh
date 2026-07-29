#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_svg="$repository_root/docs/assets/ring-and-cross-district-map.svg"
output_pdf="$repository_root/assets/print/ring-and-cross-district-map-a3.pdf"

for required_command in fc-match inkscape gs pdfinfo; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$required_command" >&2
    exit 1
  fi
done

font_requirements=(
  "Noto Serif:weight=black|Noto Serif|Black"
  "Noto Serif:weight=black:slant=italic|Noto Serif|Black Italic"
  "Noto Sans Mono:weight=black|Noto Sans Mono|Black"
)

for font_requirement in "${font_requirements[@]}"; do
  IFS="|" read -r font_pattern expected_family expected_style <<< "$font_requirement"
  resolved_font="$(fc-match -f '%{family[0]}|%{style[0]}' "$font_pattern")"
  if [[ "$resolved_font" != "$expected_family|$expected_style" ]]; then
    printf 'Missing required font face: %s %s\n' "$expected_family" "$expected_style" >&2
    exit 1
  fi
done

page_size_matches() {
  local pdf_file="$1"
  local expected_width="$2"
  local expected_height="$3"

  LC_ALL=C pdfinfo "$pdf_file" | awk \
    -v expected_width="$expected_width" \
    -v expected_height="$expected_height" '
      /^Page size:/ {
        width_delta = $3 - expected_width
        height_delta = $5 - expected_height
        if (width_delta < 0) width_delta = -width_delta
        if (height_delta < 0) height_delta = -height_delta
        found = 1
        valid = width_delta <= 0.02 && height_delta <= 0.02
      }
      END { exit !(found && valid) }
    '
}

export_directory="$(mktemp -d)"
trap 'rm -rf "$export_directory"' EXIT

artwork_pdf="$export_directory/artwork.pdf"
a3_pdf="$export_directory/board-a3.pdf"

inkscape "$source_svg" \
  --export-filename="$artwork_pdf" \
  --export-pdf-version=1.5 \
  --export-text-to-path

if ! page_size_matches "$artwork_pdf" 1122.519685 841.889764; then
  printf 'Source artwork must remain 396 x 297 mm.\n' >&2
  exit 1
fi

gs \
  -q \
  -dBATCH \
  -dNOPAUSE \
  -sDEVICE=pdfwrite \
  -dFIXEDMEDIA \
  -dPDFFitPage \
  -dAutoRotatePages=/None \
  -dDEVICEWIDTHPOINTS=1190.551181 \
  -dDEVICEHEIGHTPOINTS=841.889764 \
  -sOutputFile="$a3_pdf" \
  "$artwork_pdf"

if ! page_size_matches "$a3_pdf" 1190.551181 841.889764; then
  printf 'Export failed A3 page-size validation.\n' >&2
  exit 1
fi

install -m 0644 "$a3_pdf" "$output_pdf"
printf 'Exported %s\n' "${output_pdf#"$repository_root/"}"

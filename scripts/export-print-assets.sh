#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
board_source="$repository_root/docs/assets/inland-district-map.svg"
board_output="$repository_root/assets/print/inland-district-map-a3.pdf"
html_exporter="$repository_root/scripts/export-html-print-pages.cjs"

mkdir -p "$repository_root/assets/print"

for required_command in fc-match gs inkscape node npm pdffonts pdfinfo; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$required_command" >&2
    exit 1
  fi
done

font_requirements=(
  "Noto Serif:weight=black|Noto Serif|Black"
  "Noto Serif:weight=black:slant=italic|Noto Serif|Black Italic"
  "Noto Sans Mono:weight=black|Noto Sans Mono|Black"
  "Liberation Serif:weight=bold|Liberation Serif|Bold"
  "Liberation Sans:weight=regular|Liberation Sans|Regular"
  "Liberation Sans:weight=bold|Liberation Sans|Bold"
  "DejaVu Sans:weight=regular|DejaVu Sans|Book"
)

for font_requirement in "${font_requirements[@]}"; do
  IFS="|" read -r font_pattern expected_family expected_style <<< "$font_requirement"
  resolved_font="$(fc-match -f '%{family[0]}|%{style[0]}' "$font_pattern")"
  if [[ "$resolved_font" != "$expected_family|$expected_style" ]]; then
    printf 'Missing required font face: %s %s\n' "$expected_family" "$expected_style" >&2
    exit 1
  fi
done

python "$repository_root/scripts/generate-default-map.py"
node --conditions=development --import tsx "$repository_root/scripts/generate-scoring-cards.ts"
node "$repository_root/scripts/generate-candidate-bonus-cards.mjs"

pdf_page_size_matches() {
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
        valid = width_delta <= 0.1 && height_delta <= 0.1
      }
      END { exit !(found && valid) }
    '
}

pdf_page_count_matches() {
  local pdf_file="$1"
  local expected_pages="$2"

  LC_ALL=C pdfinfo "$pdf_file" | awk \
    -v expected_pages="$expected_pages" '
      /^Pages:/ {
        found = 1
        valid = $2 == expected_pages
      }
      END { exit !(found && valid) }
    '
}

pdf_fonts_are_embedded() {
  local pdf_file="$1"

  LC_ALL=C pdffonts "$pdf_file" | awk '
    NR > 2 && NF {
      found = 1
      if (substr($0, 73, 3) != "yes") invalid = 1
    }
    END { exit !(found && !invalid) }
  '
}

validate_pdf() {
  local pdf_file="$1"
  local expected_pages="$2"
  local expected_width="$3"
  local expected_height="$4"
  local label="$5"

  if ! pdf_page_count_matches "$pdf_file" "$expected_pages"; then
    printf '%s export has an unexpected page count.\n' "$label" >&2
    exit 1
  fi

  if ! pdf_page_size_matches "$pdf_file" "$expected_width" "$expected_height"; then
    printf '%s export has an unexpected page size.\n' "$label" >&2
    exit 1
  fi
}

html_exports=(
  "party-boards|docs/components/party-boards.html|assets/print/party-boards-a4.pdf|3|841.92|594.96"
  "player-folios|docs/components/player-folios.html|assets/print/player-folios-a4.pdf|2|594.96|841.92"
  "player-helper|docs/components/player-helper.html|assets/print/player-helper-a4.pdf|1|594.96|841.92"
  "operation-cards|docs/components/operation-cards.html|assets/print/operation-cards-a4.pdf|5|594.96|841.92"
  "bonus-cards|docs/components/bonus-cards.html|assets/print/bonus-cards-a4.pdf|2|594.96|841.92"
  "bonus-card-candidates|docs/design/printable-bonus-card-candidates.html|assets/print/bonus-card-candidates-a4.pdf|9|594.96|841.92"
  "scoring-cards|docs/components/printable-scoring-cards.html|assets/print/scoring-cards-a4.pdf|2|594.96|841.92"
  "shared-state-tokens|docs/components/shared-state-tokens.html|assets/print/shared-state-tokens-a4.pdf|1|841.92|594.96"
  "public-score-tracker|docs/components/campaign-score-trackers.html|assets/print/public-score-tracker-a4.pdf|1|841.92|594.96"
)

export_directory="$(mktemp -d)"
trap 'rm -rf "$export_directory"' EXIT

board_pdf="$export_directory/board-a3.pdf"
inkscape "$board_source" --export-filename="$board_pdf" --export-pdf-version=1.5 --export-text-to-path
validate_pdf "$board_pdf" 1 1190.551181 841.889764 "District map"

html_export_arguments=()
for export_specification in "${html_exports[@]}"; do
  IFS="|" read -r export_name source_path output_path expected_pages expected_width expected_height <<< "$export_specification"
  html_export_arguments+=(
    "$repository_root/$source_path"
    "$export_directory/$export_name.pdf"
  )
done

global_node_modules="$(npm root --global)"
NODE_PATH="$global_node_modules${NODE_PATH:+:$NODE_PATH}" \
  node "$html_exporter" "${html_export_arguments[@]}"

for export_specification in "${html_exports[@]}"; do
  IFS="|" read -r export_name source_path output_path expected_pages expected_width expected_height <<< "$export_specification"
  validate_pdf \
    "$export_directory/$export_name.pdf" \
    "$expected_pages" \
    "$expected_width" \
    "$expected_height" \
    "$export_name"

  if ! pdf_fonts_are_embedded "$export_directory/$export_name.pdf"; then
    printf '%s export contains missing or unembedded fonts.\n' "$export_name" >&2
    exit 1
  fi
done

install -m 0644 "$board_pdf" "$board_output"
printf 'Exported %s\n' "${board_output#"$repository_root/"}"

for export_specification in "${html_exports[@]}"; do
  IFS="|" read -r export_name source_path output_path expected_pages expected_width expected_height <<< "$export_specification"
  install -m 0644 "$export_directory/$export_name.pdf" "$repository_root/$output_path"
  printf 'Exported %s\n' "$output_path"
done

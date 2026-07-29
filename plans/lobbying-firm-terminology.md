# Lobbying firm terminology

## Goal

Replace “lobbying house” with the clearer “lobbying firm” throughout the live game documents and printable components, and remove manufacturing dimensions from the faces of counterbid covers.

## Steps

1. Migrate the live terminology and asset names from lobbying houses to lobbying firms. Preserve superseded wording in historical entries, add a new decision and changelog entry, rename the printable HTML/CSS and generated PDF targets, and keep all navigation and validation references working.
2. Update the printable firm boards and tokens. Use “Firm” for kit identifiers and accessibility labels, remove “70 mm” from counterbid-cover faces, retain dimensions in print/manufacturing instructions, regenerate ignored PDFs, and visually inspect the output.
3. Run documentation, export, clean-checkout, and diff checks. Have an independent agent review the completed implementation and address every high or medium finding before final handoff.

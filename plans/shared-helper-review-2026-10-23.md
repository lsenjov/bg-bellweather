# Shared player helper

1. Archive replaced helper, generator, stylesheet and PDF; implement approved turn-front/year-back wording.
2. Fit both A5 faces and record decisions, retaining recovery and deferring companion reconciliation for standalone party effects and Fiddler favour scoring.
3. Regenerate print/TTS outputs and validate docs and fit. Root arranges independent review and commit.

Validation: full approved copy retained at 9pt; both print faces pass bounds, back last text has 7.16mm bottom clearance. Documentation, print and TTS checks and 18 TTS loader/publisher tests pass. Helper HTML/PDF and source/stylesheet archived. Independent review identified the back bottom-margin issue; fresh review of the corrected PDF and TTS artwork passed with no outstanding findings.

Publication: attempted `python scripts/publish-tts-assets.py --upload`, but AWS credentials were unavailable or invalid. Local exports and importer are ready; authenticate AWS and rerun the publisher before using the new TTS image URLs. All three implementation steps are complete.

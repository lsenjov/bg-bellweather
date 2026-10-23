# Firm helper and rules reconciliation

1. Archive replaced references and source, implement approved six-firm helper wording and five rule corrections, update current companion docs and decision/history records.
2. Independently review source, regenerate print and TTS exports, validate fit and consistency, review generated output and commit.

Scope excludes policy wording revisions, Fresh Start replacement, complexity hints and app engine changes.

Implementation and exports complete. Validation: 334 HTML files pass documentation checks; print and TTS checks pass; 11 loader and 7 publisher tests pass. A5 references retain 9pt body text, and all content clears its footer (Hecate has the least clearance, 18mm). Independent review found stale glossary definitions and a version label; both were fixed, and fresh source/artifact review passed with no remaining findings.

TTS publication attempted with `python scripts/publish-tts-assets.py --upload`, but AWS credentials were unavailable or invalid. Restore authentication and rerun the publisher before using the new image URLs. Local print and TTS exports are complete.

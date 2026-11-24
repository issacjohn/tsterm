# TSTerm 0.5.1

## Device-help command reference

- Added **24,475 normalized ASA 9.24(10) device-help records** generated from a read-only `?` crawl.
- The catalog now contains **27,488 records**:
  - 503 curated, parameterized, fillable commands.
  - 24,475 device-help references.
  - 2,510 Cisco documentation references.
- Device-help entries carry the captured mode, mode prompt, category, inferred risk, enum choices, typed
  parameter placeholders, and the original device syntax.
- The importer resolves 335 enum groups, applies 4,633 enum choices, skips non-executable menu nodes, cleans
  malformed help fragments, and deduplicates by mode and command template.

## Grounding

- Assistant replies now recognize commands that exist in the device help and label them
  **Device help 9.24(10) — reference only**, instead of treating them as unknown.
- Device-help entries are version-tagged and reference-only: they are excluded from vector indexing,
  deterministic routing, and Fill.
- Strict command grounding now includes device-help candidates in free-chat retrieval while continuing to
  exclude Cisco documentation entries.
- Cisco documentation matches still show **Documented reference, not verified** and remain non-fillable.
- The command browser shows the source and version for device-help entries and keeps **Fill** disabled until
  a command is promoted to a reviewed, parameterized curated record.

## Data pipeline

- New `scripts/import-device-command-help.mjs` normalizes a captured `asa_commands.json` into
  `resources/commands/asa-device-help.json`.
- Added `npm run commands:import-device-help`.
- Added tests for the generated pack, device-help grounding, generic-template rejection, and the
  reference/fillable search boundaries.

## Known limitations

- The device-help pack is a snapshot of one ASA 9.24(10) crawl. Optional branches can be missed; for
  example, some `capture` interface/match combinations are not present. Treat absence as “not captured,”
  not “not supported.”
- Device-help parameters are inferred from help tokens and descriptions. They are suitable for reference
  and grounding, not for unreviewed Fill.
- Cisco documentation references remain non-fillable.

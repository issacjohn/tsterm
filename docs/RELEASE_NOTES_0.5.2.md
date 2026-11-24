# TSTerm 0.5.2

## Strict command enforcement

- Strict mode no longer displays commands that are absent from the ASA catalog. Unknown commands and
  Cisco-documentation-only commands are removed before rendering.
- The answer summary reports how many commands were hidden.
- Standalone command-like prose lines are checked as well as fenced blocks and inline backticks.
- **Copy** and **Snippet** only use the verified lines that remain visible.
- Previous assistant messages are sanitized before they are sent back to the model, so an unverified command
  cannot be reinforced through chat history.
- Non-strict mode retains the previous behavior: unknown and documentation-only commands are visible, marked,
  and non-fillable.

## Live-verified capture commands

- Added 11 capture records confirmed with read-only help probes on the live ASA 9.24(10) device:
  - `capture <name>`
  - `capture <name> interface <iface>`
  - `capture <name> interface <iface> match ip any any`
  - `capture <name> interface <iface> match ip host <src> host <dst>`
  - `capture <name> interface <iface> match ip <srcnet> <srcmask> <dstnet> <dstmask>`
  - `capture <name> interface <iface> match <proto> host <src> host <dst> eq <port>`
  - `capture <name> buffer <size>`
  - `capture <name> access-list <acl>`
  - `show capture <name>`
  - `no capture <name>`
  - `clear capture <name>`
- These records are parameterized, risk-classified, and fillable. Capture records include the matching
  `no capture <name>` cleanup.
- The catalog now contains **27,499 records**:
  - 514 fillable records (503 curated plus 11 live-verified capture records).
  - 24,475 device-help references.
  - 2,510 Cisco documentation references.

## Grounding behavior

- `verified` commands are shown with Fill enabled.
- Device-help commands are shown as **Device help 9.24(10) — reference only**, with Fill disabled.
- Cisco documentation and unknown commands are hidden in strict mode.
- If verification fails, strict mode hides the commands instead of falling back to unverified text.

## Tests

- Added redaction tests for fenced, inline, and bare command text.
- Added live-verified capture grounding tests.
- Updated the AI smoke test to assert that an invented command is not rendered and that the hidden-command
  summary is shown.
- Typecheck, unit tests, command-browser smokes, AI smokes, and packaged-build smokes pass.

## Known limitations

- The 24,475 device-help records remain a snapshot of one ASA 9.24(10) crawl; optional branches can still be
  missing. Strict mode treats a missing command as not present, so valid commands absent from the catalog are
  hidden until added.
- The model can still reason incorrectly about which present command to use; grounding verifies existence, not
  diagnostic appropriateness.
- Device-help parameter types are inferred, not reviewed for Fill.

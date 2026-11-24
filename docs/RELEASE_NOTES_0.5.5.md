# TSTerm 0.5.5

## Every device pack is back

The bundled catalog now contains **13 validated device packs and 236 runbooks**:

- Cisco ASA
- Cisco IOS / IOS-XE
- Cisco NX-OS
- Cisco FTD
- Cisco FMC
- Cisco 9800
- Cisco Meraki
- Cisco AireOS WLC
- Palo Alto PAN-OS
- Windows
- Linux
- macOS
- Generic network

## Device-scoped AI and commands

- Added **494 command records** generated from the non-ASA runbooks.
- The catalog now has **27,993 records**, with **1,008 fillable commands**.
- Command search, verification, routing, and the command browser are filtered by the active device type.
- A Windows session cannot see ASA, IOS, NX-OS, PAN-OS, or Linux commands.
- An ASA session cannot see another device pack's commands.
- Assistant runbook hints, command hints, reference documents, and sanitized history are all device-scoped.
- Each terminal tab keeps its own AI thread and its own device scope.

## Configuration assistance

- The assistant is no longer troubleshooting-only. The prompt and UI now support configuration and change
  requests.
- Configuration answers must include prerequisites, ordered commands, verification, rollback/cleanup, and the
  risk of each state-changing step.
- New suggested prompts cover configuration and safe change planning.
- The right-hand panel is renamed **Assist**, with **Runbooks** and **Assistant** tabs.
- The command browser is now **Command Reference**, titled with the active device pack.
- Configuration runbook commands are included in the device command catalog and can be filled after review.

## Grounding behavior by device

- **ASA**: strict mode hides unknown and Cisco-documentation commands, as before.
- **Other device packs**: unverified configuration commands remain visible for review, are clearly marked, and
  cannot be filled. This is required because the non-ASA packs do not contain an exhaustive command catalog.
- Exact catalog matches remain fillable on every device.
- The vector index target is now **1,008** fillable records.

## Verification

- Unit tests cover per-device command search and verification isolation.
- The prompt test verifies that ASA syntax is not injected into a Windows session.
- The per-terminal AI smoke test verifies that ASA runbook and command syntax do not leak into the Windows
  request.
- The command-browser smoke test opens an ASA reference, then switches to Windows and verifies that only
  Windows commands are shown.
- Typecheck, unit tests, AI smokes, command-browser smoke, and packaged-build smoke pass.

## Design pass

- Applied the device-assistant hierarchy, scoped command browser, clearer empty states, and configuration
  prompts from the UI/UX review.
- The interface keeps the terminal-first density, with a stronger separation between device scope, runbooks,
  and assistant actions.

# TSTerm 0.2.4

**No invented capture keywords.**

This is a safety patch for command suggestions. TSTerm now explicitly tells the model that Cisco ASA
capture has **no `duration` keyword**, and the cleanup warning now checks inline commands too.

## Fixes

- Added an ASA capture guardrail to the system prompt:
  - Use `buffer` / `circular-buffer`.
  - Remove the capture with `no capture <name>`.
  - Never add an invented `duration` option.
- The debug/capture cleanup warning now scans inline code commands, not only fenced blocks. An answer like
  ``capture TSTCAP interface outside match ip any any`` without a matching stop command now shows the
  “no cleanup command found” warning.
- Inline CLI commands remain clickable **Fill** chips.

## Correct ASA capture pattern

```text
capture TSTCAP interface outside match ip host 10.1.1.10 host 10.2.2.20
capture TSTCAP buffer 33554432
show capture TSTCAP
no capture TSTCAP
```

For all traffic, replace the match with `match ip any any` and consider `circular-buffer`, but prefer a
filter. There is no timed capture option on ASA 9.24.

## Verification

- `npm run typecheck`
- `npm test` — **65 tests**, including inline command extraction and cleanup detection.
- `npm run build`
- AI mock + streaming tests
- missing-runtime and real Qwen2.5 7B tests
- packaged-app smoke

The Windows installer is unsigned, so SmartScreen may ask for confirmation.

## Support

If TSTerm saves you a call: [buymeacoffee.com/issac_john](https://buymeacoffee.com/issac_john).

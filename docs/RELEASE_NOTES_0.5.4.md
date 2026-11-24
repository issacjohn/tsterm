# TSTerm 0.5.4

## Larger terminal context for AI

- The assistant now receives the last **400 terminal lines** instead of 80.
- The terminal snapshot is capped at **24,000 characters**.
- The provider prompt cap for live terminal context is raised from 7,000 to **24,000 characters**.
- The same secret redaction and untrusted-data handling still apply.

This makes config-mode output, long `show` results, and multi-screen troubleshooting output more likely to
reach the model, while still avoiding an unbounded terminal dump.

## Notes

- The snapshot is still a tail, not the full scrollback.
- Larger `show running-config` or `show tech-support` output can still exceed the limit; filter the command or
  paste the relevant section.
- Live context remains opt-in.

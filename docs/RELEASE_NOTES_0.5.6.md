# TSTerm 0.5.6

## Fix: HTTPS behind TLS inspection

- TSTerm now merges the operating system's trusted root certificates into Electron's Node CA bundle at
  startup.
- This fixes `fetch failed` / `unable to get local issuer certificate` errors on networks that use TLS
  inspection, including Cisco Secure Access.
- Applies to OpenCode Go, cloud AI providers, update checks, and other HTTPS requests made by the main
  process.

## OpenCode Go

- **Fetch models** now reaches `https://opencode.ai/inference/go/openai/v1/models` on a network with TLS
  inspection.
- Existing Go session headers and the `TSTerm/0.5.6` user agent are unchanged.
- The DeepSeek V4.1 Flash model remains selected.
- Command verification labels now use the active device pack name (for example, **Verified in the local
  Windows catalog**) instead of always saying **ASA**.

## Verification

- Verified that the models endpoint returns HTTP 200 in Electron after merging the system CA store.
- Confirmed the failure before the fix was `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` with cause
  `unable to get local issuer certificate`.
- Typecheck, unit tests, AI smokes, command-browser smoke, and packaged-build smoke pass.

# Testing TSTerm

## Fast checks

```bash
npm run typecheck
npm test
npm run build
```

This covers:

- Catalog parsing, validation, inheritance, search, and cleanup requirements.
- Runbook rendering with conditional steps.
- Inline next-word suggestions and prompt stripping.
- The daily GitHub update check, including throttling and failure messages.
- AI safety rules: requests are blocked while disabled, terminal output is marked untrusted, command fills
  cannot contain line breaks or control characters, and the AI service has no execution surface.
- Streaming OpenAI-compatible and Anthropic SSE, non-streaming fallback, inline CLI command detection, and
  small-model quality warnings.
- Ollama status checks, loopback-only model downloads, streamed pull progress, cancellation, and model name
  validation.
- Automatic Ollama runtime installation: winget success, installer failure, non-Windows fallback, tray-app
  start, and clear manual instructions.
- Reference library import, text/PDF extraction, device-type scoping, duplicate detection, retrieval, and
  removal.
- Per-terminal AI thread isolation, draft restoration, streaming text, and thread deletion.
- ASA command catalog loading, the Cisco documentation reference pack, BM25 ranking, risk filters,
  deterministic rendering, parameter validation, model-ID allowlisting, and parameter provenance checks
  for the command router.
- Free-chat command hints, natural-language runbook matching with stemming, syslog/last-command retrieval
  queries, and `<think>` tag filtering across streamed chunks.
- The Electron main/preload/renderer type boundaries.

## Unit tests

`npm test` runs Vitest against `tests/`. The tests do not connect to any device and do not require
credentials.

## UI smoke test

The UI test drives the packaged Electron renderer with Playwright. It creates a temporary profile under the
OS temp folder, so your real hosts and settings are not touched.

```bash
TSTERM_TEST_HOST=192.0.2.10 \
TSTERM_TEST_USER=admin \
TSTERM_TEST_PASSWORD=secret \
npm run test:ui
```

On PowerShell:

```powershell
$env:TSTERM_TEST_HOST = '192.0.2.10'
$env:TSTERM_TEST_USER = 'admin'
$env:TSTERM_TEST_PASSWORD = 'secret'
npm run test:ui
```

The smoke test:

1. Opens the welcome screen.
2. Adds an SSH host and captures the new-host and host-key dialogs.
3. Chooses the device type and connects.
4. Types `deb`, verifies the ghost suggestion, accepts it with Tab, and cancels the line.
5. Runs `show version`.
6. Searches the runbook library for RADIUS, opens a runbook, and tracks a copied debug runbook.
7. Opens the debug guard and the quit guard.
8. Verifies the device type and host key are remembered on a second connection.
9. Creates a snippet and a custom device pack.
10. Switches themes and changes the terminal font.
11. Opens the command palette and the port-forwarding dialog.
12. Opens a local PowerShell session.

Screenshots are written to `screenshots/`.

## AI smoke test

`npm run test:ai` launches the app with a temporary profile, opens a local PowerShell session, and points
a new AI provider at a loopback mock server started by the script. It verifies:

1. The Assistant tab starts in the opt-in state.
2. Enabling the assistant, adding a provider, saving an API key, and fetching models all work.
3. A chat request reaches the mock provider with the execution ban and untrusted-data rules in the system
   prompt.
4. The reply is rendered as reviewable command blocks.
5. **Fill** stages exactly one command in the terminal prompt without pressing Enter or executing it.
6. Turning the assistant off returns the panel to the opt-in state.

It requires no device and no real API key. Screenshots `19-ai-*.png` through `23-ai-*.png` are written to
`screenshots/`.

## Local model auto-install test

`npm run test:ai-local` starts a loopback mock that implements Ollama's native `/api/version`, `/api/tags`,
and `/api/pull` endpoints plus the OpenAI-compatible chat endpoint. It verifies:

1. Enabling the assistant with an Ollama provider starts a model check automatically.
2. A missing model triggers exactly one `/api/pull` request with the correct model and `stream: true`.
3. Download progress appears in Settings and in the Assistant panel.
4. The download continues after Settings is closed.
5. Once Ollama reports the model, chat becomes available and uses that same model.
6. The request still contains the execution ban and untrusted-data rules.

Screenshots `24-ai-model-download.png` through `26-ai-auto-pulled-chat.png` are written to `screenshots/`.
No real Ollama process or multi-gigabyte download is involved.

## AI reference and scope test

`npm run test:ai-reference` presets an ASA-scoped reference document, switches the active local session
to **Cisco ASA**, and sends a question through a mock provider. It verifies:

- The Assistant scope line says **Cisco ASA runbooks only**.
- The reference chip shows the imported document.
- Only the relevant ASA reference excerpt is included in the system prompt.
- Windows commands and Windows runbooks do not leak into the ASA-scoped prompt.

Screenshot `30-ai-reference-scope.png` is written.

## Per-terminal AI thread test

`npm run test:ai-threads` opens two local terminals, scopes the first to Cisco ASA and the second to
Windows, and verifies:

1. The first terminal's ASA question continues streaming when the second terminal is opened.
2. The Windows terminal starts with an empty conversation and Windows-only runbook scope.
3. Returning to the ASA tab restores its messages and unsent draft.
4. Background replies land in the correct terminal thread.
5. ASA context does not leak into the Windows request.
6. The top bar shows the app version and a Check for updates button.

Screenshot `31-ai-per-terminal-threads.png` is written.

## ASA command browser tests

The fast unit suite covers the catalog, BM25, rendering, and router validation without a model:

```bash
npm test -- tests/commands.test.ts
```

The opt-in Ollama test builds the embedding index for the **503 fillable records** with
`nomic-embed-text` (the 2,510 Cisco reference entries stay BM25-only) and exercises the real Qwen3 8B
router:

```powershell
$env:TSTERM_OLLAMA_TEST = '1'
npm test -- tests/commands-ollama.test.ts
```

It verifies semantic retrieval for VPN, RADIUS, certificate, and interface questions; host-to-host capture
routing with exact parameters; RADIUS-to-AAA routing; and destructive risk classification for a
reload/delete request.

The command browser has its own UI smoke test and needs no SSH host:

```bash
node scripts/commands-ui-smoke.mjs
```

Set `TSTERM_BUILD_VECTORS=1` to click **Build vector index** and wait for the footer to switch from
`BM25 only` to `Hybrid · 503/503 curated embedded`. Set `TSTERM_COMMANDS_PACKAGED=1` to run the same checks against
`release/win-unpacked/TSTerm.exe`. Screenshots are written to `screenshots/commands-*.png`.

The AI routing UI test requires Ollama plus `qwen3:8b`. It presets a temporary profile, asks the real
router for a host-to-host capture, and verifies the rendered command and parameter fields:

```bash
npm run test:commands-ai
```

Screenshot `commands-04-ai-route.png` is written. The command browser smoke also covers a Cisco
documentation reference entry (`commands-05-reference.png`): documented syntax is shown, Fill is disabled,
and the Cisco doc link is present.

## Missing-runtime UI test

`npm run test:ai-runtime` starts the app against a closed loopback port and enables the assistant. It
confirms the local-model panel and Assistant banner show **Install Ollama**, **Retry**, and a download-page
fallback — not a **Download** button that silently repeats the failed check.

Screenshots `27-ai-install-ollama.png` and `28-ai-install-ollama-assistant.png` are written.

## Real Ollama test

This test is opt-in because it uses a real model and real inference:

```bash
ollama pull qwen3:8b
npm run test:ai-ollama
```

It sends one short prompt through the TSTerm Assistant to the local Ollama server, waits for the streamed
answer to finish, and verifies the content. It writes `screenshots/29-ai-real-ollama.png`. The script exits
with code 2 and does not fail the suite if the model is missing. Override the model with
`TSTERM_OLLAMA_MODEL=llama3.2`.

## Live debug cleanup test

This test is intentionally separate because it starts a real debug on a test device. It:

1. Connects to the device.
2. Sends the RADIUS debug runbook.
3. Confirms `show debug` shows the RADIUS debugs.
4. Calls `window.close()`, confirms the guard prompt, and chooses **Stop debugs & quit**.
5. Reconnects and verifies `show debug` is clean.
6. Checks the cleanup file exists in the temporary profile's `exports/` folder.

```bash
TSTERM_TEST_HOST=192.0.2.10 \
TSTERM_TEST_USER=admin \
TSTERM_TEST_PASSWORD=secret \
node scripts/ui-debug-close.mjs
```

Only run this against a device you own or a lab device you are authorized to change. The test leaves the
device in the same debug state it found (clean).

## Update and packaged-app checks

```bash
npm run test:update
npm run test:packaged
```

`test:update` calls the live GitHub release feed from inside the app and confirms the installed version is
reported correctly. `test:packaged` launches `release/win-unpacked/TSTerm.exe` and verifies the local
PowerShell session, so it should be run after `npm run package`.

## Manual lab notes

The current release was verified on a Cisco ASA Software 9.24(10) appliance with:

- `terminal pager 0`, `terminal monitor`, and `terminal no monitor`.
- `show version | include Version`, `show aaa-server`, `show vpn-sessiondb summary`,
  `show crypto ikev2 sa`, `show crypto ipsec sa`, `show failover`, `show interface ip brief`,
  `show capture`, `show asp drop`, `show cpu usage`, `show memory`, `show conn count`,
  `show monitor-interface`, `show dhcpd binding`, `show route`.
- `debug radius all` / `undebug radius all` and `debug radius user NAME` / `undebug radius user NAME`.
- A `capture TSTCAP interface inside match ip host ... host ...` capture and its `no capture TSTCAP`
  cleanup.

The ASA pack was corrected after testing: it uses `terminal monitor` / `terminal no monitor`, not
`logging console` (which is not available in that form). The ASA capture buffer is now set after creation
(`capture TSTCAP buffer 33554432`), ACL captures use `capture ... access-list TSTCAP_ACL`, ACL cleanup uses
`clear configure access-list TSTCAP_ACL`, and debug cleanup uses the tested `undebug` form.

The ASA pack currently contains 77 runbooks across 14 categories. This build bundles ASA only; the other
packs are in `catalog-archive/` and are restored one at a time after validation.


## Test credentials

Never commit credentials. The test scripts read `TSTERM_TEST_HOST`, `TSTERM_TEST_USER`, and
`TSTERM_TEST_PASSWORD` from the environment. Screenshots are taken of the app window only and do not
contain the password.

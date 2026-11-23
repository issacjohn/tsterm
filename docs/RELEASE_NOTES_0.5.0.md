# TSTerm 0.5.0

## ASA command reference

- New **ASA Command Reference** (`Ctrl+Shift+J`, `Session` menu, or the command palette).
- **503 structured ASA records** generated from the 75 top-level commands, 407 runbook steps, and 21
  complete examples from the ASA help index.
- One record per command with mode, risk, parameters, regex validation, examples, source, and cleanup.
- Search by command name, natural-language symptom, keyword, interface, or exact token.
- Risk filters for read-only, diagnostic, mutating, and destructive commands.

## Hybrid retrieval

- Local BM25 index with command-aware tokenization and exact-token handling.
- Optional local vector index using Ollama `nomic-embed-text`.
- Reciprocal Rank Fusion (`k = 60`) merges BM25 and vector results.
- One-click **Build vector index** with progress; the cache is reused until the catalog changes.
- Clear note when a syslog ID has no mapping yet instead of returning unrelated commands.

## Deterministic command router

- **Let AI choose** retrieves candidate records and asks a local Qwen3 8B model to return a candidate ID
  and parameter values only.
- The model cannot write the command string. TSTerm renders every command from the curated template.
- Candidate IDs are allowlisted; unknown IDs are rejected.
- Parameter names are allowlisted.
- Values must appear in the question or terminal output and must pass the parameter regex.
- Validation failures retry once, then fall back to the candidate list.
- Low-confidence results do not auto-select; choose a candidate manually.

## Safety

- Four risk classes: read-only, diagnostic, mutating, destructive.
- Diagnostic records show recorded cleanup.
- Destructive records require typing `CONFIRM` before Fill.
- Top-level commands are labeled incomplete and are de-prioritized for symptom questions.
- Router is disabled when the AI assistant is off.
- Fill still writes one line and never presses Enter.

## Data and documentation

- `scripts/build-asa-command-catalog.mjs` regenerates the catalog.
- `docs/COMMANDS.md` documents the schema, retrieval, router contract, safety model, and limitations.
- Added fast router/rendering tests and opt-in real-Ollama tests for vector retrieval and Qwen3 routing.
- Added command-browser and AI-routing UI smoke tests.

## Defaults

- The built-in Ollama profile now defaults to **qwen3:8b**.
- Existing built-in `llama3.2` profiles migrate to `qwen3:8b`; custom profiles are untouched.

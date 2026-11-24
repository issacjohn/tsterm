# TSTerm 0.5.3

## OpenCode Go support

- TSTerm now sends the required OpenCode Go headers:
  - `x-opencode-session` with a stable per-terminal AI thread identifier.
  - `User-Agent: TSTerm/0.5.3`.
- The same headers are used for the provider model list, so **Fetch models** works against Go.
- Detected Go base URLs:
  - `https://opencode.ai/inference/go/openai/v1`
  - `https://opencode.ai/zen/go/v1`
- No custom-header field is required in Settings.

## Recommended OpenCode Go setup

- API style: **OpenAI compatible**
- Base URL: `https://opencode.ai/inference/go/openai/v1`
- Auth header: **Authorization: Bearer**
- Model: `deepseek-v4.1-flash` or another model listed by the Go model endpoint.

Console pay-as-you-go remains separate:

- Base URL: `https://opencode.ai/inference/openai/v1`
- Requires Console credits.
- Go does not pay for Console requests.

## Verification

- Added a provider test that verifies the Go session and user-agent headers on the model-list request.
- Typecheck and unit tests pass.
- Direct API verification with the Go endpoint returned `billing_source: go` for DeepSeek V4.1 Flash.

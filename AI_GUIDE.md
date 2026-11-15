# Assistant DATA — OpenRouter

The agent reads the prepared dataset, calls deterministic tools, and returns cited
data cards to Touchdown, the maintained frontend in `touchdown/`. The model never
supplies displayed physical values or free-form physical claims: the service
renders them from verified data.
OpenRouter is the only model provider API used by this implementation.

## Start locally

Use the existing `.venv` and frontend dependencies, or install the project and the
frontend dependencies first. Put the API key only in the root `.env` file:

```dotenv
OPENROUTER_API_KEY=your-server-side-key
OPENROUTER_MODEL=deepseek/deepseek-v4.1-flash-1017
```

The model above was explicitly selected by the user. The Python configuration has
no implicit model default. `.env` and its variants are excluded from Git; the
example file has no key. Never prefix credentials with `VITE_`.

```bash
# Terminal 1: server (reload after changing .env).
.venv/bin/python -m lunar_data.server

# Terminal 2: development UI; /api proxies to the server.
cd touchdown
npm run dev
```

For the built app, run `npm run build` in `touchdown/`, then run the Python server from
the repository root. Open http://127.0.0.1:8001/. The server serves only `touchdown/dist`
and the prepared dataset, never the repository root or `.env`. It binds to loopback.

Select a scenario and open **Assistant des données**. The selected scenario
provides explicit site/date/duration/height/model parameters. Without a selection,
ambiguous requests ask for the missing parameters. An optional analysis criterion
lets the user supply a threshold and unit; no mission threshold or weight is
selected by the model. Constraint verdicts apply only to the modeled criteria.

Mission constraints start empty. The current UI selection contains up to three
site/date pairs; the same site may appear on different prepared dates. Height,
duration and model are common. Both `POST /api/compare` and the chat request use
the same ordered scenario IDs, priority and explicitly enabled user constraints.
With no comparison columns, chat uses only the focused scenario. An unavailable
or duplicate selected scenario is not replaced by another date or the full
catalogue. Clearing the UI thresholds sends an empty constraint list explicitly.

The deterministic comparison API is the source of displayed verdicts, ranks and
the Pareto set; the assistant explains that same computation. Static data remain
readable when the API is down, but active-constraint verdicts stay unknown and no
replacement ranking is presented as an API result. The data interface and chat
controls do not depend on WebGL being available. Actual chat still requires its
local service and, for model answers, a configured provider.

## Tools and conversation

| Tool | Behavior |
|---|---|
| `list_sites` | Catalogue, sources, verification and coordinates. |
| `get_scenario` | Explicit stored scenario; metrics, windows, quality and provenance. |
| `compare` | Previously read compatible scenarios, declared Pareto criteria and user constraints. |
| `get_sensitivity` | Stored grid definition and ranges, with known/total point counts. |
| `get_evidence` | Prepared comparison evidence or a comparison from the same conversation. |

The allowlist exposes no shell, arbitrary path, URL fetch, raw DEM, kernel or full
time-series access. Arguments and final JSON are schema-checked. Evidence ids must
come from results actually read in the request. A comparison answer needs a real
comparison proof; constraints require a computed verdict even for one scenario.
Historical or session comparison evidence is rebuilt under the current selection,
method and constraints before it can be cited. A reference from a different
selection or threshold cannot supply a current verdict. Sensitivity evidence
states its fixed v1 analysis period: 30 days from 2026-12-01; it does not inherit
the date currently selected in Touchdown.

Forced tool turns (`required` or a named tool) carry tool argument schemas but no
final-message `response_format`. Turns allowing a final message (`auto`/`none`)
carry the strict final schema. Tool arguments and final answers remain validated
by the server. This separation passed the real Touchdown comparison flow through
Sail Research on 2026-11-15, after that route rejected the combined forced-tool
and final-message format.

With tools, DeepSeek V4-family requests explicitly disable thinking throughout
the loop: its API documents forced tool choices as incompatible with thinking.
Other model families, including R1, retain their previous payloads. See
[DeepSeek tool choices](https://api-docs.deepseek.com/api/create-chat-completion/)
and [OpenRouter reasoning controls](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

HTTP failures expose bounded, allowlisted diagnostics with the configured key
redacted; raw bodies, headers and URLs are not returned. An attempted call without
a provider cost record makes the aggregate observed cost unknown, including a
failed attempt followed by a successful retry. A local zero counter is not a
provider receipt.

The service preserves assistant tool-call and reasoning state during each model
loop. Conversation history consists of user text and service-generated summaries;
clients cannot submit system messages. Sessions expire after inactivity, are
bounded in memory, and retain comparison references and explicit user constraints.
There is at most one corrective validation turn, within the same turn/tool/cost
limits. Rejected answers never become physical results. Already-read deterministic
evidence remains available when the model fails.

## Limits and observed provider behavior

Defaults: six model turns, twelve tool calls, 1,600 output tokens, a conservative
64,000-token input allowance, 30 s timeout per HTTP call, and USD 0.05 reserved per
question at most. The input allowance uses UTF-8 byte count plus framing, avoiding
an external tokenizer download; actual provider token counts are recorded in usage.

Routing sets `require_parameters: true`, `allow_fallbacks: false`, and explicit
input/output price caps. The local tested setup caps routes at USD 0.12 / 0.50 per
million input/output tokens. Generic defaults in `.env.example` are higher; choose
caps appropriate to the configured model. Pricing and endpoint availability can
change. Reservations use caps and conservative input allowances, including retry
attempts; they are an application estimate, not an account-level billing guarantee.
Set an OpenRouter key spending limit for account-level enforcement.

Only HTTP 429/503 with a short Retry-After may be retried, at most once. Ambiguous
timeouts and authentication failures are not retried. The process reserves USD
0.50 per hour across requests by default; failed/ambiguous calls keep their
reservation. This in-memory guard resets with the process. Positive responses
are cached for identical evidence/configuration/history; cached responses are marked.

Local HTTP rejects foreign browser origins, hostnames, oversized bodies, path
traversal and caller-supplied conversation roles. This is a local demo server;
authenticated multi-user internet hosting is outside this implementation.

Scientific limits remain unchanged: original terrain T9 failed, LOLA remains
experimental, and visibility does not establish power, communications or mission
feasibility. See [scientific validation](docs/validation/v1.md).

Terrain cache integrity and migration are documented in
[DATA_PIPELINE.md](DATA_PIPELINE.md#cache-migration-and-integrity-checks): legacy
unhashed profiles are recomputed into `profiles-verified-v1`, while published v1
files remain unchanged. This preparation cost and full dataset verification are
separate from model usage; chat reads prepared evidence, not DEMs or SPICE caches.

## Reproduce verification

```bash
# Simulated providers, real dataset and HTTP tests; no provider calls.
.venv/bin/python -m pytest -q
cd touchdown
npm test
npm run build
npm run test:e2e
```

The browser command starts and stops its own local service on an available port.
To use an already-running service, set `PREVIEW_URL`. The
offline E2E service replaces only the model transport; dataset reads, tool calls,
comparison, sessions and answer validation use the application code. It does not
load `.env` or call OpenRouter.

```bash
# Separate terminal, from the repository root; keep running during browser checks.
.venv/bin/python scripts/serve_e2e.py --port 4180

# Test terminal.
cd touchdown
PREVIEW_URL=http://127.0.0.1:4180 npm run test:e2e
```

One real-provider browser check is available separately:
`node touchdown/scripts/check-live-browser.mjs`. It sends one question about two
selected v1 scenarios to the configured OpenRouter model, with a conservative
per-question ceiling of USD 0.05; it is never part of automatic offline tests.
Its sanitized result goes to `touchdown/.cache/live-browser-report.json`.

Broader provider qualification is separate and can incur charges:
`lunar-ai-check --report docs/validation/ai-live-next.json`. It requires intentional
execution and an unused report path. `observedCostUsd` covers provider-reported
costs of the recorded qualification cases only; missing cost fields are not proof
that a call was free, and exploratory calls are outside that report's scope.
Offline tests do not establish current endpoint availability or live provider
compatibility.

See [audit correction verification](docs/validation/touchdown-audit-fixes-2026-11-15.md)
for this branch's acquired checks, live-provider result and cost limitations. The
[14 November planner report](docs/validation/touchdown-south-pole-planner-v1.md)
and older provider reports are historical evidence, not a pass for later code.

Official protocol references: [tool calling](https://openrouter.ai/docs/guides/features/tool-calling),
[structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs),
[provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

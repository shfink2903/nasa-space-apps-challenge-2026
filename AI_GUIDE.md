# Assistant DATA — OpenRouter

The agent reads the prepared dataset, calls deterministic tools, and returns cited
data cards to the lunar explorer. The model never supplies displayed physical
values or free-form physical claims: the service renders them from verified data.
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

## Reproduce verification

```bash
# Simulated providers, real dataset and HTTP tests; no provider calls.
.venv/bin/python -m pytest -q
cd touchdown
npm test
npm run build
npm run test:e2e
```

Touchdown browser checks intercept AI chat locally. They verify selection,
priority and constraints sent by the interface without starting another provider
request. The local service remains configured for real use through its server-side
environment. See [Touchdown planner verification](docs/validation/touchdown-planner-v1.md)
for the final revision's results and limits. Older browser qualifications from the
separate web/ application do not qualify Touchdown and are not shipped here.

Official protocol references: [tool calling](https://openrouter.ai/docs/guides/features/tool-calling),
[structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs),
[provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

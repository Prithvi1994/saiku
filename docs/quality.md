# Quality dashboard

> The quality dashboard answers **"where does quality stand, and by how much is
> it drifting?"** The gates in CI answer a narrower question: *"did this PR
> break a signal?"* You need both — a gate without a level tells you a fire
> started but not whether the room was already smoke-filled.

Saiku declares its quality signals as **files, not as assertions buried in a
build log**:

| Signal | Declared in | Enforced by | Rendered by |
| --- | --- | --- | --- |
| Per-module **test-count** floors | `.github/test-floors.json` | `.github/workflows/ci.yml` | `scripts/quality-report.sh` |
| Per-module **line-coverage** floors | `.coverage-thresholds.json` | `scripts/check-coverage.sh` (from `ci.yml`) | `scripts/quality-report.sh` |
| **Formatting** (Palantir Java Format) | root `pom.xml` (Spotless) | `spotless:check`, bound to `verify` | `mvn verify` only |
| **UI type checks** (`svelte-check` + `tsc`) | `saiku-ui` | `ci.yml` → `ui` job | `.github/workflows/quality-report.yml` |
| **UI tests** (vitest) | `saiku-ui` | `ci.yml` → `ui` job | `.github/workflows/quality-report.yml` |
| **Licence headers** on Java sources | `scripts/check-licence-headers.sh` | `ci.yml` | `quality-report.yml` |
| **CRLF** in Java sources | repo convention | Spotless (indirectly) | `quality-report.yml` |
| **Runtime** behaviour (traces, JDBC spans, metrics) | `docs/observability.md` | — | your OTLP collector |

Floors are **ratchets, not targets**. Each one was set at the measured value
when the gate landed, rounded down. They exist to catch the failure mode that
no review catches: someone deletes a test to get a build green. A floor that
is never raised stops catching anything else, so raising one is part of the
job when a module's tests or coverage grow.

## Where the dashboard lives

`.github/workflows/quality-report.yml` runs **weekly** (Mondays, 05:17 UTC) and
on demand from the Actions tab. The rendered report lands in two places:

1. **The run's job summary** — the run page itself renders it, so reading it
   costs one click. This is the dashboard.
2. **`quality-report` artifact** (90-day retention) — successive weekly runs can
   be diffed to see the trend rather than the point-in-time.

It deliberately does **not** run on every push or every PR: the signal only
moves when a batch of work lands, and a weekly read is what a human actually
consumes. The per-PR verdict belongs to `ci.yml`, which is where the merge gate
lives.

The workflow is **read-only** — `permissions: contents: read`, no comments, no
labels, no issues, no releases.

## Reading the report

| Column | What it means |
| --- | --- |
| **Tests** | `tests=` summed across every `TEST-*.xml` in the module's surefire reports. |
| **Floor** | The ratchet from `.github/test-floors.json`. `—` = module is not floored. |
| **Headroom** | `Tests − Floor`. `+11` means one careless deletion away from a red build. |
| **Fail / Err / Skip** | Failures, errors and skips in the same run. A high skip count hides lost coverage. |
| **Line cov.** | JaCoCo line coverage from `target/site/jacoco/jacoco.csv`. |
| **Cov. floor** | The ratchet from `.coverage-thresholds.json`. |
| **Status** | ✅ at or above both floors · ⚠️ below at least one · ⚪ not measured. |

**⚪ is not a pass.** A ⚪ row means the module produced no surefire report —
either its tests did not run, or the build died before reaching it. The report
says so explicitly rather than rendering the absence as a zero, because "no
tests ran" and "no tests exist" are different findings and the trend must not
flatten them into the same number.

The Verdict line is the whole report in one sentence, and it is deliberately
not a gate result:

- **every measured signal is at or above its floor** — green.
- **no floor is breached, but N module(s) were not measured** — incomplete data,
  not good news. Go look at why the lane stopped.
- **N signal(s) below floor** — drift. If this came from a PR, `ci.yml` blocked
  that PR; if it landed anyway, a floor was lowered rather than met.

## Running it locally

The renderer reads only build output, so you can reproduce the Java half of the
dashboard from your own `target/` directories:

```bash
mvn -B -ntp verify                       # writes surefire + jacoco reports
./scripts/quality-report.sh              # Markdown table to stdout
./scripts/quality-report.sh --strict     # …and exit 1 if anything is below floor
```

`--strict` exists for local use and ad-hoc verification. The workflow does not
use it: it would turn the dashboard back into a gate, which is `ci.yml`'s job
and would make a red *build* indistinguishable from a red *quality signal*.

The UI half has no standalone script — it reads vitest's JSON report, which only
the workflow produces.

## Moving a signal

**Raising a floor** is the good kind of change, and the one that decays by
inaction:

1. Get green (`mvn verify`), then read the real numbers: the dashboard shows
   the measured value, and `jq . .github/test-floors.json` shows the floor.
2. Set the floor to the measured value (test counts: the whole number. Coverage:
   round **down**, never up — a floor set above the measurement fails the build
   that raised it).
3. Note it in the PR body: which module, old floor, new floor, and why.

**Lowering a floor** needs a stated reason in the PR body and should be treated
as a review conversation, not a drive-by edit. Legitimate reasons are rare:
a test moved to another module, a deliberate deletion of dead-code tests ahead
of deleting the dead code. "It was blocking my PR" is not a reason.

**Adding a module** means adding it to the floor file *and* confirming the
report renders it. `scripts/quality-report.sh` takes the union of both floor
files, so a module that is in only one still appears, with `—` in the other
column.

## What this dashboard does not tell you

- **Whether the tests are good.** A count and a coverage percentage say nothing
  about assertion strength. High coverage on trivial getters is a real and
  common failure mode.
- **Whether the AI surfaces behave correctly.** The AI Query / Ossie / skill
  surfaces are tested against real cube behaviour, but a floor is a floor.
- **Anything about runtime.** That is [observability](observability.md) and your
  OTLP collector — traces, per-statement JDBC spans, JVM and pool metrics. The
  dashboard covers the build; observability covers the running system.
- **Trends over time**, beyond whatever you diff by hand between archived
  artifacts. History rendering is the obvious next step and is deliberately not
  built here: it needs a store, and a store means a write permission this
  workflow does not have.
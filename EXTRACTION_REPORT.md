# ManFriday — Backend Extraction Report

> **Purpose.** A read-only, code-grounded inventory of what *actually exists* in this repo, to inform a
> planned TypeScript-on-Supabase rebuild. Every claim cites a file path. Where the docs describe behavior
> that is **not** implemented in code, the gap is called out explicitly. Nothing in the repo was modified,
> generated, migrated, or pushed; the only file created is this one.
>
> **"Compliance" flagging.** The pivot intends to drop the EEOC/compliance layer. Each table/module is
> flagged **CORE-PRODUCT** or **COMPLIANCE-COUPLED** so the rebuild can decide what to port. No compliance
> code was read for destruction, altered, or deleted.

---

## 0. Current State

| Item | Value |
|---|---|
| `git branch --show-current` | **`phase-0-foundations`** |
| `git status` | **dirty by exactly one untracked file** — `?? EXTRACTION_REPORT.md` (this report). No tracked file is modified or staged. |
| Git remote | `origin → https://github.com/qashsolutions/manfri.git` |
| Alembic migration files | **exactly one**: `services/api/alembic/versions/0001_phase0_baseline.py` |
| Migration revision graph | `revision = "0001"`, `down_revision = None` — a single **replayable baseline**, no ALTER chain (`…/0001_phase0_baseline.py:35-38`) |

### Have migrations been applied to a remote DB?

I did **not** connect to any database (per the read-only constraint), so I cannot assert "none have been
applied." The accurate, repo-grounded statement is the opposite of the task's assumption:

- The repo ships a committed validator, `db/supabase_validate.py` (+ `db/supabase_validate.sh`), whose
  docstring and code run `alembic upgrade head` against a **real Supabase Postgres** and then run the full
  pytest suite there, **SYNTHETIC DATA ONLY** (`db/supabase_validate.py:1-14`, `:104-105`, `:141-163`).
- `CLAUDE.md` and the project auto-memory record that the single baseline **was validated against the live
  Supabase Postgres** (us-east-2, project ref `xaazaldeqrhrwfjcwhyh`) with throwaway orgs/candidates.
- So the baseline migration **has been applied to a live Supabase Postgres for validation with synthetic
  data**. No real candidate PII is recorded as having landed — that stays gated on counsel sign-off
  (`db/supabase_validate.py:6-8`).
- Cloud admin creds live in **gitignored, untracked** files (`services/api/.env.cloud`,
  `services/api/.env.cloud.app`). They were **not** read for this report.

### Schema is ORM-first, not ALTER-first

The baseline does `Base.metadata.create_all(bind)` over the live ORM metadata (`…/0001_phase0_baseline.py:72`),
then layers the DDL the ORM can't express (extensions, HNSW index, role seed, the `manfriday_app` role +
grants, RLS). **The ORM in `services/api/app/db/models.py` is the single source of truth for the schema**;
the migration is a thin replayable wrapper around it (`…/0001_phase0_baseline.py:10-14`).

---

## 1. Schema

Source: `services/api/app/db/models.py` (528 lines) + `services/api/alembic/versions/0001_phase0_baseline.py`.

**18 tables total: 17 tenant-scoped (RLS) + 1 global (`role`, no RLS).** SQLAlchemy convention in this file:
`Mapped[str]` ⇒ `NOT NULL`; `Mapped[str | None]` ⇒ nullable. All UUID PKs default to `gen_random_uuid()`;
all `created_at` are `timestamptz NOT NULL DEFAULT now()`. I omit re-stating those defaults per-row below.

### `candidate_identity` — confirmed ABSENT

There is **no `candidate_identity` table** (nor any cross-org link / shared-pool table) anywhere in
`models.py`, the migration, or the codebase. The only references to the concept are doc comments
*asserting its deliberate absence* (`models.py:142-145`, `:469-471`; `…/0001_phase0_baseline.py:18-19`).
Candidates are strictly org-isolated; the same person in two orgs is incidental duplication, never a shared
record (matches the "org-isolation model" project memory: an identity-link build was reverted).

### RLS policy (identical shape on every tenant-scoped table)

From `…/0001_phase0_baseline.py:61, 116-125`:

```
_PRED = "{col} = NULLIF(current_setting('app.current_org', true), '')::uuid"
…
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE  ROW LEVEL SECURITY;     -- applies even to the table owner
CREATE POLICY tenant_isolation ON {table} USING ({predicate}) WITH CHECK ({predicate});
```

`{col}` is `id` for `organization` and `org_id` for the other 16 tenant tables (`…/0001_phase0_baseline.py:41-60`).
The GUC is set transaction-locally from **verified JWT claims** (`app/db/session.py:55-69`,
`app/auth/session_scope.py:18-25`).

### `manfriday_app` role grants (least-privilege, from `…/0001_phase0_baseline.py:100-114`)

- `role`: **SELECT only**.
- `organization, client, app_user, membership, candidate, embedding, parse_run, scoring_run, generation_run, score, requisition, jd_skill, proposal`: SELECT, INSERT, UPDATE, DELETE.
- `resume`: SELECT, INSERT, **UPDATE** (no DELETE) — immutable rows.
- `tenant_key`: SELECT, INSERT, **DELETE** (no UPDATE) — crypto-shred = delete the DEK row.
- `audit_event`: SELECT, INSERT only; **UPDATE/DELETE explicitly REVOKED** (append-only).
- `consent_ledger`: SELECT, INSERT only; **UPDATE/DELETE explicitly REVOKED** (append-only).

Role is `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE` (`…/0001_phase0_baseline.py:93`).

### Table-by-table

Legend: **PK** primary key · **FK** foreign key (+ ON DELETE) · **U** unique · **IX** index · **CK** check.

---

**`organization`** — tenant root. RLS keyed on **`id`**. — **CORE-PRODUCT** (`pii_retention_days` is compliance-leaning).
| column | type | null | default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** |
| type | text | no | — · **CK** `type in ('agency','direct')` |
| name | text | no | — |
| data_region | text | yes | — |
| pii_retention_days | integer | no | 730 |
| created_at | timestamptz | no | now() |
| deleted_at | timestamptz | yes | — |

**`role`** — GLOBAL lookup. **No `org_id`, NO RLS.** — **CORE-PRODUCT**.
| column | type | null | default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** |
| key | text | no | — · **U** |

Seeded with 6 rows (`…/0001_phase0_baseline.py:81-85`): `recruiter, agency_admin, client_hiring_manager,
candidate, auditor, platform_super_admin`.

**`client`** — a company served (== self for direct-hire). RLS(`org_id`). — **CORE-PRODUCT**.
| column | type | null | default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** |
| org_id | uuid | no | **FK** organization.id ON DELETE RESTRICT · **IX** |
| name | text | no | — |
| is_self | boolean | no | false |
| created_at | timestamptz | no | now() |
| deleted_at | timestamptz | yes | — |

**`app_user`** — platform user homed in one org. RLS(`org_id`). — **CORE-PRODUCT**.
| column | type | null | default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** |
| org_id | uuid | no | **FK** organization.id RESTRICT · **IX** |
| email | **citext** | no | — |
| status | text | no | `'active'` |
| created_at | timestamptz | no | now() |
| deleted_at | timestamptz | yes | — |

**U** `(org_id, email)`.

**`membership`** — `(user, org, role, scope)`. RLS(`org_id`). — **CORE-PRODUCT**.
| column | type | null | default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** |
| user_id | uuid | no | **FK** app_user.id CASCADE · **IX** |
| role_id | uuid | no | **FK** role.id RESTRICT |
| scope | jsonb | no | `'{}'::jsonb` (org / client_ids / req_ids) |
| created_at | timestamptz | no | now() |

**`candidate`** — org-isolated candidate. RLS(`org_id`). — **CORE-PRODUCT**, but several columns are **COMPLIANCE-COUPLED**.
| column | type | null | default | note |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** | |
| org_id | uuid | no | **FK** organization.id RESTRICT · **IX** | |
| external_ref | text | yes | — | |
| redaction_status | text | no | `'pending'` | **COMPLIANCE-COUPLED** |
| pii_jsonb | bytea | yes | — | **envelope-encrypted** PII blob (name/email/phone) — **COMPLIANCE-COUPLED** |
| consent_state | text | no | `'pending'` · **CK** `in ('pending','opted_in','unsubscribed')` | **COMPLIANCE-COUPLED** |
| consent_source | text | yes | — | **COMPLIANCE-COUPLED** |
| consent_updated_at | timestamptz | yes | — | **COMPLIANCE-COUPLED** |
| status | text | no | `'new'` · **CK** `in ('new','contacted','screening','submitted')` | pipeline state (CORE) |
| created_at | timestamptz | no | now() | |
| deleted_at | timestamptz | yes | — | |

> Note for the rebuild: there is **no plaintext name/email/phone column** on `candidate`. All contact PII is
> stored only inside the encrypted `pii_jsonb` blob and decrypted in-process. A TS rebuild that drops the
> crypto layer must decide where PII lives (a plain column vs Supabase column encryption / Vault).

**`embedding`** — polymorphic pgvector row. RLS(`org_id`). — **CORE-PRODUCT** (infra; currently unused, see §7).
| column | type | null | default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** |
| owner_type | text | no | — |
| owner_id | uuid | no | — |
| model_id | text | no | — |
| dim | integer | no | — |
| vector | **vector(1024)** | no | — (`EMBEDDING_DIM = 1024`, `models.py:43`) |
| created_at | timestamptz | no | now() |

**IX** `ix_embedding_vector_hnsw` — HNSW, `vector_cosine_ops`, `m=16, ef_construction=64` (`…/0001_phase0_baseline.py:74-78`).

**`parse_run`** — provenance for a parse. RLS(`org_id`). — **COMPLIANCE-COUPLED** (invariant #2).
| column | type | null | default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** |
| model_id | text | no | — |
| prompt_version | text | no | — |
| params | jsonb | no | `'{}'::jsonb` |
| input_hash | text | no | — |
| created_at | timestamptz | no | now() |

**`scoring_run`** — provenance for a scoring pass. RLS(`org_id`). — **COMPLIANCE-COUPLED** (defined; never written by live code, §7).
| column | type | null | default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** |
| screen_session_id | uuid | yes | — |
| model_id | text | no | — |
| prompt_version | text | no | — |
| weight_set | jsonb | no | `'{}'::jsonb` |
| input_snapshot_hash | text | no | — |
| created_at | timestamptz | no | now() |

**`generation_run`** — provenance for a generation. RLS(`org_id`). — **COMPLIANCE-COUPLED** (only written by the test-only router path, §7).
| column | type | null | default |
|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** |
| model_id | text | no | — |
| prompt_version | text | no | — |
| params | jsonb | no | `'{}'::jsonb` |
| input_hash | text | no | — |
| created_at | timestamptz | no | now() |

**`score`** — tall score table, one row per parameter. RLS(`org_id`). — **COMPLIANCE-COUPLED** (defined; never written by live code, §7).
| column | type | null | default | note |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** | |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** | |
| scoring_run_id | uuid | **no** | **FK** scoring_run.id CASCADE · **IX** | NOT-NULL FK = "no score without provenance" (invariant #2) |
| screen_session_id | uuid | yes | — | |
| parameter | text | no | — | |
| value | numeric | no | — | |
| max_value | numeric | no | — | **DB column name is `max`** (`models.py:287`) |
| rationale_text | text | yes | — | explainability |
| evidence_refs | jsonb | no | `'{}'::jsonb` | evidence spans |
| created_at | timestamptz | no | now() | |

**`audit_event`** — append-only, hash-chained. RLS(`org_id`). — **COMPLIANCE-COUPLED** (but also the only audit trail; see note).
| column | type | null | default | note |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** | |
| seq | bigint | no | **Identity(always)** · **U** | monotonic sequence |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** | |
| actor_id | uuid | yes | — | |
| actor_type | text | no | — | |
| action | text | no | — | |
| entity_type | text | yes | — | |
| entity_id | uuid | yes | — | |
| before_jsonb | jsonb | yes | — | |
| after_jsonb | jsonb | yes | — | |
| prev_hash | text | no | — | chain link |
| hash | text | no | — | `sha256(prev_hash ‖ canonical)` |
| occurred_at | timestamptz | no | — | (no server default; set in code) |

**U** `(hash)`, **U** `(org_id, prev_hash)` (prevents chain forks).

> Note: this is genuinely *used by the live product* (every create/consent/upload writes here), so it is
> "compliance-coupled" by design but is currently the product's only activity log. A rebuild dropping the
> hash-chain still likely wants an audit/activity table.

**`resume`** — immutable, versioned. RLS(`org_id`). — **CORE-PRODUCT** (`parse_run_id` is compliance-coupled).
| column | type | null | default | note |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** | |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** | |
| candidate_id | uuid | no | **FK** candidate.id CASCADE · **IX** | |
| version | integer | no | — | |
| content_hash | text | no | — | sha256 of bytes (dedupe) |
| storage_uri | text | no | — | object-store key |
| content_type | text | yes | — | |
| parsed_jsonb | jsonb | yes | — | non-PII parse output |
| parse_run_id | uuid | yes | **FK** parse_run.id SET NULL | **COMPLIANCE-COUPLED** |
| is_current | boolean | no | true | |
| superseded_by | uuid | yes | **FK** resume.id SET NULL | version chain |
| created_at | timestamptz | no | now() | |

**U** `uq_resume_candidate_version (candidate_id, version)`; **U** `uq_resume_candidate_content_hash
(candidate_id, content_hash)`; **partial unique IX** `uq_resume_current_per_candidate (candidate_id) WHERE
is_current` — at most one current version per candidate.

**`tenant_key`** — per-tenant wrapped DEK. RLS(`org_id`). — **COMPLIANCE-COUPLED** (PII envelope crypto / crypto-shred).
| column | type | null | default |
|---|---|---|---|
| org_id | uuid | no | **PK**, **FK** organization.id CASCADE |
| wrapped_dek | bytea | no | — |
| key_version | integer | no | 1 |
| created_at | timestamptz | no | now() |

**`requisition`** — a job opening. RLS(`org_id`). — **CORE-PRODUCT** (`parse_run_id` compliance-coupled).
| column | type | null | default | note |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** | |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** | |
| client_id | uuid | yes | **FK** client.id SET NULL · **IX** | |
| title | text | no | — | |
| location | text | yes | — | |
| employment_type | text | yes | — | |
| openings | integer | no | 1 | |
| status | text | no | `'open'` · **CK** `in ('open','on_hold','filled')` | |
| jd_text | text | yes | — | |
| jd_storage_uri | text | yes | — | |
| jd_content_hash | text | yes | — | |
| jd_version | integer | no | 1 | |
| parse_run_id | uuid | yes | **FK** parse_run.id SET NULL | **COMPLIANCE-COUPLED** |
| created_at | timestamptz | no | now() | |
| deleted_at | timestamptz | yes | — | |

**`jd_skill`** — weighted CORE/NICE skill on a req. RLS(`org_id`). — **CORE-PRODUCT** (this is the scoring rubric).
| column | type | null | default | note |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** | |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** | |
| requisition_id | uuid | no | **FK** requisition.id CASCADE · **IX** | |
| name | text | no | — | |
| tier | text | no | — · **CK** `in ('core','nice')` | |
| weight | numeric | no | — | 0..1, recruiter-adjustable |
| sort_order | integer | no | 0 | |

**`proposal`** — candidate proposed to a req + outcome. RLS(`org_id`). — **CORE-PRODUCT**.
| column | type | null | default | note |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** | |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** | |
| candidate_id | uuid | no | **FK** candidate.id CASCADE · **IX** | |
| requisition_id | uuid | no | **FK** requisition.id CASCADE · **IX** | |
| outcome | text | no | `'proposed'` · **CK** `in ('proposed','interviewing','rejected','hired')` | |
| reason | text | yes | — | |
| decided_by | uuid | yes | — | (no FK constraint) |
| decided_at | timestamptz | yes | — | |
| created_at | timestamptz | no | now() | |

**`consent_ledger`** — append-only consent events. RLS(`org_id`). — **COMPLIANCE-COUPLED** (CAN-SPAM/consent).
| column | type | null | default | note |
|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() — **PK** | |
| org_id | uuid | no | **FK** organization.id CASCADE · **IX** | |
| candidate_id | uuid | no | **FK** candidate.id CASCADE · **IX** | |
| event | text | no | — · **CK** `in ('opted_in','unsubscribed','pending')` | |
| source | text | yes | — | |
| occurred_at | timestamptz | no | now() | |

### Schema notes for the rebuild
- **No demographics / protected-class table exists.** The EEOC adverse-impact "segregated demographics"
  store described in the docs (Phase 2) is **not built** — there is nothing to port or drop there.
- **Compliance-coupled tables**: `parse_run`, `scoring_run`, `generation_run`, `score`, `audit_event`,
  `tenant_key`, `consent_ledger`, plus the `candidate.consent_*`/`redaction_status`/`pii_jsonb` columns and
  the `*.parse_run_id` FKs. Of those, only `parse_run`, `audit_event`, `consent_ledger`, `tenant_key`, and
  the candidate consent/PII columns are actually written by live code (see §7); `scoring_run`/`score`/
  `generation_run` are scaffolding.

---

## 2. Matching / Scoring

**Implemented**, deterministic, pure-Python, no LLM, no embeddings. Source: `services/api/app/matching/score.py`
(quoted verbatim below), wired into `GET /requisitions/{id}/matches` (`app/api/requisitions.py:216-268`) and the
outreach audience filter (`app/api/outreach.py:88-94`).

### The exact fit formula (`app/matching/score.py:18-105`)

```python
MATCHER_VERSION = "skill-overlap@1"

# Fit = CORE_WEIGHT * core_coverage + NICE_WEIGHT * nice_coverage, each coverage in
# [0,1] as the weighted fraction of that tier's skills present. CORE dominates.
_CORE_SHARE = 0.8
_NICE_SHARE = 0.2
```

Per tier, coverage = (sum of weights of **present** skills) / (sum of weights of **all** skills in that tier),
or `0.0` if the tier is empty (`_coverage`, `score.py:52-53`). "Present" is a **case-insensitive exact match**
(`name.casefold() in present`, `score.py:65, 72`) of the JD skill name against the résumé's parsed canonical
skills — there is no fuzzy/semantic match. Then (`score.py:91-99`):

```python
if core_total > 0 and nice_total > 0:
    fit_fraction = _CORE_SHARE * core_coverage + _NICE_SHARE * nice_coverage
elif core_total > 0:
    fit_fraction = core_coverage          # JD with only core skills → scored on core
else:
    fit_fraction = nice_coverage          # JD with only nice skills → scored on nice
…
fit = round(fit_fraction * 100)           # 0..100 integer
```

The breakdown also returns `matched`, `missing_core`, and a per-skill `SkillMatch(name, tier, weight, present)`
list (`score.py:26-45, 98-105`). Ranking in the endpoint is `fit desc, then candidate_id` for a stable
tie-break (`app/api/requisitions.py:265`).

**What is NOT in the fit:** no recency term, no experience-years term, no domain/seniority term, no
authenticity signal. `total_experience_years` *is* parsed (§3) but is **never** fed into the fit number.

### JD completeness (`app/matching/score.py:108-159`)

A separate deterministic 0–100 rating. Weighted checks summing to 100 (`_COMPLETENESS_CHECKS`, `score.py:126-133`):
`title`(15), `location`(10), `employment_type`(10), `jd_text`(15, requires ≥200 chars), `core_skills`(30,
requires ≥3 core skills), `nice_skills`(20, requires ≥1 nice skill). Returns score + per-item `present`/`hint`.

### Advisory review flags (`app/matching/flags.py`)

Four deterministic data-quality rules over `parsed_jsonb` (`flags.py:32-79`): `no_contact` (high, no email+phone),
`no_skills_detected` (medium), `sparse_resume` (low, `< 500` chars), `no_experience_signal` (low). Explicitly
**advisory only, never auto-reject, never folded into fit, never client-facing**, and explicitly **NOT fraud
detection** (`flags.py:1-8`).

### Gap vs the docs / mock
The rich composite the docs and the **mock UI** advertise — sub-scores (Core coverage 0.35, Depth & recency 0.2,
Domain match 0.15, Experience level 0.15, Nice 0.15), tiered screening questions, GREEN/AMBER/RED triage — exists
**only as static fixture data** in `web/lib/sample-data.ts:366-390` (`matchDetail`). It is **not implemented** in
the backend. The real backend matcher is the 0.8/0.2 skill-overlap above and nothing else. The `score`/`scoring_run`
tables that would persist a composite are never written (§7).

---

## 3. Parsing + Skills

**Implemented**, deterministic, local (no network, no LLM). Source: `services/api/app/parsing/`.

### Text extraction (`parsing/extract.py`)
Bytes → text, routed by content-type → filename → magic bytes (`choose_method`, `extract.py:38-46`): `%PDF-`
magic / `.pdf` / `application/pdf` → **pdf** (lazy `pypdf`); `.docx` / the docx MIME → **docx** (lazy
`python-docx`); else **text** (`utf-8`, `errors="replace"`). PDF/DOCX parsers are imported lazily so unit tests
run without them; a corrupt/encrypted binary **degrades to empty text rather than crashing** (`extract.py:74-89`).

### Field extraction regexes (`parsing/resume.py:27-35`, verbatim)

```python
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)")
_URL_RE = re.compile(r"https?://([A-Za-z0-9.-]+)", re.IGNORECASE)
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_EXPLICIT_YEARS_RE = re.compile(r"(\d{1,2})\+?\s*years?\b", re.IGNORECASE)
_RANGE_RE = re.compile(
    r"\b((?:19|20)\d{2})\s*(?:-|–|—|to|until|through)\s*((?:19|20)\d{2}|present|current)\b",
    re.IGNORECASE,
)
```

**Experience estimate** (`_experience_years`, `resume.py:74-97`): max of explicit "N years" mentions and dated
ranges; open-ended ranges (`2016 – present`) are anchored to the **latest year mentioned in the document** (not
the wall clock), so a parse is reproducible. Returns the max signal or `None`.

**PII boundary** (`resume.py:50-60`): the persisted `parsed_jsonb` carries **only non-identifying signal** —
`skills`, `total_experience_years`, `link_domains`, `contact: {has_email, has_phone}` (presence booleans only,
never the raw values), `stats: {text_chars}`, `extraction_method`, `parser_version`. Raw email/phone are detected
but **never written** to `parsed_jsonb`.

### CORE/NICE inference — **there is none**
The JD skill suggester (`POST /requisitions/{id}/extract-skills`, `app/api/requisitions.py:175-189`) runs the same
lexicon over `jd_text` and returns **every** found skill as `tier="core", weight=1.0, sort_order=i`:

```python
suggested = [
    JdSkillIn(name=name, tier="core", weight=1.0, sort_order=i)
    for i, name in enumerate(find_skills(req.jd_text))
]
```

So **all suggested skills default to CORE at weight 1.0**; there is no must-have-vs-nice classification or weight
inference. The recruiter re-tiers/re-weights via `PUT /requisitions/{id}/skills` (advisory; suggestions are never
persisted until confirmed). The `jd_skill` rows the recruiter saves are the rubric the matcher reads.

### Seed skills dictionary (`parsing/skills.py:18-72`)
`SKILL_DICTIONARY_VERSION = "skills@1"`. A fixed, precision-biased `canonical → aliases` map of **49 skills**
(verbatim list):

`Python, JavaScript, TypeScript, Java, Go (alias "golang"), Rust, C++ (c++/cpp), C# (c#/csharp), Ruby, PHP,
Swift, Kotlin, Scala, SQL, PostgreSQL (postgres), MySQL, MongoDB, Redis, React (reactjs/react.js), Next.js
(nextjs), Vue (vue.js/vuejs), Angular, Node.js (nodejs), Django, FastAPI, Flask, Spring (spring boot/springboot),
AWS (amazon web services), GCP (google cloud), Azure, Docker, Kubernetes (k8s), Terraform, Git, GraphQL, Kafka,
Spark (apache spark), Machine Learning, Deep Learning, TensorFlow, PyTorch, Pandas, NumPy, Linux, Tableau,
Power BI (powerbi), Salesforce, Figma, Excel (microsoft excel)`.

Matching is case-insensitive and **edge-bounded on alphanumerics only** (so `C++`, `C#`, `Node.js`, `k8s.` match
without `\b` misfiring on punctuation), via one compiled regex per canonical skill (`skills.py:75-101`). Ambiguous
bare aliases (lone `"go"`, `"ml"`) are deliberately omitted to avoid false positives.

### Parse pipeline + provenance (`parsing/pipeline.py`)
`parse_and_store` runs in one RLS-scoped tenant transaction: read immutable bytes from object storage → parse →
write a **`parse_run`** row first → pin `parse_run_id` + `parsed_jsonb` on the resume → append an audit event
(metadata only, never PII). `input_hash` = the resume `content_hash` (`pipeline.py:29-68`). This is genuinely wired
and tested.

---

## 4. Prompts + Router

### Prompt templates (`packages/prompts/`)
Exactly **one** template exists, and it is a **placeholder**: `packages/prompts/echo/v1/prompt.md` (verbatim):

```markdown
# Echo task — v1

Return a JSON object that echoes the provided text under the key `echo`.

This Phase 0 task exercises the router seam — redaction pre-hook, provider policy,
versioned-prompt loading, structured-output validation, content-hash cache, and
provenance stamping — without invoking a real model. Its path here
(`echo/v1`) IS its `prompt_version`; git history is the version pin.
```

`packages/prompts/README.md` confirms it is "**Empty of real prompts**" and that WP 0.9 only exercises a "trivial
echo/redaction-round-trip task — not real JD extraction or scoring (those are Phase 1)." **There are no JD-extraction,
fitment-scoring, or question-generation prompts.**

### Router backend: echo, not a real model (`app/router/`)
`generate()` (`app/router/generate.py:66-150`) defaults to **`EchoBackend`** (`generate.py:79`), which just returns
`{"echo": redacted_input["text"]}` and records what it saw to prove redaction-before-egress
(`app/router/backends.py:20-34`). A real `LiteLLMBackend` (lazy `litellm`, `temperature=0`, JSON response)
**exists** (`backends.py:37-55`) **but is never instantiated by any product code path** — only exported and used in
tests. The provider registry contains **only the local `echo` provider** (`app/router/policy.py:37-38`); real
frontier providers are "added once DPAs are signed." So **no real model or embedding call happens anywhere in the
live app.**

The router seam itself is real and does work end-to-end with the echo backend: mandatory Presidio redaction pre-hook
→ fail-closed ZDR/no-train provider policy → versioned-prompt load → JSON-schema validation with one self-repair
retry → token rehydrate → content-hash cache → `generation_run` provenance stamp + trace id (`generate.py:82-150`).
**But `generate()` is only ever called from `services/api/tests/test_router.py`** — no product endpoint calls it.

### Redaction (real, Presidio) — `app/redaction/engine.py`
Genuinely implemented: Microsoft Presidio `AnalyzerEngine` + spaCy `en_core_web_sm` NER (`engine.py:24-79`).
Policy: **strip** (non-reversible) SSN/credit-card/passport/licence/bank/IBAN/medical/crypto/`NRP`
(`engine.py:28-40`); **tokenize** (reversible, coreference-preserving) PERSON/EMAIL/PHONE/LOCATION/ORG/URL/IP
(`engine.py:42-50`); **keep** capability incl. `DATE_TIME`. Emits original-text offset spans so explainability
citations resolve (`engine.py:53-61, 126-140`). It is wired into the router but, as above, the router isn't called
by the product yet.

---

## 5. API Contract

Source of truth: FastAPI app (`services/api/app/main.py` + `app/api/*`), emitted to
`packages/contracts/openapi.json` (OpenAPI **3.1.0**, title "ManFriday Internal API", version 0.0.0) and turned into
TS types at `packages/contracts/src/generated/schema.ts`.

**Total: 23 operations.** All 23 are **IMPLEMENTED** as real handlers backed by the RLS database (none are stubs that
return canned data), with two explicitly-labelled exceptions noted below. Every product route is RLS-scoped via
`TenantSession`/`Claims` (`app/api/deps.py`).

| # | Method + Path | operationId | Request schema | Response schema | Status |
|---|---|---|---|---|---|
| 1 | GET `/health` | getHealth | — | HealthStatus | IMPLEMENTED |
| 2 | GET `/whoami` | whoami | — | WhoAmI | IMPLEMENTED (auth smoke test) |
| 3 | GET `/dashboard/stats` | getDashboardStats | — | DashboardStats | IMPLEMENTED |
| 4 | GET `/team` | listTeamMembers | — | TeamMemberOut[] | IMPLEMENTED |
| 5 | GET `/plan` | getPlan | — | PlanOut | IMPLEMENTED but **PLACEHOLDER DATA** — returns hard-coded "Team / $29 / /user/mo"; billing not wired (`app/api/dashboard.py:71-80`) |
| 6 | GET `/candidates` | listCandidates | — | CandidateSummary[] | IMPLEMENTED (decrypts name; no contact) |
| 7 | POST `/candidates` | createCandidate | CandidateCreate | CandidateDetail | IMPLEMENTED (encrypts PII) |
| 8 | GET `/candidates/{candidate_id}` | getCandidate | — | CandidateDetail | IMPLEMENTED (decrypts contact) |
| 9 | POST `/candidates/{candidate_id}/resumes` | uploadResume | ResumeUploadIn | ResumeUploadOut | IMPLEMENTED (ingest→store→parse→audit) |
| 10 | POST `/candidates/bulk` | bulkUploadResumes | BulkResumeIn | BulkResumeOut | IMPLEMENTED (one candidate per file) |
| 11 | POST `/candidates/{candidate_id}/consent` | recordConsent | ConsentEventIn | CandidateDetail | IMPLEMENTED (ledger + state) |
| 12 | GET `/requisitions` | listRequisitions | — | RequisitionOut[] | IMPLEMENTED |
| 13 | POST `/requisitions` | createRequisition | RequisitionCreate | RequisitionOut | IMPLEMENTED |
| 14 | GET `/requisitions/{requisition_id}` | getRequisition | — | RequisitionOut | IMPLEMENTED |
| 15 | GET `/requisitions/{requisition_id}/skills` | getJdSkills | — | JdSkillOut[] | IMPLEMENTED |
| 16 | PUT `/requisitions/{requisition_id}/skills` | replaceJdSkills | JdSkillsReplace | JdSkillOut[] | IMPLEMENTED (confirm rubric) |
| 17 | POST `/requisitions/{requisition_id}/extract-skills` | extractJdSkills | — | ExtractedSkillsOut | IMPLEMENTED (advisory, all → core@1.0) |
| 18 | GET `/requisitions/{requisition_id}/completeness` | getJdCompleteness | — | JdCompletenessOut | IMPLEMENTED |
| 19 | GET `/requisitions/{requisition_id}/matches` | getRequisitionMatches | — | RequisitionMatchesOut | IMPLEMENTED (skill-overlap) |
| 20 | GET `/proposals` | listProposals | — (query `candidate_id`) | ProposalOut[] | IMPLEMENTED |
| 21 | POST `/proposals` | createProposal | ProposalCreate | ProposalOut | IMPLEMENTED |
| 22 | GET `/outreach/stats` | getOutreachStats | — | OutreachStatsOut | IMPLEMENTED (consent breakdown) |
| 23 | GET `/outreach/audience` | getAudience | — (query `requisition_id`, `min_fit`) | AudienceOut | IMPLEMENTED (eligibility; **no send**) |

**Notably absent (PLANNED-NOT-BUILT) endpoints** referenced by docs/mock but with **no route**: any email **send**/
campaign/template endpoint (deliberately gated — `app/api/outreach.py:1-10`), screening-question / sub-score /
GREEN-AMBER-RED triage endpoints (Phase 2), a bulk-import **review-queue** query, and candidate **update/delete**
(only create/upload/consent exist). Request bodies are JSON; résumé bytes ride as base64 in `ResumeUploadIn.content_b64`
(no multipart). 34 component schemas total (incl. `HTTPValidationError`/`ValidationError`).

---

## 6. Frontend Data Contract

The Next.js UI is fully built against a **mock data seam**; this is the shape a TS backend must satisfy.

### The switch (`web/lib/data/index.ts:14-17`)
```ts
export const dataSource: "mock" | "api" =
  process.env.DATA_SOURCE === "api" ? "api" : "mock";
const provider: DataProvider = dataSource === "api" ? apiProvider : mockProvider;
```
Default is **mock** (anything other than `DATA_SOURCE=api`). Pages import only from `@/lib/data` and never touch a
provider directly. The contract `DataProvider` (`web/lib/data/contract.ts`) has **20 methods**; both `mockProvider`
(`web/lib/data/mock.ts`) and `apiProvider` (`web/lib/data/api.ts`) implement it, so they cannot structurally drift.

### Display types the UI expects (`web/lib/sample-data.ts`)
These are the **display/read-model** types — richer than the API actually returns (the gaps are bridged or left
blank by `api.ts`, never faked). Key shapes:

- `Candidate { id, name, title, location, email, skills[], status: "new"|"contacted"|"screening"|"submitted",
  resumeVersions: number, lastActivity, consent: boolean }`
- `CandidateDetail { phone, workAuth, availability, desiredComp, summary, resumeVersions: ResumeVersion[],
  activity: ActivityEvent[], consentSource, consentUpdated }`
- `ResumeVersion { version, filename, uploadedAt, sizeKb, isCurrent, contentHash }`
- `Requisition { id, title, client, location, employmentType, openings, inPipeline, status: "open"|"on_hold"|"filled",
  postedAt }`
- `JdSkill { name, tier: "core"|"nice", weight }` · `CompletenessItem { label, present, hint? }` ·
  `JdCompleteness { score, items[] }`
- `Match { candidateId, fit, coreCovered, coreTotal, flags, topFlag? }`; `MatchRow = Match & { candidate: Candidate }`
- `ReviewFlag { severity: "high"|"medium"|"low", label, detail }`
- `Proposal { id, client, req, date, outcome: "proposed"|"interviewing"|"rejected"|"hired", reason? }`
- `MatchDetail` (fixture-only) `{ candidate, candidateId, req, reqId, coreSkills[], niceSkills[], subScores: SubScore[],
  reviewFlags[], questions: ScreeningQuestion[] }` — `SubScore { label, weight, score, evidence }`,
  `ScreeningQuestion { tier: "Simple"|"Medium"|"Hard", q }`
- Outreach: `Campaign { …, openRate, replyRate, status, … }`, `EmailTemplate`, `Audience { total, optedIn,
  pendingConsent, unsubscribed }`, `OutreachStats { sent30d, avgOpenRate, avgReplyRate, unsubscribes30d }`
- Settings: `Plan { name, price, unit, seatsUsed, seatsTotal, renews }`, `TeamMember { id, name, email, role:
  "Admin"|"Recruiter"|"Viewer", status: "active"|"invited", twoFactor }`, `Stats { candidates, activeReqs,
  emailsSent30d, responseRate }`
- Derived: `Stats/Plan/Audience/OutreachStats/JdCompleteness/MatchDetail = typeof <fixture>` (`sample-data.ts:397-402`).

### Screens / pages that consume data (`web/app/`)
| Page | Data functions used |
|---|---|
| `/` (`page.tsx`) | getStats, listCandidates, listRequisitions |
| `/candidates` (`candidates/page.tsx`) | getStats, listCandidates |
| `/candidates/[id]` | getCandidate, getCandidateDetail, getProposalHistory, getReviewFlags |
| `/candidates/import` | getImportQueue |
| `/requisitions` | listRequisitions |
| `/requisitions/[id]` | getRequisition, getJdSkills, getJdCompleteness, getTopMatches |
| `/outreach` | getAudience, getEmailTemplates, getOutreachStats, listCampaigns |
| `/screening` | getMatchDetail |
| `/settings` | getPlan, listTeamMembers |
| `/login`, `/layout` | (no data) |

### `api` provider: honest bridge with explicit gaps (`web/lib/data/api.ts`)
Runs server-side only; reads the iron-session cookie, mints a 5-min EdDSA internal JWT per request, calls FastAPI
(`api.ts:48-73`). It adapts the compliant API shapes to the display types and **leaves unmodeled fields empty rather
than fabricating** (e.g. `title`, `location`, `summary`, `workAuth`, `desiredComp`, filename, sizeKb, activity feed,
send metrics, per-seat billing → `""`/`0`/`"—"`/`[]`, each annotated `// not modeled`). Five methods that have **no
backend** `throw` a clear "not available in this phase" error (`phase2(...)`, `api.ts:44-46`):
**`getImportQueue`** (no review-queue query), **`getMatchDetail`** (Phase-2 screening loop), **`listCampaigns`**,
**`getEmailTemplates`**, **`getOutreachStats`** (all need the email-send/comms service). So with `DATA_SOURCE=api`,
the `/screening`, `/candidates/import`, and parts of `/outreach` pages would error — they are mock-only today.

---

## 7. Real-vs-Stubbed Summary

| Feature / module | State | Evidence |
|---|---|---|
| Auth: in-house EdDSA JWT mint/verify, TOTP | **WORKING (tested)** | `app/auth/*`, `test_auth.py` (7 tests); web mints server-side (`web/lib/auth/*`) |
| RLS tenant isolation (incl. pgvector KNN, worker, PgBouncer) | **WORKING (tested)** | `db/session.py`, migration RLS, `test_rls_isolation.py` + `test_product_rls_isolation.py` + `test_leak_probe.py` (8 tests); validated on live Supabase |
| Résumé upload → immutable store → audit | **WORKING (tested)** | `app/ingestion.py`, `app/resumes.py`, `app/storage/*`, `test_ingestion.py`/`test_resume.py` |
| Append-only hash-chained audit | **WORKING (tested)** | `app/audit/chain.py`, `test_audit_chain.py` (3 tests) |
| PII envelope encryption + crypto-shred | **WORKING (tested)** | `app/crypto/*`, `tenant_key`, `test_pii_encryption.py` |
| Deterministic résumé/JD parsing + skills lexicon | **WORKING (tested)** | `app/parsing/*`, `test_parsing.py` (12) + `test_resume.py` + `test_parse_pipeline.py` |
| Parse provenance (`parse_run`) | **WORKING (tested)** | `app/parsing/pipeline.py`, `app/provenance/runs.py`, `test_provenance.py` |
| Skill-overlap matching + JD completeness + review flags | **WORKING (tested)** | `app/matching/*`, `test_matching.py` (10) |
| Product REST endpoints (the 23 ops) | **WORKING (tested)** | `app/api/*`, `test_api_product.py` (8); OpenAPI drift-gated |
| Redaction (Presidio) | **WORKING (tested) but not on a live LLM path** | `app/redaction/engine.py`, `test_redaction.py`; only the test-only router calls it |
| Multi-model router seam | **WORKING (tested) — ECHO ONLY** | `app/router/*`, `test_router.py`; `EchoBackend` default, `LiteLLMBackend` never invoked, registry has only `echo` |
| Real LLM / embedding generation | **NOT BUILT** | no provider in registry; `generate()` never called by product code; no embedding-generation code anywhere |
| Embeddings / pgvector retrieval | **SCAFFOLDED** | `embedding` table + HNSW index + RLS + leak-probe test exist; **only the test fixture inserts rows**; no app writes/reads vectors |
| Scoring provenance (`scoring_run`, `score`) | **SCAFFOLDED-EMPTY** | tables + `create_scoring_run`/`add_score` helpers exist but are **called only in tests**; matching returns fit in the HTTP response without persisting |
| Generation provenance (`generation_run`) | **SCAFFOLDED** | written only inside the test-only `router.generate()` path |
| Outreach / email send | **NOT BUILT (deliberately gated)** | `app/api/outreach.py` computes audience/consent only; no send/campaign/template route |
| Composite fitment, screening Q&A, GREEN/AMBER/RED triage | **NOT BUILT (mock fixture only)** | `web/lib/sample-data.ts` `matchDetail`; no backend |
| Demographics / adverse-impact monitoring | **NOT BUILT** | no table, no code |
| Async worker (Arq) ingest + parse jobs | **WORKING (tested)** | `services/workers/worker/settings.py`, `test_worker.py` (2) |
| Telemetry (OTel/Sentry/flags) | **WORKING (tested, scaffolding)** | `app/telemetry/*`, `test_telemetry.py` (5) |

**Test totals:** **85 test functions** across 19 files (`services/api/tests/*` + `services/workers/tests/`).

### Plain-English: what genuinely works end-to-end today

A recruiter (authenticated via in-house EdDSA JWT, RLS-scoped to their org) can create candidates with
envelope-encrypted contact PII, upload a résumé (size-capped, EICAR-stub malware-scanned, stored immutably and
versioned, audited on a hash chain), have it **deterministically parsed** into non-PII skills + an experience
estimate with a reproducible `parse_run`, create requisitions, get **all** JD skills auto-suggested as CORE@1.0
and then confirm/re-tier/re-weight them, and rank candidates against a req by a **transparent 0.8·core + 0.2·nice
skill-overlap** fit (plus a JD-completeness score and advisory data-quality flags). They can record proposals/
outcomes and view a consent-based outreach **audience** (but cannot send email). Every write is RLS-isolated and
audited; isolation was verified against live Supabase with synthetic data.

What is **scaffolding, not product**: there is **no real LLM or embedding call anywhere** — the model router runs
an echo backend, the only prompt is a placeholder, and pgvector/`embedding` is an empty table with an index. The
`scoring_run`/`score`/`generation_run` provenance tables and the composite-fitment/screening-question/GREEN-AMBER-RED
features the docs and mock UI describe are **not implemented** (the rich `matchDetail` is a static fixture). Email
send, demographics/adverse-impact monitoring, and candidate update/delete are absent. Redaction (Presidio) is real
but sits only on the unused router path. So the working core is a **compliant, deterministic résumé-DB + JD-skill-
overlap matching + consent/outreach-audience CRM** on a hardened RLS/audit/crypto spine — the AI/LLM "intelligence"
layer is seam-only.

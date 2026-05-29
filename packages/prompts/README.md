# `@manfriday/prompts` — versioned prompt templates

**Git is the version pin.** Every prompt the multi-model router uses lives here
under a stable path; the committed content + path resolve to the `prompt_version`
that gets stamped into the `*_run` provenance rows (invariant #2). A prompt is
never edited in place once a run has cited it — add a new version.

Convention (filled as tasks come online):

```
packages/prompts/
  <task>/
    v1/prompt.md
    v2/prompt.md
```

**Empty of real prompts in WP 0.1.** WP 0.9 wires the router to load from here
and exercises it with a trivial echo/redaction-round-trip task — not real JD
extraction or scoring (those are Phase 1).

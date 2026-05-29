# Echo task — v1

Return a JSON object that echoes the provided text under the key `echo`.

This Phase 0 task exercises the router seam — redaction pre-hook, provider policy,
versioned-prompt loading, structured-output validation, content-hash cache, and
provenance stamping — without invoking a real model. Its path here
(`echo/v1`) IS its `prompt_version`; git history is the version pin.

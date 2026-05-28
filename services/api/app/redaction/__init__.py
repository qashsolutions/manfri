"""PII redaction/tokenization stage — sits between the app and the router.

Empty in WP 0.1. Filled by WP 0.8: Microsoft Presidio + resume-specific
recognizers detect PII; entities are *tokenized* (not stripped) with a stable,
per-request reversible map held only in our memory/DB, so coreference survives
and outputs can be rehydrated. Redaction is **offset-preserving** so later
explainability citations still resolve. SSN/DOB/photos/work-auth/protected-class
signals are always stripped, never tokenized-for-send.

Invariant #4: no service calls an LLM provider without passing through here.
"""

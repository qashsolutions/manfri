"""Provider policy for the model router (WP 0.9).

Routes a task to a compliant provider by data sensitivity. C2/C3 data may only go
to ZDR + no-training providers (per signed DPAs); the router fails CLOSED if none
qualifies. The local 'echo' provider has no egress, so it's exempt from the ZDR
egress rule. Real frontier providers are registered with their ZDR/DPA status as
they are contracted.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum


class Sensitivity(IntEnum):
    C1_PUBLIC = 1
    C2_INTERNAL = 2
    C3_RESTRICTED = 3  # candidate PII


@dataclass(frozen=True)
class Provider:
    name: str
    model_id: str
    zdr: bool  # zero data retention (contractual)
    no_training: bool  # provider won't train on our data
    local: bool = False  # local / no-egress (e.g. echo) — exempt from ZDR egress rules


class NoCompliantProviderError(RuntimeError):
    """No registered provider satisfies the policy for a task's sensitivity."""


# Phase 0 registry: only the local echo provider. Frontier providers are added
# with zdr=True / no_training=True once DPAs are signed.
ECHO_PROVIDER = Provider(name="echo", model_id="echo-0", zdr=True, no_training=True, local=True)
DEFAULT_REGISTRY: tuple[Provider, ...] = (ECHO_PROVIDER,)


def select_provider(
    sensitivity: Sensitivity, registry: tuple[Provider, ...] = DEFAULT_REGISTRY
) -> Provider:
    """Pick a compliant provider or fail closed.

    C2/C3 require ZDR + no-training unless the provider is local (no egress).
    """
    requires_zdr = sensitivity >= Sensitivity.C2_INTERNAL
    for provider in registry:
        if requires_zdr and not provider.local and not (provider.zdr and provider.no_training):
            continue
        return provider
    raise NoCompliantProviderError(f"no provider satisfies sensitivity {sensitivity.name}")

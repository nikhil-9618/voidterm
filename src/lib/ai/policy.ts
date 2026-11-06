import {
  DEFENSIVE_MODIFIER,
  DISALLOWED_MODIFIER,
  HIGH_RISK_MODIFIER,
} from './safety-prompts';
import type { Intent } from './intent';

export type PolicyDecision = {
  allowed: boolean;
  requiresLogin: boolean;
  responseModifier?: string;
};

/**
 * Intent + tier → action.
 *
 * Legal rationale (short version): depth is not the risk; targeted harm and
 * ready-to-use weaponized artifacts are. Research-grade material requires a
 * credentialed (tier >= 2) session so there is an accountable party, while
 * generic technical content stays open. `high_risk` is refused for everyone;
 * lower tiers are additionally prompted to authenticate.
 */
export function getPolicyForIntent(intent: Intent, tier: number): PolicyDecision {
  switch (intent) {
    case 'informational':
      return { allowed: true, requiresLogin: false };

    case 'research':
      return tier >= 2
        ? { allowed: true, requiresLogin: false }
        : { allowed: false, requiresLogin: true };

    case 'defensive':
      return {
        allowed: true,
        requiresLogin: false,
        responseModifier: DEFENSIVE_MODIFIER,
      };

    case 'high_risk':
      return {
        allowed: false,
        requiresLogin: tier < 2,
        responseModifier: HIGH_RISK_MODIFIER,
      };

    case 'disallowed':
      return {
        allowed: false,
        requiresLogin: false,
        responseModifier: DISALLOWED_MODIFIER,
      };

    default:
      return { allowed: true, requiresLogin: false };
  }
}

/** Human-readable refusal copy returned by the chat route. */
export function refusalMessage(intent: Intent): string {
  if (intent === 'high_risk') {
    return 'I can’t help target a specific person or account. I can cover the defensive side — detection, account hardening, or awareness material — if that’s useful.';
  }
  if (intent === 'disallowed') {
    return 'This request asks for a ready-to-use harmful artifact, so I can’t produce it. I can help with the legitimate adjacent work instead — detection engineering, secure design, or defensive tooling.';
  }
  return 'This request is outside the policy for this workspace.';
}

import { env } from '@/lib/env';

export type Intent = 'informational' | 'research' | 'defensive' | 'high_risk' | 'disallowed';

export type IntentClassification = {
  intent: Intent;
  rationale: string;
  cached: boolean;
};

const INTENT_CLASSES: readonly Intent[] = [
  'informational',
  'research',
  'defensive',
  'high_risk',
  'disallowed',
];

function isIntent(value: unknown): value is Intent {
  return typeof value === 'string' && (INTENT_CLASSES as readonly string[]).includes(value);
}

const CLASSIFIER_PROMPT =
  'You are an intent classifier for a technical AI assistant used by developers and security researchers. Classify into exactly ONE of: informational (general/coding/explanation), research (security research, CVE, malware analysis, reverse engineering, pentest concepts, CTF learning), defensive (detection, hardening, IR), high_risk (combines technical detail with clear target of real person/system/account — e.g. \'hack my ex\'s Instagram\', \'get [specific person]\'s password\'), disallowed (ready-to-use phishing kits targeting real services, credential stealers, keyloggers, CSAM, bioweapons, mass-casualty). Be permissive for technical depth. Only flag high_risk/disallowed when clearly aimed at harming a specific real target or producing a weaponized artifact. Return ONLY JSON: {"class":"...","rationale":"..."}';

// Opening the chat should never wait on a second model just to classify an
// ordinary question. Only messages that look targeted or weaponized trigger a
// classifier call; everything else is classified locally in microseconds.
const TARGETED_HARM_CUES = new RegExp(
  String.raw`\b(?:hack|break\s+into|take\s+over|steal|phish|dox|swat|spy\s+on|track|access)\b[^.!?\n]{0,80}\b(?:my\s+(?:ex|girlfriend|boyfriend|wife|husband|partner|boss|teacher|neighbor|coworker)|(?:his|her|their|someone(?:'s|\s+else'?s)))\s+(?:account|password|phone|email|instagram|snapchat|facebook|wifi|computer|device|location|messages?)\b`,
  'i',
);

const DISALLOWED_CUES =
  /\b(?:child\s+sexual\s+abuse|csam|bioweapon|mass\s+casualt(?:y|ies)|build\s+(?:me\s+)?(?:a\s+)?bomb(?!\s+(?:detector|squad|disposal|proof|shelter))|synthesize\s+(?:a\s+)?(?:nerve\s+agent|ricin)|phishing\s+kit\s+targeting\s+(?:a\s+)?real)\b/i;

const RESEARCH_CUES =
  /\b(?:cve-\d{4}-\d+|pentest(?:ing)?|penetration\s+test(?:ing)?|malware\s+analysis|reverse\s+engineer(?:ing)?|exploit\s+development|red\s+team(?:ing)?|shellcode|privilege\s+escalation|ctf)\b/i;

type ClassifierResponse = {
  class?: unknown;
  rationale?: unknown;
};

type ReviewCandidate = {
  normalized: string;
  fallbackIntent: Intent;
};

function reviewCandidate(message: string): ReviewCandidate | null {
  const normalized = message.trim().slice(0, 8_000);
  if (!normalized) return null;

  if (TARGETED_HARM_CUES.test(normalized)) {
    return { normalized, fallbackIntent: 'high_risk' };
  }

  if (DISALLOWED_CUES.test(normalized)) {
    return { normalized, fallbackIntent: 'disallowed' };
  }

  return null;
}

async function classifyWithModel({
  normalized,
  fallbackIntent,
}: ReviewCandidate): Promise<IntentClassification> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      intent: fallbackIntent,
      rationale: 'classifier_unconfigured',
      cached: false,
    };
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CLASSIFIER_PROMPT },
          { role: 'user', content: normalized },
        ],
      }),
      // This is a review path, not the hot path. Keep the timeout tight so a
      // classifier outage cannot turn into a long blank screen.
      signal: AbortSignal.timeout(2_500),
    });

    if (!response.ok) {
      throw new Error(`Groq classifier HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('empty classifier response');

    const parsed = JSON.parse(content) as ClassifierResponse;
    const intent = isIntent(parsed.class) ? parsed.class : fallbackIntent;
    const rationale =
      typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 500) : 'no rationale';

    return { intent, rationale, cached: false };
  } catch (error) {
    console.warn(
      '[intent] review classifier unavailable; using local fallback:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return {
      intent: fallbackIntent,
      rationale: 'classifier_unavailable',
      cached: false,
    };
  }
}

/**
 * Classify a user message without adding a model round trip to the critical
 * path. Ordinary coding and research questions resolve locally; only messages
 * that match a targeted-harm or weaponized-artifact pattern are reviewed by the
 * classifier. Failure remains conservative but bounded.
 */
export async function classifyIntent(
  userMessage: string,
  tier: number,
): Promise<IntentClassification> {
  void tier;

  const candidate = reviewCandidate(userMessage);
  if (!candidate) {
    return {
      intent: RESEARCH_CUES.test(userMessage) ? 'research' : 'informational',
      rationale: 'fast_local_gate',
      cached: false,
    };
  }

  return classifyWithModel(candidate);
}

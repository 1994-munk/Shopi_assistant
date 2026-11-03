import type { SafetyFlag } from './types';

export const MAX_MESSAGE_LENGTH = 500;

// Phrases that try to override Shopi's instructions or extract its configuration.
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+|the\s+|your\s+|previous\s+|prior\s+)*(instructions|rules|prompt)/i,
  /system\s+prompt/i,
  /(reveal|show|print|repeat)\s+.*(prompt|instructions)/i,
  /you\s+are\s+now\b/i,
  /pretend\s+(to\s+be|you\s+are)/i,
];

// Card-like digit runs and requests for passwords or bank details. Shopi never needs these.
const PERSONAL_DATA_PATTERNS = [
  /\b(?:\d[ -]?){13,19}\b/,
  /\b(password|passcode|cvv|social security|bank account|sort code)\b/i,
];

// Requests that have nothing to do with grocery shopping.
const OFF_TOPIC_PATTERNS = [
  /\b(weather|stock price|bitcoin|election|politic\w*|lottery|horoscope|homework)\b/i,
  /\b(write|compose)\s+(me\s+)?(a|an)\s+(poem|essay|story|song|letter)\b/i,
];

// Rule-based guardrails that run before any shopping logic. Cheap, deterministic and easy to audit.
export function checkSafety(message: string): SafetyFlag[] {
  const flags: SafetyFlag[] = [];
  if (message.length > MAX_MESSAGE_LENGTH) flags.push('too_long');
  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(message))) flags.push('prompt_injection');
  if (PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(message))) flags.push('personal_data');
  if (OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(message))) flags.push('off_topic');
  return flags;
}

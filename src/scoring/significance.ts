import { EVENT_WEIGHT, SCORING } from "./config";

export type ScoreInput = {
  eventType: string | null;
  eventConfidence: number | null;
  sentiment: number | null;
  /** distinct moments (across the booking) where the same dish family appears */
  recurrenceMoments: number;
  /** days to the nearest proposal / first date / anniversary moment, or null if none */
  daysToKeyMoment: number | null;
  menuMatchConfidence: number | null;
  friendStoryCorroborates?: boolean; // [next]
};

export type ScoreParts = {
  event: number;
  sentiment: number;
  recurrence: number;
  proximity: number;
  menu_match: number;
  friend_story: number;
};

/**
 * significance = min(100, event_weight × event_confidence (≤45) + 15 × max(0, sentiment)
 *   + recurrence (≥3 moments → 15, 2 → 8) + proximity (±1 day of a key moment → 10)
 *   + 5 if a menu item matched at ≥0.7 + 10 if a friend story corroborates [next])   (§7.7)
 */
export function significance(input: ScoreInput): { score: number; parts: ScoreParts } {
  const event = (EVENT_WEIGHT[input.eventType ?? "other"] ?? 5) * Math.max(0, Math.min(1, input.eventConfidence ?? 0));
  const sentiment = SCORING.sentimentMax * Math.max(0, Math.min(1, input.sentiment ?? 0));
  const recurrence = input.recurrenceMoments >= 3 ? SCORING.recurrence.threeOrMore : input.recurrenceMoments === 2 ? SCORING.recurrence.two : 0;
  const proximity = input.daysToKeyMoment !== null && input.daysToKeyMoment <= SCORING.proximityDays ? SCORING.proximityBonus : 0;
  const menu_match = (input.menuMatchConfidence ?? 0) >= SCORING.menuMatchMinConfidence ? SCORING.menuMatchBonus : 0;
  const friend_story = input.friendStoryCorroborates ? SCORING.friendStoryBonus : 0;
  const parts = {
    event: round1(event),
    sentiment: round1(sentiment),
    recurrence,
    proximity,
    menu_match,
    friend_story,
  };
  const score = Math.min(SCORING.max, round1(parts.event + parts.sentiment + recurrence + proximity + menu_match + friend_story));
  return { score, parts };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

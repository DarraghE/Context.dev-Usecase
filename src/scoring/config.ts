/** §7.7 significance weights. Change here only; each component is stored per memory. */
export const EVENT_WEIGHT: Record<string, number> = {
  proposal: 45,
  engagement_celebration: 40,
  first_date: 40,
  anniversary: 30,
  birthday: 20,
  trip: 20,
  holiday_celebration: 15,
  family_gathering: 15,
  everyday: 5,
  other: 5,
};

export const SCORING = {
  sentimentMax: 15,
  recurrence: { threeOrMore: 15, two: 8 },
  proximityBonus: 10,
  proximityDays: 1,
  proximityEvents: ["proposal", "first_date", "anniversary"],
  menuMatchBonus: 5,
  menuMatchMinConfidence: 0.7,
  friendStoryBonus: 10, // [next]
  max: 100,
} as const;

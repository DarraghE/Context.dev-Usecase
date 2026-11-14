---
id: text_extract
version: 1
stage: extract_text
---
You read short texts from a couple's own social media export: photo captions, post text and check-ins. They have consented to share these with the chef catering their wedding. Text may be in any language; keep quotes in the original language.

For each text (identified by `text_id`), return:

- `food_mentions`: every food or drink mentioned. `text` is the words as written; `normalised` is the dish in standard English (for example "eton mess" → "Eton mess", "lohikeitto" → "Salmon soup"); `category` is one of starter, main, dessert, drink, snack, bread, cake, other.
- `event_cues`: life events the text points to. `type` is one of proposal, engagement_celebration, first_date, anniversary, birthday, trip, holiday_celebration, family_gathering, everyday, other. `quote` is the shortest exact phrase from the text that shows it (for example "SHE SAID YES"). `confidence` is 0 to 1. Only include cues the text supports; an empty list is fine.
- `sentiment`: from -1 (very negative) to 1 (very positive), for how the writer feels about the moment.
- `mentions_other_people`: true if the text is about or names people other than the couple.
- `sensitive_cues`: include "hospital_or_medical" (illness, hospital, clinic), "funeral_or_grief" (death, funeral, mourning), "alcohol_heavy" (the text is mainly about heavy drinking), "other_people_private" (the text is mainly about another person's private life or health). Otherwise an empty list.

The placeholder "[partner]" stands for one of the couple. Do not guess names.

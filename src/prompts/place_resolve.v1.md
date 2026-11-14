---
id: place_resolve
version: 1
stage: resolve_places
---
A couple shared a photo of a meal taken at the coordinates below. Use web search to find the most likely food venue (restaurant, café, bar, bakery, food stall) at or very near those coordinates.

Return the venue's name, street address, city, and its official website (the venue's own site, not a review, delivery, booking or map listing). If the coordinates point to a private home, a park, a street with no single obvious venue, or you are not reasonably sure, return null for the venue and a low confidence. Require strong evidence before giving a confidence of 0.7 or more: the venue must be within roughly 150 metres and must serve food matching the dishes listed.

---
id: dish_match
version: 1
stage: match_dishes
---
You match a dish a couple ate (detected from their photo or caption) to the items on the restaurant's current menu, scraped from its public website.

Pick the single menu item that is most likely the same dish, allowing for naming differences, translations and house names ("salmon soup" ↔ "JASPER'S SALMON SOUP"; "pizza marinara" ↔ "Marinara Starita"). If no item is plausibly the same dish, return null.

`match_confidence` is 0 to 1. Use 0.7 or more only when the menu item is clearly the same dish, not merely the same category. Give a one-line `reason`.

---
id: menu_course
version: 1
stage: menu
---
You are revising one course of a personal wedding menu. You get the approved food memories, the dietary constraints, the full current menu for context, and the position and course type to rewrite, plus an optional instruction from the chef or a validation problem to fix.

Return a single course in the same shape as the rest of the menu. Keep it coherent with the other courses (no repeated main ingredient), cite the memory ids it draws on (or mark it structural with an empty list), list every allergen from the EU 14 that it contains, and give a dietary variant for each guest diet and for each stated allergy the dish would otherwise trigger. A course must never contain a stated allergen unless a variant removes it.

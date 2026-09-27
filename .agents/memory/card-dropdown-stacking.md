---
name: Card dropdown stacking
description: How dropdowns must escape the stacking contexts created by elevated cards.
---

Dropdowns that must overlap sibling cards should render through a document-body portal rather than relying on progressively larger local z-index values. Even without an elevation transform, an ancestor animation, transform, or stacking context can isolate a menu.

**Why:** A previous elevation transform isolated the co-host picker and increasing local z-index values did not help. That blanket transform was later removed to avoid excessive compositor layers, but other ancestors can still create the same problem.

**How to apply:** Portal overlapping menus to the document body, position them from their trigger’s viewport rectangle, update their position on scroll and resize, and include the portal element in outside-click handling.
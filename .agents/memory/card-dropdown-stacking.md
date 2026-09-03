---
name: Card dropdown stacking
description: How dropdowns must escape the stacking contexts created by elevated cards.
---

Elevated cards create independent stacking contexts, so a dropdown that must overlap a following card should render through a document-body portal rather than relying on progressively larger z-index values.

**Why:** The shared elevation utility uses a transform for compositor performance. Increasing the co-host picker’s local and parent z-index values still allowed a later elevated card to cover the menu on mobile.

**How to apply:** Portal overlapping menus to the document body, position them from their trigger’s viewport rectangle, update their position on scroll and resize, and include the portal element in outside-click handling.
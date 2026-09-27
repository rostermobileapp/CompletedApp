---
name: Mobile scroll layer budget
description: Preserve tab scroll geometry while keeping mobile compositing work bounded.
---

Keep inactive mobile tab scroll containers mounted with their geometry intact; use visibility rather than hiding their scrollable content's layout. Animate only the outgoing and incoming screens for a tab change, including nonadjacent tabs. Avoid forcing every card and scroll area into a GPU layer with blanket compositor hints.

**Why:** Hiding a scroll container's layout can clamp its scroll offset on mobile WebViews, and animating a wide strip of mounted screens makes long tab jumps paint every intervening page. Broad layer promotion trades ordinary paint work for GPU memory pressure when many cards exist.

**How to apply:** When changing tab rendering or elevation effects, preserve each tab's scroll position and form state, limit animated surfaces to the visible pair, and check scrolling on actual iOS and Android builds before claiming a device-level frame-rate improvement.
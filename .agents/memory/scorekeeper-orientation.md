---
name: Scorekeeper orientation
description: Scorekeeping must remain usable when a mobile WebView cannot report or lock orientation.
---

The scorekeeper does not gate entry on device orientation. It uses responsive portrait and landscape layouts instead of requiring screen.orientation APIs.

**Why:** Mobile WebViews may fail to report rotation or may require fullscreen permissions for orientation locking, leaving scorekeepers trapped behind a rotate prompt.

**How to apply:** Keep orientation a layout preference only; do not restore a blocking rotate overlay or an orientation-lock dependency without a reliable fallback.
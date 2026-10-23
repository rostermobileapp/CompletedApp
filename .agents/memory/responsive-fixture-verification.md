---
name: Responsive fixture verification
description: Avoid false viewport and encoding results when checking protected pages with isolated rendering fixtures.
---

Use a real iframe viewport, not just a fixed-width container, when visually checking isolated renders of authenticated UI. Serve fixture HTML explicitly as UTF-8.

**Why:** A phone-width container inside the screenshot tool's desktop viewport still triggers desktop media queries. Missing HTML charset also corrupts Unicode checkmarks, creating apparent UI defects that do not exist in the application.

**How to apply:** Keep fixtures outside the application's routes and authentication path. Give each iframe the intended device width, retain the real component and compiled CSS, and identify fixture-based verification separately from signed-in or native-device verification.

Keyboard probes must reproduce complete native key input, not only a named key-down event.

**Why:** A focused native button can appear broken in a CDP test when Enter input omits its text/character event; browser-generated click activation then never occurs even though the component is accessible.

**How to apply:** Verify actual focus and send complete key/character/key-up sequences when testing Enter or Space. Distinguish incomplete test input from an application defect.
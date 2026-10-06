---
name: Trivia presentation intent
description: The owner's visual, grading, and push-launch requirements for daily trivia.
---

Daily trivia should be modern and minimalist. Correct answers need striking green feedback; incorrect selections need red feedback while also revealing the correct answer, with labels/icons as well as color.

The trivia collection must match the surrounding Trophy Case, not introduce a separate theme when the app switches to dark mode.

**Why:** The owner rejected bland trivia presentation, subtle result highlights, and a trivia collection that looked unrelated to the rest of the Trophy Case.

**How to apply:** Check the actual surrounding Trophy Case surfaces before restyling trivia; don't assume the app's dark-mode flag means every section should become navy.

Trivia categories must follow the achievement patches' compact, independently expandable category layout and tier grid, with categories collapsed by default. Earned tiers show their own uploaded artwork and open a larger view; locked artwork stays concealed.

**Why:** The owner explicitly requested the same category layout and design as achievement patches, not category tiles that open a separate tier-list popup.

**How to apply:** Preserve this shared presentation when extending trivia categories or patch tiers; changes to Trophy Case category styling should remain consistent across both collections.

The enlarged trivia patch viewer should show only the transparent uploaded PNG over a dimmed backdrop, with an X at the top right. No visible title, stats, card, or inner image panel.

**Why:** The owner explicitly rejected the boxed popup in favor of the patch PNG alone.

**How to apply:** Keep screen-reader labels and accessible dismissal, but don't add visible modal chrome around enlarged trivia artwork.

The owner confirmed that the completed popup looks great after trying its answer flow. Preserve that presentation when changing delivery or performance.

Trivia must grade immediately on the device rather than waiting for server verification.

**Why:** The owner explicitly chose instant on-device results after being told this makes the downloaded answer key inspectable.

**How to apply:** Deliver the key to eligible clients and reveal correctness and explanation on selection. Keep saved answers, streaks, progress, and patch unlocks server-authoritative, and distinguish immediate results from confirmed saves.

Prioritize sharp, readable trivia text over decorative blur or scaling effects.

**Why:** The owner reported that the trivia screen looked blurry and was barely readable.

**How to apply:** Keep the panel opaque and text on an untransformed surface. Use a dimmed background and simple fades; verify readability rather than assuming background effects cannot affect browser rendering.

Reopening completed trivia for presentation review should restore the saved result, not create a fresh attempt.

**Why:** The owner chose saved-result review for production rather than resetting the day's answer and reversing its earned progress.

**How to apply:** Restore the saved selection and authoritative feedback without answer submissions or progress changes. Treat a reset as a separate, explicitly authorized action.

Opening daily trivia from a push must show the trivia interface immediately once the app can render, not wait for unrelated startup work.

**Why:** The owner observed almost 20 seconds between opening a trivia push and seeing the popup, and explicitly required instant opening.

**How to apply:** Keep dashboard loading, progress details, and unresolved birthday/badge checks off trivia's opening path. Preserve protection against overlapping a dialog already on screen and keep answer persistence and awards server-authoritative.

Daily push wording should stay simple and omit the category: title "Daily Hockey Trivia"; message "Today's question is live.  Tap to play!"

**Why:** The owner explicitly requested this category-independent wording.

**How to apply:** Preserve this wording when changing the scheduler or push delivery unless the owner requests new copy.
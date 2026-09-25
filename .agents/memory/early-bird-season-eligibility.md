---
name: Early Bird season eligibility
description: How the all-season 48-hour RSVP rule relates to seasonal awards and game-local time.
---

Early Bird is earned separately for each season only after the season ends and every eligible non-scrimmage game is completed. Include rostered games with no RSVP as failures, as well as explicit substitute RSVPs, and require a Yes response at least 48 hours before each game's start. Past season awards remain history but cannot satisfy another season.

**Why:** Counting only submitted RSVPs rewards missing responses, and awarding before the season ends can reward a player who later misses a game. Scheduled game times are league-local wall-clock timestamps, whereas RSVP updates are stored as UTC timestamps; comparing them directly introduces a timezone-dependent cutoff error.

**How to apply:** Convert game-local starts to UTC before evaluating RSVP deadlines. Show eligibility for the selected season alone, keep historical awards separate, and seed older completed seasons without announcing historic achievements. The current RSVP table records only its latest state and timestamp, so it cannot reconstruct an earlier Yes if the response changed later.
# Gallery traces (T92, #159)

These are live traces (kept here, not in traces/gallery/, so `make judge` and the app list do not switch to them) from Nov 19, 2026 for the 8 gallery claims in `eval/gallery/answers.md`. The answers were written and hashed before any trace ran. Grading (HIT, MISS or PARTIAL against each claim's pre-written criteria) goes in `docs/gallery.md`.

- G6 has no trace: Token Factory returned bad_response within a second, twice, and nothing was spent. It is recorded as a failure, not dropped.
- G4 ends ORIGIN_FOUND on beyondgreenspace.net/published-papers, whose metadata date (2019-01-15) is earlier than the paper it lists (Scientific Reports, June 13, 2019). This is a false origin with a false earlier date, kept in as found.

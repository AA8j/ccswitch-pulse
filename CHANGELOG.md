# Changelog

## v0.1.8 — 2026-10-12

- Replaced four share themes with two integrated reports: Calls and Tokens.
- Combined model shares and per-model trend lines using the same metric, colors and complete range.
- Added full year/timezone context, readable time/value ticks, monotone curves and clear aggregation labels.
- Preserved daily per-model token totals for sharing even when the dashboard is weekly; removed the last-20-days truncation.
- Made rounded percentages add up to 100%, handled zero tokens honestly, and preserved privacy switches.
- Refreshed bilingual, light/dark documentation images and added model/color/axis/privacy regression checks.

## v0.1.7 — 2026-10-12

- Made selected-range totals the default ranking, including all historical data for All time.
- Added explicit selected-range and replay-bucket scopes, with matching time bounds, metrics and summary labels.
- Kept replay navigation linked to the current bucket while allowing range totals to remain available during playback.
- Fixed hidden models outside Top 5 not appearing when enabled from the ranking, overlapping number animations and obsolete request errors.
- Added API-reconciled ranking, filter, replay, empty-bucket and rapid-switch regressions; refreshed bilingual README images.

## v0.1.6 — 2026-10-12

- Fixed the 1280px cross-platform date-range overflow by wrapping the entire range according to actual content width, not an assumed font-dependent breakpoint.
- Kept all compact-field, padding, alignment and overflow acceptance checks; added wider-font regression coverage.
- Corrected share-card repository-icon spacing and missing model counts.
- Rebuilt bilingual, light/dark README images with complete charts and content-addressed filenames.
- Added reproducible screenshot tooling, version/hash validation and CI failure artifacts.

## v0.1.5 — 2026-10-12

- Removed oversized date-field padding; date and time now use compact, equal-width controls.
- Kept the complete custom range together on narrower desktops, with the Apply action beside the end date.
- Anchored calendars to their field, including window resizing, and added expanded-state and Escape focus handling.
- Prevented chart titles from being squeezed into vertical text at intermediate desktop widths.
- Added five-width, bilingual, dual-theme layout regression checks and refreshed 2× README screenshots.

## v0.1.4 — 2026-10-12

- Replaced the native browser date popup with a themed calendar picker and compact time inputs.
- Added custom-range and narrow-desktop UI regression tests.


## v0.1.3 — 2026-10-11

- Replaced native datetime-local controls with a themed calendar and time picker.
- Added desktop-width layout regression coverage for chart controls and custom ranges.


## v0.1.1 — 2026-10-11

- Added desktop Playwright regression coverage and cross-platform CI checks.
- Added CLI/API smoke testing and reproducible benchmark tooling.
- Improved demo data realism using an aggregated, synthetic model profile.
- Added stable model-specific colors and smoother share-card curves.
- Added schema validation, local-only privacy boundaries, and clearer release documentation.
- Refreshed README screenshots and added Star History.

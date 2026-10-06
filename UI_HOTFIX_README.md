# Mimir v1.0 – responsive monitor and loading ring correction

- Uses the previous v1.0 layout and evaluation bugfix as the baseline.
- The main shell fills tall viewports and pushes the privacy note, SEO links, and footer to the bottom. It continues to grow and scroll when results expand or display height is small.
- Added a single internal animated ring **inside** Find the Worthiness (visible only while loading); previous external ripple disabled. Existing button heartbeat and Cancel functionality preserved.
- No changes to backend APIs, AI prompts, scoring or candidate privacy handling.
- `styles.css` URL changed to `?v=1.0.2` to refresh browser cache; visible app version remains v1.0.
- Run `npm test` and `npm run check` after uploading to GitHub.

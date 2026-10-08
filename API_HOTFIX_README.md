# Mimir Gemini 3.5 Flash-Lite API hotfix

This build removes deprecated Gemini 3.x sampling controls from Interactions API requests.

- Removed `temperature` from live Gemini requests.
- Relies on Gemini 3.5 Flash-Lite default minimal thinking behavior.
- Preserves Fast Brain v2.1 prompts, schemas, deterministic scoring, Odin, visual budgets, and UI.
- Adds safer provider error logging for future API changes.

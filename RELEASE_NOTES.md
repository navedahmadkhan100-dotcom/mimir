# Mimir v4.4.5 — Fast DOCX Visuals

This release fixes the multi-minute visual-preparation stall seen on architecture-heavy DOCX CVs.

## Changed
- DOCX embedded visuals no longer run Tesseract OCR on the normal path.
- Direct CV text PII is still redacted locally before evaluation.
- Embedded PNG/JPEG/WebP diagrams that already fit the backend safety budget are passed directly to Mimir/Gemini without decode/re-encode.
- Oversized/unsupported visuals use image decode + compression only, not OCR.
- The already-open JSZip document is reused between text extraction and visual preparation.
- The UI shows the detected visual count immediately (for example, `8 visuals detected`) before visual payload preparation finishes.
- Evaluation waits at most 6 seconds for any remaining visual preparation, then proceeds with all visuals already ready.

## Privacy trade-off
Practical PII mode redacts direct identifiers from CV text. DOCX embedded technical visuals are no longer OCR-scanned for PII because that OCR path caused severe stalls. This is an intentional speed/fidelity trade-off.

## Intelligence
No changes were made to Claim Model, Evidence Graph, Entailment, Evidence Boundaries, Odin, policy, deterministic scoring, score lineage, or prompt-injection isolation.

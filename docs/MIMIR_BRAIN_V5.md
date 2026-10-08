# Mimir Brain — Qualification Ledger Architecture

> Repository filename retained for compatibility. This document describes the current v1.0 product brain.

## Core principle

Gemini performs semantic extraction and evidence matching. Deterministic JavaScript owns qualification weights, evidence boundaries, dimensions, policy caps and the final numerical score.

## JD flow

`Masked JD -> compact Gemini qualification extraction -> local transport normalization -> deterministic semantic normalization -> Qualification Ledger -> cached frozen JD`

Broad technical / functional / operational categories may exist as descriptive metadata for backward compatibility, but they have **zero authority over scoring**.

Score-bearing qualifications are directly weighted by priority, importance and explicit P1/P2/P3 tier. Rephrased qualifications sharing the same capability group receive one group budget, preventing repetition from inflating the score.

Eligibility constraints are gates. Generic behavioural traits are verification items. Concrete stakeholder delivery responsibilities remain CV-assessable qualifications.

## CV flow

`Masked CV + frozen JD -> compact Gemini evidence extraction -> local quote/provenance verification -> text-first evidence recovery -> evidence semantics -> dimension scoring -> Odin -> deterministic final score`

The provider does not receive Mimir's deep authoritative schemas. Schema-free JSON is normalized and AJV-validated locally.

## Dimensions

Mimir activates only dimensions justified by the JD:

- capability
- responsibility
- context
- scale
- exactness
- lifecycle
- duration
- count
- recency

The word `enterprise` alone does not activate scale. Scale needs explicit magnitude such as enterprise-wide/global/large-scale/multi-country/numeric scope.

## Evidence authority

Role/project and employment-reference evidence can establish responsibility at full authority. Professional summaries may corroborate. Skills inventories cannot independently prove ownership. Visual-only evidence cannot prove candidate authorship/ownership.

## Odin

Odin is a consistency auditor, not a second scoring model. It looks for over-claims and false negatives, including cases where Mimir says ownership is missing while another verified CV quote explicitly proves ownership.

## Transport resilience

Primary path: Interactions JSON MIME, no provider schema.

Fallbacks on provider-format/transient errors:

1. GenerateContent JSON MIME, no provider schema.
2. GenerateContent plain JSON prompt, no provider schema.

All responses are normalized locally. Unknown provider keys are stripped before AJV validation. Known provider calls have bounded attempt timeouts so a broken first route cannot consume the entire request deadline.

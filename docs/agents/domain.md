# Domain Docs

## Before exploring

Read GLOSSARY.md at the repo root and ADRs under docs/adr/ that
touch the area being explored.

If these files do not exist, proceed silently. Domain-modeling work
creates them when terms or decisions are resolved.

## Layout

This repo uses a single-context layout:

- GLOSSARY.md: shared domain vocabulary.
- docs/adr/: architecture decision records.

## Use the glossary's vocabulary

Use the glossary's defined terms in issue titles, proposals,
hypotheses, and test names.

If a needed concept is missing, reconsider whether it belongs to
the domain or record the gap for domain-modeling work.

## Surface ADR conflicts

If a proposal contradicts an existing ADR, identify the ADR and
explain why the decision should be reconsidered.

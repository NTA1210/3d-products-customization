# Phase 1 remaining implementation roadmap

The repository is implemented in small CI-gated slices. Storage uses private Supabase Storage; PostgreSQL remains the application source for metadata/configuration and Redis/BullMQ remains the long-running job queue.

Remaining spec slices after Render/360/AR:

1. P1 AI design suggestions, multi-view provider integration, lifestyle visualization and quota/rate limiting.
2. P1 authoritative manufacturability rules + heavy geometry worker + optional AI explanation.
3. P2 deterministic collection recommendations.
4. P2 Workshop/RFQ entities and authenticated quote-request flow.
5. P2 additional output formats (OBJ/STL) through background conversion jobs.
6. QA/performance/error-boundary/observability pass and full Phase 1 acceptance checklist.

AI suggestions and manufacturing fixes must continue to emit normal `EditorAction` values and pass the same editor validation pipeline before they can be applied.

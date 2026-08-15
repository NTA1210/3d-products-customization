# Implementation status

## P0 implemented
- Supabase private asset storage + signed upload/download.
- BullMQ asset analysis/normalization and export jobs.
- Khronos validation before/after normalization and after export.
- Stable glTF source-index mapping + disconnected island candidates.
- Asset Preparation + validated manifest persistence/import/export.
- Place → Lock → Customize; Action/Constraint/Compatibility/Dependency pipeline; undo/redo.
- Manual dimension/material/color edits.
- Project API, strict version snapshots, project duplicate, export from current/saved configuration.
- Export artifacts stored separately from immutable source GLB.
- Executable domain tests and three required GLB fixture scenarios.

## Remaining P0 polish
- Component translate/rotate/delete/restore controls in the web inspector.
- Web project/version creation and exact reload flow after authentication identity is connected.
- Integration/E2E test covering import → manifest → project → actions → save → reload → export → re-import.

## P1 next
- Variant asset replacement + anchor auto-fit, then Style/Preset transactions.
- Render/multi-view/360.
- AI structured suggestions/visualization with quotas/logging.
- Manufacturability geometry checks.
- AR from exported current configuration.

## P2 next
- Collection recommendation.
- Workshop/RFQ and integration polish.

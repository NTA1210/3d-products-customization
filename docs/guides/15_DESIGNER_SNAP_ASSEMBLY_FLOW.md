# Designer Snap & Assembly Workflow

This guide defines the intended editing flow for professional 3D work. Positioning assistance and persistent assembly relationships are deliberately separate concepts.

## 1. Default: Free Move

The editor starts with Anchor Snap off. `W` / Move behaves freely and does not magnetically pull a part toward another component.

This avoids the most disruptive snap failure mode in DCC tools: the viewport changing the user's intended transform simply because unrelated geometry is nearby.

## 2. Temporary positioning snap

While moving a component, hold **Ctrl** to temporarily arm Anchor Snap.

- Releasing Ctrl restores the previous persistent Snap state.
- Temporary Snap can position and optionally align a part.
- Temporary Snap never creates a persistent attachment relationship by itself.

Use this for quick assembly positioning without changing editor mode.

## 3. Persistent positioning snap

The **Snap** toolbar button (`S` in the Maya/Standard preset) keeps anchor positioning assistance armed across multiple transforms.

When a compatible candidate enters the magnetic radius, the viewport previews the candidate and release snaps the position. This still does **not** create an attachment.

## 4. Attach mode

Use **Attach** (`J`) only when a persistent assembly relationship is intended.

Attach mode automatically arms the same anchor candidate system, but a successful release commits both transform actions and `ATTACH_COMPONENT`.

Attach mode exits after a successful attachment so subsequent moves return to ordinary editing unless the user explicitly arms Attach again. `Esc` cancels Attach mode before a relationship is created.

## 5. Candidate ranking

The runtime does not blindly choose the closest point. Candidates are ranked by:

1. Compatibility.
2. Confirmed semantic anchors.
3. Non-generic connection types.
4. User/manual anchors.
5. Suggested anchors.
6. Auto-generated generic geometry anchors.
7. Distance.

A confirmed `WING_ROOT ↔ WING_MOUNT` pair can therefore outrank a slightly closer generic bounds point.

## 6. Hysteresis / sticky candidate

When two candidates are nearly equivalent, the active candidate remains selected until another candidate becomes materially better. This prevents the target indicator from flickering between two nearby anchors while the mouse is almost stationary.

The current switch threshold is intentionally conservative: a new candidate must improve the ranked distance enough to justify changing target.

## 7. Anchor review states

Anchors carry review metadata:

- `AUTO` — generated from geometry; useful as a fallback but not trusted semantic assembly information.
- `SUGGESTED` — reviewed or inferred as a likely connection point but still needs verification.
- `CONFIRMED` — approved for real assembly workflows.

`confidence` is a 0–1 hint for authoring/review. It does not override explicit compatibility rules.

Manual anchors start as `CONFIRMED` with confidence 1. Auto bounds anchors start as `AUTO` with lower confidence.

## 8. Asset Preparation flow

For a newly imported GLB:

1. Detect components / connected regions.
2. Generate the seven generic bounds anchors where possible.
3. Review component names and roles.
4. Review anchors in Anchor Setup.
5. Rename semantic connections (`LEG_TOP`, `LEG_SOCKET`, `WING_ROOT`, `WING_MOUNT`, etc.).
6. Configure `compatibleTypes`.
7. Set important reviewed anchors to `CONFIRMED`.
8. Save Manifest.

The end designer should not recreate anchors in every editing session.

## 9. Runtime editing flow

Typical positioning only:

1. Select component.
2. `W` Move.
3. Move freely.
4. Hold Ctrl near the desired connection.
5. Inspect the highlighted candidate and gap.
6. Release to snap position.

Typical persistent assembly:

1. Select component.
2. Press `J` or click Attach.
3. Move near a compatible target.
4. Wait for **Ready to attach**.
5. Release.
6. Configuration stores the attachment.

## 10. Existing attachment behavior

Attachments are business state, never Three.js parent/child hierarchy. Runtime editable meshes remain siblings under the neutral component layer.

If the source component of an existing attachment is directly moved or rotated, the current action engine detaches that source relationship because the anchors are no longer aligned. The HUD makes this behavior explicit and exposes a Detach command so designers can express intent before editing.

## 11. Undo / Redo

A positioning snap is one transform history command. An Attach snap is one history command containing the transform plus attachment relationship. Undo therefore restores both position and relationship state deterministically.

## 12. What Snap must never do

- Never attach solely because two objects are spatially close.
- Never re-parent editable Three.js components.
- Never persist an attachment unless Attach mode was explicit.
- Never prefer an incompatible generic point over a valid confirmed semantic connection only because it is a few millimetres closer.
- Never flicker rapidly between equivalent candidates.

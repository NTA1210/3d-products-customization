# Editor attachment direction

The editor must keep runtime component transforms independent. Do not re-parent editable component meshes to represent attachments.

Recommended assembly UX:

1. **Snap toggle** (`S`): enables/disables magnetic snapping while moving a component.
2. **Anchor candidates**: generate six box-face anchors (left/right/top/bottom/front/back) plus center for every component. Explicit manifest anchors can override or add semantic anchors.
3. **Proximity preview**: while dragging, when a source anchor is within a configurable threshold of a target anchor, render the target anchor and distance in mm.
4. **Confirm attachment**: snapping changes only the selected component transform. A separate attachment relation stores `sourceComponentId`, `sourceAnchorId`, `targetComponentId`, `targetAnchorId`, and optional orientation alignment.
5. **Detach**: removes only the relation and preserves current world transform.
6. **Follow behavior**: if an attachment should make a child follow a parent later, resolve that through editor actions/configuration rules, never Three.js parent-child hierarchy.

Suggested V1 modes: `OFF`, `ANCHOR`, `SURFACE`. Grid snapping can remain a separate transform-control option.

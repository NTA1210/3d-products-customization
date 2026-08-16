# Runtime component transform isolation

The source GLB hierarchy is preserved for identity/mapping, but editor component transforms must not inherit from other editor components.

During viewer preparation the runtime component meshes are therefore re-parented under a neutral `Editor Component Layer` as siblings. Their world matrices are captured before any detach and restored relative to the layer afterward. Stable component IDs and Manifest mappings are unchanged.

This prevents moving, rotating, or scaling a parent mesh from implicitly transforming component meshes that were descendants in the source GLB. It also keeps per-component bounding measurements from accidentally including other component descendants.

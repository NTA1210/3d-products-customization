# Authentication, ownership and project versions

The web app uses Supabase Auth sessions. API calls carry `Authorization: Bearer <access-token>` and NestJS verifies each token using Supabase Auth before trusting the user identity.

Protected resources enforce ownership in the application database:
- newly imported `ModelAsset.ownerId` must match the authenticated Supabase user;
- `Project.userId` is always taken from the verified request, never from client JSON;
- asset analysis/manifest/download endpoints query by both asset ID and owner ID;
- job status/artifact endpoints authorize through the related asset owner;
- user presets are scoped to the verified user.

Legacy assets created before this migration may have `ownerId = null`; they are not considered owned by an authenticated user automatically.

The web workspace supports:
1. sign in/sign up;
2. import and prepare a GLB;
3. create a project and initial version;
4. save further configuration versions;
5. load a project or selected version with a fresh signed source-GLB URL;
6. export the current configuration as a validated GLB artifact.

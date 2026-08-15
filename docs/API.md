# API surface

Base URL: `/api`

Implemented persistence-backed routes:
- `GET /health`
- `GET /assets/:id`
- `GET /assets/:id/manifest`
- `PUT /assets/:id/manifest`
- `POST /projects`
- `GET /projects/:id`
- `PUT /projects/:id`
- `POST /projects/:id/versions`
- `GET /projects/:id/versions`
- `GET /materials`
- `GET /materials/:id`

Worker/provider routes currently return `501 Not Implemented` until the production adapter exists:
- `POST /assets/import`
- `POST /assets/:id/analyze`
- `POST /projects/:id/export`
- `POST /projects/:id/manufacturability/check`

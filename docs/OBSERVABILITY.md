# Phase 1 observability

The API exposes Prometheus-compatible metrics at `GET /api/metrics`.

## Security

- Local development may leave `METRICS_BEARER_TOKEN` empty.
- Production/staging should set a strong `METRICS_BEARER_TOKEN` and configure the scraper with `Authorization: Bearer <token>`.
- Browser telemetry is not public. `POST /api/metrics/client` requires the normal Supabase user session and currently accepts only `viewer_load_time`.

## Sampling model

Worker processes run independently from the API, so background-job metrics are derived from persisted PostgreSQL records rather than process-local counters. `METRICS_SAMPLE_LIMIT` controls how many recent rows are sampled per metric family; the default is 10,000 and the accepted range is 100–50,000.

This makes asset, render, export, AI, and manufacturing signals visible even when the responsible worker ran in another process or container. Viewer load timing is client-reported and therefore remains process-local to the API instance unless the deployment's metrics backend aggregates multiple replicas.

## Metric families

- `product3d_asset_total{status}` — recent assets by persisted status.
- `asset_import_duration_seconds` — end-to-end asset lifetime for recent READY/FAILED assets.
- `asset_analysis_duration_seconds` — analyze/normalize job duration.
- `product3d_job_total{type,status}` — recent persisted background jobs.
- `product3d_job_duration_seconds{type,status}` — persisted job lifetime.
- `render_duration_seconds` — render job duration.
- `export_duration_seconds` — export job duration.
- `ai_request_count{type,status}` — recent AI requests.
- `ai_request_failure{type}` — recent failed AI requests.
- `product3d_manufacturability_check_total{status}` — recent manufacturability checks.
- `product3d_render_request_total{mode,quality}` — recent render requests.
- `average_model_triangle_count` — average analyzed triangle count in the sampled assets.
- `viewer_load_time_seconds` — time from a new editor `assetUrl` to the loaded GLB mounting in the Three.js viewer.

## Prometheus example

```yaml
scrape_configs:
  - job_name: product3d-api
    metrics_path: /api/metrics
    scheme: https
    static_configs:
      - targets: [api.example.com]
    authorization:
      type: Bearer
      credentials: ${PRODUCT3D_METRICS_TOKEN}
```

## Suggested alerts/dashboards

Start with:

- failed jobs by `type` and `status`,
- AI failure count,
- p95-equivalent trends calculated by the metrics backend from job durations,
- export/render duration regression,
- asset failure ratio,
- average triangle count growth,
- viewer load-time regression.

The endpoint intentionally exposes raw recent-sample counters/sums rather than claiming production-certified percentiles. The deployment metrics backend should perform rate, ratio, percentile/trend, retention, and alert calculations.

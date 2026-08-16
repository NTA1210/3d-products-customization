# Khả năng quan sát của Phase 1

API cung cấp các metric tương thích Prometheus tại `GET /api/metrics`.

## Bảo mật

- Môi trường phát triển local có thể để trống `METRICS_BEARER_TOKEN`.
- Production/staging nên đặt một `METRICS_BEARER_TOKEN` mạnh và cấu hình scraper với `Authorization: Bearer <token>`.
- Telemetry từ trình duyệt không phải endpoint công khai. `POST /api/metrics/client` yêu cầu session Supabase thông thường của người dùng và hiện chỉ chấp nhận `viewer_load_time`.

## Mô hình lấy mẫu

Các worker chạy độc lập với API, vì vậy metric của background job được suy ra từ các bản ghi PostgreSQL đã lưu thay vì counter cục bộ trong từng process. `METRICS_SAMPLE_LIMIT` kiểm soát số lượng bản ghi gần nhất được lấy mẫu cho mỗi nhóm metric; mặc định là 10.000 và khoảng cho phép là 100–50.000.

Cách này giúp các tín hiệu asset, render, export, AI và manufacturing vẫn quan sát được ngay cả khi worker chịu trách nhiệm chạy ở process hoặc container khác. Thời gian load viewer được client gửi lên và vì vậy vẫn là dữ liệu cục bộ theo từng API instance, trừ khi metrics backend của deployment tổng hợp nhiều replica.

## Các nhóm metric

- `product3d_asset_total{status}` — số asset gần đây theo trạng thái đã lưu.
- `asset_import_duration_seconds` — vòng đời end-to-end của các asset READY/FAILED gần đây.
- `asset_analysis_duration_seconds` — thời lượng job analyze/normalize.
- `product3d_job_total{type,status}` — các background job gần đây đã được lưu.
- `product3d_job_duration_seconds{type,status}` — vòng đời job đã lưu.
- `render_duration_seconds` — thời lượng render job.
- `export_duration_seconds` — thời lượng export job.
- `ai_request_count{type,status}` — các request AI gần đây.
- `ai_request_failure{type}` — các request AI gần đây bị lỗi.
- `product3d_manufacturability_check_total{status}` — các lần kiểm tra khả năng sản xuất gần đây.
- `product3d_render_request_total{mode,quality}` — các request render gần đây.
- `average_model_triangle_count` — số triangle trung bình của các asset được phân tích trong mẫu.
- `viewer_load_time_seconds` — thời gian từ khi editor nhận `assetUrl` mới đến khi GLB đã load được mount vào Three.js viewer.

## Ví dụ Prometheus

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

## Cảnh báo/dashboard được đề xuất

Nên bắt đầu với:

- job thất bại theo `type` và `status`,
- số lần AI lỗi,
- xu hướng tương đương p95 được metrics backend tính từ thời lượng job,
- regression về thời gian export/render,
- tỷ lệ asset thất bại,
- xu hướng tăng số triangle trung bình,
- regression thời gian load viewer.

Endpoint chủ động cung cấp các counter/sum thô từ mẫu gần đây thay vì khẳng định có percentile đạt chuẩn production. Metrics backend của deployment nên thực hiện các phép tính rate, ratio, percentile/trend, retention và alert.

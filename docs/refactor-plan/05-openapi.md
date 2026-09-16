# OpenAPI Documentation

## Tujuan

Membuat kontrak API yang jelas sebelum refactor besar. Ini penting karena backend sudah punya banyak endpoint dan frontend bergantung pada response shape existing.

## Output Target

```txt
docs/openapi/
  openapi.yaml
  modules/
    auth.yaml
    master-data.yaml
    thesis-guidance.yaml
    thesis-exam.yaml
    internship.yaml
    yudisium.yaml
    documents.yaml
    notification.yaml
```

## Scope Awal

Mulai dari endpoint yang paling sering dipakai frontend:

- `/auth/login`
- `/auth/me`
- `/auth/refresh`
- `/notification`
- `/documents/upload`
- `/thesisGuidance/student/*`
- `/thesisGuidance/lecturer/*`
- `/milestones/*`
- `/thesis-seminars/*`
- `/thesis-defences/*`
- `/insternship/registration/*`
- `/insternship/activity/*`
- `/yudisiums/student/*`

## Standar Response

Jika response saat ini beragam, dokumentasikan apa adanya dulu. Jangan langsung ubah semua.

Target jangka panjang:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": {}
}
```

Error target:

```json
{
  "success": false,
  "status": 400,
  "message": "Validation error",
  "timestamp": "2026-05-23T00:00:00.000Z",
  "path": "/example"
}
```

## Tag OpenAPI

Gunakan tag:

- Auth
- Admin
- Master Data
- Thesis Guidance
- Milestones
- Thesis Seminar
- Thesis Defence
- Internship
- Yudisium
- Documents
- Notification
- Calendar
- SOP

## Security Scheme

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

## Proses Pembuatan

1. Dokumentasikan endpoint berdasarkan route file.
2. Catat method, path, role, query, body, response.
3. Cocokkan dengan controller/service untuk field yang benar.
4. Tambahkan contoh request/response.
5. Validasi manual lewat frontend atau Postman.

## Acceptance Criteria

- Endpoint kritikal punya method, path, auth, body, dan response minimal.
- Role access tercatat.
- Endpoint upload memakai `multipart/form-data` dengan nama field file yang benar.
- Breaking changes harus dicatat di changelog.


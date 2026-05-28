# TypeScript Migration

## Keputusan

Migrasi TypeScript dilakukan tanpa NestJS. Alasannya:

- Backend sudah punya Express dan layered architecture.
- Migrasi bisa incremental.
- Tidak perlu rewrite routing/controller.
- Risiko kontrak API berubah lebih kecil.
- Frontend sudah TypeScript, sehingga sharing tipe bisa dipikirkan belakangan.

## Target

- File baru boleh ditulis dengan `.ts`.
- File `.js` lama tetap berjalan.
- Tipe kritikal dibuat dulu: user claims, role, request payload, service result, storage interface.
- Tidak rewrite semua file dalam satu fase.

## Setup Awal

Dependency yang kemungkinan dibutuhkan:

```txt
typescript
tsx
@types/node
@types/express
```

Opsional:

```txt
eslint
typescript-eslint
```

## tsconfig Target

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "allowJs": true,
    "checkJs": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "express"]
  },
  "include": ["src/**/*"]
}
```

## Strategi Runtime

Opsi A: jalankan TS langsung saat dev.

```json
{
  "dev:api": "tsx watch src/server.ts",
  "dev:worker": "tsx watch src/worker.ts"
}
```

Opsi B: compile ke `dist`.

```json
{
  "build": "tsc",
  "start:api": "node dist/server.js",
  "start:worker": "node dist/worker.js"
}
```

Untuk production, opsi B lebih rapi.

## Urutan Migrasi File

Prioritas 1:

- config
- constants
- utils kecil
- storage service baru
- worker entrypoint baru

Prioritas 2:

- middleware auth typing
- validation middleware
- notification service
- document service

Prioritas 3:

- domain service yang sering berubah:
  - thesis guidance
  - seminar/defence
  - internship
  - yudisium

## Express Request Typing

Buat declaration file:

```txt
src/types/express.d.ts
```

Isi target:

```ts
declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email?: string;
        roles?: string[];
      };
    }
  }
}
```

## DTO dan Validator

Untuk fase awal, tetap gunakan validator existing. Setelah itu bisa pilih:

- Tetap Joi/Zod.
- Lebih disarankan Zod untuk type inference.

Contoh arah target:

```ts
const createRoomSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
  capacity: z.number().int().positive(),
});

type CreateRoomInput = z.infer<typeof createRoomSchema>;
```

## Anti-Pattern Yang Dihindari

- Rewrite semua controller sekaligus.
- Mengubah response shape sambil migrasi TS.
- Membuat generic abstraction terlalu awal.
- Memaksa semua Prisma query menjadi tipe custom manual.

## Acceptance Criteria

- Project bisa menjalankan file JS dan TS.
- Typecheck bisa dijalankan tanpa memblokir file JS lama.
- File baru punya tipe eksplisit.
- `req.user` tidak lagi memakai implicit `any` di file TS.
- Tidak ada perubahan endpoint karena migrasi TypeScript.


# Backend Development Rules

## Context Awareness
Setiap kali memulai implementasi fitur atau perubahan, agent **HARUS** mengikuti langkah-langkah berikut:

### 1. Check Schema Prisma TERLEBIH DAHULU
- **WAJIB** membaca `prisma/schema.prisma` sebelum implementasi
- Pahami relasi antar model yang terkait dengan fitur yang akan dibuat
- Identifikasi field yang tersedia dan tipe datanya
- Perhatikan constraint (unique, foreign key, enum, dll)
- Pastikan menggunakan model dan relasi yang sudah ada, jangan membuat asumsi

### 2. Implementasi Sesuai Layer Architecture
Project ini menggunakan **layered architecture**. Implementasi **HARUS** mengikuti urutan layer berikut:

#### a. Repository Layer (`src/repositories/`)
- Berisi query database menggunakan Prisma Client
- Hanya fokus pada operasi CRUD dan query logic
- Return raw data dari database
- Tidak ada business logic di sini
- File naming: `{feature}.repository.js`

**Contoh Structure:**
```javascript
// repositories/example.repository.js
const prisma = require('../config/prisma');

const findAll = async () => {
  return await prisma.modelName.findMany({
    include: { /* relasi */ }
  });
};

const findById = async (id) => {
  return await prisma.modelName.findUnique({
    where: { id }
  });
};

module.exports = {
  findAll,
  findById,
  // ... CRUD operations
};
```

#### b. Service Layer (`src/services/`)
- Berisi business logic dan validasi
- Memanggil repository untuk operasi database
- Handle error dan exception
- Transform data sesuai kebutuhan
- File naming: `{feature}.service.js`

**Contoh Structure:**
```javascript
// services/example.service.js
const repository = require('../repositories/example.repository');
const { NotFoundError } = require('../middlewares/error.middleware');

const getAll = async () => {
  const data = await repository.findAll();
  // Transform atau business logic
  return data;
};

const getById = async (id) => {
  const data = await repository.findById(id);
  if (!data) {
    throw new NotFoundError('Data not found');
  }
  return data;
};

module.exports = {
  getAll,
  getById,
  // ... business operations
};
```

#### c. Controller Layer (`src/controllers/`)
- Handle HTTP request dan response
- Validasi input dari request (menggunakan validator)
- Memanggil service layer
- Return response dengan format yang konsisten
- File naming: `{feature}.controller.js`

**Contoh Structure:**
```javascript
// controllers/example.controller.js
const service = require('../services/example.service');

const getAll = async (req, res, next) => {
  try {
    const data = await service.getAll();
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await service.getById(id);
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAll,
  getById,
  // ... controller methods
};
```

#### d. Validator Layer (`src/validators/`)
- Validasi input menggunakan Joi atau library serupa
- Validate request body, params, query
- File naming: `{feature}.validator.js`

**Contoh Structure:**
```javascript
// validators/example.validator.js
const Joi = require('joi');

const createSchema = Joi.object({
  field1: Joi.string().required(),
  field2: Joi.number().optional(),
  // ... sesuai dengan schema prisma
});

const updateSchema = Joi.object({
  field1: Joi.string().optional(),
  field2: Joi.number().optional(),
  // ...
});

module.exports = {
  createSchema,
  updateSchema,
  // ... validation schemas
};
```

#### e. Route Layer (`src/routes/`)
- Define endpoints dan HTTP methods
- Gunakan middleware untuk auth, validation, dll
- File naming: `{feature}.route.js`

**Contoh Structure:**
```javascript
// routes/example.route.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/example.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const validator = require('../validators/example.validator');

router.get('/', authenticate, controller.getAll);
router.get('/:id', authenticate, controller.getById);
router.post('/', authenticate, validate(validator.createSchema), controller.create);
router.put('/:id', authenticate, validate(validator.updateSchema), controller.update);
router.delete('/:id', authenticate, controller.delete);

module.exports = router;
```

### 3. Testing (Optional tapi Recommended)
- Buat test file di `src/test/{feature}.test.js`
- Test business logic di service layer
- Test edge cases dan error handling

### 4. Dokumentasi OpenAPI/Swagger (WAJIB)
Setelah fitur selesai diimplementasi, **WAJIB** mendokumentasikannya di `src/docs/`:

#### Structure Dokumentasi:
```
src/docs/
├── openapi.yaml (main file)
└── {feature}/
    └── swagger-{feature}.yaml
```

#### Format Dokumentasi:
```yaml
# docs/{feature}/swagger-{feature}.yaml
paths:
  /{endpoint}:
    get:
      tags:
        - Feature Name
      summary: Short description
      description: Detailed description
      parameters:
        - in: path/query/header
          name: paramName
          required: true/false
          schema:
            type: string
      responses:
        '200':
          description: Success response
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: object
                    # ... sesuai response
        '400':
          description: Bad request
        '401':
          description: Unauthorized
        '404':
          description: Not found
        '500':
          description: Internal server error

components:
  schemas:
    ModelName:
      type: object
      properties:
        # ... sesuai dengan Prisma schema
```

#### Jangan Lupa:
1. Update `src/docs/openapi.yaml` untuk me-reference file swagger baru
2. Dokumentasikan semua endpoint (GET, POST, PUT, DELETE)
3. Sertakan contoh request dan response
4. Dokumentasikan semua parameter dan field
5. Dokumentasikan error responses yang mungkin terjadi

## Checklist Implementasi Fitur

Sebelum menganggap fitur selesai, pastikan semua checklist berikut sudah terpenuhi:

- [ ] Schema Prisma sudah dicek dan dipahami
- [ ] Repository layer dibuat dengan query yang efisien
- [ ] Service layer dibuat dengan business logic yang jelas
- [ ] Controller layer dibuat dengan error handling yang baik
- [ ] Validator dibuat untuk semua input
- [ ] Route didefinisikan dengan middleware yang sesuai
- [ ] Testing (jika diperlukan)
- [ ] **Dokumentasi Swagger/OpenAPI sudah dibuat dan lengkap**
- [ ] Code sudah ditest secara manual
- [ ] Tidak ada error atau warning

## Best Practices

### Error Handling
- Gunakan custom error classes di `src/middlewares/error.middleware.js`
- Selalu gunakan try-catch di controller
- Return error yang informatif

### Database Query
- Gunakan Prisma Client dengan proper include/select
- Hindari N+1 query problem
- Gunakan transaction untuk operasi multiple insert/update

### Security
- Selalu gunakan authentication middleware untuk protected routes
- Validasi semua input dari user
- Sanitize data sebelum insert ke database

### Code Quality
- Consistent naming convention (camelCase untuk JS)
- Single responsibility principle
- DRY (Don't Repeat Yourself)
- Meaningful variable and function names

## File Organization untuk Feature Baru

Ketika membuat feature baru (misal: `feature-name`):

```
src/
├── repositories/
│   └── featureName.repository.js
├── services/
│   └── featureName.service.js
├── controllers/
│   └── featureName.controller.js
├── validators/
│   └── featureName.validator.js
├── routes/
│   └── featureName.route.js
└── docs/
    └── featureName/
        └── swagger-featureName.yaml
```

Atau untuk feature yang kompleks dengan sub-modules:

```
src/
├── repositories/
│   └── featureName/
│       ├── subFeature1.repository.js
│       └── subFeature2.repository.js
├── services/
│   └── featureName/
│       ├── subFeature1.service.js
│       └── subFeature2.service.js
├── controllers/
│   └── featureName/
│       ├── subFeature1.controller.js
│       └── subFeature2.controller.js
└── docs/
    └── featureName/
        ├── swagger-subFeature1.yaml
        └── swagger-subFeature2.yaml
```

## PENTING: Urutan Kerja yang WAJIB Diikuti

1. **READ** `prisma/schema.prisma` terlebih dahulu
2. **CREATE** repository layer
3. **CREATE** service layer
4. **CREATE** controller layer
5. **CREATE** validator layer
6. **CREATE** route layer
7. **TEST** manual atau automated
8. **DOCUMENT** di OpenAPI/Swagger

**Jangan pernah skip langkah dokumentasi!** Dokumentasi adalah bagian integral dari implementasi fitur.

import * as service from "../services/seminar-requirement.service.js";

export const getAll = async (req, res, next) => {
    try {
        const { academicYearId } = req.query;
        const data = await service.getAll({ academicYearId });
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

export const getById = async (req, res, next) => {
    try {
        const data = await service.getById(req.params.id);
        res.json({ success: true, data });
    } catch (err) { next(err); }
};

export const create = async (req, res, next) => {
    try {
        const data = await service.create(req.validated || req.body);
        res.status(201).json({ success: true, data, message: "Persyaratan berhasil dibuat" });
    } catch (err) { next(err); }
};

export const update = async (req, res, next) => {
    try {
        const data = await service.update(req.params.id, req.validated || req.body);
        res.json({ success: true, data, message: "Persyaratan berhasil diperbarui" });
    } catch (err) { next(err); }
};

export const remove = async (req, res, next) => {
    try {
        await service.remove(req.params.id);
        res.json({ success: true, message: "Persyaratan berhasil dihapus" });
    } catch (err) { next(err); }
};

export const reorder = async (req, res, next) => {
    try {
        const { orderedIds } = req.validated || req.body;
        await service.reorder(orderedIds);
        res.json({ success: true, message: "Urutan berhasil diperbarui" });
    } catch (err) { next(err); }
};

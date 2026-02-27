import { getScienceGroups, createScienceGroup, updateScienceGroup, deleteScienceGroup } from "../services/scienceGroup.service.js";

// --- Science Groups ---
export async function getScienceGroupsController(req, res, next) {
    try {
        const result = await getScienceGroups();
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
}

export async function createScienceGroupController(req, res, next) {
    try {
        const result = await createScienceGroup(req.body);
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
}

export async function updateScienceGroupController(req, res, next) {
    try {
        const result = await updateScienceGroup(req.params.id, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
}

export async function deleteScienceGroupController(req, res, next) {
    try {
        await deleteScienceGroup(req.params.id);
        res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (err) { next(err); }
}

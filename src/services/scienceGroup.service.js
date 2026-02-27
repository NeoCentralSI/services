import prisma from "../config/prisma.js";
export async function getScienceGroups() {
    return prisma.scienceGroup.findMany({
        orderBy: { name: 'asc' }
    });
}

export async function createScienceGroup(data) {
    if (!data.name) throw Object.assign(new Error('Name is required'), { statusCode: 400 });
    return prisma.scienceGroup.create({ data: { name: data.name } });
}

export async function updateScienceGroup(id, data) {
    if (!data.name) throw Object.assign(new Error('Name is required'), { statusCode: 400 });
    return prisma.scienceGroup.update({ where: { id }, data: { name: data.name } });
}

export async function deleteScienceGroup(id) {
    const inUse = await prisma.lecturer.findFirst({ where: { scienceGroupId: id } });
    if (inUse) throw Object.assign(new Error('Cannot delete Science Group because it is assigned to lecturers'), { statusCode: 400 });
    return prisma.scienceGroup.delete({ where: { id } });
}

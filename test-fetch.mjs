import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { PrismaClient } from "./src/generated/prisma/index.js";
dotenv.config();

const prisma = new PrismaClient();

async function run() {
    const role = await prisma.userRole.findFirst({ where: { name: "Ketua Departemen" } });
    const userRole = await prisma.userHasRole.findFirst({ where: { roleId: role.id, status: "active" } });
    const token = jwt.sign({ sub: userRole.userId }, process.env.ACCESS_TOKEN_SECRET || "access-secret", { expiresIn: "1h" });
    
    const res = await fetch("http://[::1]:3000/seminar-rubrics/cpmks?academicYearId=undefined", {
        headers: { "Authorization": `Bearer ${token}` }
    });
    console.log(res.status);
    console.log(await res.text());
}
run();

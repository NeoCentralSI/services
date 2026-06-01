const jwt = require("jsonwebtoken");
const { PrismaClient } = require("./src/generated/prisma/index.js");
const prisma = new PrismaClient();
require("dotenv").config({ path: __dirname + "/.env" });

async function run() {
    const role = await prisma.userRole.findFirst({ where: { name: "Ketua Departemen" } });
    const userRole = await prisma.userHasRole.findFirst({ where: { roleId: role.id, status: "active" } });
    const token = jwt.sign({ sub: userRole.userId }, process.env.ACCESS_TOKEN_SECRET || "access-secret", { expiresIn: "1h" });
    console.log(token);
}
run();

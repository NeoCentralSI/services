const http = require('http');

const jwt = require("jsonwebtoken");
require("dotenv").config({ path: __dirname + "/.env" });

const { PrismaClient } = require("./src/generated/prisma/index.js");
const prisma = new PrismaClient();

async function run() {
    const role = await prisma.userRole.findFirst({ where: { name: "Ketua Departemen" } });
    const userRole = await prisma.userHasRole.findFirst({ where: { roleId: role.id, status: "active" } });
    if (!userRole) { console.log("no kadep found"); return; }
    
    const token = jwt.sign({ sub: userRole.userId }, process.env.ACCESS_TOKEN_SECRET || "access-secret", { expiresIn: "1h" });
    
    http.get('http://[::1]:3000/seminar-rubrics/cpmks?academicYearId=undefined', {
        headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => console.log('STATUS:', res.statusCode, '\nBODY:', data));
    });
}
run();

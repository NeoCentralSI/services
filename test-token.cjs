const jwt = require("jsonwebtoken");
require("dotenv").config({ path: __dirname + "/.env" });
const token = jwt.sign({ sub: "user-1", email: "test@example.com" }, process.env.ACCESS_TOKEN_SECRET || "access-secret", { expiresIn: "1h" });
console.log(token);

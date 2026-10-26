/**
 * Behind the one proxy of the deployment, the client address is the right end of
 * X-Forwarded-For (written by the proxy), not the left end a client may forge.
 */
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("trust proxy", () => {
  it("app.js trusts exactly one proxy hop", () => {
    const source = readFileSync(fileURLToPath(new URL("../../app.js", import.meta.url)), "utf8");
    expect(source).toContain('app.set("trust proxy", 1);');
  });

  it("req.ip is the address the proxy appended; a forged left value is ignored", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.get("/ip", (req, res) => res.json({ ip: req.ip }));
    const res = await request(app).get("/ip").set("X-Forwarded-For", "6.6.6.6, 203.0.113.7");
    expect(res.body.ip).toBe("203.0.113.7");
    const direct = await request(app).get("/ip");
    expect(direct.body.ip).toMatch(/127\.0\.0\.1|::1/);
  });
});

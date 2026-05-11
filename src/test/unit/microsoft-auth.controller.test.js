import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeExchangePayload: vi.fn(),
  storeExchangePayload: vi.fn(),
  getMicrosoftAuthUrl: vi.fn(),
  loginWithMicrosoftAuthorizationCode: vi.fn(),
}));

vi.mock("../../services/oauth-exchange.service.js", () => ({
  consumeExchangePayload: mocks.consumeExchangePayload,
  storeExchangePayload: mocks.storeExchangePayload,
}));

vi.mock("../../services/microsoft-auth.service.js", () => ({
  getMicrosoftAuthUrl: mocks.getMicrosoftAuthUrl,
  loginWithMicrosoftAuthorizationCode: mocks.loginWithMicrosoftAuthorizationCode,
}));

import { exchangeOauthCode } from "../../controllers/microsoft-auth.controller.js";

function mockResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("microsoft-auth.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one-shot exchange payload without calling Microsoft again", async () => {
    const payload = {
      accessToken: "jwt-access",
      refreshToken: "jwt-refresh",
      user: { id: "user-1" },
      hasCalendarAccess: true,
    };
    mocks.consumeExchangePayload.mockResolvedValue(payload);

    const req = { body: { code: "a".repeat(64) } };
    const res = mockResponse();
    const next = vi.fn();

    await exchangeOauthCode(req, res, next);

    expect(mocks.consumeExchangePayload).toHaveBeenCalledWith("a".repeat(64));
    expect(mocks.loginWithMicrosoftAuthorizationCode).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: payload });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects expired one-shot codes without treating them as Microsoft auth codes", async () => {
    mocks.consumeExchangePayload.mockResolvedValue(null);

    const req = { body: { code: "b".repeat(64) } };
    const res = mockResponse();
    const next = vi.fn();

    await exchangeOauthCode(req, res, next);

    expect(mocks.loginWithMicrosoftAuthorizationCode).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Exchange code is invalid, expired, or already used",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts direct Microsoft authorization codes for legacy frontend callback flows", async () => {
    const result = {
      accessToken: "jwt-access",
      refreshToken: "jwt-refresh",
      user: { id: "user-1" },
      hasCalendarAccess: false,
    };
    mocks.consumeExchangePayload.mockResolvedValue(null);
    mocks.loginWithMicrosoftAuthorizationCode.mockResolvedValue(result);

    const req = { body: { code: "0.ABC-direct-microsoft-code" } };
    const res = mockResponse();
    const next = vi.fn();

    await exchangeOauthCode(req, res, next);

    expect(mocks.loginWithMicrosoftAuthorizationCode).toHaveBeenCalledWith(
      "0.ABC-direct-microsoft-code",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
    expect(next).not.toHaveBeenCalled();
  });
});

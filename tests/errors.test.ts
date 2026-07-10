import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { createApiHandler } from "@/lib/api/handler";
import { InternalServerError, ValidationError, toAppError } from "@/lib/errors";

describe("error serialization", () => {
  it("redacts non-operational error messages from client-facing JSON", () => {
    const leaky = toAppError(new Error("connect ECONNREFUSED db.internal:5432 (password=hunter2)"));

    expect(leaky).toBeInstanceOf(InternalServerError);
    // The real message is preserved internally for logging…
    expect(leaky.message).toContain("ECONNREFUSED");
    // …but never serialized to clients.
    expect(leaky.toJSON()).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  });

  it("keeps message and details for operational errors", () => {
    const err = new ValidationError("address must be a 0x-prefixed hex string", {
      details: { field: "address" },
    });
    expect(err.toJSON()).toEqual({
      code: "VALIDATION_ERROR",
      message: "address must be a 0x-prefixed hex string",
      details: { field: "address" },
    });
  });
});

describe("createApiHandler error mapping", () => {
  it("maps unknown throwables to an opaque 500 without leaking internals", async () => {
    const handler = createApiHandler("boom", async () => {
      throw new Error("secret internal detail: /etc/claimradar/creds.json");
    });

    const response = await handler(new NextRequest("http://localhost/api/boom"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toEqual({ code: "INTERNAL_SERVER_ERROR", message: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("secret internal detail");
    expect(body.requestId).toBeTruthy();
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("maps operational errors to their status with message intact", async () => {
    const handler = createApiHandler("invalid", async () => {
      throw new ValidationError("invalid address");
    });

    const request = new NextRequest("http://localhost/api/invalid", {
      headers: { "x-request-id": "rid-42" },
    });
    const response = await handler(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toEqual({ code: "VALIDATION_ERROR", message: "invalid address" });
    expect(body.requestId).toBe("rid-42");
  });
});

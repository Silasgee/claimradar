import { describe, expect, it } from "vitest";

import { ConnectorConfigurationError, ConnectorExecutionError } from "@/connectors";
import { ConnectorRuntime } from "@/lib/scan";
import { ConnectorRunStatus } from "@/types";

import { StubConnector, createTestContext, testRequest } from "./helpers";

const fastRuntime = () => new ConnectorRuntime({ backoffBaseMs: 1, maxBackoffMs: 2 });

describe("ConnectorRuntime", () => {
  it("returns a SUCCESS result with the connector response", async () => {
    const connector = new StubConnector({ id: "ok" });
    const result = await fastRuntime().execute(connector, testRequest, createTestContext());

    expect(result.status).toBe(ConnectorRunStatus.SUCCESS);
    expect(result.attempts).toBe(1);
    expect(result.response?.connectorId).toBe("ok");
    expect(result.error).toBeUndefined();
  });

  it("isolates throwing connectors: never throws, returns FAILED with a ConnectorError", async () => {
    const connector = new StubConnector({
      id: "boom",
      failTimes: Number.POSITIVE_INFINITY,
      failWith: () => new Error("raw internal explosion"),
    });
    const result = await fastRuntime().execute(connector, testRequest, createTestContext(), {
      maxRetries: 1,
    });

    expect(result.status).toBe(ConnectorRunStatus.FAILED);
    expect(result.error).toBeInstanceOf(ConnectorExecutionError);
    expect(result.error?.connectorId).toBe("boom");
  });

  describe("retry policy", () => {
    it("retries transient failures and succeeds", async () => {
      const connector = new StubConnector({ id: "flaky", failTimes: 2 });
      const result = await fastRuntime().execute(connector, testRequest, createTestContext(), {
        maxRetries: 2,
      });

      expect(result.status).toBe(ConnectorRunStatus.SUCCESS);
      expect(result.attempts).toBe(3);
      expect(connector.calls).toBe(3);
    });

    it("stops after maxRetries is exhausted", async () => {
      const connector = new StubConnector({ id: "dead", failTimes: Number.POSITIVE_INFINITY });
      const result = await fastRuntime().execute(connector, testRequest, createTestContext(), {
        maxRetries: 2,
      });

      expect(result.status).toBe(ConnectorRunStatus.FAILED);
      expect(result.attempts).toBe(3);
      expect(connector.calls).toBe(3);
    });

    it("never retries permanent (configuration) errors", async () => {
      const connector = new StubConnector({
        id: "misconfigured",
        failTimes: Number.POSITIVE_INFINITY,
        failWith: () => new ConnectorConfigurationError("misconfigured", "missing api key"),
      });
      const result = await fastRuntime().execute(connector, testRequest, createTestContext(), {
        maxRetries: 5,
      });

      expect(result.status).toBe(ConnectorRunStatus.FAILED);
      expect(result.attempts).toBe(1);
      expect(connector.calls).toBe(1);
      expect(result.error).toBeInstanceOf(ConnectorConfigurationError);
    });
  });

  describe("timeout", () => {
    it("times out a non-cooperative connector via the race guard", async () => {
      const connector = new StubConnector({ id: "slow", delayMs: 200 });
      const result = await fastRuntime().execute(connector, testRequest, createTestContext(), {
        timeoutMs: 25,
        maxRetries: 0,
      });

      expect(result.status).toBe(ConnectorRunStatus.TIMEOUT);
      expect(result.error?.code).toBe("CONNECTOR_TIMEOUT");
      // The scan resolved at the deadline, not after the connector's 200ms.
      expect(result.durationMs).toBeLessThan(150);
    });

    it("treats timeouts as transient: retries then reports TIMEOUT", async () => {
      const connector = new StubConnector({ id: "molasses", delayMs: 200 });
      const result = await fastRuntime().execute(connector, testRequest, createTestContext(), {
        timeoutMs: 20,
        maxRetries: 1,
      });

      expect(result.status).toBe(ConnectorRunStatus.TIMEOUT);
      expect(result.attempts).toBe(2);
      expect(connector.calls).toBe(2);
    });

    it("exposes the deadline to cooperative connectors via ctx.signal", async () => {
      const connector = new StubConnector({ id: "cooperative", delayMs: 200, honorSignal: true });
      const started = performance.now();
      const result = await fastRuntime().execute(connector, testRequest, createTestContext(), {
        timeoutMs: 25,
        maxRetries: 0,
      });

      expect(result.status).toBe(ConnectorRunStatus.TIMEOUT);
      expect(performance.now() - started).toBeLessThan(150);
    });
  });

  describe("cancellation", () => {
    it("returns CANCELLED without executing when the signal is already aborted", async () => {
      const connector = new StubConnector({ id: "never-ran" });
      const controller = new AbortController();
      controller.abort();

      const result = await fastRuntime().execute(connector, testRequest, createTestContext(), {
        signal: controller.signal,
      });

      expect(result.status).toBe(ConnectorRunStatus.CANCELLED);
      expect(connector.calls).toBe(0);
    });

    it("cancels a run in flight", async () => {
      const connector = new StubConnector({ id: "interrupted", delayMs: 200 });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 15);

      const result = await fastRuntime().execute(connector, testRequest, createTestContext(), {
        timeoutMs: 5_000,
        signal: controller.signal,
      });

      expect(result.status).toBe(ConnectorRunStatus.CANCELLED);
      expect(result.durationMs).toBeLessThan(150);
    });

    it("cancellation during backoff prevents further attempts", async () => {
      const connector = new StubConnector({
        id: "no-second-chance",
        failTimes: Number.POSITIVE_INFINITY,
      });
      const controller = new AbortController();
      const runtime = new ConnectorRuntime({ backoffBaseMs: 100, maxBackoffMs: 100 });

      setTimeout(() => controller.abort(), 20);
      const result = await runtime.execute(connector, testRequest, createTestContext(), {
        maxRetries: 5,
        signal: controller.signal,
      });

      expect(result.status).toBe(ConnectorRunStatus.CANCELLED);
      expect(connector.calls).toBe(1);
    });
  });
});

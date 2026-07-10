import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "@/lib/scan";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("preserves input order in results", async () => {
    const items = [30, 1, 15, 2];
    const results = await mapWithConcurrency(items, 2, async (ms) => {
      await wait(ms);
      return `done:${ms}`;
    });
    expect(results).toEqual(["done:30", "done:1", "done:15", "done:2"]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 12 }, (_, i) => i),
      3,
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await wait(5);
        inFlight--;
      },
    );
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("handles an empty input and rejects a nonsensical limit", async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
    await expect(mapWithConcurrency([1], 0, async () => 1)).rejects.toThrow(/limit/i);
  });
});

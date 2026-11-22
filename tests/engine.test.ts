import { describe, expect, it } from "vitest";
import { runTrial } from "../src/engine.js";
import { scenarios } from "../src/types.js";

describe("offline scenario harness", () => {
  it.each(scenarios)(
    "verifies scenario %s without a model or API key",
    async (scenario) => {
      const previous = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try {
        const result = await runTrial(
          {
            environment: "offline",
            strategy: "direct",
            scenario,
            catalogSize: 5,
            trials: 1,
            outputDir: "unused",
          },
          1,
        );
        expect(result.environment).toBe("offline");
        expect(result.executionKind).toBe("offline-harness");
        expect(result.benchmarkComparable).toBe(false);
        expect(result.inputTokens).toBeNull();
        expect(result.correct).toBe(true);
      } finally {
        if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
      }
    },
  );

  it("refuses to label offline execution as programmatic tool calling", async () => {
    await expect(
      runTrial(
        {
          environment: "offline",
          strategy: "programmatic",
          scenario: "single-lookup",
          catalogSize: 5,
          trials: 1,
          outputDir: "unused",
        },
        1,
      ),
    ).rejects.toThrow(/does not simulate PTC/);
  });

  it("fails live execution before opening a fixture when no API key is set", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(
        runTrial(
          {
            environment: "live",
            strategy: "programmatic",
            scenario: "single-lookup",
            catalogSize: 5,
            trials: 1,
            model: "gpt-6.2-astra",
            outputDir: "unused",
          },
          1,
        ),
      ).rejects.toThrow("Live mode requires OPENAI_API_KEY.");
    } finally {
      if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
    }
  });
});

import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.js";

describe("CLI options", () => {
  it("parses independent environment and invocation strategy values", () => {
    expect(
      parseArgs([
        "--",
        "--environment",
        "live",
        "--strategy",
        "programmatic",
        "--scenario",
        "dependent-calls",
        "--catalog-size",
        "20",
        "--trials",
        "20",
        "--model",
        "test-model",
      ]),
    ).toMatchObject({
      environment: "live",
      strategy: "programmatic",
      scenario: ["dependent-calls"],
      catalogSize: [20],
      trials: 20,
      model: "test-model",
    });
  });

  it("rejects offline PTC instead of substituting a simulated implementation", () => {
    expect(() =>
      parseArgs(["--environment", "offline", "--strategy", "programmatic"]),
    ).toThrow(/does not emulate/);
  });

  it("validates catalog sizes and trial counts", () => {
    expect(() => parseArgs(["--catalog-size", "15"])).toThrow(/Catalog size/);
    expect(() => parseArgs(["--trials", "0"])).toThrow(/integer/);
  });
});

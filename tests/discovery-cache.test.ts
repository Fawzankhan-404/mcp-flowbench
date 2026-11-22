import { describe, expect, it } from "vitest";
import { DiscoveryCache } from "../src/adapter.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("DiscoveryCache concurrency and invalidation", () => {
  it("coalesces callers in one generation", async () => {
    let loads = 0;
    const gate = deferred<string>();
    const cache = new DiscoveryCache(async () => {
      loads += 1;
      return gate.promise;
    });
    const first = cache.get();
    const second = cache.get();
    expect(loads).toBe(1);
    gate.resolve("tools-v1");
    await expect(Promise.all([first, second])).resolves.toEqual([
      "tools-v1",
      "tools-v1",
    ]);
    await expect(cache.get()).resolves.toBe("tools-v1");
    expect(loads).toBe(1);
  });

  it("does not let a pre-invalidation listing populate or satisfy the new generation", async () => {
    const oldLoad = deferred<string>();
    const freshLoad = deferred<string>();
    let loads = 0;
    const cache = new DiscoveryCache(async () =>
      ++loads === 1 ? oldLoad.promise : freshLoad.promise,
    );
    const beforeInvalidation = cache.get();
    cache.invalidate();
    const afterInvalidation = cache.get();
    expect(loads).toBe(2);
    freshLoad.resolve("tools-v2");
    await expect(afterInvalidation).resolves.toBe("tools-v2");
    oldLoad.resolve("tools-v1");
    await expect(beforeInvalidation).resolves.toBe("tools-v1");
    await expect(cache.get()).resolves.toBe("tools-v2");
    expect(loads).toBe(2);
  });
});

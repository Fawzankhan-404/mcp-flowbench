import { createServer, type Server } from "node:http";
import { MCPServerStreamableHttp } from "@openai/agents";
import { afterEach, describe, expect, it } from "vitest";

let httpServer: Server | undefined;
let mcpServer: MCPServerStreamableHttp | undefined;

afterEach(async () => {
  await mcpServer?.close().catch(() => undefined);
  mcpServer = undefined;
  if (httpServer?.listening) {
    await new Promise<void>((resolve, reject) =>
      httpServer!.close((error) => (error ? reject(error) : resolve())),
    );
  }
  httpServer = undefined;
});

describe("Agents SDK issue #2047 reproduction", () => {
  it("reproduces stale rejection for overlapping sessionless listTools calls", async () => {
    let firstListingReceived!: () => void;
    const firstListing = new Promise<void>((resolve) => {
      firstListingReceived = resolve;
    });
    let listingCount = 0;
    httpServer = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        if (request.method !== "POST") {
          response.writeHead(405).end();
          return;
        }
        const message = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          id?: number | string;
          method: string;
          params?: { protocolVersion?: string };
        };
        if (message.id === undefined) {
          response.writeHead(202).end();
          return;
        }
        const result =
          message.method === "initialize"
            ? {
                protocolVersion: message.params?.protocolVersion,
                capabilities: { tools: {} },
                serverInfo: { name: "sessionless-repro", version: "1" },
              }
            : message.method === "tools/list"
              ? { tools: [{ name: "echo", inputSchema: { type: "object" } }] }
              : {};
        const reply = () => {
          response
            .writeHead(200, { "content-type": "application/json" })
            .end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
        };
        if (message.method === "tools/list") {
          listingCount += 1;
          if (listingCount === 1) firstListingReceived();
          setTimeout(reply, 150);
        } else reply();
      });
    });
    await new Promise<void>((resolve) =>
      httpServer!.listen(0, "127.0.0.1", resolve),
    );
    const address = httpServer.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");
    mcpServer = new MCPServerStreamableHttp({
      url: `http://127.0.0.1:${address.port}/mcp`,
      name: "sessionless-repro",
      cacheToolsList: true,
    });
    await mcpServer.connect();
    expect(mcpServer.sessionId).toBeUndefined();

    const first = mcpServer.listTools();
    await firstListing;
    const second = mcpServer.listTools();
    const outcomes = await Promise.allSettled([first, second]);

    // Characterize the pinned SDK behavior from issue #2047. Update this test
    // when the dependency fixes the race; expected behavior is two fulfillments.
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    const fulfilled = outcomes.find(
      (outcome) => outcome.status === "fulfilled",
    );
    expect(fulfilled?.status).toBe("fulfilled");
    if (fulfilled?.status === "fulfilled")
      expect(fulfilled.value).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(
      rejected?.status === "rejected" ? String(rejected.reason) : "",
    ).toContain("MCP tool listing became stale");
  });
});

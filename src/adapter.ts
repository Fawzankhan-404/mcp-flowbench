import { tool } from "@openai/agents";
import type { Client } from "@modelcontextprotocol/client";
import type { ToolDescriptor } from "./fixture.js";
import type { Strategy } from "./types.js";

export class ToolPermissionError extends Error {
  constructor(message = "Permission denied by FlowBench policy") {
    super(message);
    this.name = "ToolPermissionError";
  }
}

export class McpToolAdapter {
  calls = 0;
  errors = 0;
  readonly callLedger: Array<{
    name: string;
    arguments: unknown;
    ok: boolean;
    result?: unknown;
    error?: string;
  }> = [];
  private readonly allowedTools: ReadonlySet<string>;

  constructor(
    private readonly client: Client,
    private readonly catalog: ToolDescriptor[],
    allowedTools?: ReadonlySet<string>,
  ) {
    this.allowedTools =
      allowedTools ?? new Set(catalog.map((item) => item.name));
  }

  async call(
    name: string,
    args: unknown,
    allowedTools?: ReadonlySet<string>,
  ): Promise<unknown> {
    this.calls += 1;
    const ledgerEntry: (typeof this.callLedger)[number] = {
      name,
      arguments: args,
      ok: false,
    };
    this.callLedger.push(ledgerEntry);
    try {
      const descriptor = this.catalog.find((item) => item.name === name);
      if (!descriptor) throw new Error(`Unknown MCP tool: ${name}`);
      if (
        !this.allowedTools.has(name) ||
        (allowedTools && !allowedTools.has(name))
      )
        throw new ToolPermissionError(`Tool ${name} is not allowlisted`);
      const parsed = descriptor.schema.parse(args);
      if (
        descriptor.permissioned &&
        (parsed as { departmentId?: string }).departmentId === "D-RESTRICTED"
      ) {
        throw new ToolPermissionError(
          "Permission denied: department is restricted",
        );
      }
      const response = await this.client.callTool({
        name,
        arguments: parsed as Record<string, unknown>,
      });
      if (response.isError) {
        const message = response.content.find((item) => item.type === "text");
        throw new Error(
          message?.type === "text" ? message.text : `MCP tool ${name} failed`,
        );
      }
      if (response.structuredContent !== undefined)
        if (response.structuredContent !== undefined) {
          ledgerEntry.ok = true;
          ledgerEntry.result = response.structuredContent;
          return response.structuredContent;
        }
      const text = response.content.find((item) => item.type === "text");
      const value =
        text?.type === "text"
          ? (JSON.parse(text.text) as unknown)
          : response.content;
      ledgerEntry.ok = true;
      ledgerEntry.result = value;
      return value;
    } catch (error) {
      this.errors += 1;
      ledgerEntry.error =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async agentsTools(strategy: Strategy, allowedTools?: ReadonlySet<string>) {
    const listed = await this.client.listTools();
    const effectiveAllowed = new Set(
      [...this.allowedTools].filter(
        (name) => !allowedTools || allowedTools.has(name),
      ),
    );
    return listed.tools
      .filter((wireTool) => effectiveAllowed.has(wireTool.name))
      .map((wireTool) => {
        const descriptor = this.catalog.find(
          (item) => item.name === wireTool.name,
        );
        if (!descriptor)
          throw new Error(
            `MCP tool ${wireTool.name} has no local schema binding`,
          );
        return tool({
          name: wireTool.name,
          description: wireTool.description ?? descriptor.description,
          parameters: descriptor.schema,
          allowedCallers: [strategy],
          execute: async (args: unknown) =>
            this.call(wireTool.name, args, effectiveAllowed),
          errorFunction: (_context, error) =>
            error instanceof Error ? error.message : String(error),
        });
      });
  }
}

export class DiscoveryCache<T> {
  private generation = 0;
  private value: T | undefined;
  private inFlight = new Map<number, Promise<T>>();

  constructor(private readonly load: () => Promise<T>) {}

  async get(): Promise<T> {
    if (this.value !== undefined) return this.value;
    const generation = this.generation;
    let pending = this.inFlight.get(generation);
    if (!pending) {
      pending = this.load();
      this.inFlight.set(generation, pending);
    }
    try {
      const value = await pending;
      if (generation === this.generation) this.value = value;
      return value;
    } finally {
      if (this.inFlight.get(generation) === pending)
        this.inFlight.delete(generation);
    }
  }

  invalidate(): void {
    this.generation += 1;
    this.value = undefined;
  }
}

import { describe, expect, it } from "vitest";
import { Agent, programmaticToolCallingTool } from "@openai/agents";
import { McpToolAdapter, ToolPermissionError } from "../src/adapter.js";
import { createSyntheticMcpFixture } from "../src/fixture.js";

describe("MCP-to-Agents adapter", () => {
  it("constructs Agents JS tools and the official PTC helper", async () => {
    const fixture = await createSyntheticMcpFixture(5);
    const adapter = new McpToolAdapter(fixture.client, fixture.catalog);
    try {
      const tools = await adapter.agentsTools("programmatic");
      expect(tools).toHaveLength(5);
      const employeeTool = tools.find(
        (item) => item.name === "employee_lookup_001",
      );
      expect(employeeTool).toBeDefined();
      expect(employeeTool?.allowedCallers).toEqual(["programmatic"]);
      const agent = new Agent({
        name: "FlowBench PTC API smoke",
        model: "gpt-5.6",
        instructions:
          "Smoke-test tool registration without making a provider request.",
        tools: [...tools, programmaticToolCallingTool()],
      });
      expect(agent.name).toBe("FlowBench PTC API smoke");
    } finally {
      await fixture.close();
    }
  });

  it("uses the fixture schema to reject invalid input before dispatch", async () => {
    const fixture = await createSyntheticMcpFixture(5);
    const adapter = new McpToolAdapter(fixture.client, fixture.catalog);
    try {
      await expect(
        adapter.call("employee_lookup_001", { employeeId: "" }),
      ).rejects.toThrow();
      expect(fixture.callCounts.get("employee_lookup_001") ?? 0).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it("exposes only the intersection of constructor and run allowlists", async () => {
    const fixture = await createSyntheticMcpFixture(5);
    const adapter = new McpToolAdapter(
      fixture.client,
      fixture.catalog,
      new Set(["employee_lookup_001", "department_retrieve_001"]),
    );
    try {
      const tools = await adapter.agentsTools(
        "direct",
        new Set(["employee_lookup_001"]),
      );
      expect(tools.map((item) => item.name)).toEqual(["employee_lookup_001"]);
      await expect(
        adapter.call(
          "department_retrieve_001",
          { departmentId: "D-07" },
          new Set(["employee_lookup_001"]),
        ),
      ).rejects.toThrow(/not allowlisted/);
      expect(fixture.callCounts.get("department_retrieve_001") ?? 0).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it("applies the same department deny policy before the MCP server is invoked", async () => {
    const fixture = await createSyntheticMcpFixture(5);
    const adapter = new McpToolAdapter(fixture.client, fixture.catalog);
    try {
      await expect(
        adapter.call("department_retrieve_001", {
          departmentId: "D-RESTRICTED",
        }),
      ).rejects.toBeInstanceOf(ToolPermissionError);
      expect(fixture.callCounts.get("department_retrieve_001") ?? 0).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it("surfaces MCP tool errors through the shared adapter", async () => {
    const fixture = await createSyntheticMcpFixture(5);
    const adapter = new McpToolAdapter(fixture.client, fixture.catalog);
    try {
      await expect(
        adapter.call("task_search_001", { query: "failure-case" }),
      ).rejects.toThrow("Synthetic task search failure");
      expect(adapter.errors).toBe(1);
    } finally {
      await fixture.close();
    }
  });
});

import { describe, expect, it } from "vitest";
import { createSyntheticMcpFixture } from "../src/fixture.js";

describe("synthetic MCP fixture", () => {
  it.each([5, 20, 50, 100] as const)(
    "registers exactly %i tools over the MCP protocol",
    async (size) => {
      const fixture = await createSyntheticMcpFixture(size);
      try {
        const listed = await fixture.client.listTools();
        expect(listed.tools).toHaveLength(size);
        expect(new Set(listed.tools.map((tool) => tool.name)).size).toBe(size);
        expect(listed.tools[0]?.inputSchema).toMatchObject({ type: "object" });
        const result = await fixture.client.callTool({
          name: "employee_lookup_001",
          arguments: { employeeId: "E-0042" },
        });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          employeeId: "E-0042",
          name: "Asha Rao",
        });
      } finally {
        await fixture.close();
      }
    },
  );

  it("returns MCP error results for invalid synthetic operations", async () => {
    const fixture = await createSyntheticMcpFixture(5);
    try {
      const result = await fixture.client.callTool({
        name: "task_search_001",
        arguments: { query: "failure-case" },
      });
      expect(result.isError).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it("serves synthetic course and assignment records", async () => {
    const fixture = await createSyntheticMcpFixture(5);
    try {
      const courses = await fixture.client.callTool({
        name: "classroom_query_001",
        arguments: { query: "MCP", kind: "courses" },
      });
      const assignments = await fixture.client.callTool({
        name: "classroom_query_001",
        arguments: { query: "MCP", kind: "assignments" },
      });
      expect(
        (courses.structuredContent as { items: unknown[] }).items[0],
      ).toMatchObject({
        courseId: "C-01",
      });
      expect(
        (assignments.structuredContent as { items: unknown[] }).items[0],
      ).toMatchObject({
        assignmentId: "A-01",
      });
    } finally {
      await fixture.close();
    }
  });
});

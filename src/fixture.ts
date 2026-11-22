import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { CatalogSize } from "./types.js";

export const employeeSchema = z.object({ employeeId: z.string().min(1) });
export const departmentSchema = z.object({ departmentId: z.string().min(1) });
export const taskSearchSchema = z.object({
  query: z.string(),
  cursor: z.string().optional(),
  pageSize: z.number().int().min(1).max(100).default(2),
});
export const reportSchema = z.object({
  departmentId: z.string().min(1),
  detail: z.enum(["summary", "large"]).default("summary"),
});
export const classroomSchema = z.object({
  query: z.string(),
  kind: z.enum(["courses", "assignments"]).default("courses"),
});

export type ToolFamily =
  | "employee_lookup"
  | "department_retrieve"
  | "task_search"
  | "report_aggregate"
  | "classroom_query";
export type ToolArgs =
  | z.infer<typeof employeeSchema>
  | z.infer<typeof departmentSchema>
  | z.infer<typeof taskSearchSchema>
  | z.infer<typeof reportSchema>
  | z.infer<typeof classroomSchema>;

export interface ToolDescriptor {
  name: string;
  description: string;
  family: ToolFamily;
  schema: z.ZodObject<any>;
  permissioned?: boolean;
}

const families: Array<{
  family: ToolFamily;
  prefix: string;
  description: string;
  schema: z.ZodObject<any>;
}> = [
  {
    family: "employee_lookup",
    prefix: "employee_lookup",
    description: "Look up a synthetic employee by identifier.",
    schema: employeeSchema,
  },
  {
    family: "department_retrieve",
    prefix: "department_retrieve",
    description: "Retrieve a synthetic department by identifier.",
    schema: departmentSchema,
  },
  {
    family: "task_search",
    prefix: "task_search",
    description: "Search synthetic tasks with cursor pagination.",
    schema: taskSearchSchema,
  },
  {
    family: "report_aggregate",
    prefix: "report_aggregate",
    description:
      "Aggregate synthetic department reports; large detail is bounded.",
    schema: reportSchema,
  },
  {
    family: "classroom_query",
    prefix: "classroom_query",
    description: "Search synthetic courses or assignments.",
    schema: classroomSchema,
  },
];

export const makeCatalog = (size: CatalogSize): ToolDescriptor[] =>
  Array.from({ length: size }, (_, index) => {
    const familySpec = families[index % families.length]!;
    const ordinal = Math.floor(index / families.length) + 1;
    return {
      name: `${familySpec.prefix}_${String(ordinal).padStart(3, "0")}`,
      description: `${familySpec.description} Catalog entry ${index + 1}.`,
      family: familySpec.family,
      schema: familySpec.schema,
      permissioned: familySpec.family === "department_retrieve",
    };
  });

const employees = new Map([
  ["E-0042", { employeeId: "E-0042", name: "Asha Rao", departmentId: "D-07" }],
]);
const departments = new Map([
  ["D-07", { departmentId: "D-07", name: "Learning Systems", totalTasks: 7 }],
]);
const tasks = Array.from({ length: 7 }, (_, i) => ({
  taskId: `T-${String(i + 1).padStart(3, "0")}`,
  title: `Synthetic task ${i + 1}`,
}));
const courses = [
  { courseId: "C-01", title: "MCP Foundations" },
  { courseId: "C-02", title: "Agent Tooling" },
];
const assignments = [
  { assignmentId: "A-01", courseId: "C-01", title: "Schema exercise" },
];

export function executeFixtureTool(
  descriptor: ToolDescriptor,
  rawArgs: unknown,
): unknown {
  const args = descriptor.schema.parse(rawArgs) as Record<string, unknown>;
  switch (descriptor.family) {
    case "employee_lookup": {
      const employee = employees.get(String(args.employeeId));
      if (!employee) throw new Error("Employee not found");
      return employee;
    }
    case "department_retrieve": {
      const id = String(args.departmentId);
      if (id === "D-RESTRICTED")
        throw new Error("Permission denied: department is restricted");
      const department = departments.get(id);
      if (!department) throw new Error("Department not found");
      return department;
    }
    case "task_search": {
      if (args.query === "failure-case")
        throw new Error("Synthetic task search failure");
      const start = args.cursor ? Number(args.cursor) : 0;
      const pageSize = Number(args.pageSize ?? 2);
      const page = tasks.slice(start, start + pageSize);
      return {
        items: page,
        nextCursor:
          start + pageSize < tasks.length ? String(start + pageSize) : null,
      };
    }
    case "report_aggregate": {
      if (!departments.has(String(args.departmentId)))
        throw new Error("Department not found");
      const count = args.detail === "large" ? 80 : 0;
      return {
        departmentId: args.departmentId,
        totalTasks: 7,
        items: Array.from({ length: count }, (_, i) => ({
          id: `R-${i + 1}`,
          value: i + 1,
        })),
      };
    }
    case "classroom_query":
      return args.kind === "assignments" ? assignments : courses;
  }
}

export interface SyntheticMcpFixture {
  server: McpServer;
  client: Client;
  catalog: ToolDescriptor[];
  callCounts: Map<string, number>;
  close(): Promise<void>;
}

export async function createSyntheticMcpFixture(
  size: CatalogSize,
): Promise<SyntheticMcpFixture> {
  const server = new McpServer({
    name: "mcp-flowbench-fixture",
    version: "0.1.0",
  });
  const client = new Client({ name: "mcp-flowbench", version: "0.1.0" });
  const catalog = makeCatalog(size);
  const callCounts = new Map<string, number>();
  for (const descriptor of catalog) {
    server.registerTool(
      descriptor.name,
      { description: descriptor.description, inputSchema: descriptor.schema },
      async (args) => {
        callCounts.set(
          descriptor.name,
          (callCounts.get(descriptor.name) ?? 0) + 1,
        );
        try {
          const output = executeFixtureTool(descriptor, args);
          const structuredContent = Array.isArray(output)
            ? { items: output }
            : (output as Record<string, unknown>);
          return {
            content: [{ type: "text", text: JSON.stringify(output) }],
            structuredContent,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : String(error),
              },
            ],
            isError: true,
          };
        }
      },
    );
  }
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  } catch (error) {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    throw error;
  }
  return {
    server,
    client,
    catalog,
    callCounts,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

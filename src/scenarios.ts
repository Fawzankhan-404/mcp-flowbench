import type { Scenario } from "./types.js";

export const scenarioDescriptions: Record<Scenario, string> = {
  "single-lookup": "Look up one synthetic employee.",
  "independent-calls":
    "Perform an employee lookup and department lookup independently.",
  "dependent-calls": "Look up a department, then aggregate its report.",
  "large-catalog": "Find and call a named tool in a large catalog.",
  "large-response": "Retrieve a bounded large synthetic report.",
  pagination: "Fetch adjacent task-search pages without duplicates.",
  "partial-failure":
    "Handle one failed task search and one successful report call.",
  "concurrent-discovery": "Issue concurrent MCP tool discovery requests.",
  "cache-invalidation": "Refresh cached discovery after explicit invalidation.",
  "permission-denied":
    "Verify a restricted department lookup is denied before dispatch.",
};

export const scenarioPrompt = (
  scenario: Scenario,
  targetTool: string,
): string => {
  const instructions: Record<Scenario, string> = {
    "single-lookup":
      "Call employee lookup for E-0042 and return JSON with employeeId and name.",
    "independent-calls":
      "Independently look up E-0042 and department D-07. Return both JSON records.",
    "dependent-calls":
      "Look up department D-07, then use its id to aggregate its report. Return JSON with departmentId and totalTasks.",
    "large-catalog": `Find the exact tool named ${targetTool}, call it with valid arguments for employee E-0042, and return its result as JSON.`,
    "large-response":
      "Call the report tool for D-07 requesting large detail. Return JSON with departmentId and itemCount.",
    pagination:
      "Search tasks with query all using page size 2, fetch the next page using its cursor, and return JSON with uniqueTaskIds.",
    "partial-failure":
      "Search tasks with query failure-case, then aggregate D-07. Report JSON with searchFailed and totalTasks.",
    "concurrent-discovery":
      "Call employee lookup for E-0042 and return its JSON result.",
    "cache-invalidation":
      "Call employee lookup for E-0042 and return its JSON result.",
    "permission-denied":
      "Attempt the restricted lookup for department D-RESTRICTED. Return JSON stating denied=true.",
  };
  return `${instructions[scenario]} Use only available tools. Final answer must be a JSON object.`;
};

export const strategyInstruction = (strategy: "direct" | "programmatic") =>
  strategy === "direct"
    ? "Invoke the available tools directly as needed."
    : "Use Programmatic Tool Calling to coordinate tool work; invoke the available tools only from the programmatic tool environment.";

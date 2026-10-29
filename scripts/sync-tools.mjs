// Copies the MCP server's tools/list result into appPackage/ai-plugin.json: the inline
// mcp_tool_description.tools, functions and run_for_functions.
// Uses the spike's `npm run tool-description`, which runs the server in-process (no server or Azure needed).
// Usage: node scripts/sync-tools.mjs [path-to-copilot-mcp-spike]   (default: ../copilot-mcp-spike)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const spike = resolve(root, process.argv[2] ?? "../copilot-mcp-spike");
const pluginPath = join(root, "appPackage/ai-plugin.json");

const dir = mkdtempSync(join(tmpdir(), "mcp-tools-"));
let tools;
try {
  const out = join(dir, "tools.json");
  execFileSync("npm", ["run", "-s", "tool-description", "--", "--out", out], { cwd: spike, stdio: "inherit" });
  ({ tools } = JSON.parse(readFileSync(out, "utf8")));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const plugin = JSON.parse(readFileSync(pluginPath, "utf8"));
const runtime = plugin.runtimes.find((r) => r.type === "RemoteMCPServer");
plugin.functions = tools.map(({ name, description }) => ({ name, description }));
runtime.run_for_functions = tools.map((t) => t.name);
// Inline rather than { "file": "mcp-tools.json" }: Agents Toolkit's validator rejects the file form
// ("mcp_tool_description must match exactly one schema in oneOf").
runtime.spec.mcp_tool_description = { tools };
writeFileSync(pluginPath, JSON.stringify(plugin, null, 4) + "\n");
console.log(`Synced ${tools.length} tools into appPackage/ai-plugin.json: ${runtime.run_for_functions.join(", ")}`);

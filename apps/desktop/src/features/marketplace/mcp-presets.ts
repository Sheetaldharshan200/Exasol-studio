/**
 * Curated MCP connector presets (verified packages only). Auth follows the
 * MCP spec's guidance for local stdio servers: environment-based credentials
 * (API tokens) — OAuth 2.1 + PKCE is the spec path for REMOTE servers and
 * slots in when we add HTTP transport. All open standards, no licensing.
 */
export type McpPreset = {
  id: string;
  name: string;
  desc: string;
  command: string;
  args: string[];
  env: { key: string; label: string; secret: boolean; hint?: string }[];
  /** Positional arguments the user supplies (appended to args in order). */
  argInputs?: { key: string; label: string; secret: boolean; hint?: string }[];
  /** Where the user creates the credential. */
  tokenUrl?: string;
  tokenHint?: string;
};

export const MCP_PRESETS: McpPreset[] = [
  {
    id: "jira",
    name: "Jira & Confluence",
    desc: "Search and read issues, pages, and sprints — then land them in Exasol for analysis.",
    command: "uvx",
    args: ["mcp-atlassian"],
    env: [
      { key: "JIRA_URL", label: "Jira URL", secret: false, hint: "https://your-team.atlassian.net" },
      { key: "JIRA_USERNAME", label: "Account email", secret: false },
      { key: "JIRA_API_TOKEN", label: "API token", secret: true },
    ],
    tokenUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
    tokenHint: "Create an API token in your Atlassian account (Security → API tokens). It acts like a scoped password and can be revoked anytime.",
  },
  {
    id: "github",
    name: "GitHub",
    desc: "Repos, issues, and pull requests — analyze engineering data next to your business data.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: [{ key: "GITHUB_PERSONAL_ACCESS_TOKEN", label: "Personal access token", secret: true }],
    tokenUrl: "https://github.com/settings/tokens",
    tokenHint: "Create a fine-grained personal access token with read-only scopes for the repos you need — revocable and least-privilege.",
  },
  {
    id: "excel",
    name: "Excel workbooks",
    desc: "Read and write .xlsx files — sheets straight into Exasol tables.",
    command: "uvx",
    args: ["excel-mcp-server", "stdio"],
    env: [],
  },
  {
    id: "files",
    name: "Local files",
    desc: "Read files and folders (CSV, JSON, logs) for the agent to import.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"],
    env: [],
  },
  {
    id: "postgres",
    name: "Postgres",
    desc: "Query an operational Postgres database — compare or migrate data into Exasol.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    env: [],
    argInputs: [{ key: "url", label: "Connection string", secret: true, hint: "postgresql://user:pass@host:5432/db" }],
    tokenHint: "Use a READ-ONLY database role where possible — the connection string is sealed at rest like every connector credential.",
  },
  {
    id: "sqlite",
    name: "SQLite",
    desc: "Read a local SQLite file — app data and exports straight into Exasol.",
    command: "uvx",
    args: ["mcp-server-sqlite", "--db-path"],
    env: [],
    argInputs: [{ key: "path", label: "Database file path", secret: false, hint: "/Users/you/data/app.db" }],
  },
  {
    id: "custom",
    name: "Custom server",
    desc: "Any stdio MCP server — your own or from the community.",
    command: "",
    args: [],
    env: [],
  },
];

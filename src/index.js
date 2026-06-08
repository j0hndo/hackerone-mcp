#!/usr/bin/env node
// HackerOne MCP server — exposes the documented Hacker API (Hackers section)
// as MCP tools. See src/h1client.js for the endpoint implementations.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as h1 from "./h1client.js";

const server = new McpServer({ name: "hackerone", version: "1.0.0" });

// Wrap a handler so any thrown error becomes an MCP tool error result.
function tool(name, description, schema, fn) {
  server.tool(name, description, schema, async (args) => {
    try {
      const result = await fn(args ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }],
        isError: true,
      };
    }
  });
}

const SEVERITY = z.enum(["none", "low", "medium", "high", "critical"]);

// ── Reports ─────────────────────────────────────────────────────────
tool(
  "list_my_reports",
  "List the reports you have submitted (GET /hackers/me/reports). Returns id, title, state, severity, bounty, program. Paginated.",
  {
    page_number: z.number().int().min(1).optional().describe("Page number (default 1)"),
    page_size: z.number().int().min(1).max(100).optional().describe("Results per page (default 25)"),
  },
  (a) => h1.listMyReports(a),
);

tool(
  "get_report",
  "Get full details of one of your reports by ID (GET /hackers/reports/{id}): vulnerability info, impact, CVSS vector/score, bounty, attachments, timeline fields, program.",
  { report_id: z.string().describe("The HackerOne report ID") },
  (a) => h1.getReport(a.report_id),
);

tool(
  "submit_report",
  "Submit a NEW vulnerability report directly to a program (POST /hackers/reports). Use get_program_scope and get_program_weaknesses first to get structured_scope_id / weakness_id. Returns the new report id + URL.",
  {
    team_handle: z.string().describe("Program handle to submit to (e.g. 'security')"),
    title: z.string().describe("Report title"),
    vulnerability_information: z.string().describe("Full details in markdown: root cause, steps to reproduce, PoC"),
    impact: z.string().optional().describe("Impact statement — what an attacker achieves"),
    severity_rating: SEVERITY.optional().describe("Suggested severity"),
    weakness_id: z.union([z.string(), z.number()]).optional().describe("Numeric weakness id from get_program_weaknesses"),
    structured_scope_id: z.union([z.string(), z.number()]).optional().describe("Numeric scope id from get_program_scope"),
  },
  (a) => h1.submitReport(a),
);

// ── Hacktivity ──────────────────────────────────────────────────────
tool(
  "search_hacktivity",
  "Search publicly disclosed reports (GET /hackers/hacktivity). queryString uses Apache Lucene syntax, e.g. 'weakness_id:79', 'severity_rating:critical', 'cwe:79 AND disclosed:true'. Great for prior-art and what programs pay for.",
  {
    query_string: z.string().optional().describe("Lucene query (e.g. 'severity_rating:critical AND cwe:79')"),
    page_number: z.number().int().min(1).optional().describe("Page number (default 1)"),
    page_size: z.number().int().min(1).max(100).optional().describe("Results per page (default 25)"),
  },
  (a) => h1.hacktivity(a),
);

// ── Programs ────────────────────────────────────────────────────────
tool(
  "list_programs",
  "List all bug bounty programs you have access to (GET /hackers/programs). Auto-paginated.",
  { page_size: z.number().int().min(1).max(1000).optional().describe("Cap results (default: all)") },
  (a) => h1.listPrograms(a),
);

tool(
  "get_program",
  "Get one program's details (GET /hackers/programs/{handle}): policy, submission state, response metrics, bounty splitting.",
  { handle: z.string().describe("Program handle (e.g. 'security')") },
  (a) => h1.getProgram(a.handle),
);

tool(
  "get_program_scope",
  "Get a program's in-scope assets / structured scopes (GET /hackers/programs/{handle}/structured_scopes). Auto-paginated. Returns asset_type, asset_identifier, bounty eligibility, max_severity, and the id needed for submit_report.",
  {
    handle: z.string().describe("Program handle"),
    page_size: z.number().int().min(1).max(1000).optional().describe("Cap results (default: all)"),
  },
  (a) => h1.getProgramScope(a.handle, a),
);

tool(
  "get_program_weaknesses",
  "Get the weakness/CWE types a program accepts (GET /hackers/programs/{handle}/weaknesses). Auto-paginated. Returns the id needed for submit_report and external_id (e.g. 'cwe-79').",
  {
    handle: z.string().describe("Program handle"),
    page_size: z.number().int().min(1).max(1000).optional().describe("Cap results (default: all)"),
  },
  (a) => h1.getProgramWeaknesses(a.handle, a),
);

tool(
  "get_program_scope_exclusions",
  "Get a program's out-of-scope / ineligible categories (GET /hackers/programs/{handle}/scope_exclusions). Auto-paginated.",
  {
    handle: z.string().describe("Program handle"),
    page_size: z.number().int().min(1).max(1000).optional().describe("Cap results (default: all)"),
  },
  (a) => h1.getProgramScopeExclusions(a.handle, a),
);

// ── Payments ────────────────────────────────────────────────────────
tool(
  "get_balance",
  "Get your current unpaid bounty balance (GET /hackers/payments/balance).",
  {},
  () => h1.getBalance(),
);

tool(
  "get_earnings",
  "Get your bounty earnings history (GET /hackers/payments/earnings): amount, currency, date, awarding program. Paginated.",
  {
    page_number: z.number().int().min(1).optional(),
    page_size: z.number().int().min(1).max(100).optional().describe("Default 100"),
  },
  (a) => h1.getEarnings(a),
);

tool(
  "get_payouts",
  "Get your payout history (GET /hackers/payments/payouts): amount, paid_out_at, reference, provider, status. Paginated.",
  {
    page_number: z.number().int().min(1).optional(),
    page_size: z.number().int().min(1).max(100).optional().describe("Default 100"),
  },
  (a) => h1.getPayouts(a),
);

// ── Report Intents (draft → submit) ─────────────────────────────────
tool(
  "list_report_intents",
  "List your report intents / drafts (GET /hackers/report_intents). Returns id, title, description, state, and AI job statuses.",
  {
    page_number: z.number().int().min(1).optional(),
    page_size: z.number().int().min(1).max(100).optional().describe("Default 25"),
  },
  (a) => h1.listReportIntents(a),
);

tool(
  "create_report_intent",
  "Create a new report intent / draft (POST /hackers/report_intents). Takes team_handle + a free-text description; HackerOne's assistant structures it into a draft you can later submit_report_intent.",
  {
    team_handle: z.string().describe("Program handle the draft targets"),
    description: z.string().describe("Free-text vulnerability description / reproduction steps"),
  },
  (a) => h1.createReportIntent(a),
);

tool(
  "get_report_intent",
  "Get a single report intent / draft by ID (GET /hackers/report_intents/{id}).",
  { report_intent_id: z.string().describe("Report intent ID") },
  (a) => h1.getReportIntent(a.report_intent_id),
);

tool(
  "update_report_intent",
  "Update a report intent's description (PATCH /hackers/report_intents/{id}).",
  {
    report_intent_id: z.string().describe("Report intent ID"),
    description: z.string().describe("New description"),
  },
  (a) => h1.updateReportIntent(a.report_intent_id, a),
);

tool(
  "delete_report_intent",
  "Delete a report intent / draft (DELETE /hackers/report_intents/{id}).",
  { report_intent_id: z.string().describe("Report intent ID") },
  (a) => h1.deleteReportIntent(a.report_intent_id),
);

tool(
  "submit_report_intent",
  "Submit a report intent as a formal report (POST /hackers/report_intents/{id}/submit). The draft must be in a ready_to_submit state.",
  { report_intent_id: z.string().describe("Report intent ID") },
  (a) => h1.submitReportIntent(a.report_intent_id),
);

tool(
  "list_report_intent_attachments",
  "List attachments on a report intent (GET /hackers/report_intents/{id}/attachments).",
  { report_intent_id: z.string().describe("Report intent ID") },
  (a) => h1.listReportIntentAttachments(a.report_intent_id),
);

tool(
  "upload_report_intent_attachment",
  "Upload one or more local files to a report intent (POST /hackers/report_intents/{id}/attachments, multipart files[]).",
  {
    report_intent_id: z.string().describe("Report intent ID"),
    file_paths: z.array(z.string()).min(1).describe("Absolute paths of local files to upload"),
  },
  (a) => h1.uploadReportIntentAttachments(a.report_intent_id, a.file_paths),
);

tool(
  "delete_report_intent_attachment",
  "Remove one attachment from a report intent (DELETE /hackers/report_intents/{id}/attachments/{attachment_id}).",
  {
    report_intent_id: z.string().describe("Report intent ID"),
    attachment_id: z.string().describe("Attachment ID to remove"),
  },
  (a) => h1.deleteReportIntentAttachment(a.report_intent_id, a.attachment_id),
);

// ── Start ───────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HackerOne MCP server (Hacker API) running on stdio");
}
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

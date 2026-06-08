<div align="center">

# 🛡️ hackerone-mcp

### A Model Context Protocol server for the HackerOne **Hacker API**

Drive your bug-bounty workflow — reports, programs, scope, hacktivity, payouts and
AI-assisted drafts — straight from any MCP-capable client like **Claude Code**.

[![MCP](https://img.shields.io/badge/Model_Context_Protocol-server-6E56CF?style=flat-square)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![ESM](https://img.shields.io/badge/Pure_ESM-no_build_step-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://nodejs.org/api/esm.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](#-license)
[![HackerOne API](https://img.shields.io/badge/HackerOne-Hacker_API-494649?style=flat-square&logo=hackerone&logoColor=white)](https://api.hackerone.com/hacker-resources/)

</div>

---

## ✨ Highlights

- **21 tools** covering the entire documented *Hackers* surface of the HackerOne API.
- **Pure ESM, zero build step** — just `node src/index.js`. Uses the runtime's global `fetch`/`FormData` (Node ≥ 18).
- **Read-safe by design** — only the documented *Hackers* endpoints are implemented; no Customer/admin surface.
- **Resilient client** — automatic JSON:API pagination plus `429` back-off honoring `Retry-After`.
- **Minimal deps** — only `@modelcontextprotocol/sdk` and `zod`.

---

## 📋 Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js ≥ 18** | Needs global `fetch` / `FormData` / `Blob` |
| **HackerOne API token** | *HackerOne → Settings → [API Token](https://hackerone.com/settings/api_token/edit)* |

Authentication is HTTP Basic using your **token identifier** as the username and the
**token value** as the password, supplied through environment variables.

---

## 🚀 Install

```bash
git clone https://github.com/j0hndo/hackerone-mcp.git
cd hackerone-mcp
npm install
```

---

## 🔌 Register in Claude Code

Add the block below to your `~/.claude.json` under `mcpServers`, then restart
Claude Code (or reconnect the server).

```json
"hackerone": {
  "command": "node",
  "args": [
    "/ABSOLUTE/PATH/TO/hackerone-mcp/src/index.js"
  ],
  "env": {
    "H1_USERNAME": "YOUR-USERNAME",
    "H1_API_TOKEN": "YOUR-TOKEN"
  },
  "type": "stdio"
}
```

| Field | Value |
|---|---|
| `args[0]` | Absolute path to `src/index.js` in this folder. On Windows use forward slashes, e.g. `C:/Users/you/hackerone-mcp/src/index.js` |
| `H1_USERNAME` | Your HackerOne API token **identifier** |
| `H1_API_TOKEN` | Your HackerOne API token **value** |

> Works with any MCP client over **stdio**, not just Claude Code — point your client at `node src/index.js` with the two env vars set.

---

## 🔥 Smoke test (read-only)

Verify your token and connectivity without writing anything:

```powershell
# PowerShell
$env:H1_USERNAME="<id>"; $env:H1_API_TOKEN="<token>"; node scripts/smoke.js
```

```bash
# bash / zsh
H1_USERNAME=<id> H1_API_TOKEN=<token> node scripts/smoke.js
```

---

## 🧰 Tools

<details open>
<summary><b>Reports</b></summary>

| Tool | Endpoint |
|---|---|
| `list_my_reports` | `GET /hackers/me/reports` |
| `get_report` | `GET /hackers/reports/{id}` |
| `submit_report` | `POST /hackers/reports` |

</details>

<details open>
<summary><b>Programs &amp; Hacktivity</b></summary>

| Tool | Endpoint |
|---|---|
| `search_hacktivity` | `GET /hackers/hacktivity` |
| `list_programs` | `GET /hackers/programs` |
| `get_program` | `GET /hackers/programs/{handle}` |
| `get_program_scope` | `GET /hackers/programs/{handle}/structured_scopes` |
| `get_program_weaknesses` | `GET /hackers/programs/{handle}/weaknesses` |
| `get_program_scope_exclusions` | `GET /hackers/programs/{handle}/scope_exclusions` |

</details>

<details open>
<summary><b>Payments</b></summary>

| Tool | Endpoint |
|---|---|
| `get_balance` | `GET /hackers/payments/balance` |
| `get_earnings` | `GET /hackers/payments/earnings` |
| `get_payouts` | `GET /hackers/payments/payouts` |

</details>

<details open>
<summary><b>Report Intents (AI-assisted draft → submit)</b></summary>

| Tool | Endpoint |
|---|---|
| `list_report_intents` | `GET /hackers/report_intents` |
| `create_report_intent` | `POST /hackers/report_intents` |
| `get_report_intent` | `GET /hackers/report_intents/{id}` |
| `update_report_intent` | `PATCH /hackers/report_intents/{id}` |
| `delete_report_intent` | `DELETE /hackers/report_intents/{id}` |
| `submit_report_intent` | `POST /hackers/report_intents/{id}/submit` |
| `list_report_intent_attachments` | `GET /hackers/report_intents/{id}/attachments` |
| `upload_report_intent_attachment` | `POST /hackers/report_intents/{id}/attachments` |
| `delete_report_intent_attachment` | `DELETE /hackers/report_intents/{id}/attachments/{id}` |

</details>

---

## ⏱️ Rate limits

The HackerOne Hacker API allows **600 reads/min** and **25 writes / 20 s**. This
client automatically retries `429` responses using the `Retry-After` header.

---

## 📦 Project layout

```
hackerone-mcp/
├── src/
│   ├── index.js      # MCP server — tool definitions (zod schemas)
│   └── h1client.js   # HackerOne Hacker API client (fetch, pagination, back-off)
├── scripts/
│   └── smoke.js      # read-only connectivity check
├── package.json
└── README.md
```

---

## 🧭 Scope &amp; limitations

This server implements **only** the documented *Hackers* section of the
[HackerOne API](https://api.hackerone.com/hacker-resources/). No Customer/program-owner
endpoints are included.

Not currently implemented (undocumented in the Hacker section):

- `GET /hackers/me` (profile)
- `POST /hackers/reports/{id}/activities` (comments)

PRs welcome if HackerOne documents these.

---

## 🤝 Contributing

Issues and pull requests are welcome. Keep the server faithful to the **documented**
Hacker API surface and preserve the read-safe boundary.

---

## ⚖️ License

[MIT](LICENSE) © j0hndo

---

<div align="center">
<sub>Built for security researchers who'd rather hunt than click through a web UI.</sub>
</div>

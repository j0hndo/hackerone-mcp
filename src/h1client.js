// HackerOne Hacker API client.
// Implements ONLY the documented "Hackers" section of
// https://api.hackerone.com/hacker-resources/ (no Customer endpoints).
//
// Auth: HTTP Basic with <API token identifier>:<API token value> as
// username:password, sent on every request (docs: "Getting Started").
// Read ops: 600 req/min. Write ops: 25 req / 20s. 401 = bad token, 429 = throttled.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const H1_BASE = "https://api.hackerone.com/v1";

// ── Auth ────────────────────────────────────────────────────────────
function authHeader() {
  const username = process.env.H1_USERNAME;
  const token = process.env.H1_API_TOKEN;
  if (!username || !token) {
    throw new Error(
      "Missing H1_USERNAME or H1_API_TOKEN environment variables",
    );
  }
  return "Basic " + Buffer.from(`${username}:${token}`).toString("base64");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Core request (JSON in / JSON out) with 429 backoff ──────────────
async function request(method, path, { params, body } = {}) {
  const url = new URL(`${H1_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const headers = {
    Authorization: authHeader(),
    Accept: "application/json",
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1)); // 1s,2s,4s
    let res;
    try {
      res = await fetch(url.toString(), init);
    } catch (err) {
      lastErr = err; // network blip → retry
      continue;
    }
    if (res.status === 429) {
      const ra = res.headers.get("retry-after");
      await sleep(ra ? parseInt(ra, 10) * 1000 : 5000);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HackerOne API error ${res.status}: ${text}`);
    }
    if (res.status === 204) return {};
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }
  throw lastErr ?? new Error(`${method} ${path} failed after retries`);
}

// ── Auto-pagination (JSON:API page[number]/page[size]) ──────────────
async function fetchAll(path, params = {}, { maxPages = 50, pageSize = 100 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await request("GET", path, {
      params: { ...params, "page[size]": pageSize, "page[number]": page },
    });
    const items = data.data ?? [];
    out.push(...items);
    if (items.length < pageSize) break; // last page
    // JSON:API also exposes links.next; stop if absent
    if (!data.links?.next) break;
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════
//  REPORTS
// ════════════════════════════════════════════════════════════════════

// GET /hackers/me/reports
export async function listMyReports({ page_number, page_size } = {}) {
  const data = await request("GET", "/hackers/me/reports", {
    params: { "page[number]": page_number, "page[size]": page_size ?? 25 },
  });
  return (data.data ?? []).map(mapReportSummary);
}

// GET /hackers/reports/{id}
export async function getReport(id) {
  const data = await request("GET", `/hackers/reports/${id}`);
  return mapReportFull(data.data);
}

// POST /hackers/reports
// Documented attributes: team_handle, title, vulnerability_information,
// impact, severity_rating, weakness_id (int), structured_scope_id (int).
export async function submitReport(opts) {
  const attributes = {
    team_handle: opts.team_handle,
    title: opts.title,
    vulnerability_information: opts.vulnerability_information,
    impact: opts.impact ?? "",
  };
  if (opts.severity_rating) attributes.severity_rating = opts.severity_rating;
  if (opts.weakness_id != null) attributes.weakness_id = Number(opts.weakness_id);
  if (opts.structured_scope_id != null)
    attributes.structured_scope_id = Number(opts.structured_scope_id);

  const data = await request("POST", "/hackers/reports", {
    body: { data: { type: "report", attributes } },
  });
  const r = data.data ?? {};
  return {
    id: r.id,
    title: r.attributes?.title,
    state: r.attributes?.state,
    created_at: r.attributes?.created_at,
    url: r.id ? `https://hackerone.com/reports/${r.id}` : undefined,
  };
}

// ════════════════════════════════════════════════════════════════════
//  HACKTIVITY  (publicly disclosed reports)
// ════════════════════════════════════════════════════════════════════

// GET /hackers/hacktivity — queryString uses Apache Lucene syntax.
export async function hacktivity({ query_string, page_number, page_size } = {}) {
  const data = await request("GET", "/hackers/hacktivity", {
    params: {
      queryString: query_string,
      "page[number]": page_number,
      "page[size]": page_size ?? 25,
    },
  });
  return (data.data ?? []).map((r) => ({
    id: r.id,
    title: r.attributes?.title ?? r.attributes?.raw_title ?? null,
    severity: r.attributes?.severity_rating ?? null,
    substate: r.attributes?.substate ?? null,
    disclosed_at: r.attributes?.disclosed_at ?? null,
    total_awarded_amount: r.attributes?.total_awarded_amount ?? null,
    upvotes: r.attributes?.vote_count ?? r.attributes?.upvotes ?? null,
    url: r.attributes?.url ?? `https://hackerone.com/reports/${r.id}`,
    reporter: r.relationships?.reporter?.data?.attributes?.username ?? null,
    program:
      r.relationships?.team?.data?.attributes?.handle ??
      r.relationships?.program?.data?.attributes?.handle ??
      null,
    weakness: r.relationships?.weakness?.data?.attributes?.name ?? null,
  }));
}

// ════════════════════════════════════════════════════════════════════
//  PROGRAMS
// ════════════════════════════════════════════════════════════════════

// GET /hackers/programs  (auto-paginated)
export async function listPrograms({ page_size } = {}) {
  const all = await fetchAll("/hackers/programs");
  const out = all.map((p) => ({
    id: p.id,
    handle: p.attributes?.handle,
    name: p.attributes?.name,
    offers_bounties: p.attributes?.offers_bounties,
    state: p.attributes?.state,
    submission_state: p.attributes?.submission_state,
    started_accepting_at: p.attributes?.started_accepting_at,
  }));
  return page_size && page_size < out.length ? out.slice(0, page_size) : out;
}

// GET /hackers/programs/{handle}
export async function getProgram(handle) {
  const data = await request("GET", `/hackers/programs/${handle}`);
  const a = data.data?.attributes ?? {};
  return {
    id: data.data?.id,
    handle: a.handle,
    name: a.name,
    state: a.state,
    submission_state: a.submission_state,
    offers_bounties: a.offers_bounties,
    started_accepting_at: a.started_accepting_at,
    policy: a.policy,
    response_efficiency_percentage: a.response_efficiency_percentage,
    average_time_to_first_program_response:
      a.average_time_to_first_program_response,
    average_time_to_report_resolved: a.average_time_to_report_resolved,
    average_time_to_bounty_awarded: a.average_time_to_bounty_awarded,
    allow_bounty_splitting: a.allow_bounty_splitting,
  };
}

// GET /hackers/programs/{handle}/structured_scopes  (auto-paginated)
export async function getProgramScope(handle, { page_size } = {}) {
  const all = await fetchAll(`/hackers/programs/${handle}/structured_scopes`);
  const out = all.map((s) => ({
    id: s.id,
    asset_type: s.attributes?.asset_type,
    asset_identifier: s.attributes?.asset_identifier,
    eligible_for_bounty: s.attributes?.eligible_for_bounty,
    eligible_for_submission: s.attributes?.eligible_for_submission,
    max_severity: s.attributes?.max_severity,
    instruction: s.attributes?.instruction,
    created_at: s.attributes?.created_at,
    updated_at: s.attributes?.updated_at,
  }));
  return page_size && page_size < out.length ? out.slice(0, page_size) : out;
}

// GET /hackers/programs/{handle}/weaknesses  (auto-paginated)
export async function getProgramWeaknesses(handle, { page_size } = {}) {
  const all = await fetchAll(`/hackers/programs/${handle}/weaknesses`);
  const out = all.map((w) => ({
    id: w.id,
    name: w.attributes?.name,
    description: w.attributes?.description,
    external_id: w.attributes?.external_id, // e.g. "cwe-79"
  }));
  return page_size && page_size < out.length ? out.slice(0, page_size) : out;
}

// GET /hackers/programs/{handle}/scope_exclusions  (auto-paginated)
export async function getProgramScopeExclusions(handle, { page_size } = {}) {
  const all = await fetchAll(`/hackers/programs/${handle}/scope_exclusions`);
  const out = all.map((s) => ({
    id: s.id,
    type: s.type,
    category: s.attributes?.category,
    details: s.attributes?.details,
    created_at: s.attributes?.created_at,
    updated_at: s.attributes?.updated_at,
  }));
  return page_size && page_size < out.length ? out.slice(0, page_size) : out;
}

// ════════════════════════════════════════════════════════════════════
//  PAYMENTS
// ════════════════════════════════════════════════════════════════════

// GET /hackers/payments/balance
export async function getBalance() {
  const data = await request("GET", "/hackers/payments/balance");
  const a = data.data?.attributes ?? data.data ?? {};
  return {
    balance: a.balance ?? a.amount ?? null,
    currency: a.currency ?? null,
  };
}

// GET /hackers/payments/earnings
export async function getEarnings({ page_number, page_size } = {}) {
  const data = await request("GET", "/hackers/payments/earnings", {
    params: { "page[number]": page_number, "page[size]": page_size ?? 100 },
  });
  return (data.data ?? []).map((e) => ({
    id: e.id,
    amount: e.attributes?.amount,
    awarded_by: e.attributes?.awarded_by_name,
    created_at: e.attributes?.created_at,
    currency: e.relationships?.program?.data?.attributes?.currency ?? null,
    program: e.relationships?.program?.data?.attributes?.handle ?? null,
  }));
}

// GET /hackers/payments/payouts
export async function getPayouts({ page_number, page_size } = {}) {
  const data = await request("GET", "/hackers/payments/payouts", {
    params: { "page[number]": page_number, "page[size]": page_size ?? 100 },
  });
  return (data.data ?? []).map((p) => ({
    id: p.id,
    amount: p.attributes?.amount,
    paid_out_at: p.attributes?.paid_out_at,
    reference: p.attributes?.reference,
    payout_provider: p.attributes?.payout_provider,
    status: p.attributes?.status,
  }));
}

// ════════════════════════════════════════════════════════════════════
//  REPORT INTENTS  (AI-assisted draft workflow → submit)
// ════════════════════════════════════════════════════════════════════

function mapIntent(d) {
  if (!d) return null;
  const a = d.attributes ?? {};
  return {
    id: d.id,
    title: a.title,
    description: a.description,
    state: a.state,
    has_failing_jobs: a.has_failing_jobs,
    has_canceled_jobs: a.has_canceled_jobs,
    job_status_by_type: a.job_status_by_type,
    metadata: a.metadata,
  };
}

// GET /hackers/report_intents
export async function listReportIntents({ page_number, page_size } = {}) {
  const data = await request("GET", "/hackers/report_intents", {
    params: { "page[number]": page_number, "page[size]": page_size ?? 25 },
  });
  return (data.data ?? []).map(mapIntent);
}

// POST /hackers/report_intents  (attributes: team_handle, description)
export async function createReportIntent({ team_handle, description }) {
  const data = await request("POST", "/hackers/report_intents", {
    body: {
      data: { type: "report-intent", attributes: { team_handle, description } },
    },
  });
  return mapIntent(data.data);
}

// GET /hackers/report_intents/{id}
export async function getReportIntent(id) {
  const data = await request("GET", `/hackers/report_intents/${id}`);
  return mapIntent(data.data);
}

// PATCH /hackers/report_intents/{id}  (attributes: description)
export async function updateReportIntent(id, { description }) {
  const data = await request("PATCH", `/hackers/report_intents/${id}`, {
    body: { data: { type: "report-intent", attributes: { description } } },
  });
  return mapIntent(data.data);
}

// DELETE /hackers/report_intents/{id}
export async function deleteReportIntent(id) {
  await request("DELETE", `/hackers/report_intents/${id}`);
  return { id, deleted: true };
}

// POST /hackers/report_intents/{id}/submit  (no body) → returns report-intent
export async function submitReportIntent(id) {
  const data = await request("POST", `/hackers/report_intents/${id}/submit`);
  return mapIntent(data.data);
}

// GET /hackers/report_intents/{id}/attachments
export async function listReportIntentAttachments(id) {
  const data = await request(
    "GET",
    `/hackers/report_intents/${id}/attachments`,
  );
  return (data.data ?? []).map((a) => ({
    id: a.id,
    file_name: a.attributes?.file_name,
    content_type: a.attributes?.content_type,
    file_size: a.attributes?.file_size,
    expiring_url: a.attributes?.expiring_url,
  }));
}

// POST /hackers/report_intents/{id}/attachments  (multipart: files[])
export async function uploadReportIntentAttachments(id, filePaths) {
  const fd = new FormData();
  for (const p of filePaths) {
    const buf = await readFile(p);
    fd.append("files[]", new Blob([buf]), basename(p));
  }
  // Don't set Content-Type; fetch adds the multipart boundary automatically.
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    res = await fetch(
      `${H1_BASE}/hackers/report_intents/${id}/attachments`,
      { method: "POST", headers: { Authorization: authHeader(), Accept: "application/json" }, body: fd },
    );
    if (res.status === 429) {
      const ra = res.headers.get("retry-after");
      await sleep(ra ? parseInt(ra, 10) * 1000 : 5000);
      continue;
    }
    break;
  }
  if (!res.ok) {
    throw new Error(`HackerOne API error ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  const items = Array.isArray(data.data) ? data.data : [data.data].filter(Boolean);
  return items.map((a) => ({
    id: a.id,
    file_name: a.attributes?.file_name,
    content_type: a.attributes?.content_type,
    file_size: a.attributes?.file_size,
  }));
}

// DELETE /hackers/report_intents/{id}/attachments/{attachment_id}
export async function deleteReportIntentAttachment(id, attachmentId) {
  await request(
    "DELETE",
    `/hackers/report_intents/${id}/attachments/${attachmentId}`,
  );
  return { report_intent_id: id, attachment_id: attachmentId, deleted: true };
}

// ── shared report mappers ───────────────────────────────────────────
function mapReportSummary(r) {
  const a = r.attributes ?? {};
  const bounty = r.relationships?.bounties?.data?.[0]?.attributes;
  return {
    id: r.id,
    title: a.title,
    state: a.state,
    substate: a.substate,
    severity: a.severity_rating,
    created_at: a.created_at,
    disclosed_at: a.disclosed_at,
    bounty_awarded_at: a.bounty_awarded_at,
    bounty_amount: bounty?.amount ?? null,
    weakness: r.relationships?.weakness?.data?.attributes?.name ?? null,
    program: r.relationships?.program?.data?.attributes?.handle ?? null,
  };
}

function mapReportFull(r) {
  if (!r) return null;
  const a = r.attributes ?? {};
  const sev = r.relationships?.severity?.data?.attributes;
  const bounty = r.relationships?.bounties?.data?.[0]?.attributes;
  const attachments = r.relationships?.attachments?.data ?? [];
  return {
    id: r.id,
    title: a.title,
    state: a.state,
    substate: a.substate,
    created_at: a.created_at,
    triaged_at: a.triaged_at,
    closed_at: a.closed_at,
    disclosed_at: a.disclosed_at,
    bounty_awarded_at: a.bounty_awarded_at,
    severity: sev?.rating ?? a.severity_rating ?? null,
    cvss_score: sev?.score ?? null,
    cvss: sev?.attack_vector
      ? {
          attack_vector: sev.attack_vector,
          attack_complexity: sev.attack_complexity,
          privileges_required: sev.privileges_required,
          user_interaction: sev.user_interaction,
          scope: sev.scope,
          confidentiality: sev.confidentiality,
          integrity: sev.integrity,
          availability: sev.availability,
        }
      : null,
    bounty_amount: bounty?.amount ?? null,
    bounty_bonus: bounty?.bonus_amount ?? null,
    vulnerability_information: a.vulnerability_information,
    impact: a.impact,
    weakness: r.relationships?.weakness?.data?.attributes?.name ?? null,
    weakness_external_id:
      r.relationships?.weakness?.data?.attributes?.external_id ?? null,
    program: r.relationships?.program?.data?.attributes?.handle ?? null,
    structured_scope:
      r.relationships?.structured_scope?.data?.attributes?.asset_identifier ??
      null,
    attachments: attachments.map((at) => ({
      id: at.id,
      file_name: at.attributes?.file_name,
      content_type: at.attributes?.content_type,
      file_size: at.attributes?.file_size,
      expiring_url: at.attributes?.expiring_url,
    })),
  };
}

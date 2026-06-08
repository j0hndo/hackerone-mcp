// Read-only smoke test against the live HackerOne Hacker API.
// Usage: H1_USERNAME=.. H1_API_TOKEN=.. node scripts/smoke.js
import * as h1 from "../src/h1client.js";

const checks = [
  ["get_balance", () => h1.getBalance()],
  ["list_programs(cap 3)", () => h1.listPrograms({ page_size: 3 })],
  ["search_hacktivity(severity_rating:critical, 2)", () =>
    h1.hacktivity({ query_string: "severity_rating:critical", page_size: 2 })],
  ["list_my_reports(2)", () => h1.listMyReports({ page_size: 2 })],
  ["list_report_intents(2)", () => h1.listReportIntents({ page_size: 2 })],
  ["get_earnings(2)", () => h1.getEarnings({ page_size: 2 })],
];

let pass = 0,
  fail = 0;
for (const [name, fn] of checks) {
  try {
    const r = await fn();
    const n = Array.isArray(r) ? r.length : 1;
    console.log(`✅ ${name} -> ${n} item(s)`);
    pass++;
  } catch (e) {
    console.log(`❌ ${name} -> ${e.message}`);
    fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

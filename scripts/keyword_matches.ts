// Prints the pairs of reports whose duplicate keywords overlap enough to group at a threshold, using
// web/src/engine.ts itself so check_pairs.py never drifts from the dashboard. Reads
// {"threshold": t, "reports": [...]} on stdin, reports in the /api/reports shape; writes [[a, b], ...].
import { readFileSync } from "node:fs";
import { keywordMatches } from "../web/src/engine.ts";

const { threshold, reports } = JSON.parse(readFileSync(0, "utf8"));
const rs = reports.map((r: any) => ({ ...r, id: `gh#${r.number}`, createdAt: Date.parse(r.createdAt) }));
process.stdout.write(JSON.stringify(keywordMatches(rs, threshold)));

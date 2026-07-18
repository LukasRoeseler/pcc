#!/usr/bin/env node
// Crawls OpenAlex for every work affiliated with the University of Munster
// (ROR https://ror.org/00pd74e08) and estimates its APC cost.
//
// OpenAlex meters free usage at roughly $1/day per contact email, and that budget
// resets at midnight UTC, so a university's full output (which can span hundreds
// of thousands of works) cannot be fetched in a single run. Progress is
// checkpointed to data/progress.json after every page, so a run that gets
// rate-limited (or is simply cut off by MAX_REQUESTS_PER_RUN) picks up exactly
// where it left off the next time this script runs. Because the budget is a
// daily one, .github/workflows/munster-report.yml runs it once a day so the
// backlog keeps making steady progress; running it more often than daily would
// not help, since the budget would already be exhausted from the prior run.
//
// If a run fails for any other reason (a bug, a transient network error, an
// unexpected API response), whatever was fetched before the failure is still
// checkpointed and written out -- see the try/catch around the crawl call in
// main() below, and the `if: always()` commit step in the workflow.
//
// Once the full backlog has been fetched once, later runs switch to a cheap
// "delta" pass that only asks OpenAlex for works created/changed since the
// last run, rather than re-walking the entire institution's output every day.

const fs = require("fs");
const path = require("path");

const ROR_ID = "https://ror.org/00pd74e08";
const CONTACT_EMAIL = "lukas.roeseler@uni-muenster.de";
// Optional: if you ever get an OpenAlex API key (see openalex.org/pricing for
// current premium/higher-budget options), set it as a GitHub Actions secret
// named OPENALEX_API_KEY and it will be picked up automatically -- no other
// code changes needed.
const OPENALEX_API_KEY = process.env.OPENALEX_API_KEY || null;
const DATA_DIR = path.join(__dirname, "data");
const WORKS_FILE = path.join(DATA_DIR, "works.jsonl");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");
const PER_PAGE = 200;
// Keep each run well under OpenAlex's daily budget so a scheduled run finishes
// cleanly instead of getting cut off mid-page. Override via env var if needed.
const MAX_REQUESTS_PER_RUN = Number(process.env.MAX_REQUESTS_PER_RUN || 300);
const REQUEST_GAP_MS = 110;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  }
  return {
    cursor: "*",
    fetchedCount: 0,
    totalCount: null,
    done: false,
    backlogCompletedAt: null,
    lastRunAt: null,
    runs: 0,
  };
}

function saveProgress(progress) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function appendWorks(works) {
  if (!works.length) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lines = works.map((w) => JSON.stringify(w)).join("\n") + "\n";
  fs.appendFileSync(WORKS_FILE, lines);
}

function filterQuery(sinceDate) {
  const parts = [`authorships.institutions.ror:${ROR_ID}`];
  if (sinceDate) parts.push(`from_created_date:${sinceDate}`);
  return parts.join(",");
}

async function fetchPage(filter, cursor) {
  let url =
    `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}` +
    `&per_page=${PER_PAGE}&cursor=${encodeURIComponent(cursor)}&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
  if (OPENALEX_API_KEY) url += `&api_key=${encodeURIComponent(OPENALEX_API_KEY)}`;
  const res = await fetch(url);
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const retryAfter = Number(res.headers.get("retry-after") || body.retryAfter || 0);
    throw Object.assign(new Error(body.message || "OpenAlex budget exhausted for today"), {
      retryAfter,
      budgetExhausted: true,
    });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAlex request failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Mirrors the cost-priority logic used by the interactive calculator's estimateCost():
// a trusted paid-APC record always wins; otherwise preprints and diamond OA are free;
// gold/hybrid fall back to the journal's list price when no paid record exists;
// green/bronze/closed/unknown carry no APC paid by this route (the article may still
// have cost money via a subscription, which OpenAlex does not expose per-work).
function estimateCost(work) {
  const apcPaid = work.apc_paid && typeof work.apc_paid.value_usd === "number" ? work.apc_paid.value_usd : null;
  if (apcPaid != null) return { cost: apcPaid, source: "openalex_apc_paid" };

  if (work.type === "preprint") return { cost: 0, source: "preprint_server" };

  const oaStatus = work.open_access && work.open_access.oa_status;
  if (oaStatus === "diamond") return { cost: 0, source: "openalex_diamond" };

  if (oaStatus === "gold" || oaStatus === "hybrid") {
    const apcList = work.apc_list && typeof work.apc_list.value_usd === "number" ? work.apc_list.value_usd : null;
    if (apcList != null) return { cost: apcList, source: "openalex_apc_list" };
    return { cost: null, source: "no_apc_data" };
  }

  return { cost: 0, source: oaStatus ? `oa_status_${oaStatus}` : "unknown" };
}

function firstAuthorIsMuenster(work) {
  const authorships = work.authorships || [];
  const first = authorships.find((a) => a.author_position === "first");
  if (!first) return false;
  return (first.institutions || []).some((inst) => inst.ror === ROR_ID);
}

function simplifyWork(work) {
  const { cost, source } = estimateCost(work);
  const primarySource = work.primary_location && work.primary_location.source;
  return {
    id: work.id,
    doi: work.doi,
    title: work.title,
    publication_year: work.publication_year,
    type: work.type,
    oa_status: work.open_access && work.open_access.oa_status,
    // Proxy for "a free-to-read copy exists": at institution-wide scale, calling
    // Unpaywall once per work (as the single-user calculator does) is not viable,
    // so this reuses OpenAlex's own is_oa flag. See the report's methods section.
    has_pdf_proxy: !!(work.open_access && work.open_access.is_oa),
    cost_usd: cost,
    cost_source: source,
    cited_by_count: work.cited_by_count,
    is_retracted: !!work.is_retracted,
    journal: primarySource && primarySource.display_name,
    publisher: (primarySource && primarySource.host_organization_name) || null,
    mean_citedness: primarySource && primarySource.summary_stats && primarySource.summary_stats["2yr_mean_citedness"],
    field: work.primary_topic && work.primary_topic.field && work.primary_topic.field.display_name,
    is_first_author_muenster: firstAuthorIsMuenster(work),
  };
}

async function crawlBacklog(progress) {
  let requests = 0;
  let cursor = progress.cursor || "*";
  let fetchedThisRun = 0;

  while (requests < MAX_REQUESTS_PER_RUN) {
    let page;
    try {
      page = await fetchPage(filterQuery(), cursor);
    } catch (err) {
      if (err.budgetExhausted) {
        console.log(`Stopping backlog crawl: ${err.message} (retry after ${err.retryAfter}s). Progress saved; the next scheduled run resumes here.`);
        break;
      }
      throw err;
    }
    requests++;

    const works = (page.results || []).map(simplifyWork);
    appendWorks(works);
    fetchedThisRun += works.length;
    progress.fetchedCount += works.length;
    progress.totalCount = page.meta ? page.meta.count : progress.totalCount;

    const nextCursor = page.meta && page.meta.next_cursor;
    if (!nextCursor || works.length === 0) {
      progress.done = true;
      progress.cursor = null;
      progress.backlogCompletedAt = new Date().toISOString();
      break;
    }
    progress.cursor = nextCursor;
    saveProgress(progress);
    await sleep(REQUEST_GAP_MS);
  }

  return fetchedThisRun;
}

async function crawlDelta(progress) {
  const since = (progress.lastRunAt || progress.backlogCompletedAt).slice(0, 10);
  let requests = 0;
  let cursor = "*";
  let fetchedThisRun = 0;

  while (requests < MAX_REQUESTS_PER_RUN) {
    let page;
    try {
      page = await fetchPage(filterQuery(since), cursor);
    } catch (err) {
      if (err.budgetExhausted) {
        console.log(`Stopping delta pass: ${err.message} (retry after ${err.retryAfter}s). Will retry on the next scheduled run.`);
        break;
      }
      throw err;
    }
    requests++;

    const works = (page.results || []).map(simplifyWork);
    appendWorks(works);
    fetchedThisRun += works.length;

    const nextCursor = page.meta && page.meta.next_cursor;
    if (!nextCursor || works.length === 0) break;
    cursor = nextCursor;
    await sleep(REQUEST_GAP_MS);
  }

  return fetchedThisRun;
}

// Reads the append-only checkpoint log, deduplicates by work id (later entries
// win, so a delta re-fetch of an updated work replaces the older record), and
// writes both a full CSV (for download) and a compact columnar dataset.json
// (for the report's charts) -- flat per-work JSON would be tens of megabytes
// once the crawl covers hundreds of thousands of works.
function buildOutputs() {
  if (!fs.existsSync(WORKS_FILE)) return { count: 0 };

  const lines = fs.readFileSync(WORKS_FILE, "utf8").trim().split("\n").filter(Boolean);
  const byId = new Map();
  for (const line of lines) {
    try {
      const w = JSON.parse(line);
      if (w.id) byId.set(w.id, w);
    } catch (err) {
      // skip a corrupt checkpoint line rather than aborting the whole build
    }
  }
  const works = Array.from(byId.values());

  const csvHeader = [
    "id", "doi", "title", "publication_year", "type", "oa_status", "has_pdf_proxy",
    "cost_usd", "cost_source", "cited_by_count", "is_retracted", "journal",
    "publisher", "mean_citedness", "field", "is_first_author_muenster",
  ];
  const csvEscape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csvLines = [csvHeader.join(",")];
  for (const w of works) csvLines.push(csvHeader.map((k) => csvEscape(w[k])).join(","));
  fs.writeFileSync(path.join(DATA_DIR, "works.csv"), csvLines.join("\n"));

  // Dictionary-encode the two open-ended text columns so the dataset stays
  // compact even at institution scale (an index number instead of a repeated string).
  const publisherDict = [];
  const publisherIndex = new Map();
  const fieldDict = [];
  const fieldIndex = new Map();
  const internId = (dict, index, value) => {
    const key = value || "";
    if (!index.has(key)) {
      index.set(key, dict.length);
      dict.push(key);
    }
    return index.get(key);
  };

  const dataset = {
    generatedAt: new Date().toISOString(),
    n: works.length,
    publisherDict,
    fieldDict,
    id: [],
    doi: [],
    title: [],
    year: [],
    oa: [],
    hasPdf: [],
    cost: [],
    citations: [],
    retracted: [],
    publisher: [],
    field: [],
    firstAuthorMuenster: [],
  };

  for (const w of works) {
    dataset.id.push(w.id);
    dataset.doi.push(w.doi || null);
    dataset.title.push(w.title || null);
    dataset.year.push(w.publication_year || null);
    dataset.oa.push(w.oa_status || "unknown");
    dataset.hasPdf.push(!!w.has_pdf_proxy);
    dataset.cost.push(typeof w.cost_usd === "number" ? w.cost_usd : null);
    dataset.citations.push(typeof w.cited_by_count === "number" ? w.cited_by_count : 0);
    dataset.retracted.push(!!w.is_retracted);
    dataset.publisher.push(internId(publisherDict, publisherIndex, w.publisher));
    dataset.field.push(internId(fieldDict, fieldIndex, w.field));
    dataset.firstAuthorMuenster.push(!!w.is_first_author_muenster);
  }

  fs.writeFileSync(path.join(DATA_DIR, "dataset.json"), JSON.stringify(dataset));

  return { count: works.length };
}

async function main() {
  const progress = loadProgress();

  // A genuinely unexpected error (a bug, a transient network failure, a malformed
  // API response) must not lose the pages already fetched this run: every page is
  // already checkpointed to disk as it arrives (see appendWorks/saveProgress inside
  // crawlBacklog/crawlDelta), so the only thing this catch needs to do is make sure
  // progress.json and the derived CSV/dataset.json still get rebuilt from whatever
  // is on disk, and that the process exits non-zero afterwards so the failure is
  // still visible in the Actions log.
  let fetchedThisRun = 0;
  let runError = null;
  try {
    fetchedThisRun = progress.done ? await crawlDelta(progress) : await crawlBacklog(progress);
  } catch (err) {
    runError = err;
    console.error("Crawl run hit an unexpected error; saving whatever was fetched before it failed.");
    console.error(err);
  }

  progress.lastRunAt = new Date().toISOString();
  progress.runs = (progress.runs || 0) + 1;
  saveProgress(progress);

  const { count } = buildOutputs();

  console.log(
    `Fetched ${fetchedThisRun} work record${fetchedThisRun === 1 ? "" : "s"} this run. ` +
      `Deduplicated dataset now holds ${count} works` +
      (progress.totalCount ? ` (OpenAlex reports ~${progress.totalCount} total matches).` : ".")
  );

  if (runError) process.exitCode = 1;
}

main().catch((err) => {
  // Only reachable for errors in main() itself (e.g. a disk write failure), since
  // the crawl call above already has its own try/catch. Data already written to
  // disk up to this point is unaffected by this exiting non-zero.
  console.error(err);
  process.exitCode = 1;
});

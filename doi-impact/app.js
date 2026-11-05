/* DOI Impact Explorer, fully client-side */

const $ = (s) => document.querySelector(s);
const EMAIL_KEY = "doi-impact-email";
let citeChart = null;
let lastCitationSeries = [];
let lastDoi = "";

/* ---------------- helpers ---------------- */

function normalizeDoi(input) {
  return input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}
const isValidDoi = (d) => /^10\.\d{4,9}\/\S+$/i.test(d);

// Keep slashes, encode everything else
const encDoi = (doi) => doi.split("/").map(encodeURIComponent).join("/");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const fmt = (n, digits = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "–"
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

const getEmail = () => localStorage.getItem(EMAIL_KEY) || "";

const shortId = (openalexUrl) => (openalexUrl || "").split("/").pop();

async function getJSON(url, timeout = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) {
      const e = new Error(r.status === 404 ? "Not found" : `HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return await r.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out");
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function oaUrl(path, params = {}) {
  const u = new URL("https://api.openalex.org/" + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const email = getEmail();
  if (email) u.searchParams.set("mailto", email);
  return u.toString();
}

function setStatus(msg, type = "") {
  const el = $("#status");
  el.className = "status " + type;
  el.innerHTML = msg;
}

/* ---------------- API calls ---------------- */

const fetchOpenAlexWork = (doi) => getJSON(oaUrl(`works/doi:${encDoi(doi)}`));

// Full citation history: group citing works by publication year
async function fetchCitationHistory(workId) {
  const data = await getJSON(oaUrl("works", { filter: `cites:${workId}`, group_by: "publication_year" }));
  return (data.group_by || [])
    .map((g) => ({ year: parseInt(g.key, 10), count: g.count }))
    .filter((g) => !Number.isNaN(g.year));
}

const fetchSource = (sourceId) => getJSON(oaUrl(`sources/${sourceId}`));

async function fetchAuthors(authorIds) {
  if (!authorIds.length) return [];
  const data = await getJSON(
    oaUrl("authors", { filter: `openalex:${authorIds.join("|")}`, "per-page": "50" })
  );
  return data.results || [];
}

const fetchAltmetric = (doi) => getJSON(`https://api.altmetric.com/v1/doi/${encDoi(doi)}`);

const fetchBip = (doi) => getJSON(`https://bip-api.imsi.athenarc.gr/paper/scores/${encDoi(doi)}`);

function fetchCrossref(doi) {
  const email = getEmail();
  const q = email ? `?mailto=${encodeURIComponent(email)}` : "";
  return getJSON(`https://api.crossref.org/works/${encDoi(doi)}${q}`);
}

/* ---------------- rendering ---------------- */

function renderPaper(work, doi) {
  const authors = (work.authorships || []).map((a) => a.author?.display_name).filter(Boolean);
  const authorStr =
    authors.length > 8 ? authors.slice(0, 8).join(", ") + ` … (+${authors.length - 8} more)` : authors.join(", ");
  const source = work.primary_location?.source?.display_name;
  const oa = work.open_access?.is_oa;
  const pct = work.citation_normalized_percentile;

  $("#paper-card").innerHTML = `
    <h2 class="paper-title">${esc(work.display_name || work.title || "Untitled")}</h2>
    <div class="paper-meta">${esc(authorStr)}</div>
    <div class="paper-meta">
      ${source ? `<em>${esc(source)}</em> · ` : ""}${esc(work.publication_year || "")}
      · <a href="https://doi.org/${esc(doi)}" target="_blank" rel="noopener">doi:${esc(doi)}</a>
      · <a href="${esc(work.id)}" target="_blank" rel="noopener">OpenAlex</a>
    </div>
    <div class="tags">
      ${work.type ? `<span class="tag">${esc(work.type)}</span>` : ""}
      ${oa ? `<span class="tag oa">Open Access (${esc(work.open_access.oa_status)})</span>` : ""}
      ${pct?.is_in_top_1_percent ? `<span class="tag top">Top 1% cited</span>` : pct?.is_in_top_10_percent ? `<span class="tag top">Top 10% cited</span>` : ""}
    </div>`;
}

function metricTile(value, label, sub = "") {
  return `<div class="metric"><div class="value">${value}</div><div class="label">${label}</div>${
    sub ? `<div class="sub">${sub}</div>` : ""
  }</div>`;
}

function renderMetrics(work, extras = {}) {
  const pct = work.citation_normalized_percentile;
  const tiles = [
    metricTile(fmt(work.cited_by_count), "Citations (OpenAlex)"),
    metricTile(
      extras.crossref ?? '<span class="spinner"></span>',
      "Citations (Crossref)"
    ),
    metricTile(
      work.fwci != null ? fmt(work.fwci, 2) : "–",
      "FWCI",
      "Field-Weighted Citation Impact (1.0 = world average)"
    ),
    metricTile(
      pct?.value != null ? fmt(pct.value * 100, 1) + "%" : "–",
      "Citation percentile",
      "Normalized by field, year and type"
    ),
    metricTile(
      extras.altmetric ?? '<span class="spinner"></span>',
      "Altmetric score"
    ),
  ];
  $("#metrics-grid").innerHTML = tiles.join("");
}

function buildSeries(history, pubYear) {
  const currentYear = new Date().getFullYear();
  const map = new Map(history.map((h) => [h.year, h.count]));
  const years = history.map((h) => h.year);
  let start = Math.min(...years, pubYear || Infinity);
  if (!Number.isFinite(start)) start = currentYear;
  start = Math.max(start, (pubYear || start) - 1); // ignore odd pre-publication outliers
  const end = Math.max(currentYear, ...years);
  const out = [];
  let cum = 0;
  for (let y = start; y <= end; y++) {
    const c = map.get(y) || 0;
    cum += c;
    out.push({ year: y, count: c, cumulative: cum });
  }
  return out;
}

function renderChart(series, note) {
  lastCitationSeries = series;
  $("#chart-note").textContent = note || "";
  const ctx = $("#cite-chart").getContext("2d");
  if (citeChart) citeChart.destroy();
  citeChart = new Chart(ctx, {
    data: {
      labels: series.map((s) => s.year),
      datasets: [
        {
          type: "bar",
          label: "Citations per year",
          data: series.map((s) => s.count),
          backgroundColor: "rgba(59, 91, 219, 0.75)",
          borderRadius: 4,
          yAxisID: "y",
          order: 2,
        },
        {
          type: "line",
          label: "Cumulative citations",
          data: series.map((s) => s.cumulative),
          borderColor: "#f08c00",
          backgroundColor: "#f08c00",
          tension: 0.25,
          pointRadius: 3,
          yAxisID: "y1",
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Per year" } },
        y1: {
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Cumulative" },
        },
      },
    },
  });
}

function renderAltmetric(data) {
  const body = $("#altmetric-card .card-body");
  if (!data) {
    body.innerHTML = `<p class="muted">No Altmetric attention data found for this DOI (or the API could not be reached).</p>`;
    return;
  }
  const rows = [
    ["News outlets", data.cited_by_msm_count],
    ["Blogs", data.cited_by_feeds_count],
    ["Policy documents", data.cited_by_policies_count],
    ["Patents", data.cited_by_patents_count],
    ["X / Twitter users", data.cited_by_tweeters_count],
    ["Bluesky", data.cited_by_bluesky_count],
    ["Facebook pages", data.cited_by_fbwalls_count],
    ["Reddit", data.cited_by_rdts_count],
    ["Wikipedia", data.cited_by_wikipedia_count],
    ["Videos", data.cited_by_videos_count],
    ["Peer review sites", data.cited_by_peer_review_sites_count],
    ["Mendeley readers", data.readers?.mendeley],
    ["Total posts", data.cited_by_posts_count],
  ].filter(([, v]) => v !== undefined && v !== null && Number(v) > 0);

  const ctx = data.context?.all;
  body.innerHTML = `
    <div class="alt-head">
      ${data.images?.medium ? `<img src="${esc(data.images.medium)}" alt="Altmetric donut">` : ""}
      <div>
        <div class="alt-score">${fmt(data.score, 1)}</div>
        <div class="muted small">Altmetric Attention Score</div>
        ${ctx?.pct != null ? `<div class="small">Higher than <b>${fmt(ctx.pct)}%</b> of all research outputs tracked</div>` : ""}
      </div>
    </div>
    ${
      rows.length
        ? `<table><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${fmt(v)}</td></tr>`).join("")}</tbody></table>`
        : ""
    }
    ${data.details_url ? `<p class="small"><a href="${esc(data.details_url)}" target="_blank" rel="noopener">Full Altmetric details →</a></p>` : ""}
  `;
}

const BIP_CLASSES = {
  C1: "Top 0.01%",
  C2: "Top 0.1%",
  C3: "Top 1%",
  C4: "Top 10%",
  C5: "Average (bottom 90%)",
};

function pick(obj, keys) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

function renderBip(data, doi) {
  const body = $("#bip-card .card-body");
  const link = `<p class="small"><a href="https://bip.imsi.athenarc.gr/site/details?id=${encodeURIComponent(doi)}" target="_blank" rel="noopener">View on BIP! Finder →</a></p>`;
  if (!data) {
    body.innerHTML = `<p class="muted">BIP! scores not available for this DOI (or the API could not be reached / blocked by CORS).</p>${link}`;
    return;
  }
  const d = Array.isArray(data) ? data[0] || {} : data;

  const indicators = [
    {
      name: "Popularity",
      desc: "Current attention (citations in recent years)",
      score: pick(d, ["pop", "popularity", "attrank"]),
      cls: pick(d, ["pop_class", "popularity_class"]),
    },
    {
      name: "Influence",
      desc: "Overall long-term impact (PageRank-based)",
      score: pick(d, ["inf", "influence", "pagerank"]),
      cls: pick(d, ["inf_class", "influence_class"]),
    },
    {
      name: "Impulse",
      desc: "Initial momentum (citations in first 3 years)",
      score: pick(d, ["imp", "impulse", "3y_cc"]),
      cls: pick(d, ["imp_class", "impulse_class"]),
    },
    {
      name: "Citation count",
      desc: "Total citations in BIP! graph",
      score: pick(d, ["cc", "citation_count"]),
      cls: pick(d, ["cc_class", "citation_count_class"]),
    },
  ];

  const rows = indicators
    .filter((i) => i.score !== undefined || i.cls !== undefined)
    .map((i) => {
      const scoreStr =
        typeof i.score === "number" ? (i.score < 0.01 && i.score > 0 ? i.score.toExponential(3) : fmt(i.score, 3)) : esc(i.score ?? "–");
      const clsStr = i.cls ? `<span class="bip-class bip-${esc(i.cls)}">${esc(i.cls)}</span> <span class="small muted">${BIP_CLASSES[i.cls] || ""}</span>` : "–";
      return `<tr><td><b>${i.name}</b><br><span class="small muted">${i.desc}</span></td><td>${clsStr}</td><td class="num">${scoreStr}</td></tr>`;
    });

  body.innerHTML = `
    ${
      rows.length
        ? `<table><thead><tr><th>Indicator</th><th>Class</th><th class="num">Score</th></tr></thead><tbody>${rows.join("")}</tbody></table>`
        : `<p class="muted">Response received, but no known indicator fields were found (see raw data).</p>`
    }
    ${link}
    <details><summary class="small">Raw BIP! response</summary><pre>${esc(JSON.stringify(data, null, 2))}</pre></details>
  `;
}

function renderCitedness(work, source, authors) {
  const body = $("#citedness-card .card-body");
  let html = "";

  if (source) {
    const s = source.summary_stats || {};
    const mc = s["2yr_mean_citedness"];
    const ratio = mc ? work.cited_by_count / mc : null;
    html += `
      <h3 class="small muted">VENUE</h3>
      <table>
        <thead><tr><th>Source</th><th class="num">2-yr mean citedness</th><th class="num">h-index</th><th class="num">i10-index</th><th class="num">Works</th></tr></thead>
        <tbody><tr>
          <td><a href="${esc(source.id)}" target="_blank" rel="noopener">${esc(source.display_name)}</a></td>
          <td class="num"><b>${fmt(mc, 2)}</b></td>
          <td class="num">${fmt(s.h_index)}</td>
          <td class="num">${fmt(s.i10_index)}</td>
          <td class="num">${fmt(source.works_count)}</td>
        </tr></tbody>
      </table>
      ${
        ratio != null
          ? `<p class="small">This paper has <b>${fmt(work.cited_by_count)}</b> citations, which is <b>${fmt(ratio, 1)}×</b> the venue's 2-year mean citedness (an impact-factor-like measure).</p>`
          : ""
      }`;
  } else {
    html += `<p class="muted">No venue information available.</p>`;
  }

  if (authors && authors.length) {
    // keep original authorship order
    const order = (work.authorships || []).map((a) => shortId(a.author?.id));
    authors.sort((a, b) => order.indexOf(shortId(a.id)) - order.indexOf(shortId(b.id)));
    html += `
      <h3 class="small muted" style="margin-top:1.2rem">AUTHORS</h3>
      <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Author</th><th class="num">2-yr mean citedness</th><th class="num">h-index</th><th class="num">i10-index</th><th class="num">Works</th><th class="num">Citations</th></tr></thead>
        <tbody>
          ${authors
            .map((a) => {
              const s = a.summary_stats || {};
              return `<tr>
                <td><a href="${esc(a.id)}" target="_blank" rel="noopener">${esc(a.display_name)}</a></td>
                <td class="num"><b>${fmt(s["2yr_mean_citedness"], 2)}</b></td>
                <td class="num">${fmt(s.h_index)}</td>
                <td class="num">${fmt(s.i10_index)}</td>
                <td class="num">${fmt(a.works_count)}</td>
                <td class="num">${fmt(a.cited_by_count)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table></div>
      ${(work.authorships || []).length > authors.length ? `<p class="small muted">Showing first ${authors.length} authors.</p>` : ""}
      <p class="small muted">Note: OpenAlex author profiles are algorithmically disambiguated and may merge or split people.</p>`;
  }
  body.innerHTML = html;
}

function downloadCsv() {
  if (!lastCitationSeries.length) return;
  const csv =
    "year,citations,cumulative\n" + lastCitationSeries.map((s) => `${s.year},${s.count},${s.cumulative}`).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `citations_${lastDoi.replace(/[^\w.-]+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------- main flow ---------------- */

async function analyze(rawDoi) {
  const doi = normalizeDoi(rawDoi);
  if (!isValidDoi(doi)) {
    setStatus("That doesn't look like a valid DOI (should start with <code>10.</code>).", "error");
    return;
  }
  lastDoi = doi;
  $("#doi-input").value = doi;

  // shareable URL
  const url = new URL(location.href);
  url.searchParams.set("doi", doi);
  history.replaceState(null, "", url);

  const btn = $("#search-btn");
  btn.disabled = true;
  setStatus(`<span class="spinner"></span> Fetching data for <b>${esc(doi)}</b>…`);
  $("#altmetric-card .card-body").innerHTML = '<span class="spinner"></span> Loading…';
  $("#bip-card .card-body").innerHTML = '<span class="spinner"></span> Loading…';
  $("#citedness-card .card-body").innerHTML = '<span class="spinner"></span> Loading…';

  // Fire independent requests in parallel
  const altP = fetchAltmetric(doi).catch(() => null);
  const bipP = fetchBip(doi).catch(() => null);
  const crP = fetchCrossref(doi).catch(() => null);

  let work;
  try {
    work = await fetchOpenAlexWork(doi);
  } catch (e) {
    btn.disabled = false;
    setStatus(
      e.status === 404
        ? `DOI <b>${esc(doi)}</b> was not found in OpenAlex.`
        : `Error contacting OpenAlex: ${esc(e.message)}`,
      "error"
    );
    $("#results").hidden = true;
    return;
  }

  $("#results").hidden = false;
  renderPaper(work, doi);
  const extras = {};
  renderMetrics(work, extras);

  // Citation history
  const workId = shortId(work.id);
  const historyP = fetchCitationHistory(workId)
    .then((h) => {
      const series = buildSeries(h, work.publication_year);
      const total = h.reduce((s, x) => s + x.count, 0);
      renderChart(
        series,
        `Based on ${fmt(total)} citing works in OpenAlex, grouped by the citing work's publication year.`
      );
    })
    .catch(() => {
      const h = (work.counts_by_year || []).map((c) => ({ year: c.year, count: c.cited_by_count }));
      renderChart(
        buildSeries(h, Math.min(...h.map((x) => x.year))),
        "Fallback: OpenAlex counts_by_year (covers only the last ~10 years)."
      );
    });

  // Mean citedness (source + authors)
  const sourceId = shortId(work.primary_location?.source?.id);
  const authorIds = (work.authorships || [])
    .map((a) => shortId(a.author?.id))
    .filter(Boolean)
    .slice(0, 25);
  const citednessP = Promise.all([
    sourceId ? fetchSource(sourceId).catch(() => null) : null,
    fetchAuthors(authorIds).catch(() => []),
  ]).then(([source, authors]) => renderCitedness(work, source, authors));

  // Altmetric
  const altP2 = altP.then((alt) => {
    renderAltmetric(alt);
    extras.altmetric = alt ? fmt(alt.score, 1) : "–";
    renderMetrics(work, extras);
  });

  // Crossref
  const crP2 = crP.then((cr) => {
    extras.crossref = cr?.message?.["is-referenced-by-count"] != null ? fmt(cr.message["is-referenced-by-count"]) : "–";
    renderMetrics(work, extras);
  });

  // BIP
  const bipP2 = bipP.then((bip) => renderBip(bip, doi));

  await Promise.allSettled([historyP, citednessP, altP2, crP2, bipP2]);
  btn.disabled = false;
  setStatus(`Done. <a href="${esc(location.href)}">Shareable link</a>`, "ok");
}

/* ---------------- wiring ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  $("#email-input").value = getEmail();

  $("#save-email").addEventListener("click", () => {
    const v = $("#email-input").value.trim();
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      setStatus("Please enter a valid email address.", "error");
      return;
    }
    if (v) localStorage.setItem(EMAIL_KEY, v);
    else localStorage.removeItem(EMAIL_KEY);
    setStatus(v ? "Email saved. You're in the polite pool. 🙂" : "Email removed.", "ok");
  });

  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    // auto-save email if typed but not saved
    const v = $("#email-input").value.trim();
    if (v && v !== getEmail() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) localStorage.setItem(EMAIL_KEY, v);
    analyze($("#doi-input").value);
  });

  document.querySelectorAll(".example").forEach((b) =>
    b.addEventListener("click", () => analyze(b.dataset.doi))
  );

  $("#download-csv").addEventListener("click", downloadCsv);

  const initial = new URLSearchParams(location.search).get("doi");
  if (initial) analyze(initial);
});

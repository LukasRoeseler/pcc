"use strict";

/* DOI Metrics Explorer: enter a DOI and get OpenAlex citation history, FWCI,
   percentile, journal and author mean citedness, Crossref comparison, an
   Altmetric attention badge and BIP! Scholar impact classes. Everything runs
   in the browser; OpenAlex / Crossref / BIP! are called directly. */

const $ = (s) => document.querySelector(s);
const EMAIL_KEY = "doi-metrics-email";
let citeChart = null;
let lastCitationSeries = [];
let lastDoi = "";
let state = null; // { work, doi, extras, altScore, series, noteKey, noteVars, source, authors, bip }

/* ---------- i18n ---------- */
const TR = {
  title: { en: "DOI Metrics Explorer", de: "DOI-Metrik-Explorer" },
  doi_label: { en: "DOI", de: "DOI" },
  doi_placeholder: {
    en: "e.g. 10.1038/nature12373 or https://doi.org/10.1038/nature12373",
    de: "z. B. 10.1038/nature12373 oder https://doi.org/10.1038/nature12373",
  },
  analyze: { en: "Analyze", de: "Analysieren" },
  email_label: { en: "Your email", de: "Deine E-Mail" },
  email_hint: {
    en: "(optional; used for the OpenAlex and Crossref polite pool, stored only in your browser)",
    de: "(optional; wird für den OpenAlex- und Crossref-Polite-Pool genutzt, nur in deinem Browser gespeichert)",
  },
  email_placeholder: { en: "you@university.edu", de: "du@uni.de" },
  save_email: { en: "Save", de: "Speichern" },
  email_saved: { en: "Email saved. You are in the polite pool.", de: "E-Mail gespeichert. Du bist im Polite-Pool." },
  email_removed: { en: "Email removed.", de: "E-Mail entfernt." },
  email_invalid: { en: "Please enter a valid email address.", de: "Bitte gib eine gültige E-Mail-Adresse ein." },
  try: { en: "Try:", de: "Beispiele:" },
  loading: { en: "Loading...", de: "Laden..." },
  invalid_doi: { en: "That does not look like a valid DOI (should start with 10.).", de: "Das sieht nicht nach einer gültigen DOI aus (sollte mit 10. beginnen)." },
  not_found: { en: "DOI {doi} was not found in OpenAlex.", de: "DOI {doi} wurde nicht in OpenAlex gefunden." },
  error_openalex: { en: "Error contacting OpenAlex: {msg}", de: "Fehler beim Kontaktieren von OpenAlex: {msg}" },
  fetching: { en: "Fetching data for {doi}...", de: "Daten werden für {doi} geladen..." },
  done: { en: "Shareable link", de: "Teilbarer Link" },

  metrics_h: { en: "Metrics", de: "Kennzahlen" },
  metric: { en: "Metric", de: "Kennzahl" },
  value: { en: "Value", de: "Wert" },
  citations_openalex: { en: "Citations (OpenAlex)", de: "Zitate (OpenAlex)" },
  citations_per_year: { en: "Citations per year", de: "Zitate pro Jahr" },
  cumulative_citations: { en: "Cumulative citations", de: "Kumulierte Zitate" },
  citations_crossref: { en: "Citations (Crossref)", de: "Zitate (Crossref)" },
  fwci: { en: "FWCI", de: "FWCI" },
  fwci_sub: { en: "Field-Weighted Citation Impact (1.0 = world average)", de: "Feldgewichteter Zitationsimpact (1.0 = Weltdurchschnitt)" },
  percentile: { en: "Citation percentile", de: "Zitationsperzentil" },
  percentile_sub: { en: "Normalized by field, year and type", de: "Nach Fach, Jahr und Typ normalisiert" },
  altmetric_score: { en: "Altmetric Attention Score", de: "Altmetric Attention Score" },
  altmetric_score_sub: { en: "Weighted online attention (news, blogs, social, policy)", de: "Gewichtete Online-Aufmerksamkeit (News, Blogs, Social, Politik)" },
  no_data: { en: "Not available", de: "Nicht verfügbar" },

  chart_title: { en: "Citations over time (OpenAlex)", de: "Zitate im Zeitverlauf (OpenAlex)" },
  download_csv: { en: "Download CSV", de: "CSV herunterladen" },
  chart_note: { en: "Based on {n} citing works in OpenAlex, grouped by the citing work's publication year.", de: "Basierend auf {n} zitierenden Werken in OpenAlex, gruppiert nach dem Erscheinungsjahr des zitierenden Werks." },
  chart_note_fallback: { en: "Fallback: OpenAlex counts_by_year (covers only the last ~10 years).", de: "Fallback: OpenAlex counts_by_year (deckt nur die letzten ~10 Jahre ab)." },

  altmetric_h: { en: "Altmetric", de: "Altmetric" },
  altmetric_none: { en: "No Altmetric attention data found for this DOI.", de: "Keine Altmetric-Aufmerksamkeitsdaten für diese DOI gefunden." },
  altmetric_details: { en: "Full Altmetric details", de: "Vollständige Altmetric-Details" },

  bip_h: { en: "BIP! Scholar impact", de: "BIP! Scholar-Impact" },
  bip_none: { en: "BIP! scores not available for this DOI.", de: "BIP!-Werte für diese DOI nicht verfügbar." },
  bip_details: { en: "View on BIP! Finder", de: "Auf BIP! Finder ansehen" },
  bip_raw: { en: "Raw BIP! response", de: "Rohe BIP!-Antwort" },
  bip_indicator: { en: "Indicator", de: "Indikator" },
  bip_class: { en: "Class", de: "Klasse" },
  bip_score: { en: "Score", de: "Wert" },
  bip_popularity: { en: "Popularity", de: "Popularität" },
  bip_popularity_sub: { en: "Current attention (citations in recent years)", de: "Aktuelle Aufmerksamkeit (Zitate der letzten Jahre)" },
  bip_influence: { en: "Influence", de: "Einfluss" },
  bip_influence_sub: { en: "Overall long-term impact (PageRank-based)", de: "Langfristiger Gesamtimpact (PageRank-basiert)" },
  bip_impulse: { en: "Impulse", de: "Impuls" },
  bip_impulse_sub: { en: "Initial momentum (citations in first 3 years)", de: "Anfängliche Dynamik (Zitate der ersten 3 Jahre)" },
  bip_citation_count: { en: "Citation count", de: "Zitationsanzahl" },
  bip_citation_count_sub: { en: "Total citations in BIP! graph", de: "Gesamtzitate im BIP!-Graphen" },

  citedness_h: { en: "Mean citedness (OpenAlex 2-year mean citedness)", de: "Mittlere Zitiertheit (OpenAlex 2-Jahres-Mittel)" },
  venue: { en: "VENUE", de: "ZEITSCHRIFT" },
  authors: { en: "AUTHORS", de: "AUTOR:INNEN" },
  source: { en: "Source", de: "Quelle" },
  mean_citedness: { en: "2-yr mean citedness", de: "2-Jahres-Mittel" },
  h_index: { en: "h-index", de: "h-Index" },
  i10: { en: "i10-index", de: "i10-Index" },
  works: { en: "Works", de: "Werke" },
  citations: { en: "Citations", de: "Zitate" },
  author: { en: "Author", de: "Autor:in" },
  no_venue: { en: "No venue information available.", de: "Keine Zeitschrifteninformationen verfügbar." },
  ratio_note: { en: "This paper has {c} citations, which is {r}x the venue's 2-year mean citedness (an impact-factor-like measure).", de: "Dieses Papier hat {c} Zitate, das ist das {r}-Fache der 2-Jahres-Mittel-Zitiertheit der Zeitschrift (ein impact-faktor-ähnliches Maß)." },
  showing_first: { en: "Showing first {n} authors.", de: "Erste {n} Autor:innen werden angezeigt." },
  author_note: { en: "Note: OpenAlex author profiles are algorithmically disambiguated and may merge or split people.", de: "Hinweis: OpenAlex-Autor:innenprofile werden algorithmisch aufgelöst und können Personen zusammenführen oder trennen." },

  oa_h: { en: "Open Access", de: "Open Access" },
  oa_open: { en: "Open access", de: "Open Access" },
  oa_status: { en: "OA status", de: "OA-Status" },
  oa_license: { en: "License", de: "Lizenz" },
  oa_location: { en: "Best free location", de: "Beste freie Quelle" },
  oa_type: { en: "Type", de: "Typ" },
  yes: { en: "Yes", de: "Ja" },
  no: { en: "No", de: "Nein" },

  footer: { en: 'Part of the <a href="../">Publication Cost Calculator</a>.', de: 'Teil des <a href="../">Publication Cost Calculator</a>.' },
};

let lang = "en";
try { lang = localStorage.getItem("dm-lang") || ((navigator.language || "").startsWith("de") ? "de" : "en"); } catch (e) { /* ignore */ }

function t(key, vars) {
  let s = (TR[key] && (TR[key][lang] || TR[key].en)) || key;
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll("{" + k + "}", v);
  return s;
}

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((n) => { n.innerHTML = t(n.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((n) => { n.placeholder = t(n.dataset.i18nPlaceholder); });
  document.querySelectorAll(".lang-btn").forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
  document.title = t("title");
  if (state) renderAll();
}

/* ---------- helpers ---------- */
function normalizeDoi(input) {
  return input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}
const isValidDoi = (d) => /^10\.\d{4,9}\/\S+$/i.test(d);

// Keep slashes (for OpenAlex / Crossref), encode everything else
const encDoi = (doi) => doi.split("/").map(encodeURIComponent).join("/");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const fmt = (n, digits = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "–"
    : Number(n).toLocaleString(lang === "de" ? "de-DE" : "en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

const getEmail = () => localStorage.getItem(EMAIL_KEY) || "";
const shortId = (openalexUrl) => (openalexUrl || "").split("/").pop();

async function getJSON(url, timeout = 20000) {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeout);
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
    clearTimeout(tm);
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
  el.className = "hint status " + type;
  el.innerHTML = msg;
}

/* ---------- API calls ---------- */
const fetchOpenAlexWork = (doi) => getJSON(oaUrl(`works/doi:${encDoi(doi)}`));

async function fetchCitationHistory(workId) {
  const data = await getJSON(oaUrl("works", { filter: `cites:${workId}`, group_by: "publication_year" }));
  return (data.group_by || [])
    .map((g) => ({ year: parseInt(g.key, 10), count: g.count }))
    .filter((g) => !Number.isNaN(g.year));
}

const fetchSource = (sourceId) => getJSON(oaUrl(`sources/${sourceId}`));

async function fetchAuthors(authorIds) {
  if (!authorIds.length) return [];
  const data = await getJSON(oaUrl("authors", { filter: `openalex:${authorIds.join("|")}`, "per-page": "50" }));
  return data.results || [];
}

// BIP! requires the DOI fully URL-encoded (the slash as %2F); otherwise the
// server treats it as a nested path and returns 404.
const fetchBip = (doi) => getJSON(`https://bip-api.imsi.athenarc.gr/paper/scores/${encodeURIComponent(doi)}`);

function fetchCrossref(doi) {
  const email = getEmail();
  const q = email ? `?mailto=${encodeURIComponent(email)}` : "";
  return getJSON(`https://api.crossref.org/works/${encDoi(doi)}${q}`);
}

/* ---------- rendering ---------- */
function renderPaper(work, doi) {
  const authors = (work.authorships || []).map((a) => a.author?.display_name).filter(Boolean);
  const authorStr =
    authors.length > 8 ? authors.slice(0, 8).join(", ") + ` (+${authors.length - 8} more)` : authors.join(", ");
  const source = work.primary_location?.source?.display_name;

  $("#paper-card").innerHTML = `
    <h2 class="paper-title">${esc(work.display_name || work.title || "Untitled")}</h2>
    ${authorStr ? `<div class="paper-meta">${esc(authorStr)}</div>` : ""}
    <div class="paper-meta">
      ${source ? `<em>${esc(source)}</em> · ` : ""}${esc(work.publication_year || "")}
      · <a href="https://doi.org/${esc(doi)}" target="_blank" rel="noopener">doi:${esc(doi)}</a>
      · <a href="${esc(work.id)}" target="_blank" rel="noopener">OpenAlex</a>
    </div>`;
}

function metricRow(label, value, sub) {
  return `<tr><td>${label}${sub ? `<div class="metric-sub">${sub}</div>` : ""}</td><td class="num">${value}</td></tr>`;
}

function renderMetrics(work, extras, altScore) {
  const pct = work.citation_normalized_percentile;
  const crossref = extras.crossref != null ? fmt(extras.crossref) : t("no_data");
  const rows = [
    metricRow(t("citations_openalex"), fmt(work.cited_by_count)),
    metricRow(t("citations_crossref"), crossref),
    metricRow(t("fwci"), work.fwci != null ? fmt(work.fwci, 2) : t("no_data"), t("fwci_sub")),
    metricRow(t("percentile"), pct?.value != null ? fmt(pct.value * 100, 1) + "%" : t("no_data"), t("percentile_sub")),
    metricRow(t("altmetric_score"), altScore != null ? fmt(altScore, 1) : t("no_data"), t("altmetric_score_sub")),
  ];
  $("#metrics-table tbody").innerHTML = rows.join("");
}

function buildSeries(history, pubYear) {
  const currentYear = new Date().getFullYear();
  const map = new Map(history.map((h) => [h.year, h.count]));
  const years = history.map((h) => h.year);
  let start = Math.min(...years, pubYear || Infinity);
  if (!Number.isFinite(start)) start = currentYear;
  start = Math.max(start, (pubYear || start) - 1);
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

function renderChart(series) {
  lastCitationSeries = series;
  const ctx = $("#cite-chart").getContext("2d");
  if (citeChart) citeChart.destroy();
  citeChart = new Chart(ctx, {
    data: {
      labels: series.map((s) => s.year),
      datasets: [
        {
          type: "bar",
          label: t("citations_per_year"),
          data: series.map((s) => s.count),
          backgroundColor: "rgba(0, 159, 227, 0.6)",
          borderRadius: 2,
          yAxisID: "y",
          order: 2,
        },
        {
          type: "line",
          label: t("cumulative_citations"),
          data: series.map((s) => s.cumulative),
          borderColor: "#00305d",
          backgroundColor: "#00305d",
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
        y: { beginAtZero: true, title: { display: true, text: t("citations_per_year") } },
        y1: {
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: t("cumulative_citations") },
        },
      },
    },
  });
}

function setChartNote(key, vars) {
  $("#chart-note").textContent = t(key, vars);
}

function renderAltmetric(doi) {
  const body = $("#altmetric-card .card-body");
  body.innerHTML = "";
  const div = document.createElement("div");
  div.className = "altmetric-embed";
  div.setAttribute("data-badge-type", "donut");
  div.setAttribute("data-badge-popover", "left");
  div.setAttribute("data-hide-no-mentions", "true");
  div.setAttribute("data-doi", doi);
  body.appendChild(div);
  if (window._altmetric_embed_init) window._altmetric_embed_init(div);

  const obs = new MutationObserver(() => {
    const img = div.querySelector("img");
    if (img && img.alt) {
      const m = img.alt.match(/score of ([\d.]+)/i);
      if (m) {
        state.altScore = parseFloat(m[1]);
        renderMetrics(state.work, state.extras, state.altScore);
      }
      obs.disconnect();
    }
  });
  obs.observe(div, { childList: true, subtree: true });

  body.insertAdjacentHTML(
    "beforeend",
    `<p class="hint small"><a href="https://www.altmetric.com/details/doi/${encDoi(doi)}" target="_blank" rel="noopener">${t("altmetric_details")}</a></p>`
  );
}

const BIP_CLASSES = {
  C1: "Top 0.01%",
  C2: "Top 0.1%",
  C3: "Top 1%",
  C4: "Top 10%",
  C5: "Average",
};

function renderBip(data, doi) {
  const body = $("#bip-card .card-body");
  const link = `<p class="hint small"><a href="https://bip.imsi.athenarc.gr/site/details?id=${encodeURIComponent(doi)}" target="_blank" rel="noopener">${t("bip_details")}</a></p>`;
  if (!data) {
    body.innerHTML = `<p class="hint">${t("bip_none")}</p>${link}`;
    return;
  }
  const indicators = [
    { name: t("bip_popularity"), desc: t("bip_popularity_sub"), score: data.attrank, cls: data.pop_class },
    { name: t("bip_influence"), desc: t("bip_influence_sub"), score: data.pagerank, cls: data.inf_class },
    { name: t("bip_impulse"), desc: t("bip_impulse_sub"), score: data["3_year_cc"], cls: data.imp_class },
    { name: t("bip_citation_count"), desc: t("bip_citation_count_sub"), score: data.cc, cls: data.cc_class },
  ];
  const rows = indicators
    .filter((i) => i.score !== undefined || i.cls !== undefined)
    .map((i) => {
      const scoreStr = typeof i.score === "number" ? (i.score < 0.01 && i.score > 0 ? i.score.toExponential(3) : fmt(i.score, 3)) : esc(i.score ?? "–");
      const clsStr = i.cls ? `<span class="bip-class bip-${esc(i.cls)}">${esc(i.cls)}</span> <span class="hint-inline">${BIP_CLASSES[i.cls] || ""}</span>` : "–";
      return `<tr><td><b>${i.name}</b><br><span class="hint-inline">${i.desc}</span></td><td>${clsStr}</td><td class="num">${scoreStr}</td></tr>`;
    });
  body.innerHTML = `
    ${rows.length
      ? `<div class="table-scroll"><table class="bip-table"><thead><tr><th>${t("bip_indicator")}</th><th>${t("bip_class")}</th><th class="num">${t("bip_score")}</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`
      : `<p class="hint">${t("bip_none")}</p>`}
    ${link}
    <details><summary class="hint-inline">${t("bip_raw")}</summary><pre>${esc(JSON.stringify(data, null, 2))}</pre></details>`;
}

function renderCitedness(work, source, authors) {
  const body = $("#citedness-card .card-body");
  let html = "";

  if (source) {
    const s = source.summary_stats || {};
    const mc = s["2yr_mean_citedness"];
    const ratio = mc ? work.cited_by_count / mc : null;
    html += `
      <h3 class="hint" style="font-weight:700;text-transform:uppercase;letter-spacing:.03em;font-size:.8rem;margin:0 0 6px">${t("venue")}</h3>
      <div class="table-scroll"><table>
        <thead><tr><th>${t("source")}</th><th class="num">${t("mean_citedness")}</th><th class="num">${t("h_index")}</th><th class="num">${t("i10")}</th><th class="num">${t("works")}</th></tr></thead>
        <tbody><tr>
          <td><a href="${esc(source.id)}" target="_blank" rel="noopener">${esc(source.display_name)}</a></td>
          <td class="num"><b>${fmt(mc, 2)}</b></td>
          <td class="num">${fmt(s.h_index)}</td>
          <td class="num">${fmt(s.i10_index)}</td>
          <td class="num">${fmt(source.works_count)}</td>
        </tr></tbody>
      </table></div>
      ${ratio != null ? `<p class="hint small">${t("ratio_note", { c: fmt(work.cited_by_count), r: fmt(ratio, 1) })}</p>` : ""}`;
  } else {
    html += `<p class="hint">${t("no_venue")}</p>`;
  }

  if (authors && authors.length) {
    const order = (work.authorships || []).map((a) => shortId(a.author?.id));
    authors.sort((a, b) => order.indexOf(shortId(a.id)) - order.indexOf(shortId(b.id)));
    html += `
      <h3 class="hint" style="font-weight:700;text-transform:uppercase;letter-spacing:.03em;font-size:.8rem;margin:18px 0 6px">${t("authors")}</h3>
      <div class="table-scroll"><table>
        <thead><tr><th>${t("author")}</th><th class="num">${t("mean_citedness")}</th><th class="num">${t("h_index")}</th><th class="num">${t("i10")}</th><th class="num">${t("works")}</th><th class="num">${t("citations")}</th></tr></thead>
        <tbody>
          ${authors.map((a) => {
            const s = a.summary_stats || {};
            return `<tr>
              <td><a href="${esc(a.id)}" target="_blank" rel="noopener">${esc(a.display_name)}</a></td>
              <td class="num"><b>${fmt(s["2yr_mean_citedness"], 2)}</b></td>
              <td class="num">${fmt(s.h_index)}</td>
              <td class="num">${fmt(s.i10_index)}</td>
              <td class="num">${fmt(a.works_count)}</td>
              <td class="num">${fmt(a.cited_by_count)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>
      ${(work.authorships || []).length > authors.length ? `<p class="hint small">${t("showing_first", { n: authors.length })}</p>` : ""}
      <p class="hint small">${t("author_note")}</p>`;
  }
  body.innerHTML = html;
}

function renderOA(work) {
  const oa = work.open_access || {};
  const best = work.best_oa_location || {};
  const loc = best.landing_page_url || best.pdf_url || null;
  const rows = [
    [t("oa_open"), oa.is_oa ? t("yes") : t("no")],
    [t("oa_status"), oa.oa_status ? esc(oa.oa_status) : t("no_data")],
    [t("oa_license"), oa.license ? esc(oa.license) : t("no_data")],
    [t("oa_type"), work.type ? esc(work.type) : t("no_data")],
    [t("oa_location"), loc ? `<a class="oa-url" href="${esc(loc)}" target="_blank" rel="noopener">${esc(loc)}</a>` : t("no_data")],
  ];
  $("#oa-card .card-body").innerHTML = `
    <div class="table-scroll"><table>
      <tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</tbody>
    </table></div>`;
}

function renderAll() {
  const s = state;
  if (!s) return;
  renderPaper(s.work, s.doi);
  renderMetrics(s.work, s.extras, s.altScore);
  if (s.series && s.series.length) renderChart(s.series);
  setChartNote(s.noteKey, s.noteVars);
  renderAltmetric(s.doi);
  renderBip(s.bip, s.doi);
  renderCitedness(s.work, s.source, s.authors);
  renderOA(s.work);
}

function downloadCsv() {
  if (!lastCitationSeries.length) return;
  const csv = "year,citations,cumulative\n" + lastCitationSeries.map((s) => `${s.year},${s.count},${s.cumulative}`).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `citations_${lastDoi.replace(/[^\w.-]+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- main flow ---------- */
async function analyze(rawDoi) {
  const doi = normalizeDoi(rawDoi);
  if (!isValidDoi(doi)) {
    setStatus(t("invalid_doi"), "error");
    return;
  }
  lastDoi = doi;
  $("#doi-input").value = doi;

  const url = new URL(location.href);
  url.searchParams.set("doi", doi);
  history.replaceState(null, "", url);

  const btn = $("#search-btn");
  btn.disabled = true;
  setStatus(`<span class="spinner"></span> ${t("fetching", { doi: esc(doi) })}`);
  $("#altmetric-card .card-body").innerHTML = `<span class="hint">${t("loading")}</span>`;
  $("#bip-card .card-body").innerHTML = `<span class="hint">${t("loading")}</span>`;
  $("#citedness-card .card-body").innerHTML = `<span class="hint">${t("loading")}</span>`;
  $("#oa-card .card-body").innerHTML = `<span class="hint">${t("loading")}</span>`;

  const bipP = fetchBip(doi).catch(() => null);
  const crP = fetchCrossref(doi).catch(() => null);

  let work;
  try {
    work = await fetchOpenAlexWork(doi);
  } catch (e) {
    btn.disabled = false;
    setStatus(
      e.status === 404
        ? t("not_found", { doi: esc(doi) })
        : t("error_openalex", { msg: esc(e.message) }),
      "error"
    );
    $("#results").classList.add("hidden");
    return;
  }

  $("#results").classList.remove("hidden");
  state = { work, doi, extras: {}, altScore: null, source: null, authors: [], bip: null, series: null, noteKey: null, noteVars: null };
  renderPaper(work, doi);
  renderMetrics(work, state.extras, null);

  const workId = shortId(work.id);
  const historyP = fetchCitationHistory(workId)
    .then((h) => {
      const series = buildSeries(h, work.publication_year);
      const total = h.reduce((s, x) => s + x.count, 0);
      state.series = series;
      state.noteKey = "chart_note";
      state.noteVars = { n: fmt(total) };
      renderChart(series);
      setChartNote(state.noteKey, state.noteVars);
    })
    .catch(() => {
      const h = (work.counts_by_year || []).map((c) => ({ year: c.year, count: c.cited_by_count }));
      const series = buildSeries(h, Math.min(...h.map((x) => x.year)));
      state.series = series;
      state.noteKey = "chart_note_fallback";
      state.noteVars = {};
      renderChart(series);
      setChartNote(state.noteKey, state.noteVars);
    });

  const sourceId = shortId(work.primary_location?.source?.id);
  const authorIds = (work.authorships || [])
    .map((a) => shortId(a.author?.id))
    .filter(Boolean)
    .slice(0, 25);
  const citednessP = Promise.all([
    sourceId ? fetchSource(sourceId).catch(() => null) : null,
    fetchAuthors(authorIds).catch(() => []),
  ]).then(([source, authors]) => {
    state.source = source;
    state.authors = authors;
    renderCitedness(work, source, authors);
  });

  renderAltmetric(doi);

  crP.then((cr) => {
    state.extras.crossref = cr?.message?.["is-referenced-by-count"] != null ? cr.message["is-referenced-by-count"] : null;
    renderMetrics(work, state.extras, state.altScore);
  });

  bipP.then((bip) => {
    state.bip = bip;
    renderBip(bip, doi);
  });

  await Promise.allSettled([historyP, citednessP, crP, bipP]);
  btn.disabled = false;
  setStatus(`<a href="${esc(location.href)}">${t("done")}</a>`, "ok");
}

/* ---------- wiring ---------- */
document.addEventListener("DOMContentLoaded", () => {
  $("#email-input").value = getEmail();

  $("#save-email").addEventListener("click", () => {
    const v = $("#email-input").value.trim();
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      setStatus(t("email_invalid"), "error");
      return;
    }
    if (v) localStorage.setItem(EMAIL_KEY, v);
    else localStorage.removeItem(EMAIL_KEY);
    setStatus(t(v ? "email_saved" : "email_removed"), "ok");
  });

  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#email-input").value.trim();
    if (v && v !== getEmail() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) localStorage.setItem(EMAIL_KEY, v);
    analyze($("#doi-input").value);
  });

  document.querySelectorAll(".example").forEach((b) =>
    b.addEventListener("click", () => analyze(b.dataset.doi))
  );

  $("#download-csv").addEventListener("click", downloadCsv);

  document.querySelectorAll(".lang-btn").forEach((b) => b.addEventListener("click", () => {
    lang = b.dataset.lang;
    try { localStorage.setItem("dm-lang", lang); } catch (e) { /* ignore */ }
    applyLang();
  }));

  /* theme: same storage key and default as the other apps */
  const ICON_SUN = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>';
  const ICON_MOON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  function applyTheme(th) {
    document.documentElement.setAttribute("data-theme", th);
    $("#theme-btn").innerHTML = th === "dark" ? ICON_SUN : ICON_MOON;
  }
  applyTheme(document.documentElement.getAttribute("data-theme") || "dark");
  $("#theme-btn").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
    applyTheme(next);
  });

  const initial = new URLSearchParams(location.search).get("doi");
  applyLang();
  if (initial) analyze(initial);
});

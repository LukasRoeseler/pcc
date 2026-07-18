/* Publication Cost Calculator
 * All processing happens client-side. References are matched to DOIs via the
 * Crossref API, then priced using OpenAlex's apc_list / apc_paid fields.
 */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
}

// ---------- state ----------
let referenceItems = []; // { raw, doi, searchQuery, include }
let currentResults = [];

// ---------- utilities ----------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDoi(raw) {
  if (!raw) return null;
  let d = String(raw).trim();
  if (!d) return null;
  d = d.replace(/^doi:\s*/i, "");
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return d || null;
}

function getEmail() {
  return document.getElementById("contact-email").value.trim();
}

async function asyncPool(poolLimit, items, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    if (poolLimit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- reference splitting (paste / txt / pdf / docx) ----------
function splitReferences(text) {
  const rawLines = text.split(/\r\n|\r|\n/);
  const lines = rawLines.map((l) => l.trim());
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return [];

  const numberedRegex = /^(\[\d+\]|\(\d+\)|\d+[.)])\s+/;
  const numberedCount = nonEmpty.filter((l) => numberedRegex.test(l)).length;

  if (numberedCount >= Math.max(2, Math.floor(nonEmpty.length * 0.5))) {
    const refs = [];
    let current = "";
    for (const line of lines) {
      if (numberedRegex.test(line)) {
        if (current.trim()) refs.push(current.trim());
        current = line.replace(numberedRegex, "");
      } else if (line.length > 0) {
        current += " " + line;
      }
    }
    if (current.trim()) refs.push(current.trim());
    return refs.map((r) => r.replace(/\s+/g, " ").trim()).filter((r) => r.length > 10);
  }

  if (rawLines.some((l) => l.trim() === "")) {
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 10);
    if (paragraphs.length > 1) return paragraphs;
  }

  return nonEmpty.filter((l) => l.length > 10);
}

// ---------- file extraction ----------
async function extractPdfText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let lastY = null;
    let line = "";
    for (const item of content.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        fullText += line.trim() + "\n";
        line = "";
      }
      line += item.str + " ";
      lastY = y;
    }
    fullText += line.trim() + "\n\n";
  }
  return fullText;
}

async function extractDocxText(arrayBuffer) {
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// ---------- BibTeX parsing ----------
function parseBibtex(text) {
  const entries = [];
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at === -1) break;
    let j = at + 1;
    while (j < text.length && /[a-zA-Z]/.test(text[j])) j++;
    const type = text.slice(at + 1, j).toLowerCase();
    while (j < text.length && /\s/.test(text[j])) j++;
    if (text[j] !== "{" && text[j] !== "(") {
      i = at + 1;
      continue;
    }
    if (type === "comment" || type === "string" || type === "preamble") {
      i = j + 1;
      continue;
    }
    const openChar = text[j];
    const closeChar = openChar === "{" ? "}" : ")";
    let depth = 1;
    let k = j + 1;
    while (k < text.length && depth > 0) {
      if (text[k] === openChar) depth++;
      else if (text[k] === closeChar) depth--;
      k++;
    }
    const body = text.slice(j + 1, k - 1);
    entries.push(parseBibEntry(type, body));
    i = k;
  }
  return entries;
}

function parseBibEntry(type, body) {
  const commaIdx = body.indexOf(",");
  const key = commaIdx === -1 ? body.trim() : body.slice(0, commaIdx).trim();
  const fieldsText = commaIdx === -1 ? "" : body.slice(commaIdx + 1);
  const fields = {};
  let idx = 0;
  while (idx < fieldsText.length) {
    while (idx < fieldsText.length && /[\s,]/.test(fieldsText[idx])) idx++;
    if (idx >= fieldsText.length) break;
    const eqIdx = fieldsText.indexOf("=", idx);
    if (eqIdx === -1) break;
    const fname = fieldsText.slice(idx, eqIdx).trim().toLowerCase();
    let vIdx = eqIdx + 1;
    while (vIdx < fieldsText.length && /\s/.test(fieldsText[vIdx])) vIdx++;
    let value = "";
    if (fieldsText[vIdx] === "{") {
      let depth = 1;
      let k = vIdx + 1;
      while (k < fieldsText.length && depth > 0) {
        if (fieldsText[k] === "{") depth++;
        else if (fieldsText[k] === "}") depth--;
        k++;
      }
      value = fieldsText.slice(vIdx + 1, k - 1);
      idx = k;
    } else if (fieldsText[vIdx] === '"') {
      let k = vIdx + 1;
      while (k < fieldsText.length && fieldsText[k] !== '"') k++;
      value = fieldsText.slice(vIdx + 1, k);
      idx = k + 1;
    } else {
      let k = vIdx;
      while (k < fieldsText.length && fieldsText[k] !== ",") k++;
      value = fieldsText.slice(vIdx, k).trim();
      idx = k;
    }
    fields[fname] = value.replace(/\s+/g, " ").trim();
    idx++;
  }
  return { type, key, fields };
}

function bibEntryToItem(entry) {
  const f = entry.fields;
  const doi = normalizeDoi(f.doi);
  const title = f.title || "";
  const author = f.author || "";
  const year = f.year || "";
  const raw = title
    ? `${title}${author ? " — " + author : ""}${year ? " (" + year + ")" : ""}`
    : entry.key;
  const searchQuery = [title, author, year].filter(Boolean).join(" ") || entry.key;
  return { raw, doi, searchQuery, include: true };
}

// ---------- Crossref / OpenAlex ----------
async function searchCrossref(query, email) {
  const params = new URLSearchParams({ "query.bibliographic": query, rows: "1" });
  if (email) params.set("mailto", email);
  const res = await fetch(`https://api.crossref.org/works?${params.toString()}`);
  if (!res.ok) throw new Error("Crossref request failed (" + res.status + ")");
  const data = await res.json();
  const item = data.message && data.message.items && data.message.items[0];
  if (!item) return null;
  return {
    doi: item.DOI,
    title: (item.title && item.title[0]) || "",
    score: item.score,
  };
}

async function getOpenAlexWork(doi, email) {
  const params = new URLSearchParams();
  if (email) params.set("mailto", email);
  const qs = params.toString();
  const url = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}${qs ? "?" + qs : ""}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("OpenAlex request failed (" + res.status + ")");
  return res.json();
}

function estimateCost(work) {
  if (!work) {
    return { cost: null, source: null, oaStatus: null, note: "No OpenAlex record found for this DOI", journal: null, field: null };
  }
  const oaStatus = work.open_access ? work.open_access.oa_status : null;
  const journal =
    (work.primary_location && work.primary_location.source && work.primary_location.source.display_name) || null;
  const field = (work.primary_topic && work.primary_topic.field && work.primary_topic.field.display_name) || null;
  const apcPaid = work.apc_paid;
  const apcList = work.apc_list;

  if (apcPaid && apcPaid.value_usd != null) {
    return {
      cost: apcPaid.value_usd,
      source: "OpenAlex apc_paid (actual payment record, via OpenAPC)",
      oaStatus,
      note: "",
      journal,
      field,
    };
  }
  if (apcList && apcList.value_usd != null) {
    return {
      cost: apcList.value_usd,
      source: `OpenAlex apc_list (journal list price${work.publication_year ? " in " + work.publication_year : ""})`,
      oaStatus,
      note: "List price — actual amount paid may differ (waivers, discounts, institutional agreements)",
      journal,
      field,
    };
  }
  if (oaStatus === "gold" || oaStatus === "hybrid") {
    return { cost: null, source: null, oaStatus, note: "Open access but no APC price data available", journal, field };
  }
  if (oaStatus === "green" || oaStatus === "closed" || oaStatus === "bronze") {
    return {
      cost: 0,
      source: "Inferred: non-gold/hybrid OA route",
      oaStatus,
      note: "Typically no APC for this route (subscription/self-archived/bronze) — not independently verified",
      journal,
      field,
    };
  }
  return { cost: null, source: null, oaStatus, note: "OA status unknown, no APC data", journal, field };
}

const sourceStatsCache = new Map();
async function getSourceMeanCitedness(sourceId, email) {
  if (!sourceId) return null;
  if (sourceStatsCache.has(sourceId)) return sourceStatsCache.get(sourceId);
  const shortId = sourceId.replace(/^https?:\/\/openalex\.org\//i, "");
  const params = new URLSearchParams();
  if (email) params.set("mailto", email);
  const qs = params.toString();
  const url = `https://api.openalex.org/sources/${encodeURIComponent(shortId)}${qs ? "?" + qs : ""}`;
  let value = null;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      value = (data.summary_stats && data.summary_stats["2yr_mean_citedness"]) ?? null;
    }
    await sleep(80);
  } catch (e) {
    value = null;
  }
  sourceStatsCache.set(sourceId, value);
  return value;
}

// ---------- ORCID ----------
async function getOrcidWorks(orcidId) {
  const headers = { Accept: "application/json" };
  const res = await fetch(`https://pub.orcid.org/v3.0/${orcidId}/works`, { headers });
  if (!res.ok) throw new Error("ORCID request failed (" + res.status + ")");
  const data = await res.json();
  const putCodes = (data.group || [])
    .map((g) => g["work-summary"] && g["work-summary"][0] && g["work-summary"][0]["put-code"])
    .filter(Boolean);

  const items = [];
  for (let i = 0; i < putCodes.length; i += 50) {
    const chunk = putCodes.slice(i, i + 50).join(",");
    const res2 = await fetch(`https://pub.orcid.org/v3.0/${orcidId}/works/${chunk}`, { headers });
    if (!res2.ok) continue;
    const data2 = await res2.json();
    for (const bulk of data2.bulk || []) {
      const work = bulk.work;
      if (!work) continue;
      const title = (work.title && work.title.title && work.title.title.value) || "(untitled)";
      const extIds = (work["external-ids"] && work["external-ids"]["external-id"]) || [];
      const doiObj = extIds.find((e) => e["external-id-type"] === "doi");
      const doi = doiObj ? normalizeDoi(doiObj["external-id-value"]) : null;
      const type = work.type || "";
      items.push({ raw: `${title}${type ? " [" + type + "]" : ""}`, doi, searchQuery: title, include: true });
    }
  }
  return items;
}

// ---------- hero: mode toggle ----------
document.querySelectorAll("#mode-toggle .mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

function setMode(mode) {
  document.querySelectorAll("#mode-toggle .mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  const isOrcid = mode === "orcid";
  document.getElementById("mode-orcid-wrap").classList.toggle("hidden", !isOrcid);
  document.getElementById("fetch-orcid-btn").classList.toggle("hidden", !isOrcid);
  document.getElementById("mode-paste-panel").classList.toggle("hidden", isOrcid);
}

// ---------- hero: advanced options ----------
document.getElementById("advanced-toggle").addEventListener("click", () => {
  document.getElementById("advanced-panel").classList.toggle("hidden");
});

// ---------- hero: upload card ----------
document.getElementById("upload-card").addEventListener("click", () => {
  document.getElementById("file-input").click();
});

document.getElementById("file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) await handleParseFile(file);
});

// ---------- hero: examples ----------
document.getElementById("example-list-btn").addEventListener("click", () => {
  setMode("paste");
  const demo = [
    "Munafo, M. R., Nosek, B. A., Bishop, D. V. M., Button, K. S., Chambers, C. D., Percie du Sert, N., Simonsohn, U., Wagenmakers, E. J., Ware, J. J., & Ioannidis, J. P. A. (2017). A manifesto for reproducible science. Nature Human Behaviour, 1, 0021. https://doi.org/10.1038/s41562-016-0021",
    "Open Science Collaboration. (2015). Estimating the reproducibility of psychological science. Science, 349(6251), aac4716. https://doi.org/10.1126/science.aac4716",
    "Simmons, J. P., Nelson, L. D., & Simonsohn, U. (2011). False-positive psychology. Psychological Science, 22(11), 1359-1366. https://doi.org/10.1177/0956797611417632",
  ].join("\n");
  document.getElementById("ref-textarea").value = demo;
  handleParseText(demo);
});

document.getElementById("example-orcid-btn").addEventListener("click", () => {
  setMode("orcid");
  document.getElementById("orcid-input").value = "0000-0002-1825-0097";
  handleFetchOrcid("0000-0002-1825-0097");
});

// ---------- parse (text/file) flow ----------
document.getElementById("parse-btn").addEventListener("click", () => {
  handleParseText(document.getElementById("ref-textarea").value);
});

async function handleParseText(text) {
  const refs = splitReferences(text);
  showReviewTextarea(refs);
}

async function handleParseFile(file) {
  const btn = document.getElementById("upload-card");
  btn.disabled = true;
  try {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "bib") {
      const text = await file.text();
      const entries = parseBibtex(text);
      referenceItems = entries.map(bibEntryToItem);
      showReviewList();
      return;
    }
    let text;
    if (ext === "pdf") {
      const buf = await file.arrayBuffer();
      text = await extractPdfText(buf);
    } else if (ext === "docx") {
      const buf = await file.arrayBuffer();
      text = await extractDocxText(buf);
    } else {
      text = await file.text();
    }
    showReviewTextarea(splitReferences(text));
  } catch (e) {
    alert("Could not parse file: " + e.message);
  } finally {
    btn.disabled = false;
  }
}

function showReviewTextarea(refs) {
  document.getElementById("review-section").classList.remove("hidden");
  document.getElementById("review-text-mode").classList.remove("hidden");
  document.getElementById("review-list-mode").classList.add("hidden");
  document.getElementById("review-count-text").textContent = refs.length;
  document.getElementById("review-textarea").value = refs.join("\n");
  document.getElementById("review-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showReviewList() {
  document.getElementById("review-section").classList.remove("hidden");
  document.getElementById("review-text-mode").classList.add("hidden");
  document.getElementById("review-list-mode").classList.remove("hidden");
  document.getElementById("review-count-list").textContent = referenceItems.length;
  const container = document.getElementById("review-list");
  container.innerHTML = "";
  referenceItems.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "review-item";
    row.innerHTML = `
      <input type="checkbox" data-idx="${idx}" ${item.include ? "checked" : ""}>
      <span>${escapeHtml(item.raw)}${item.doi ? ` <span class="hint-inline">DOI: ${escapeHtml(item.doi)}</span>` : ""}</span>
    `;
    row.querySelector("input").addEventListener("change", (e) => {
      referenceItems[idx].include = e.target.checked;
    });
    container.appendChild(row);
  });
  document.getElementById("review-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ---------- ORCID flow ----------
document.getElementById("fetch-orcid-btn").addEventListener("click", () => {
  handleFetchOrcid(document.getElementById("orcid-input").value.trim());
});

async function handleFetchOrcid(orcidRaw) {
  const btn = document.getElementById("fetch-orcid-btn");
  const orcid = orcidRaw.replace(/^https?:\/\/orcid\.org\//i, "");
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) {
    alert("Please enter a valid ORCID iD, e.g. 0000-0002-1825-0097");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Fetching…";
  try {
    referenceItems = await getOrcidWorks(orcid);
    if (referenceItems.length === 0) {
      alert("No public works found for this ORCID iD.");
      return;
    }
    showReviewList();
  } catch (e) {
    alert(
      "Could not fetch ORCID works: " +
        e.message +
        "\n\nIf this persists, the ORCID API may be unreachable from the browser (CORS/network) — try again later or use the paste/upload option instead."
    );
  } finally {
    btn.disabled = false;
    btn.textContent = "Fetch works";
  }
}

// ---------- confirm & calculate ----------
document.getElementById("confirm-btn").addEventListener("click", async () => {
  const textMode = !document.getElementById("review-text-mode").classList.contains("hidden");
  let items;
  if (textMode) {
    const lines = document
      .getElementById("review-textarea")
      .value.split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    items = lines.map((l) => ({ raw: l, doi: null, searchQuery: l, include: true }));
  } else {
    items = referenceItems.filter((it) => it.include);
  }

  if (items.length === 0) {
    alert("No references to process.");
    return;
  }

  await calculateCosts(items);
});

// ---------- calculation ----------
async function calculateCosts(items) {
  const email = getEmail();
  const progressSection = document.getElementById("progress-section");
  const resultsSection = document.getElementById("results-section");
  progressSection.classList.remove("hidden");
  resultsSection.classList.remove("hidden");
  document.getElementById("confirm-btn").disabled = true;

  currentResults = items.map((it) => ({ ...it, status: "pending", doi: it.doi || null }));
  rowElements = [];
  renderTable();
  updateSummary();
  updateProgress(0, items.length);
  progressSection.scrollIntoView({ behavior: "smooth", block: "start" });

  let done = 0;
  const update = (idx, patch) => {
    currentResults[idx] = { ...currentResults[idx], ...patch };
    renderTable();
    updateSummary();
  };

  await asyncPool(4, items.map((it, i) => i), async (i) => {
    await processItem(currentResults[i], i, email, update);
    done++;
    updateProgress(done, items.length);
  });

  document.getElementById("confirm-btn").disabled = false;
  progressSection.classList.add("hidden");
}

async function processItem(item, index, email, onUpdate) {
  onUpdate(index, { status: "resolving" });
  let doi = normalizeDoi(item.doi);
  let matchedTitle = item.raw;
  let matchScore = null;

  if (!doi) {
    try {
      const match = await searchCrossref(item.searchQuery || item.raw, email);
      if (match) {
        doi = match.doi;
        matchedTitle = match.title || item.raw;
        matchScore = match.score;
      }
    } catch (e) {
      onUpdate(index, { status: "error", notes: "Crossref lookup failed: " + e.message });
      return;
    }
    await sleep(120);
  }

  if (!doi) {
    onUpdate(index, {
      status: "done",
      doi: null,
      cost: null,
      oaStatus: null,
      source: null,
      journal: null,
      notes: "No matching DOI found",
    });
    return;
  }

  onUpdate(index, { status: "fetching-cost", doi, matchedTitle, matchScore });
  let work;
  try {
    work = await getOpenAlexWork(doi, email);
  } catch (e) {
    onUpdate(index, { status: "error", doi, notes: "OpenAlex lookup failed: " + e.message });
    return;
  }
  await sleep(120);

  const estimate = estimateCost(work);
  const citedByCount = work && work.cited_by_count != null ? work.cited_by_count : null;
  const sourceId = work && work.primary_location && work.primary_location.source && work.primary_location.source.id;
  const meanCitedness = sourceId ? await getSourceMeanCitedness(sourceId, email) : null;

  onUpdate(index, {
    status: "done",
    doi,
    matchedTitle: (work && work.title) || matchedTitle,
    matchScore,
    oaStatus: estimate.oaStatus,
    cost: estimate.cost,
    source: estimate.source,
    journal: estimate.journal,
    field: estimate.field,
    notes: estimate.note,
    citedByCount,
    meanCitedness,
  });
}

// ---------- rendering ----------
function updateProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent = `${done} / ${total} processed`;
}

function oaBadgeClass(oaStatus) {
  if (!oaStatus) return "oa-unknown";
  return "oa-" + oaStatus;
}

let rowElements = [];
function ensureRows() {
  const tbody = document.getElementById("results-tbody");
  if (rowElements.length === currentResults.length) return;
  tbody.innerHTML = "";
  rowElements = currentResults.map(() => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="cell-idx"></td>
      <td class="cell-title"></td>
      <td class="cell-doi"></td>
      <td class="cell-oa"></td>
      <td class="cell-cost cost-cell"></td>
      <td class="cell-source"></td>
      <td class="cell-citations num-cell"></td>
      <td class="cell-meancited num-cell"></td>
      <td class="cell-altmetric"></td>
      <td class="cell-notes"></td>
    `;
    tbody.appendChild(tr);
    return tr;
  });
}

function initAltmetric(cell, doi) {
  cell.innerHTML = "";
  const div = document.createElement("div");
  div.className = "altmetric-embed";
  div.setAttribute("data-badge-type", "donut");
  div.setAttribute("data-badge-popover", "left");
  div.setAttribute("data-hide-no-mentions", "true");
  div.setAttribute("data-doi", doi);
  cell.appendChild(div);
  if (window._altmetric_embed_init) window._altmetric_embed_init(cell);

  const obs = new MutationObserver(() => {
    const img = div.querySelector("img");
    if (img && img.alt) {
      const m = img.alt.match(/score of ([\d.]+)/i);
      if (m) cell.dataset.score = m[1];
      obs.disconnect();
    }
  });
  obs.observe(div, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 8000);
}

function renderTable() {
  ensureRows();
  currentResults.forEach((r, i) => {
    const tr = rowElements[i];
    tr.className = r.status === "error" ? "status-error" : "";

    const statusLabel =
      r.status === "pending"
        ? "Waiting…"
        : r.status === "resolving"
        ? "Resolving DOI…"
        : r.status === "fetching-cost"
        ? "Fetching cost…"
        : r.status === "error"
        ? "Error"
        : "";

    const costText = r.status === "done" ? (r.cost != null ? "$" + r.cost.toFixed(2) : "—") : statusLabel;
    const doiHtml = r.doi
      ? `<a href="https://doi.org/${encodeURIComponent(r.doi)}" target="_blank" rel="noopener">${escapeHtml(r.doi)}</a>`
      : "—";
    const oaHtml =
      r.status === "done" && r.oaStatus ? `<span class="badge ${oaBadgeClass(r.oaStatus)}">${escapeHtml(r.oaStatus)}</span>` : r.status === "done" ? "—" : "";
    const notesHtml =
      escapeHtml(r.notes || "") +
      (r.journal || r.field ? `<br><span class="hint-inline">${escapeHtml([r.journal, r.field].filter(Boolean).join(" · "))}</span>` : "");

    tr.querySelector(".cell-idx").textContent = i + 1;
    tr.querySelector(".cell-title").textContent = r.matchedTitle || r.raw;
    tr.querySelector(".cell-doi").innerHTML = doiHtml;
    tr.querySelector(".cell-oa").innerHTML = oaHtml;
    tr.querySelector(".cell-cost").textContent = costText;
    tr.querySelector(".cell-source").textContent = r.source || "";
    tr.querySelector(".cell-citations").textContent = r.status === "done" ? (r.citedByCount != null ? r.citedByCount.toLocaleString("en-US") : "—") : "";
    tr.querySelector(".cell-meancited").textContent = r.status === "done" ? (r.meanCitedness != null ? r.meanCitedness.toFixed(2) : "—") : "";
    tr.querySelector(".cell-notes").innerHTML = notesHtml;

    const altCell = tr.querySelector(".cell-altmetric");
    if (r.doi && !altCell.dataset.initialized) {
      altCell.dataset.initialized = "1";
      initAltmetric(altCell, r.doi);
    } else if (!r.doi && r.status === "done" && !altCell.dataset.initialized) {
      altCell.dataset.initialized = "1";
      altCell.textContent = "—";
    }
  });
}

function updateSummary() {
  const finished = currentResults.filter((r) => r.status === "done");
  const determined = finished.filter((r) => r.cost != null);
  const totalCost = determined.reduce((s, r) => s + r.cost, 0);
  const avgAll = determined.length ? totalCost / determined.length : 0;
  const paidOnly = determined.filter((r) => r.cost > 0);
  const avgPaid = paidOnly.length ? paidOnly.reduce((s, r) => s + r.cost, 0) / paidOnly.length : 0;

  document.getElementById("stat-total-cost").textContent = "$" + totalCost.toFixed(2);
  document.getElementById("stat-avg-all").textContent = "$" + avgAll.toFixed(2);
  document.getElementById("stat-avg-paid").textContent = "$" + avgPaid.toFixed(2);
  document.getElementById("stat-determined").textContent = `${determined.length} / ${currentResults.length}`;

  renderHistogram(determined.map((r) => r.cost));
}

// ---------- histogram ----------
function niceBinWidth(raw) {
  if (!isFinite(raw) || raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const fraction = raw / Math.pow(10, exponent);
  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * Math.pow(10, exponent);
}

function computeHistogram(costs) {
  if (costs.length === 0) return { labels: [], counts: [] };
  const max = Math.max(...costs);
  if (max === 0) {
    return { labels: ["$0"], counts: [costs.length] };
  }
  const targetBins = Math.min(10, Math.max(5, Math.round(Math.sqrt(costs.length))));
  const width = niceBinWidth(max / targetBins);
  const nBins = Math.max(1, Math.ceil((max + 0.01) / width));
  const counts = new Array(nBins).fill(0);
  for (const c of costs) {
    let idx = Math.floor(c / width);
    if (idx >= nBins) idx = nBins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  const labels = counts.map((_, i) => `$${Math.round(i * width).toLocaleString()}–${Math.round((i + 1) * width).toLocaleString()}`);
  return { labels, counts };
}

let costChart = null;
function renderHistogram(costs) {
  const canvas = document.getElementById("cost-histogram");
  if (!canvas || typeof Chart === "undefined") return;
  const { labels, counts } = computeHistogram(costs);

  const caption = document.getElementById("chart-caption");
  if (caption) {
    caption.textContent = costs.length
      ? `Distribution of APC cost across ${costs.length} priced article${costs.length === 1 ? "" : "s"}. Full values are in the table below.`
      : "No priced articles yet.";
  }

  if (!costChart) {
    costChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Articles",
            data: counts,
            backgroundColor: "#2f6f4f",
            borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: "bottom",
            maxBarThickness: 32,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#234f38",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 10,
            displayColors: false,
            callbacks: {
              title: (items) => items[0].label,
              label: (item) => `${item.parsed.y} article${item.parsed.y === 1 ? "" : "s"}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#5c6560", font: { size: 11 } },
            title: { display: true, text: "APC cost (USD)", color: "#5c6560", font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0, color: "#5c6560" },
            grid: { color: "#e4e7e5", drawTicks: false },
            title: { display: true, text: "Number of articles", color: "#5c6560", font: { size: 11 } },
          },
        },
      },
    });
  } else {
    costChart.data.labels = labels;
    costChart.data.datasets[0].data = counts;
    costChart.update();
  }
}

function getAltmetricScore(i) {
  const cell = rowElements[i] && rowElements[i].querySelector(".cell-altmetric");
  const v = cell && cell.dataset.score;
  return v ? parseFloat(v) : null;
}

// ---------- CSV export ----------
document.getElementById("export-csv-btn").addEventListener("click", () => {
  const header = [
    "#", "Reference", "DOI", "OA type", "APC cost (USD)", "Price source",
    "Citations", "Journal mean citedness (2yr)", "Altmetric score", "Journal", "Field", "Notes",
  ];
  const rows = currentResults.map((r, i) => [
    i + 1,
    r.matchedTitle || r.raw,
    r.doi || "",
    r.oaStatus || "",
    r.cost != null ? r.cost.toFixed(2) : "",
    r.source || "",
    r.citedByCount != null ? r.citedByCount : "",
    r.meanCitedness != null ? r.meanCitedness.toFixed(2) : "",
    getAltmetricScore(i) ?? "",
    r.journal || "",
    r.field || "",
    r.notes || "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  downloadFile(csv, "publication-costs.csv", "text/csv;charset=utf-8");
});

// ---------- HTML export ----------
document.getElementById("export-html-btn").addEventListener("click", () => {
  const determined = currentResults.filter((r) => r.status === "done" && r.cost != null);
  const totalCost = determined.reduce((s, r) => s + r.cost, 0);
  const avgAll = determined.length ? totalCost / determined.length : 0;
  const paidOnly = determined.filter((r) => r.cost > 0);
  const avgPaid = paidOnly.length ? paidOnly.reduce((s, r) => s + r.cost, 0) / paidOnly.length : 0;
  const chartImg = costChart ? costChart.toBase64Image() : null;

  const rowsHtml = currentResults
    .map((r, i) => {
      const altScore = getAltmetricScore(i);
      return `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.matchedTitle || r.raw)}</td>
        <td>${r.doi ? `<a href="https://doi.org/${escapeHtml(r.doi)}">${escapeHtml(r.doi)}</a>` : "—"}</td>
        <td>${escapeHtml(r.oaStatus || "—")}</td>
        <td>${r.cost != null ? "$" + r.cost.toFixed(2) : "—"}</td>
        <td>${escapeHtml(r.source || "")}</td>
        <td>${r.citedByCount != null ? r.citedByCount.toLocaleString("en-US") : "—"}</td>
        <td>${r.meanCitedness != null ? r.meanCitedness.toFixed(2) : "—"}</td>
        <td>${altScore != null ? altScore : "—"}</td>
        <td>${escapeHtml([r.journal, r.field].filter(Boolean).join(" · "))}</td>
        <td>${escapeHtml(r.notes || "")}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Publication Cost Report</title>
<style>
  body { font-family: "Source Sans 3", Arial, sans-serif; color: #262b30; background: #f4f7f9; margin: 0; padding: 2rem; }
  h1 { font-family: Georgia, serif; color: #1583ad; margin-bottom: 0.2rem; }
  .generated { color: #8b95a0; font-size: 0.85rem; margin-bottom: 1.2rem; }
  .stats { display: flex; gap: 14px; margin: 1rem 0 1.5rem; flex-wrap: wrap; }
  .stat { background: #eaf4f9; border-radius: 8px; padding: 12px 18px; text-align: center; min-width: 150px; }
  .stat b { display: block; font-size: 1.3rem; color: #0f6f96; }
  .stat span { font-size: 0.78rem; color: #55606b; }
  img.chart { max-width: 100%; margin: 0 0 1.5rem; background: #fff; border-radius: 8px; padding: 10px; }
  table { border-collapse: collapse; width: 100%; background: #fff; font-size: 12.5px; box-shadow: 0 1px 3px rgba(15,40,55,0.07); }
  th, td { padding: 7px 9px; border-bottom: 1px solid #e6ebee; text-align: left; vertical-align: top; }
  th { background: #f4f7f9; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.02em; color: #3d4857; }
  a { color: #1583ad; }
</style>
</head>
<body>
  <h1>Publication Cost Report</h1>
  <p class="generated">Generated by the <a href="https://github.com/LukasRoeseler/pcc">Publication Cost Calculator</a> on ${new Date().toLocaleString()}.</p>
  <div class="stats">
    <div class="stat"><b>$${totalCost.toFixed(2)}</b><span>Total cost (USD)</span></div>
    <div class="stat"><b>$${avgAll.toFixed(2)}</b><span>Average per article (all determined)</span></div>
    <div class="stat"><b>$${avgPaid.toFixed(2)}</b><span>Average per article with an APC &gt; 0</span></div>
    <div class="stat"><b>${determined.length} / ${currentResults.length}</b><span>Articles with a determined cost</span></div>
  </div>
  ${chartImg ? `<img class="chart" src="${chartImg}" alt="Histogram of APC cost across priced articles">` : ""}
  <table>
    <thead>
      <tr>
        <th>#</th><th>Reference / matched title</th><th>DOI</th><th>OA type</th><th>APC cost (USD)</th>
        <th>Price source</th><th>Citations</th><th>Journal mean citedness (2yr)</th><th>Altmetric</th>
        <th>Journal / field</th><th>Notes</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

  downloadFile(html, "publication-cost-report.html", "text/html;charset=utf-8");
});

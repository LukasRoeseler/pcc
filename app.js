/* Publication Cost Calculator
 * All processing happens client-side. References are matched to DOIs via the
 * Crossref API, then priced using OpenAlex's apc_list / apc_paid fields.
 */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
}

// ---------- global state ----------
let referenceItems = []; // { raw, doi, searchQuery, include }
let currentResults = [];
let currentLang = "en";
let currentCurrency = "EUR";
let firstAuthorOnly = false;
let userOrcidNorm = "";
let candidateName = null;
let candidateOrcidId = null;
const exchangeRates = { EUR: 0.92, GBP: 0.78 }; // per 1 USD; overwritten by live rates if available
const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£" };

// ================================================================
// i18n
// ================================================================
const TRANSLATIONS = {
  currency_label: { en: "Currency", de: "Währung" },
  hero_title: { en: "Publication Cost Calculator", de: "Publication Cost Calculator" },
  hero_subtitle: {
    en: "Paste a reference list, upload a file, or enter an ORCID iD to see article processing charges, OA type, citations, and Altmetric attention for every publication.",
    de: "Fügen Sie eine Literaturliste ein, laden Sie eine Datei hoch oder geben Sie eine ORCID-iD ein, um für jede Publikation Publikationsgebühren (APCs), OA-Typ, Zitationen und Altmetric-Aufmerksamkeit zu sehen.",
  },
  mode_paste: { en: "Paste / Upload", de: "Einfügen / Hochladen" },
  mode_orcid: { en: "ORCID iD", de: "ORCID-iD" },
  paste_hint: { en: "One reference per line, or a numbered list", de: "Eine Referenz pro Zeile oder eine nummerierte Liste" },
  parse_btn: { en: "Parse references", de: "Referenzen einlesen" },
  fetch_orcid_btn: { en: "Fetch works", de: "Werke abrufen" },
  or_divider: { en: "or", de: "oder" },
  advanced_title: { en: "Advanced options", de: "Erweiterte Optionen" },
  advanced_sub: { en: "First-author filter", de: "Erstautorenschafts-Filter" },
  upload_title: { en: "Upload a file", de: "Datei hochladen" },
  upload_sub: {
    en: ".txt, .pdf, .docx, or .bib, including Google Scholar/Zotero BibTeX exports",
    de: ".txt, .pdf, .docx oder .bib, einschließlich BibTeX-Exporte aus Google Scholar/Zotero",
  },
  contact_email_label: { en: "Contact email", de: "Kontakt-E-Mail" },
  optional: { en: "(optional)", de: "(optional)" },
  contact_email_hint: {
    en: 'Crossref, OpenAlex, and Unpaywall serve requests faster (and Unpaywall requires it at all) when they can identify a contact. Sent only to those APIs, directly from your browser.',
    de: 'Crossref, OpenAlex und Unpaywall bearbeiten Anfragen schneller, wenn ein Kontakt angegeben ist (Unpaywall verlangt dies sogar). Wird nur direkt aus Ihrem Browser an diese APIs gesendet.',
  },
  your_orcid_label: { en: "Your ORCID iD (optional, for first-author filter)", de: "Ihre ORCID-iD (optional, für Erstautorenschafts-Filter)" },
  first_author_toggle_label: { en: "Count first-authorship papers only towards costs", de: "Nur Erstautorenschaften in die Kosten einrechnen" },
  first_author_hint: {
    en: "Uses OpenAlex's author-position data matched against your ORCID iD above.",
    de: "Nutzt die Autor:innen-Positionsangaben von OpenAlex, abgeglichen mit Ihrer ORCID-iD oben.",
  },
  first_author_missing_orcid: {
    en: "Enter your ORCID iD above to use this filter. Showing all articles for now.",
    de: "Geben Sie oben Ihre ORCID-iD ein, um diesen Filter zu nutzen. Momentan werden alle Artikel gezeigt.",
  },
  first_author_active_note: {
    en: "Showing costs for first-authored articles only. Other rows stay visible below, dimmed and struck through.",
    de: "Es werden nur Kosten für Artikel mit Erstautorenschaft gezeigt. Andere Zeilen bleiben unten sichtbar, abgeblendet und durchgestrichen.",
  },
  examples_label: { en: "Try it", de: "Ausprobieren" },
  example_list_btn: { en: "Load an example reference list", de: "Beispiel-Literaturliste laden" },
  example_orcid_btn: { en: "Try ORCID 0000-0002-1825-0097", de: "ORCID 0000-0002-1825-0097 testen" },
  glossary_title: { en: "What do these terms mean?", de: "Was bedeuten diese Begriffe?" },
  review_title: { en: "Review & confirm", de: "Überprüfen & bestätigen" },
  review_hint_text: {
    en: "We split your input into {n} references. Edit below if anything looks wrong (one reference per line), then confirm.",
    de: "Ihre Eingabe wurde in {n} Referenzen aufgeteilt. Bei Bedarf unten korrigieren (eine Referenz pro Zeile) und dann bestätigen.",
  },
  review_hint_list: {
    en: "Found {n} works. Untick anything you don't want priced.",
    de: "{n} Werke gefunden. Entfernen Sie das Häkchen bei allem, das nicht bepreist werden soll.",
  },
  confirm_btn: { en: "Calculate costs", de: "Kosten berechnen" },
  progress_title: { en: "Processing…", de: "Verarbeitung…" },
  progress_label: { en: "{done} / {total} processed", de: "{done} / {total} verarbeitet" },
  results_title: { en: "Results", de: "Ergebnisse" },
  stat_total: { en: "Total cost", de: "Gesamtkosten" },
  stat_avg_all: { en: "Average per article (all determined)", de: "Ø pro Artikel (alle bestimmten)" },
  stat_avg_paid: { en: "Average per article with an APC > 0", de: "Ø pro Artikel mit APC > 0" },
  stat_determined: { en: "Articles with a determined cost", de: "Artikel mit bestimmten Kosten" },
  stat_cost_per_citation: { en: "Cost per citation", de: "Kosten pro Zitation" },
  stat_cost_per_year: { en: "Cost per year since first publication", de: "Kosten pro Jahr seit der ersten Publikation" },
  chart_title_hist: { en: "Cost distribution", de: "Kostenverteilung" },
  chart_caption_hist: {
    en: "{n} priced article{plural} grouped into fixed cost tiers (free, up to 400, up to 2,500, and above, converted from EUR). Dashed lines mark the mean and median. Full values are in the table below.",
    de: "{n} bepreiste Artikel, gruppiert in feste Kostenstufen (kostenlos, bis 400, bis 2.500, darüber, umgerechnet aus EUR). Gestrichelte Linien markieren Mittelwert und Median. Alle Werte stehen in der Tabelle unten.",
  },
  chart_title_scatter_actual: { en: "Cost vs. actual citations", de: "Kosten vs. tatsächliche Zitationen" },
  chart_caption_scatter_actual: {
    en: "Each dot is one article: its APC cost against how many times it has actually been cited.",
    de: "Jeder Punkt ist ein Artikel: seine APC-Kosten im Vergleich zur tatsächlichen Zitationszahl.",
  },
  chart_title_scatter_expected: { en: "Journal mean citedness vs. actual citations", de: "Mittlere Zitierhäufigkeit der Zeitschrift vs. tatsächliche Zitationen" },
  chart_caption_scatter_expected: {
    en: "Each dot is one article: its journal's mean citedness (a snapshot of that journal's average citation rate over its most recently tracked 2-year window, not a prediction) against how many times this specific article has actually been cited. Points above the diagonal trend are outperforming their journal's typical rate.",
    de: "Jeder Punkt ist ein Artikel: die mittlere Zitierhäufigkeit seiner Zeitschrift (eine Momentaufnahme der durchschnittlichen Zitierrate über das zuletzt erfasste 2-Jahres-Fenster, keine Vorhersage) im Vergleich zur tatsächlichen Zitationszahl dieses Artikels. Punkte über dem allgemeinen Trend übertreffen die typische Rate ihrer Zeitschrift.",
  },
  chart_title_oa: { en: "Open access type breakdown", de: "Open-Access-Typ-Verteilung" },
  chart_title_oa_time: { en: "Open access type by publication year", de: "Open-Access-Typ nach Erscheinungsjahr" },
  chart_title_pdf: { en: "Free PDF availability", de: "Verfügbarkeit einer freien PDF-Datei" },
  pdf_caption_data: {
    en: "Checked via Unpaywall for {n} article{plural}.",
    de: "Für {n} Artikel über Unpaywall geprüft.",
  },
  pdf_caption_no_email: {
    en: "Add a contact email in Advanced options to check PDF availability via Unpaywall.",
    de: "Fügen Sie in den erweiterten Optionen eine Kontakt-E-Mail hinzu, um die PDF-Verfügbarkeit über Unpaywall zu prüfen.",
  },
  pdf_available: { en: "PDF available", de: "PDF verfügbar" },
  pdf_not_available: { en: "No free PDF found", de: "Keine freie PDF gefunden" },
  export_csv_btn: { en: "Export CSV", de: "CSV exportieren" },
  export_html_btn: { en: "Export HTML report", de: "HTML-Bericht exportieren" },
  th_ref: { en: "Reference / matched title", de: "Referenz / gefundener Titel" },
  th_oa: { en: "OA type", de: "OA-Typ" },
  th_cost: { en: "APC cost", de: "APC-Kosten" },
  th_source: { en: "Price source", de: "Preisquelle" },
  th_citations: { en: "Citations", de: "Zitationen" },
  th_meancited: { en: "Journal mean citedness (2yr)", de: "Ø Zitierhäufigkeit der Zeitschrift (2 J.)" },
  th_altmetric: { en: "Altmetric", de: "Altmetric" },
  th_notes: { en: "Notes", de: "Anmerkungen" },
  th_hide: { en: "Hide", de: "Ausblenden" },
  th_pdf: { en: "Free PDF", de: "Freie PDF" },
  th_year: { en: "Year", de: "Jahr" },
  status_waiting: { en: "Waiting…", de: "Wartet…" },
  status_resolving: { en: "Resolving DOI…", de: "DOI wird ermittelt…" },
  status_fetching: { en: "Fetching cost…", de: "Kosten werden abgerufen…" },
  status_error: { en: "Error", de: "Fehler" },
  src_apc_paid: {
    en: "OpenAlex apc_paid (actual payment record, via OpenAPC)",
    de: "OpenAlex apc_paid (tatsächlich gezahlter Betrag, über OpenAPC)",
  },
  src_apc_list: { en: "OpenAlex apc_list (journal list price{year})", de: "OpenAlex apc_list (Listenpreis der Zeitschrift{year})" },
  src_apc_list_year: { en: " in {year}", de: " im Jahr {year}" },
  src_inferred: { en: "Inferred: non-gold/hybrid OA route", de: "Abgeleitet: kein Gold-/Hybrid-OA-Weg" },
  src_diamond: { en: "OpenAlex: no APC pricing on record for this journal (diamond OA)", de: "OpenAlex: keine APC-Preisangabe für diese Zeitschrift bekannt (Diamond OA)" },
  src_diamond_doaj: { en: "DOAJ: this journal is listed with no APC (diamond OA)", de: "DOAJ: diese Zeitschrift ist ohne APC gelistet (Diamond OA)" },
  src_preprint: { en: "Preprint repository: free to read, no APC", de: "Preprint-Repositorium: frei zugänglich, keine APC" },
  note_no_openalex: { en: "No OpenAlex record found for this DOI", de: "Kein OpenAlex-Eintrag für diese DOI gefunden" },
  note_list_price_caveat: {
    en: "List price. The actual amount paid may differ (waivers, discounts, institutional agreements).",
    de: "Listenpreis. Der tatsächlich gezahlte Betrag kann abweichen (Erlasse, Rabatte, institutionelle Vereinbarungen).",
  },
  note_oa_no_apc: { en: "Open access but no APC price data available", de: "Open Access, aber keine APC-Preisdaten verfügbar" },
  note_inferred_caveat: {
    en: "Typically no APC for this route (subscription, self-archived, or bronze); not independently verified.",
    de: "Für diesen Weg fällt in der Regel keine APC an (Abo, Selbstarchivierung oder Bronze); nicht unabhängig geprüft.",
  },
  note_green_available: {
    en: "Published in a subscription journal. A free self-archived (green OA) copy is also available; no APC applies.",
    de: "Veröffentlicht in einer Abonnement-Zeitschrift. Eine frei zugängliche, selbst archivierte (Grün-OA) Kopie ist ebenfalls verfügbar; es fällt keine APC an.",
  },
  note_diamond: {
    en: "Diamond OA, the best case: free to read and free to publish, no author fee found.",
    de: "Diamond OA, der beste Fall: frei zugänglich und ohne Publikationsgebühr für Autor:innen.",
  },
  note_preprint: {
    en: "Hosted on a preprint repository: free to read, no APC. Note this may not be the peer-reviewed version of record.",
    de: "Auf einem Preprint-Repositorium gehostet: frei zugänglich, keine APC. Dies ist möglicherweise nicht die begutachtete Fassung.",
  },
  note_oa_unknown: { en: "OA status unknown, no APC data", de: "OA-Status unbekannt, keine APC-Daten" },
  note_no_doi: { en: "No matching DOI found", de: "Keine passende DOI gefunden" },
  note_excluded_not_first_author: {
    en: "Excluded from totals: not confirmed first author.",
    de: "Von den Summen ausgeschlossen: Erstautorenschaft nicht bestätigt.",
  },
  note_manually_hidden: { en: "Hidden manually; excluded from totals.", de: "Manuell ausgeblendet, von den Summen ausgeschlossen." },
  note_crossref_failed_prefix: { en: "Crossref lookup failed: ", de: "Crossref-Suche fehlgeschlagen: " },
  note_openalex_failed_prefix: { en: "OpenAlex lookup failed: ", de: "OpenAlex-Abfrage fehlgeschlagen: " },
  oa_gold: { en: "gold", de: "Gold" },
  oa_hybrid: { en: "hybrid", de: "Hybrid" },
  oa_green: { en: "closed (green available)", de: "geschlossen (Grün verfügbar)" },
  oa_bronze: { en: "bronze", de: "Bronze" },
  oa_closed: { en: "closed", de: "Geschlossen" },
  oa_diamond: { en: "diamond", de: "Diamond" },
  oa_preprint: { en: "preprint", de: "Preprint" },
  oa_unknown: { en: "unknown", de: "Unbekannt" },
  th_retracted: { en: "Retracted", de: "Zurückgezogen" },
  retracted_badge: { en: "RETRACTED", de: "ZURÜCKGEZOGEN" },
  candidate_report_label: { en: "Report for", de: "Bericht für" },
  retraction_banner_text: {
    en: "{n} retracted work{plural} found among these publications. Check the Notes column for details before using this report.",
    de: "{n} zurückgezogene Publikation(en) unter diesen Werken gefunden. Details siehe Spalte Anmerkungen, bevor dieser Bericht verwendet wird.",
  },
  alert_invalid_orcid: {
    en: "Please enter a valid ORCID iD, e.g. 0000-0002-1825-0097",
    de: "Bitte geben Sie eine gültige ORCID-iD ein, z. B. 0000-0002-1825-0097",
  },
  alert_orcid_none_found: { en: "No public works found for this ORCID iD.", de: "Keine öffentlichen Werke für diese ORCID-iD gefunden." },
  alert_orcid_failed_prefix: { en: "Could not fetch ORCID works: ", de: "ORCID-Werke konnten nicht abgerufen werden: " },
  alert_orcid_failed_hint: {
    en: "\n\nIf this persists, the ORCID API may be unreachable from the browser (a CORS or network issue). Try again later, or use the paste/upload option instead.",
    de: "\n\nWenn dies weiterhin auftritt, ist die ORCID-API vom Browser aus eventuell nicht erreichbar (CORS- oder Netzwerkproblem). Versuchen Sie es später erneut, oder nutzen Sie stattdessen Einfügen/Hochladen.",
  },
  alert_parse_file_failed_prefix: { en: "Could not parse file: ", de: "Datei konnte nicht verarbeitet werden: " },
  alert_no_refs: { en: "No references to process.", de: "Keine Referenzen zu verarbeiten." },
  footnote: {
    en: 'All processing happens in your browser. Data comes from the public <a href="https://www.crossref.org/documentation/retrieve-metadata/rest-api/" target="_blank" rel="noopener">Crossref</a>, <a href="https://openalex.org" target="_blank" rel="noopener">OpenAlex</a> (including <a href="https://openapc.net" target="_blank" rel="noopener">OpenAPC</a>), <a href="https://pub.orcid.org" target="_blank" rel="noopener">ORCID</a>, <a href="https://unpaywall.org" target="_blank" rel="noopener">Unpaywall</a>, and <a href="https://www.altmetric.com" target="_blank" rel="noopener">Altmetric</a> APIs. Nothing is stored on a server. See the <a href="README.md">README</a> for methodology.',
    de: 'Die gesamte Verarbeitung erfolgt in Ihrem Browser. Die Daten stammen von den öffentlichen APIs <a href="https://www.crossref.org/documentation/retrieve-metadata/rest-api/" target="_blank" rel="noopener">Crossref</a>, <a href="https://openalex.org" target="_blank" rel="noopener">OpenAlex</a> (inklusive <a href="https://openapc.net" target="_blank" rel="noopener">OpenAPC</a>), <a href="https://pub.orcid.org" target="_blank" rel="noopener">ORCID</a>, <a href="https://unpaywall.org" target="_blank" rel="noopener">Unpaywall</a> und <a href="https://www.altmetric.com" target="_blank" rel="noopener">Altmetric</a>. Nichts wird auf einem Server gespeichert. Methodik siehe <a href="README.md">README</a>.',
  },
  glossary_apc_term: { en: "APC (Article Processing Charge)", de: "APC (Article Processing Charge)" },
  glossary_apc_def: {
    en: "The fee some journals charge to make an article freely readable (open access) immediately on publication.",
    de: "Die Gebühr, die manche Zeitschriften verlangen, um einen Artikel sofort bei Veröffentlichung frei zugänglich (Open Access) zu machen.",
  },
  glossary_diamond_term: { en: "Diamond OA", de: "Diamond-OA" },
  glossary_diamond_def: {
    en: "The best case for a reader and an author alike: published in a fully open-access journal that charges no APC at all, funded some other way (institutional, society, or grant support).",
    de: "Der beste Fall für Lesende und Autor:innen: veröffentlicht in einer reinen Open-Access-Zeitschrift, die keine APC verlangt, finanziert auf andere Weise (Institution, Fachgesellschaft oder Förderung).",
  },
  glossary_preprint_term: { en: "Preprint", de: "Preprint" },
  glossary_preprint_def: {
    en: "Deposited on a preprint repository (arXiv, OSF and its branded servers like PsyArXiv/SocArXiv/MetaArXiv, SSRN, medRxiv, bioRxiv, Zenodo, preprints.org, and similar). Free to read, no APC, but not necessarily the peer-reviewed version of record.",
    de: "Auf einem Preprint-Repositorium hinterlegt (arXiv, OSF und seine Marken wie PsyArXiv/SocArXiv/MetaArXiv, SSRN, medRxiv, bioRxiv, Zenodo, preprints.org und ähnliche). Frei zugänglich, keine APC, aber nicht zwingend die begutachtete Fassung.",
  },
  glossary_gold_term: { en: "Gold OA", de: "Gold-OA" },
  glossary_gold_def: {
    en: "Published in a fully open-access journal, usually funded by an APC.",
    de: "Veröffentlicht in einer reinen Open-Access-Zeitschrift, meist finanziert durch eine APC.",
  },
  glossary_hybrid_term: { en: "Hybrid OA", de: "Hybrid-OA" },
  glossary_hybrid_def: {
    en: "Published in a subscription journal, but this specific article was made open access for a fee.",
    de: "Veröffentlicht in einer Abonnement-Zeitschrift, aber dieser einzelne Artikel wurde gegen Gebühr frei zugänglich gemacht.",
  },
  glossary_green_term: { en: "Closed (green copy available)", de: "Geschlossen (Grün-Kopie verfügbar)" },
  glossary_green_def: {
    en: "The journal itself is a subscription journal (not open access), but a free copy (e.g. a preprint or accepted manuscript) is legally available elsewhere, such as a repository. No APC applies.",
    de: "Die Zeitschrift selbst ist eine Abonnement-Zeitschrift (nicht Open Access), aber eine freie Kopie (z. B. Preprint oder akzeptiertes Manuskript) ist legal anderswo verfügbar, etwa in einem Repositorium. Es fällt keine APC an.",
  },
  glossary_bronze_term: { en: "Bronze OA", de: "Bronze-OA" },
  glossary_bronze_def: {
    en: "Free to read on the publisher's site, but without a clear open license and usually without a formal APC.",
    de: "Auf der Verlagsseite frei lesbar, aber ohne klare offene Lizenz und meist ohne formale APC.",
  },
  glossary_closed_term: { en: "Closed", de: "Geschlossen" },
  glossary_closed_def: {
    en: "No free legal copy found anywhere; typically requires a subscription or per-article payment to read.",
    de: "Keine freie legale Kopie gefunden; meist nur über Abonnement oder Einzelzahlung lesbar.",
  },
  glossary_mean_citedness_term: { en: "Journal mean citedness (2-year)", de: "Ø Zitierhäufigkeit der Zeitschrift (2 Jahre)" },
  glossary_mean_citedness_def: {
    en: "The journal's average number of citations per article over 2 years, similar in spirit to a journal impact factor. Used here as a rough benchmark for how many citations an average paper in that journal gets.",
    de: "Die durchschnittliche Zahl an Zitationen pro Artikel einer Zeitschrift über 2 Jahre, ähnlich einem Journal Impact Factor. Dient hier als grober Richtwert, wie viele Zitationen ein durchschnittlicher Artikel dieser Zeitschrift erhält.",
  },
  glossary_altmetric_term: { en: "Altmetric Attention Score", de: "Altmetric Attention Score" },
  glossary_altmetric_def: {
    en: 'A weighted count of online attention (news, blogs, social media, policy documents, etc.) an article received. A higher score is not automatically "better"; it reflects visibility, not quality.',
    de: 'Eine gewichtete Kennzahl der Online-Aufmerksamkeit (Nachrichten, Blogs, soziale Medien, politische Dokumente usw.), die ein Artikel erhalten hat. Ein höherer Wert ist nicht automatisch "besser", er spiegelt Sichtbarkeit wider, nicht Qualität.',
  },
  glossary_cost_per_citation_term: { en: "Cost per citation", de: "Kosten pro Zitation" },
  glossary_cost_per_citation_def: {
    en: "Total APC spending divided by total citations received: a rough efficiency indicator (a lower number can mean more citation impact per unit of currency spent).",
    de: "Gesamte APC-Ausgaben geteilt durch die Gesamtzahl der Zitationen: ein grober Effizienz-Indikator (ein niedrigerer Wert kann mehr Zitationswirkung pro ausgegebener Währungseinheit bedeuten).",
  },
  glossary_first_author_term: { en: "First-authorship filter", de: "Erstautorenschafts-Filter" },
  glossary_first_author_def: {
    en: "Restricts the cost totals to papers where you (matched via ORCID) are listed as the first author, useful if you only want to count costs you were most responsible for.",
    de: "Beschränkt die Kostensummen auf Artikel, bei denen Sie (abgeglichen über ORCID) als Erstautor:in gelistet sind, nützlich, wenn nur Kosten gezählt werden sollen, für die Sie hauptverantwortlich waren.",
  },
  glossary_hide_term: { en: "Hide", de: "Ausblenden" },
  glossary_hide_def: {
    en: "Lets you remove a row that was matched to the wrong article (or that you simply don't want counted) from all totals and charts, without deleting your input.",
    de: "Ermöglicht es, eine Zeile, die dem falschen Artikel zugeordnet wurde (oder die einfach nicht gezählt werden soll), aus allen Summen und Diagrammen zu entfernen, ohne Ihre Eingabe zu löschen.",
  },
  glossary_pdf_term: { en: "Free PDF availability", de: "Verfügbarkeit einer freien PDF-Datei" },
  glossary_pdf_def: {
    en: "Whether a free, legally posted PDF of the article could be found via Unpaywall, regardless of OA type.",
    de: "Ob über Unpaywall eine frei zugängliche, legal veröffentlichte PDF-Datei des Artikels gefunden werden konnte, unabhängig vom OA-Typ.",
  },
};

const GLOSSARY_TERMS = [
  "apc", "diamond", "preprint", "gold", "hybrid", "green", "bronze", "closed",
  "mean_citedness", "altmetric", "cost_per_citation", "first_author", "hide", "pdf",
];

function t(key, vars) {
  const entry = TRANSLATIONS[key];
  if (!entry) return key;
  let str = entry[currentLang] || entry.en || "";
  if (vars) {
    for (const k of Object.keys(vars)) str = str.split("{" + k + "}").join(vars[k]);
  }
  return str;
}

function applyTranslations() {
  document.getElementById("html-root").lang = currentLang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  const orcidInput = document.getElementById("orcid-input");
  if (orcidInput) orcidInput.placeholder = "0000-0002-1825-0097" + (currentLang === "de" ? " oder orcid.org/0000-0002-1825-0097" : " or orcid.org/0000-0002-1825-0097");
  updateCostHeader();
}

function updateCostHeader() {
  const th = document.getElementById("th-cost");
  if (th) th.textContent = `${t("th_cost")} (${currentCurrency})`;
}

function renderGlossary() {
  const dl = document.getElementById("glossary-body");
  dl.innerHTML = GLOSSARY_TERMS.map((id) => `<dt>${escapeHtml(t(`glossary_${id}_term`))}</dt><dd>${escapeHtml(t(`glossary_${id}_def`))}</dd>`).join("");
}

document.querySelectorAll("#lang-toggle .lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentLang = btn.dataset.lang;
    document.querySelectorAll("#lang-toggle .lang-btn").forEach((b) => b.classList.toggle("active", b === btn));
    applyTranslations();
    renderGlossary();
    if (currentResults.length) {
      renderTable();
      updateSummary();
    }
    updateReviewHints();
  });
});

document.getElementById("glossary-toggle").addEventListener("click", () => {
  const btn = document.getElementById("glossary-toggle");
  const body = document.getElementById("glossary-body");
  const expanded = btn.getAttribute("aria-expanded") === "true";
  btn.setAttribute("aria-expanded", String(!expanded));
  body.classList.toggle("hidden", expanded);
});

// ================================================================
// currency
// ================================================================
async function loadExchangeRates() {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP");
    if (res.ok) {
      const data = await res.json();
      if (data.rates && data.rates.EUR) exchangeRates.EUR = data.rates.EUR;
      if (data.rates && data.rates.GBP) exchangeRates.GBP = data.rates.GBP;
    }
  } catch (e) {
    // keep fallback approximate rates
  }
}

function convertCost(usd) {
  if (usd == null) return null;
  if (currentCurrency === "USD") return usd;
  return usd * (exchangeRates[currentCurrency] || 1);
}

function formatCurrency(usd) {
  if (usd == null) return null;
  return CURRENCY_SYMBOLS[currentCurrency] + convertCost(usd).toFixed(2);
}

document.getElementById("currency-select").addEventListener("change", (e) => {
  currentCurrency = e.target.value;
  updateCostHeader();
  if (currentResults.length) {
    renderTable();
    updateSummary();
  }
});

// ================================================================
// first-author filter
// ================================================================
function normalizeOrcidInput(raw) {
  if (!raw) return "";
  let s = raw.trim();
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/^www\./i, "");
  s = s.replace(/^orcid\.org\//i, "");
  s = s.replace(/\/+$/, "");
  return s.toUpperCase();
}

function isValidOrcid(id) {
  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id);
}

document.getElementById("user-orcid-input").addEventListener("input", (e) => {
  userOrcidNorm = normalizeOrcidInput(e.target.value);
  if (currentResults.length) {
    renderTable();
    updateSummary();
  }
});

document.getElementById("first-author-toggle").addEventListener("change", (e) => {
  firstAuthorOnly = e.target.checked;
  if (currentResults.length) {
    renderTable();
    updateSummary();
  }
});

function authorPositionFor(r) {
  if (!r.authorships || !userOrcidNorm) return null;
  const match = r.authorships.find((a) => a.author && a.author.orcid && normalizeOrcidInput(a.author.orcid) === userOrcidNorm);
  return match ? match.author_position : null;
}

function filterActive() {
  return firstAuthorOnly && !!userOrcidNorm;
}

function passesAuthorFilter(r) {
  if (!filterActive()) return true;
  return authorPositionFor(r) === "first";
}

function isIncluded(r) {
  if (r.manuallyHidden) return false;
  return passesAuthorFilter(r);
}

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

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
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
    ? `${title}${author ? ", " + author : ""}${year ? " (" + year + ")" : ""}`
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

const sourceStatsCache = new Map();
async function getSourceInfo(sourceId, email) {
  if (!sourceId) return { meanCitedness: null, hasApcPricing: null };
  if (sourceStatsCache.has(sourceId)) return sourceStatsCache.get(sourceId);
  const shortId = sourceId.replace(/^https?:\/\/openalex\.org\//i, "");
  const params = new URLSearchParams();
  if (email) params.set("mailto", email);
  const qs = params.toString();
  const url = `https://api.openalex.org/sources/${encodeURIComponent(shortId)}${qs ? "?" + qs : ""}`;
  let info = { meanCitedness: null, hasApcPricing: null, issnL: null };
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      info = {
        meanCitedness: (data.summary_stats && data.summary_stats["2yr_mean_citedness"]) ?? null,
        hasApcPricing: Array.isArray(data.apc_prices) && data.apc_prices.length > 0,
        issnL: data.issn_l || (Array.isArray(data.issn) && data.issn[0]) || null,
      };
    }
    await sleep(80);
  } catch (e) {
    info = { meanCitedness: null, hasApcPricing: null, issnL: null };
  }
  sourceStatsCache.set(sourceId, info);
  return info;
}

const doajCache = new Map();
async function getDoajHasApc(issnL) {
  if (!issnL) return null;
  if (doajCache.has(issnL)) return doajCache.get(issnL);
  let hasApc = null;
  try {
    const res = await fetch(`https://doaj.org/api/search/journals/${encodeURIComponent(issnL)}`);
    if (res.ok) {
      const data = await res.json();
      const journal = data.results && data.results[0];
      if (journal && journal.bibjson && journal.bibjson.apc) hasApc = !!journal.bibjson.apc.has_apc;
    }
    await sleep(80);
  } catch (e) {
    hasApc = null;
  }
  doajCache.set(issnL, hasApc);
  return hasApc;
}

async function estimateCost(work, sourceInfo, email) {
  if (!work) {
    return { cost: null, sourceKey: null, sourceParams: null, oaStatus: null, noteKey: "note_no_openalex", journal: null, field: null };
  }
  let oaStatus = work.open_access ? work.open_access.oa_status : null;
  const journal =
    (work.primary_location && work.primary_location.source && work.primary_location.source.display_name) || null;
  const field = (work.primary_topic && work.primary_topic.field && work.primary_topic.field.display_name) || null;
  const apcPaid = work.apc_paid;
  const apcList = work.apc_list;
  const info = sourceInfo || { meanCitedness: null, hasApcPricing: null, issnL: null };

  // an actual recorded payment is trustworthy regardless of the OA label
  if (apcPaid && apcPaid.value_usd != null) {
    return { cost: apcPaid.value_usd, sourceKey: "src_apc_paid", sourceParams: null, oaStatus, noteKey: null, journal, field };
  }

  // a preprint hosted on a repository (arXiv, OSF-family, SSRN, medRxiv, etc.)
  // is free to read and never carries an APC of its own.
  if (work.type === "preprint") {
    return { cost: 0, sourceKey: "src_preprint", sourceParams: null, oaStatus: "preprint", noteKey: "note_preprint", journal, field };
  }

  // OpenAlex classifies some works as diamond OA directly (free to read and
  // free to publish); trust that label outright.
  if (oaStatus === "diamond") {
    return { cost: 0, sourceKey: "src_diamond", sourceParams: null, oaStatus, noteKey: "note_diamond", journal, field };
  }

  // apc_list is only a legitimate cost basis when the paid-OA route was
  // actually the one used (gold/hybrid); for green/bronze/closed it just
  // reflects an optional fee this article did not use.
  if (oaStatus === "gold" || oaStatus === "hybrid") {
    if (apcList && apcList.value_usd != null) {
      return {
        cost: apcList.value_usd,
        sourceKey: "src_apc_list",
        sourceParams: { year: work.publication_year || "" },
        oaStatus,
        noteKey: "note_list_price_caveat",
        journal,
        field,
      };
    }
    if (oaStatus === "gold") {
      if (info.hasApcPricing === false) {
        return { cost: 0, sourceKey: "src_diamond", sourceParams: null, oaStatus: "diamond", noteKey: "note_diamond", journal, field };
      }
      // OpenAlex was inconclusive; fall back to DOAJ, which lists has_apc for
      // every journal it indexes (DOAJ only indexes OA journals).
      if (info.hasApcPricing !== true) {
        const doajHasApc = await getDoajHasApc(info.issnL);
        if (doajHasApc === false) {
          return { cost: 0, sourceKey: "src_diamond_doaj", sourceParams: null, oaStatus: "diamond", noteKey: "note_diamond", journal, field };
        }
      }
    }
    return { cost: null, sourceKey: null, sourceParams: null, oaStatus, noteKey: "note_oa_no_apc", journal, field };
  }
  if (oaStatus === "green") {
    return { cost: 0, sourceKey: "src_inferred", sourceParams: null, oaStatus, noteKey: "note_green_available", journal, field };
  }
  if (oaStatus === "closed" || oaStatus === "bronze") {
    return { cost: 0, sourceKey: "src_inferred", sourceParams: null, oaStatus, noteKey: "note_inferred_caveat", journal, field };
  }
  return { cost: null, sourceKey: null, sourceParams: null, oaStatus, noteKey: "note_oa_unknown", journal, field };
}

function formatSource(sourceKey, sourceParams) {
  if (!sourceKey) return "";
  if (sourceKey === "src_apc_list") {
    const yearStr = sourceParams && sourceParams.year ? t("src_apc_list_year", { year: sourceParams.year }) : "";
    return t("src_apc_list", { year: yearStr });
  }
  return t(sourceKey);
}

async function getUnpaywallInfo(doi, email) {
  if (!email) return null;
  try {
    const res = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.error) return null;
    const hasPdf = !!(data.best_oa_location && data.best_oa_location.url_for_pdf);
    await sleep(80);
    return { hasPdf };
  } catch (e) {
    return null;
  }
}

// ---------- ORCID ----------
async function getOrcidPersonName(orcidId) {
  try {
    const res = await fetch(`https://pub.orcid.org/v3.0/${orcidId}/person`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const given = data.name && data.name["given-names"] && data.name["given-names"].value;
    const family = data.name && data.name["family-name"] && data.name["family-name"].value;
    const credit = data.name && data.name["credit-name"] && data.name["credit-name"].value;
    if (credit) return credit;
    return [given, family].filter(Boolean).join(" ") || null;
  } catch (e) {
    return null;
  }
}

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
  const btn = document.getElementById("advanced-toggle");
  const panel = document.getElementById("advanced-panel");
  const expanded = btn.getAttribute("aria-expanded") === "true";
  btn.setAttribute("aria-expanded", String(!expanded));
  panel.classList.toggle("hidden");
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
  candidateName = null;
  candidateOrcidId = null;
  const refs = splitReferences(text);
  showReviewTextarea(refs);
}

async function handleParseFile(file) {
  candidateName = null;
  candidateOrcidId = null;
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
    alert(t("alert_parse_file_failed_prefix") + e.message);
  } finally {
    btn.disabled = false;
  }
}

let lastReviewCount = { mode: null, n: 0 };
function updateReviewHints() {
  if (lastReviewCount.mode === "text") {
    document.getElementById("review-hint-text").textContent = t("review_hint_text", { n: lastReviewCount.n });
  } else if (lastReviewCount.mode === "list") {
    document.getElementById("review-hint-list").textContent = t("review_hint_list", { n: lastReviewCount.n });
  }
}

function showReviewTextarea(refs) {
  document.getElementById("review-section").classList.remove("hidden");
  document.getElementById("review-text-mode").classList.remove("hidden");
  document.getElementById("review-list-mode").classList.add("hidden");
  lastReviewCount = { mode: "text", n: refs.length };
  updateReviewHints();
  document.getElementById("review-textarea").value = refs.join("\n");
  document.getElementById("review-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showReviewList() {
  document.getElementById("review-section").classList.remove("hidden");
  document.getElementById("review-text-mode").classList.add("hidden");
  document.getElementById("review-list-mode").classList.remove("hidden");
  lastReviewCount = { mode: "list", n: referenceItems.length };
  updateReviewHints();
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

// ---------- ORCID flow ----------
document.getElementById("fetch-orcid-btn").addEventListener("click", () => {
  handleFetchOrcid(document.getElementById("orcid-input").value.trim());
});

async function handleFetchOrcid(orcidRaw) {
  const btn = document.getElementById("fetch-orcid-btn");
  const orcid = normalizeOrcidInput(orcidRaw);
  if (!isValidOrcid(orcid)) {
    alert(t("alert_invalid_orcid"));
    return;
  }
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "…";
  try {
    const [works, personName] = await Promise.all([getOrcidWorks(orcid), getOrcidPersonName(orcid)]);
    referenceItems = works;
    if (referenceItems.length === 0) {
      alert(t("alert_orcid_none_found"));
      return;
    }
    candidateName = personName;
    candidateOrcidId = orcid;
    // auto-fill "your ORCID" for the first-author filter, if empty
    const userOrcidField = document.getElementById("user-orcid-input");
    if (!userOrcidField.value.trim()) {
      userOrcidField.value = orcid;
      userOrcidNorm = orcid;
    }
    showReviewList();
  } catch (e) {
    alert(t("alert_orcid_failed_prefix") + e.message + t("alert_orcid_failed_hint"));
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
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
    alert(t("alert_no_refs"));
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
      onUpdate(index, { status: "error", notes: t("note_crossref_failed_prefix") + e.message });
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
      sourceKey: null,
      sourceParams: null,
      journal: null,
      noteKey: "note_no_doi",
    });
    return;
  }

  onUpdate(index, { status: "fetching-cost", doi, matchedTitle, matchScore });
  let work;
  try {
    work = await getOpenAlexWork(doi, email);
  } catch (e) {
    onUpdate(index, { status: "error", doi, notes: t("note_openalex_failed_prefix") + e.message });
    return;
  }
  await sleep(120);

  const sourceId = work && work.primary_location && work.primary_location.source && work.primary_location.source.id;
  const sourceInfo = sourceId ? await getSourceInfo(sourceId, email) : null;
  const estimate = await estimateCost(work, sourceInfo, email);
  const citedByCount = work && work.cited_by_count != null ? work.cited_by_count : null;
  const meanCitedness = sourceInfo ? sourceInfo.meanCitedness : null;
  const authorships = (work && work.authorships) || null;
  const publicationYear = (work && work.publication_year) || null;
  const isRetracted = !!(work && work.is_retracted);
  // preprints always have a downloadable PDF at their host repository; no need to ask Unpaywall
  const unpaywallInfo = estimate.oaStatus === "preprint" ? null : await getUnpaywallInfo(doi, email);

  onUpdate(index, {
    status: "done",
    doi,
    matchedTitle: (work && work.title) || matchedTitle,
    matchScore,
    oaStatus: estimate.oaStatus,
    cost: estimate.cost,
    sourceKey: estimate.sourceKey,
    sourceParams: estimate.sourceParams,
    journal: estimate.journal,
    field: estimate.field,
    noteKey: estimate.noteKey,
    citedByCount,
    meanCitedness,
    authorships,
    publicationYear,
    isRetracted,
    hasPdf: estimate.oaStatus === "preprint" ? true : unpaywallInfo ? unpaywallInfo.hasPdf : null,
  });
}

// ---------- rendering ----------
function updateProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const fill = document.getElementById("progress-fill");
  fill.style.width = pct + "%";
  fill.setAttribute("aria-valuenow", String(pct));
  document.getElementById("progress-label").textContent = t("progress_label", { done, total });
}

function oaBadgeClass(oaStatus) {
  if (!oaStatus) return "oa-unknown";
  return "oa-" + oaStatus;
}

function oaLabel(oaStatus) {
  return t("oa_" + (oaStatus || "unknown"));
}

let rowElements = [];
function ensureRows() {
  const tbody = document.getElementById("results-tbody");
  if (rowElements.length === currentResults.length) return;
  tbody.innerHTML = "";
  rowElements = currentResults.map((_, i) => {
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
      <td class="cell-hide"><input type="checkbox" class="hide-checkbox" aria-label="Hide this row from totals"></td>
    `;
    tr.querySelector(".hide-checkbox").addEventListener("change", (e) => {
      currentResults[i].manuallyHidden = e.target.checked;
      renderTable();
      updateSummary();
    });
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
    const manuallyHidden = !!r.manuallyHidden;
    const authorExcluded = r.status === "done" && !manuallyHidden && !passesAuthorFilter(r);
    const excluded = manuallyHidden || authorExcluded;
    tr.className = r.status === "error" ? "status-error" : excluded ? "excluded-row" : "";

    const statusLabel =
      r.status === "pending"
        ? t("status_waiting")
        : r.status === "resolving"
        ? t("status_resolving")
        : r.status === "fetching-cost"
        ? t("status_fetching")
        : r.status === "error"
        ? t("status_error")
        : "";

    const costText = r.status === "done" ? (r.cost != null ? formatCurrency(r.cost) : "–") : statusLabel;
    const doiHtml = r.doi
      ? `<a href="https://doi.org/${encodeURIComponent(r.doi)}" target="_blank" rel="noopener">${escapeHtml(r.doi)}</a>`
      : "–";
    const oaHtml =
      r.status === "done" && r.oaStatus ? `<span class="badge ${oaBadgeClass(r.oaStatus)}">${escapeHtml(oaLabel(r.oaStatus))}</span>` : r.status === "done" ? "–" : "";

    let notesText = r.noteKey ? t(r.noteKey) : r.notes || "";
    if (manuallyHidden) notesText = (notesText ? notesText + ". " : "") + t("note_manually_hidden");
    else if (authorExcluded) notesText = (notesText ? notesText + ". " : "") + t("note_excluded_not_first_author");
    const notesHtml =
      escapeHtml(notesText) +
      (r.journal || r.field ? `<br><span class="hint-inline">${escapeHtml([r.journal, r.field].filter(Boolean).join(" · "))}</span>` : "");

    tr.querySelector(".cell-idx").textContent = i + 1;
    tr.querySelector(".cell-title").innerHTML =
      (r.isRetracted ? `<span class="badge retracted">${escapeHtml(t("retracted_badge"))}</span> ` : "") + escapeHtml(r.matchedTitle || r.raw);
    tr.querySelector(".cell-doi").innerHTML = doiHtml;
    tr.querySelector(".cell-oa").innerHTML = oaHtml;
    tr.querySelector(".cell-cost").textContent = costText;
    tr.querySelector(".cell-source").textContent = r.sourceKey ? formatSource(r.sourceKey, r.sourceParams) : "";
    tr.querySelector(".cell-citations").textContent = r.status === "done" ? (r.citedByCount != null ? r.citedByCount.toLocaleString("en-US") : "–") : "";
    tr.querySelector(".cell-meancited").textContent = r.status === "done" ? (r.meanCitedness != null ? r.meanCitedness.toFixed(2) : "–") : "";
    tr.querySelector(".cell-notes").innerHTML = notesHtml;
    tr.querySelector(".hide-checkbox").checked = manuallyHidden;

    const altCell = tr.querySelector(".cell-altmetric");
    if (r.doi && !altCell.dataset.initialized) {
      altCell.dataset.initialized = "1";
      initAltmetric(altCell, r.doi);
    } else if (!r.doi && r.status === "done" && !altCell.dataset.initialized) {
      altCell.dataset.initialized = "1";
      altCell.textContent = "–";
    }
  });
}

function getAltmetricScore(i) {
  const cell = rowElements[i] && rowElements[i].querySelector(".cell-altmetric");
  const v = cell && cell.dataset.score;
  return v ? parseFloat(v) : null;
}

function renderCandidateAndRetraction(finished) {
  const header = document.getElementById("candidate-header");
  const nameEl = document.getElementById("candidate-name");
  const orcidLink = document.getElementById("candidate-orcid-link");
  if (candidateName || candidateOrcidId) {
    header.classList.remove("hidden");
    nameEl.textContent = candidateName || "";
    if (candidateOrcidId) {
      orcidLink.href = `https://orcid.org/${candidateOrcidId}`;
      orcidLink.textContent = `ORCID ${candidateOrcidId}`;
    } else {
      orcidLink.textContent = "";
    }
  } else {
    header.classList.add("hidden");
  }

  const retractedWorks = finished.filter((r) => r.isRetracted);
  const banner = document.getElementById("retraction-banner");
  const bannerText = document.getElementById("retraction-banner-text");
  if (retractedWorks.length > 0) {
    banner.classList.remove("hidden");
    bannerText.textContent = t("retraction_banner_text", { n: retractedWorks.length, plural: retractedWorks.length === 1 ? "" : "s" });
  } else {
    banner.classList.add("hidden");
  }
}

function updateSummary() {
  const active = filterActive();
  document.getElementById("first-author-note").style.display = firstAuthorOnly ? "block" : "none";
  document.getElementById("first-author-note").textContent = firstAuthorOnly
    ? active
      ? t("first_author_active_note")
      : t("first_author_missing_orcid")
    : "";

  const finished = currentResults.filter((r) => r.status === "done" && isIncluded(r));
  renderCandidateAndRetraction(finished);
  const determined = finished.filter((r) => r.cost != null);
  const determinedConverted = determined.map((r) => convertCost(r.cost));
  const totalCost = determinedConverted.reduce((s, c) => s + c, 0);
  const avgAll = determinedConverted.length ? totalCost / determinedConverted.length : 0;
  const paidOnly = determinedConverted.filter((c) => c > 0);
  const avgPaid = paidOnly.length ? paidOnly.reduce((s, c) => s + c, 0) / paidOnly.length : 0;

  const withBoth = determined.filter((r) => r.citedByCount != null && r.citedByCount > 0);
  const totalCostForCitations = withBoth.reduce((s, r) => s + convertCost(r.cost), 0);
  const totalCitations = withBoth.reduce((s, r) => s + r.citedByCount, 0);
  const costPerCitation = totalCitations > 0 ? totalCostForCitations / totalCitations : null;

  const years = finished.map((r) => r.publicationYear).filter((y) => y != null);
  const earliestYear = years.length ? Math.min(...years) : null;
  const yearsSpan = earliestYear != null ? Math.max(1, new Date().getFullYear() - earliestYear + 1) : null;
  const costPerYear = yearsSpan != null ? totalCost / yearsSpan : null;

  const sym = CURRENCY_SYMBOLS[currentCurrency];
  document.getElementById("stat-total-cost").textContent = sym + totalCost.toFixed(2);
  document.getElementById("stat-avg-all").textContent = sym + avgAll.toFixed(2);
  document.getElementById("stat-avg-paid").textContent = sym + avgPaid.toFixed(2);
  document.getElementById("stat-determined").textContent = `${determined.length} / ${finished.length}`;
  document.getElementById("stat-cost-per-citation").textContent = costPerCitation != null ? sym + costPerCitation.toFixed(2) : "–";
  document.getElementById("stat-cost-per-year").textContent = costPerYear != null ? sym + costPerYear.toFixed(2) : "–";

  renderHistogram(determinedConverted);
  renderActualScatter(finished);
  renderExpectedScatter(finished);
  renderOaChart(finished);
  renderOaTimeChart(finished);
  renderPdfChart(finished);
}

// ================================================================
// histogram (with mean/median reference lines)
// ================================================================
// Fixed cost tiers (thresholds defined in EUR, converted to the active
// display currency so bin membership doesn't shift when currency changes).
const COST_TIER_THRESHOLDS_EUR = [400, 2500];
const COST_TIER_COLORS = ["#2f8f5b", "#d9a521", "#c1443c", "#8f2626"]; // zero / low / mid / high

function costTierThresholds() {
  const eurPerUsd = exchangeRates.EUR || 0.92;
  const t1usd = COST_TIER_THRESHOLDS_EUR[0] / eurPerUsd;
  const t2usd = COST_TIER_THRESHOLDS_EUR[1] / eurPerUsd;
  return [convertCost(t1usd), convertCost(t2usd)];
}

function computeHistogram(costs) {
  const [t1, t2] = costTierThresholds();
  const counts = [0, 0, 0, 0];
  for (const c of costs) {
    if (c === 0) counts[0]++;
    else if (c <= t1) counts[1]++;
    else if (c <= t2) counts[2]++;
    else counts[3]++;
  }
  const sym = CURRENCY_SYMBOLS[currentCurrency];
  const fmt = (v) => sym + Math.round(v).toLocaleString("en-US");
  const labels = [fmt(0), `${fmt(0)}–${fmt(t1)}`, `${fmt(t1)}–${fmt(t2)}`, `> ${fmt(t2)}`];
  return { labels, counts, thresholds: [t1, t2] };
}

function fractionalIndexForValue(value, t1, t2) {
  if (value <= 0) return 0.5;
  if (value <= t1) return 1 + value / t1;
  if (value <= t2) return 2 + (value - t1) / (t2 - t1);
  const span = t2 - t1 || 1;
  return 3 + Math.min(1, (value - t2) / span);
}

function computeMeanMedian(values) {
  if (!values.length) return { mean: null, median: null };
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { mean, median };
}

const referenceLinesPlugin = {
  id: "referenceLines",
  afterDraw(chart) {
    const cfg = chart.options.plugins && chart.options.plugins.referenceLines;
    if (!cfg || !cfg.lines || !cfg.lines.length) return;
    const { ctx, chartArea } = chart;
    const nBins = cfg.nBins || 1;
    const bandWidth = (chartArea.right - chartArea.left) / nBins;
    ctx.save();
    cfg.lines.forEach((line) => {
      const fractionalIndex = line.fractionalIndex;
      const xPixel = chartArea.left + fractionalIndex * bandWidth;
      if (xPixel < chartArea.left - 1 || xPixel > chartArea.right + 1) return;
      ctx.beginPath();
      ctx.moveTo(xPixel, chartArea.top);
      ctx.lineTo(xPixel, chartArea.bottom);
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = line.color;
      ctx.font = "600 11px 'Source Sans 3', sans-serif";
      const nearRight = xPixel > chartArea.right - 70;
      ctx.textAlign = nearRight ? "right" : "left";
      ctx.fillText(line.label, xPixel + (nearRight ? -6 : 6), chartArea.top + 12);
    });
    ctx.restore();
  },
};
if (window.Chart) Chart.register(referenceLinesPlugin);

let costChart = null;
function renderHistogram(costs) {
  const canvas = document.getElementById("cost-histogram");
  if (!canvas || typeof Chart === "undefined") return;
  const { labels, counts, thresholds } = computeHistogram(costs);
  const [t1, t2] = thresholds;
  const { mean, median } = computeMeanMedian(costs);
  const sym = CURRENCY_SYMBOLS[currentCurrency];

  const caption = document.getElementById("chart-caption");
  if (caption) {
    caption.textContent = costs.length
      ? t("chart_caption_hist", { n: costs.length, plural: costs.length === 1 ? "" : "s" })
      : "";
  }

  const referenceLines = costs.length
    ? {
        nBins: counts.length,
        lines: [
          mean != null
            ? { fractionalIndex: fractionalIndexForValue(mean, t1, t2), color: "#0c1e30", label: `${currentLang === "de" ? "Ø" : "Mean"}: ${sym}${mean.toFixed(0)}` }
            : null,
          median != null
            ? { fractionalIndex: fractionalIndexForValue(median, t1, t2), color: "#7a3fa0", label: `Median: ${sym}${median.toFixed(0)}` }
            : null,
        ].filter(Boolean),
      }
    : { lines: [] };

  if (!costChart) {
    costChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Articles",
            data: counts,
            backgroundColor: COST_TIER_COLORS,
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
          referenceLines,
          tooltip: {
            backgroundColor: "#0c1e30",
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
            ticks: { color: "#55606b", font: { size: 11 } },
            title: { display: true, text: `APC cost (${currentCurrency})`, color: "#55606b", font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0, color: "#55606b" },
            grid: { color: "#e6ebee", drawTicks: false },
            title: { display: true, text: "Number of articles", color: "#55606b", font: { size: 11 } },
          },
        },
      },
    });
  } else {
    costChart.data.labels = labels;
    costChart.data.datasets[0].data = counts;
    costChart.data.datasets[0].backgroundColor = COST_TIER_COLORS;
    costChart.options.plugins.referenceLines = referenceLines;
    costChart.options.scales.x.title.text = `APC cost (${currentCurrency})`;
    costChart.update();
  }
}

// ================================================================
// two scatter plots: (1) APC cost vs. actual citations, (2) journal mean
// citedness vs. actual citations. Both show the paper title on hover.
// ================================================================
function buildScatterChart(existingChart, canvasId, points, color, xLabel, yLabel, xIsCurrency) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return existingChart;
  const fmtX = (v) => (xIsCurrency ? `${CURRENCY_SYMBOLS[currentCurrency]}${v.toFixed(0)}` : v.toFixed(2));

  const tooltipCallbacks = {
    title: (items) => (items[0] && items[0].raw && items[0].raw.title) || "",
    label: (item) => [`${xLabel}: ${fmtX(item.parsed.x)}`, `${yLabel}: ${item.parsed.y.toFixed(1)}`],
  };

  if (!existingChart) {
    return new Chart(canvas.getContext("2d"), {
      type: "scatter",
      data: { datasets: [{ label: yLabel, data: points, backgroundColor: color, borderColor: color }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "#0c1e30", titleColor: "#fff", bodyColor: "#fff", padding: 10, callbacks: tooltipCallbacks },
        },
        scales: {
          x: {
            title: { display: true, text: xLabel, color: "#55606b", font: { size: 11 } },
            ticks: { color: "#55606b", font: { size: 11 } },
            grid: { color: "#e6ebee" },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: yLabel, color: "#55606b", font: { size: 11 } },
            ticks: { color: "#55606b", font: { size: 11 } },
            grid: { color: "#e6ebee" },
          },
        },
      },
    });
  }
  existingChart.data.datasets[0].data = points;
  existingChart.data.datasets[0].label = yLabel;
  existingChart.options.plugins.tooltip.callbacks = tooltipCallbacks;
  existingChart.options.scales.x.title.text = xLabel;
  existingChart.options.scales.y.title.text = yLabel;
  existingChart.update();
  return existingChart;
}

let actualScatterChart = null;
function renderActualScatter(finished) {
  const points = [];
  finished.forEach((r) => {
    if (r.cost == null || r.citedByCount == null) return;
    points.push({ x: convertCost(r.cost), y: r.citedByCount, title: r.matchedTitle || r.raw });
  });
  const yLabel = currentLang === "de" ? "Tatsächliche Zitationen" : "Actual citations";
  actualScatterChart = buildScatterChart(actualScatterChart, "cost-actual-scatter", points, "#16324f", `APC cost (${currentCurrency})`, yLabel, true);
}

let expectedScatterChart = null;
function renderExpectedScatter(finished) {
  const points = [];
  finished.forEach((r) => {
    if (r.meanCitedness == null || r.citedByCount == null) return;
    points.push({ x: r.meanCitedness, y: r.citedByCount, title: r.matchedTitle || r.raw });
  });
  const xLabel = currentLang === "de" ? "Ø Zitierhäufigkeit der Zeitschrift (2 J.)" : "Journal mean citedness (2yr)";
  const yLabel = currentLang === "de" ? "Tatsächliche Zitationen" : "Actual citations";
  expectedScatterChart = buildScatterChart(expectedScatterChart, "cost-expected-scatter", points, "#d1652c", xLabel, yLabel, false);
}

// ================================================================
// OA type stacked bar
// ================================================================
const OA_TYPES = [
  { key: "diamond", color: "#2f8f5b" },
  { key: "preprint", color: "#7a9c3f" },
  { key: "gold", color: "#c99a2e" },
  { key: "hybrid", color: "#d1652c" },
  { key: "green", color: "#1f93a8" },
  { key: "bronze", color: "#96551f" },
  { key: "closed", color: "#2c6099" },
  { key: "unknown", color: "#3fa0c9" },
];

const percentLabelPlugin = {
  id: "percentLabels",
  afterDatasetsDraw(chart) {
    if (chart.canvas.id !== "oa-stacked-bar" && chart.canvas.id !== "pdf-stacked-bar") return;
    const { ctx } = chart;
    ctx.save();
    ctx.font = "600 11px 'Source Sans 3', sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    chart.data.datasets.forEach((ds, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      meta.data.forEach((bar, i) => {
        const value = ds.data[i];
        const total = chart.data.datasets.reduce((s, d) => s + d.data[i], 0);
        if (!value || !total) return;
        const pct = Math.round((value / total) * 100);
        const width = bar.width;
        if (width < 26 || pct < 5) return;
        ctx.fillText(pct + "%", bar.x, bar.y);
      });
    });
    ctx.restore();
  },
};
if (window.Chart) Chart.register(percentLabelPlugin);

let oaChart = null;
function renderOaChart(finished) {
  const canvas = document.getElementById("oa-stacked-bar");
  if (!canvas || typeof Chart === "undefined") return;

  const counts = {};
  OA_TYPES.forEach((t) => (counts[t.key] = 0));
  finished.forEach((r) => {
    const key = r.oaStatus || "unknown";
    if (counts[key] == null) counts[key] = 0;
    counts[key]++;
  });

  const datasets = OA_TYPES.map((oa) => ({
    label: oaLabel(oa.key),
    data: [counts[oa.key] || 0],
    backgroundColor: oa.color,
  }));

  if (!oaChart) {
    oaChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels: [""], datasets },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, display: false },
          y: { stacked: true, display: false },
        },
        plugins: {
          legend: { position: "bottom", labels: { color: "#55606b", font: { size: 11 }, boxWidth: 10, boxHeight: 10 } },
          tooltip: {
            backgroundColor: "#0c1e30",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 10,
            callbacks: {
              label: (item) => {
                const total = item.chart.data.datasets.reduce((s, d) => s + d.data[0], 0);
                const pct = total ? Math.round((item.raw / total) * 100) : 0;
                return `${item.dataset.label}: ${item.raw} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  } else {
    oaChart.data.datasets.forEach((ds, i) => {
      ds.data = datasets[i].data;
      ds.label = datasets[i].label;
    });
    oaChart.update();
  }
}

// ================================================================
// OA type by publication year (stacked bar over time)
// ================================================================
let oaTimeChart = null;
function renderOaTimeChart(finished) {
  const canvas = document.getElementById("oa-time-bar");
  if (!canvas || typeof Chart === "undefined") return;

  const withYear = finished.filter((r) => r.publicationYear != null);
  const years = Array.from(new Set(withYear.map((r) => r.publicationYear))).sort((a, b) => a - b);
  const counts = OA_TYPES.map((oa) => years.map(() => 0));
  withYear.forEach((r) => {
    const yearIdx = years.indexOf(r.publicationYear);
    const oaIdx = OA_TYPES.findIndex((oa) => oa.key === (r.oaStatus || "unknown"));
    if (yearIdx !== -1 && oaIdx !== -1) counts[oaIdx][yearIdx]++;
  });

  const datasets = OA_TYPES.map((oa, i) => ({
    label: oaLabel(oa.key),
    data: counts[i],
    backgroundColor: oa.color,
  }));

  if (!oaTimeChart) {
    oaTimeChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels: years, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: "#55606b", font: { size: 11 } }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: "#55606b" }, grid: { color: "#e6ebee" } },
        },
        plugins: {
          legend: { position: "bottom", labels: { color: "#55606b", font: { size: 11 }, boxWidth: 10, boxHeight: 10 } },
          tooltip: { backgroundColor: "#0c1e30", titleColor: "#fff", bodyColor: "#fff", padding: 10 },
        },
      },
    });
  } else {
    oaTimeChart.data.labels = years;
    oaTimeChart.data.datasets.forEach((ds, i) => {
      ds.data = datasets[i].data;
      ds.label = datasets[i].label;
    });
    oaTimeChart.update();
  }
}

// ================================================================
// PDF availability (Unpaywall) stacked bar
// ================================================================
let pdfChart = null;
function renderPdfChart(finished) {
  const canvas = document.getElementById("pdf-stacked-bar");
  if (!canvas || typeof Chart === "undefined") return;
  const caption = document.getElementById("pdf-caption");

  const withData = finished.filter((r) => r.hasPdf != null);
  if (!getEmail()) {
    if (caption) caption.textContent = t("pdf_caption_no_email");
  } else if (caption) {
    caption.textContent = t("pdf_caption_data", { n: withData.length, plural: withData.length === 1 ? "" : "s" });
  }

  const available = withData.filter((r) => r.hasPdf).length;
  const notAvailable = withData.length - available;

  const datasets = [
    { label: t("pdf_available"), data: [available], backgroundColor: "#2f8f5b" },
    { label: t("pdf_not_available"), data: [notAvailable], backgroundColor: "#c1443c" },
  ];

  if (!pdfChart) {
    pdfChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels: [""], datasets },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, display: false },
          y: { stacked: true, display: false },
        },
        plugins: {
          legend: { position: "bottom", labels: { color: "#55606b", font: { size: 11 }, boxWidth: 10, boxHeight: 10 } },
          tooltip: {
            backgroundColor: "#0c1e30",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 10,
            callbacks: {
              label: (item) => {
                const total = item.chart.data.datasets.reduce((s, d) => s + d.data[0], 0);
                const pct = total ? Math.round((item.raw / total) * 100) : 0;
                return `${item.dataset.label}: ${item.raw} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  } else {
    pdfChart.data.datasets.forEach((ds, i) => {
      ds.data = datasets[i].data;
      ds.label = datasets[i].label;
    });
    pdfChart.update();
  }
}

// ---------- CSV export ----------
document.getElementById("export-csv-btn").addEventListener("click", () => {
  const header = [
    "#", t("th_ref"), "DOI", t("th_oa"), `${t("th_cost")} (${currentCurrency})`, t("th_source"),
    t("th_citations"), t("th_meancited"), "Altmetric", t("th_pdf"), t("th_year"), t("th_retracted"), "Journal", "Field", t("th_notes"),
  ];
  const rows = currentResults
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !r.manuallyHidden)
    .map(({ r, i }) => [
      i + 1,
      r.matchedTitle || r.raw,
      r.doi || "",
      r.oaStatus ? oaLabel(r.oaStatus) : "",
      r.cost != null ? convertCost(r.cost).toFixed(2) : "",
      r.sourceKey ? formatSource(r.sourceKey, r.sourceParams) : "",
      r.citedByCount != null ? r.citedByCount : "",
      r.meanCitedness != null ? r.meanCitedness.toFixed(2) : "",
      getAltmetricScore(i) ?? "",
      r.hasPdf == null ? "" : r.hasPdf ? t("pdf_available") : t("pdf_not_available"),
      r.publicationYear || "",
      r.isRetracted ? t("retracted_badge") : "",
      r.journal || "",
      r.field || "",
      r.noteKey ? t(r.noteKey) : "",
    ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  downloadFile(csv, "publication-costs.csv", "text/csv;charset=utf-8");
});

// ---------- HTML export ----------
document.getElementById("export-html-btn").addEventListener("click", () => {
  const finished = currentResults.filter((r) => r.status === "done" && isIncluded(r));
  const determined = finished.filter((r) => r.cost != null);
  const determinedConverted = determined.map((r) => convertCost(r.cost));
  const totalCost = determinedConverted.reduce((s, c) => s + c, 0);
  const avgAll = determinedConverted.length ? totalCost / determinedConverted.length : 0;
  const paidOnly = determinedConverted.filter((c) => c > 0);
  const avgPaid = paidOnly.length ? paidOnly.reduce((s, c) => s + c, 0) / paidOnly.length : 0;
  const sym = CURRENCY_SYMBOLS[currentCurrency];

  const histImg = costChart ? costChart.toBase64Image() : null;
  const actualScatterImg = actualScatterChart ? actualScatterChart.toBase64Image() : null;
  const expectedScatterImg = expectedScatterChart ? expectedScatterChart.toBase64Image() : null;
  const oaImg = oaChart ? oaChart.toBase64Image() : null;
  const oaTimeImg = oaTimeChart ? oaTimeChart.toBase64Image() : null;
  const pdfImg = pdfChart ? pdfChart.toBase64Image() : null;

  const retractedCount = finished.filter((r) => r.isRetracted).length;

  const rowsHtml = currentResults
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !r.manuallyHidden)
    .map(({ r, i }) => {
      const altScore = getAltmetricScore(i);
      const pdfText = r.hasPdf == null ? "–" : r.hasPdf ? t("pdf_available") : t("pdf_not_available");
      const titleCell = (r.isRetracted ? `<span class="retracted-badge">${escapeHtml(t("retracted_badge"))}</span> ` : "") + escapeHtml(r.matchedTitle || r.raw);
      return `<tr>
        <td>${i + 1}</td>
        <td>${titleCell}</td>
        <td>${r.doi ? `<a href="https://doi.org/${escapeHtml(r.doi)}">${escapeHtml(r.doi)}</a>` : "–"}</td>
        <td>${r.oaStatus ? escapeHtml(oaLabel(r.oaStatus)) : "–"}</td>
        <td>${r.cost != null ? sym + convertCost(r.cost).toFixed(2) : "–"}</td>
        <td>${r.sourceKey ? escapeHtml(formatSource(r.sourceKey, r.sourceParams)) : ""}</td>
        <td>${r.citedByCount != null ? r.citedByCount.toLocaleString("en-US") : "–"}</td>
        <td>${r.meanCitedness != null ? r.meanCitedness.toFixed(2) : "–"}</td>
        <td>${altScore != null ? altScore : "–"}</td>
        <td>${escapeHtml(pdfText)}</td>
        <td>${r.publicationYear || "–"}</td>
        <td>${escapeHtml([r.journal, r.field].filter(Boolean).join(" · "))}</td>
        <td>${r.noteKey ? escapeHtml(t(r.noteKey)) : ""}</td>
      </tr>`;
    })
    .join("");

  const reportTitle = candidateName ? `Publication Cost Report for ${escapeHtml(candidateName)}` : "Publication Cost Report";

  const html = `<!DOCTYPE html>
<html lang="${currentLang}">
<head>
<meta charset="UTF-8">
<title>${reportTitle}</title>
<style>
  body { font-family: "Source Sans 3", Arial, sans-serif; color: #262b30; background: #f4f7f9; margin: 0; padding: 2rem; }
  h1 { font-family: Georgia, serif; color: #16324f; margin-bottom: 0.2rem; }
  h2 { font-family: Georgia, serif; color: #16324f; font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
  .generated { color: #8b95a0; font-size: 0.85rem; margin-bottom: 1.2rem; }
  .candidate { font-size: 0.95rem; color: #55606b; margin: 0.2rem 0 1rem; }
  .candidate a { color: #16324f; }
  .retraction-banner { display: flex; gap: 8px; background: #fdeceb; color: #a4291c; border-left: 3px solid #a4291c; padding: 12px 14px; border-radius: 3px; margin: 0 0 1.2rem; font-weight: 600; }
  .retracted-badge { display: inline-block; background: #fdeceb; color: #a4291c; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; }
  .stats { display: flex; gap: 14px; margin: 1rem 0 1.5rem; flex-wrap: wrap; }
  .stat { background: #eaf4f9; border-radius: 8px; padding: 12px 18px; text-align: center; min-width: 150px; }
  .stat b { display: block; font-size: 1.3rem; color: #0c1e30; }
  .stat span { font-size: 0.78rem; color: #55606b; }
  img.chart { max-width: 100%; margin: 0 0 1rem; background: #fff; border-radius: 8px; padding: 10px; }
  table { border-collapse: collapse; width: 100%; background: #fff; font-size: 12.5px; box-shadow: 0 1px 3px rgba(15,40,55,0.07); }
  th, td { padding: 7px 9px; border-bottom: 1px solid #e6ebee; text-align: left; vertical-align: top; }
  th { background: #f4f7f9; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.02em; color: #16324f; }
  a { color: #16324f; }
</style>
</head>
<body>
  <h1>${reportTitle}</h1>
  <p class="generated">Generated by the <a href="https://github.com/LukasRoeseler/pcc">Publication Cost Calculator</a> on ${new Date().toLocaleString()}.</p>
  ${
    candidateOrcidId
      ? `<p class="candidate">${t("candidate_report_label")}: <strong>${escapeHtml(candidateName || "")}</strong>, <a href="https://orcid.org/${candidateOrcidId}" target="_blank" rel="noopener">ORCID ${candidateOrcidId}</a></p>`
      : ""
  }
  ${retractedCount > 0 ? `<div class="retraction-banner">${escapeHtml(t("retraction_banner_text", { n: retractedCount, plural: retractedCount === 1 ? "" : "s" }))}</div>` : ""}
  <div class="stats">
    <div class="stat"><b>${sym}${totalCost.toFixed(2)}</b><span>${t("stat_total")}</span></div>
    <div class="stat"><b>${sym}${avgAll.toFixed(2)}</b><span>${t("stat_avg_all")}</span></div>
    <div class="stat"><b>${sym}${avgPaid.toFixed(2)}</b><span>${t("stat_avg_paid")}</span></div>
    <div class="stat"><b>${determined.length} / ${finished.length}</b><span>${t("stat_determined")}</span></div>
  </div>
  ${histImg ? `<h2>${t("chart_title_hist")}</h2><img class="chart" src="${histImg}" alt="${t("chart_title_hist")}">` : ""}
  ${actualScatterImg ? `<h2>${t("chart_title_scatter_actual")}</h2><img class="chart" src="${actualScatterImg}" alt="${t("chart_title_scatter_actual")}">` : ""}
  ${expectedScatterImg ? `<h2>${t("chart_title_scatter_expected")}</h2><img class="chart" src="${expectedScatterImg}" alt="${t("chart_title_scatter_expected")}">` : ""}
  ${oaImg ? `<h2>${t("chart_title_oa")}</h2><img class="chart" src="${oaImg}" alt="${t("chart_title_oa")}">` : ""}
  ${oaTimeImg ? `<h2>${t("chart_title_oa_time")}</h2><img class="chart" src="${oaTimeImg}" alt="${t("chart_title_oa_time")}">` : ""}
  ${pdfImg ? `<h2>${t("chart_title_pdf")}</h2><img class="chart" src="${pdfImg}" alt="${t("chart_title_pdf")}">` : ""}
  <h2>${t("results_title")}</h2>
  <table>
    <thead>
      <tr>
        <th>#</th><th>${t("th_ref")}</th><th>DOI</th><th>${t("th_oa")}</th><th>${t("th_cost")} (${currentCurrency})</th>
        <th>${t("th_source")}</th><th>${t("th_citations")}</th><th>${t("th_meancited")}</th><th>${t("th_altmetric")}</th>
        <th>${t("th_pdf")}</th><th>${t("th_year")}</th><th>Journal / field</th><th>${t("th_notes")}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

  downloadFile(html, "publication-cost-report.html", "text/html;charset=utf-8");
});

// ---------- init ----------
applyTranslations();
renderGlossary();
loadExchangeRates();

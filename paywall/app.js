"use strict";

/* Free your knowledge: paste a reference list, see which articles are still
   behind a paywall and what buying them would cost. Everything runs in the
   browser; Crossref / OpenAlex / Unpaywall are called directly. */

// Typical single-article (pay-per-view) prices in EUR, rounded. These are
// estimates: there is no public price database. First matching pattern wins.
const PRICES = [
  { re: /elsevier|cell press|academic press|pergamon|sciencedirect/i, name: "Elsevier", eur: 33 },
  { re: /springer|nature portfolio|nature publishing|palgrave|macmillan/i, name: "Springer Nature", eur: 40 },
  { re: /wiley/i, name: "Wiley", eur: 45 },
  { re: /taylor|routledge|francis/i, name: "Taylor & Francis", eur: 50 },
  { re: /sage/i, name: "SAGE", eur: 40 },
  { re: /oxford university press/i, name: "Oxford University Press", eur: 35 },
  { re: /cambridge university press/i, name: "Cambridge University Press", eur: 30 },
  { re: /american psychological association/i, name: "American Psychological Association", eur: 15 },
  { re: /ieee|institute of electrical and electronics/i, name: "IEEE", eur: 33 },
  { re: /association for computing machinery|^acm$/i, name: "ACM", eur: 15 },
  { re: /american chemical society/i, name: "American Chemical Society", eur: 45 },
  { re: /de gruyter/i, name: "De Gruyter", eur: 40 },
  { re: /wolters kluwer|lippincott/i, name: "Wolters Kluwer", eur: 40 },
  { re: /karger/i, name: "Karger", eur: 40 },
];
const DEFAULT_PRICE = 35;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let results = [];

/* ---------- i18n ---------- */
const A = (href, text) => '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + text + "</a>";
const OPF = A("https://openpolicyfinder.jisc.ac.uk", "openpolicyfinder.jisc.ac.uk");
const WIKI = A("https://en.wikipedia.org/wiki/List_of_preprint_repositories", "Wikipedia");
const ORE = (txt) => A("https://chromewebstore.google.com/detail/forrt-ore-%E2%80%94-open-research/kdbmghoddafabpjdnjhocollhjefcnco", txt);

const TR = {
  title: { en: "Free your knowledge", de: "Befreie dein Wissen" },
  subtitle: { en: "Check which of your articles are stuck behind a paywall", de: "Prüfe, welche deiner Artikel hinter einer Paywall feststecken" },
  refs_label: { en: "Paste your reference list", de: "Füge deine Literaturliste ein" },
  refs_placeholder: {
    en: "One reference per line (or a numbered list). DOIs are used if present; otherwise we look them up by title and authors.",
    de: "Eine Referenz pro Zeile (oder nummerierte Liste). Vorhandene DOIs werden genutzt, sonst suchen wir sie über Titel und Autor:innen.",
  },
  email_label: { en: "E-mail for API access", de: "E-Mail für den API-Zugriff" },
  optional: { en: "(optional)", de: "(optional)" },
  email_hint: {
    en: "Crossref, OpenAlex and Unpaywall answer faster, and Unpaywall can be used as a second check, when they can identify a contact. Sent only to those APIs, straight from your browser. Nothing is stored.",
    de: "Crossref, OpenAlex und Unpaywall antworten schneller, und Unpaywall kann als zweite Prüfung genutzt werden, wenn sie einen Kontakt erkennen. Wird nur direkt aus deinem Browser an diese APIs gesendet. Es wird nichts gespeichert.",
  },
  go: { en: "Check my articles", de: "Meine Artikel prüfen" },
  example: { en: "Try an example", de: "Beispiel ausprobieren" },
  progress: { en: "Checking {done} of {total} references ...", de: "Prüfe {done} von {total} Referenzen ..." },
  stat_found: { en: "Articles found", de: "Artikel gefunden" },
  stat_free: { en: "Freely available", de: "Frei verfügbar" },
  of: { en: "of", de: "von" },
  cost_lead: { en: "Your research costs about", de: "Deine Forschung kostet ca." },
  cost_sub_some: {
    en: "Estimated cost of buying the {n} paywalled article(s) at typical single-article prices.",
    de: "Geschätzte Kosten, um die {n} Artikel hinter der Paywall zu kaufen, zu typischen Einzelpreisen.",
  },
  cost_sub_none: { en: "Nothing to buy: every article we found is freely available.", de: "Nichts zu kaufen: Jeder gefundene Artikel ist frei verfügbar." },
  paywalled_h: { en: "Still behind a paywall", de: "Noch hinter einer Paywall" },
  paywall_hint: {
    en: "Sorted by estimated price. Check each journal's preprint policy at Open Policy Finder, then upload the version you may share to a non-profit repository (see FAQ).",
    de: "Nach geschätztem Preis sortiert. Prüfe die Preprint-Richtlinie jeder Zeitschrift bei Open Policy Finder und lade dann die Version, die du teilen darfst, in ein gemeinnütziges Repositorium hoch (siehe FAQ).",
  },
  csv: { en: "Download CSV", de: "CSV herunterladen" },
  free_h: { en: "Already freely available", de: "Bereits frei verfügbar" },
  nf_h: { en: "Could not be matched", de: "Nicht gefunden" },
  cost_sub_unk: {
    en: "The open-access services did not answer, so no price can be estimated yet. Please try again in a minute.",
    de: "Die Open-Access-Dienste haben nicht geantwortet, daher kann noch kein Preis geschätzt werden. Bitte versuche es in einer Minute erneut.",
  },
  cost_sub_plus_unk: { en: "{n} article(s) could not be checked and are not included.", de: "{n} Artikel konnten nicht geprüft werden und sind nicht enthalten." },
  unk_h: { en: "Could not be checked", de: "Konnte nicht geprüft werden" },
  unk_hint: {
    en: "These articles were found, but the open-access services did not answer (usually a rate limit). They are not counted above. Try again in a minute, ideally with your e-mail address filled in.",
    de: "Diese Artikel wurden gefunden, aber die Open-Access-Dienste haben nicht geantwortet (meist ein Anfragelimit). Sie zählen oben nicht mit. Versuche es in einer Minute erneut, am besten mit eingetragener E-Mail-Adresse.",
  },
  nf_hint: {
    en: "These references were not found in Crossref/OpenAlex, so they are not counted in the totals above. Adding the DOI to the line usually fixes it.",
    de: "Diese Referenzen wurden in Crossref/OpenAlex nicht gefunden und zählen daher nicht in die Summen oben. Meist hilft es, die DOI zur Zeile hinzuzufügen.",
  },
  open_tag: { en: "open", de: "frei" },
  free_version: { en: "Free version", de: "Freie Version" },
  check_rights: { en: "Check preprint rights", de: "Preprint-Rechte prüfen" },
  price_listed: { en: "Typical price for this publisher", de: "Typischer Preis dieses Verlags" },
  price_default: { en: "Default price (publisher not in table)", de: "Standardpreis (Verlag nicht in der Tabelle)" },
  th_publisher: { en: "Publisher", de: "Verlag" },
  th_price: { en: "Assumed price", de: "Angenommener Preis" },
  default_price: { en: "Default for publishers not in the table: ~{p} per article.", de: "Standard für Verlage, die nicht in der Tabelle stehen: ~{p} pro Artikel." },
  faq_h: { en: "FAQ", de: "FAQ" },
  faq1_q: { en: "Which of my paywalled articles may I publish as a preprint?", de: "Welche meiner Artikel hinter der Paywall darf ich als Preprint veröffentlichen?" },
  faq1_a: {
    en: "<p>Look up the journal at " + OPF + " (the successor of Sherpa Romeo). It lists, for each journal, which version (submitted preprint, accepted manuscript, published PDF) you may share, where, and after which embargo. Most journals allow you to share the <em>submitted</em> version straight away; many also allow the accepted manuscript. If the journal is not listed, check its author guidelines or ask the editor.</p><p>Your funder or institution may additionally give you the right to share an accepted manuscript (for example through a rights-retention statement), no matter what the journal says.</p>",
    de: "<p>Suche die Zeitschrift bei " + OPF + " (Nachfolger von Sherpa Romeo). Dort steht je Zeitschrift, welche Version (eingereichtes Preprint, akzeptiertes Manuskript, veröffentlichtes PDF) du wo und nach welcher Embargofrist teilen darfst. Die meisten Zeitschriften erlauben, die <em>eingereichte</em> Version sofort zu teilen; viele erlauben auch das akzeptierte Manuskript. Ist die Zeitschrift nicht gelistet, prüfe die Autor:innen-Richtlinien oder frage die Redaktion.</p><p>Deine Förderorganisation oder Institution kann dir zusätzlich das Recht geben, ein akzeptiertes Manuskript zu teilen (z. B. über eine Rights-Retention-Erklärung), unabhängig von der Zeitschrift.</p>",
  },
  faq2_q: { en: "Which preprint servers are suitable?", de: "Welche Preprint-Server eignen sich?" },
  faq2_a: {
    en: "<p>Choose a <strong>non-profit, community-run</strong> repository, so your work stays open and is not locked into a commercial platform:</p><ul><li><strong>arXiv</strong>: physics, maths, computer science, and more</li><li><strong>OSF Preprints</strong> and its community servers (<strong>PsyArXiv</strong>, <strong>SocArXiv</strong>, <strong>MetaArXiv</strong>, ...): social, behavioural and meta-science</li><li><strong>bioRxiv / medRxiv</strong>: biology and health sciences</li><li><strong>Zenodo</strong> (CERN): any field, any file type</li><li><strong>HAL</strong>, your <strong>institutional repository</strong>, or a national repository</li></ul><p>Be careful with commercial platforms that look like repositories, for example SSRN (owned by Elsevier), ResearchGate, Academia.edu or Research Square (owned by Springer Nature). A longer list is on " + WIKI + ". Upload the latest version you are allowed to share; extensions such as the " + ORE("FORRT Open Research Extension") + " then point readers to it.</p>",
    de: "<p>Wähle ein <strong>gemeinnütziges, von der Community getragenes</strong> Repositorium, damit deine Arbeit offen bleibt und nicht an eine kommerzielle Plattform gebunden wird:</p><ul><li><strong>arXiv</strong>: Physik, Mathematik, Informatik und mehr</li><li><strong>OSF Preprints</strong> und seine Community-Server (<strong>PsyArXiv</strong>, <strong>SocArXiv</strong>, <strong>MetaArXiv</strong>, ...): Sozial-, Verhaltens- und Metawissenschaft</li><li><strong>bioRxiv / medRxiv</strong>: Biologie und Gesundheitswissenschaften</li><li><strong>Zenodo</strong> (CERN): jedes Fach, jeder Dateityp</li><li><strong>HAL</strong>, das <strong>institutionelle Repositorium</strong> deiner Hochschule oder ein nationales Repositorium</li></ul><p>Vorsicht bei kommerziellen Plattformen, die wie Repositorien aussehen, z. B. SSRN (gehört Elsevier), ResearchGate, Academia.edu oder Research Square (gehört Springer Nature). Eine längere Liste steht bei " + WIKI + ". Lade die aktuellste Version hoch, die du teilen darfst; Erweiterungen wie die " + ORE("FORRT Open Research Extension") + " verweisen Leser:innen dann darauf.</p>",
  },
  faq3_q: { en: "Where do the numbers come from?", de: "Woher kommen die Zahlen?" },
  faq3_a: {
    en: "<p><strong>Finding articles:</strong> if a reference contains a DOI, we use it. Otherwise we search " + A("https://www.crossref.org", "Crossref") + " by the reference text and only accept the best hit if its title clearly appears in your reference.</p><p><strong>Free versions:</strong> we ask " + A("https://openalex.org", "OpenAlex") + ", which builds on " + A("https://unpaywall.org", "Unpaywall") + " data, whether any legal free copy exists (publisher-hosted or in a repository). If you enter an e-mail address, Unpaywall is asked directly as a second check for articles that look closed.</p><p><strong>Prices:</strong> there is no public database of pay-per-view prices, so the price of a paywalled article is an <em>estimate</em>: a typical single-article price of its publisher (table below), or a default price for publishers not in the table. Actual prices vary by journal, date, country and bundle, and many institutions pay subscriptions so that you never see these prices. Read the total as an order of magnitude, not an invoice.</p>",
    de: "<p><strong>Artikel finden:</strong> Enthält eine Referenz eine DOI, nutzen wir sie. Sonst suchen wir bei " + A("https://www.crossref.org", "Crossref") + " mit dem Referenztext und akzeptieren den besten Treffer nur, wenn sein Titel deutlich in deiner Referenz vorkommt.</p><p><strong>Freie Versionen:</strong> Wir fragen " + A("https://openalex.org", "OpenAlex") + " (baut auf " + A("https://unpaywall.org", "Unpaywall") + "-Daten auf), ob irgendeine legale freie Kopie existiert (beim Verlag oder in einem Repositorium). Gibst du eine E-Mail-Adresse an, wird Unpaywall bei scheinbar geschlossenen Artikeln direkt als zweite Prüfung gefragt.</p><p><strong>Preise:</strong> Es gibt keine öffentliche Datenbank mit Einzelabruf-Preisen, daher ist der Preis eines Artikels hinter der Paywall eine <em>Schätzung</em>: ein typischer Einzelpreis des Verlags (Tabelle unten) oder ein Standardpreis für Verlage, die nicht in der Tabelle stehen. Tatsächliche Preise schwanken je nach Zeitschrift, Datum, Land und Paket, und viele Institutionen zahlen Abonnements, sodass du diese Preise nie siehst. Lies die Summe als Größenordnung, nicht als Rechnung.</p>",
  },
  faq4_q: { en: "Is my reference list stored?", de: "Wird meine Literaturliste gespeichert?" },
  faq4_a: {
    en: "<p>No. Everything runs in your browser; there is no server. Reference text is only sent to Crossref when a DOI has to be looked up, DOIs go to OpenAlex (and Unpaywall, if you give an e-mail address). We store nothing.</p>",
    de: "<p>Nein. Alles läuft in deinem Browser, es gibt keinen Server. Referenztext wird nur an Crossref gesendet, wenn eine DOI gesucht werden muss; DOIs gehen an OpenAlex (und an Unpaywall, wenn du eine E-Mail-Adresse angibst). Wir speichern nichts.</p>",
  },
  faq5_q: { en: 'Why might an article be marked "paywalled" although I can read it?', de: "Warum wird ein Artikel als „Paywall“ markiert, obwohl ich ihn lesen kann?" },
  faq5_a: {
    en: "<p>You may be reading it through your library's subscription, which is invisible to these services. Also, a free copy might exist but not yet be indexed, or the match may be wrong. Check the DOI link in the list, and consider uploading your version yourself, so that everyone else can read it too.</p>",
    de: "<p>Vielleicht liest du ihn über das Abonnement deiner Bibliothek, das diese Dienste nicht sehen. Außerdem kann es eine freie Kopie geben, die noch nicht indexiert ist, oder der Treffer ist falsch. Prüfe den DOI-Link in der Liste und überlege, deine Version selbst hochzuladen, damit sie alle anderen auch lesen können.</p>",
  },
  msg_h: { en: "Message to your co-authors", de: "Nachricht an deine Co-Autor:innen" },
  msg_hint: {
    en: "A ready-made text for colleagues. It lists your paywalled articles; edit it as you like, then copy it into an e-mail. Pick the version that fits your role.",
    de: "Ein fertiger Text für Kolleg:innen. Er listet deine Artikel hinter der Paywall auf; passe ihn nach Belieben an und kopiere ihn in eine E-Mail. Wähle die Version, die zu deiner Rolle passt.",
  },
  msg_mode_not: { en: "I am not first author", de: "Ich bin nicht Erstautor:in" },
  msg_mode_first: { en: "I am first author", de: "Ich bin Erstautor:in" },
  msg_copy: { en: "Copy text", de: "Text kopieren" },
  msg_copied: { en: "Copied!", de: "Kopiert!" },
  tpl_not: {
    en: `Dear [Name],

I am going through the research articles I contributed to and noticed that the following ones are behind a paywall (found with this web app: https://lukasroeseler.github.io/pcc/paywall/):

{articles}

Since you are first author on these papers, could you please upload the accepted version of each as a preprint to a non-profit server (for example PsyArXiv/OSF, arXiv or Zenodo)? This is usually in line with the journals' policies as long as the link to the published version (DOI) is included; the policy links above show the details for each journal. If you prefer, I am happy to upload the preprints myself with your permission and make us both admins.

Right now, anyone whose university does not pay for an expensive subscription cannot read these articles. Once the preprint is online, tools like Unpaywall (https://unpaywall.org) point interested readers straight to the identical free version.

Best wishes
[Your name]`,
    de: `Liebe*r [Name],

ich gehe gerade die Forschungsartikel durch, an denen ich beteiligt war, und habe gesehen, dass die folgenden Artikel hinter einer Paywall stehen (gefunden mit dieser Web-App: https://lukasroeseler.github.io/pcc/paywall/):

{articles}

Da du bei diesen Artikeln Erstautor*in bist, möchte ich dich bitten, jeweils die akzeptierte Version als Preprint auf einem gemeinnützigen Server hochzuladen (z. B. PsyArXiv/OSF, arXiv oder Zenodo). Das ist in der Regel mit den Policies der Zeitschriften vereinbar, solange der Link zur veröffentlichten Version (DOI) angegeben wird; die Links oben zeigen die Details je Zeitschrift. Wenn du möchtest, lade ich die Preprints mit deiner Erlaubnis gern selbst hoch und weise uns beiden Admin-Rechte zu.

Aktuell kommt man, wenn die eigene Uni keine teure Subscription hat, nicht an diese Artikel. Sobald das Preprint online ist, leiten Tools wie Unpaywall (https://unpaywall.org) Interessierte direkt zur inhaltsgleichen freien Version.

Viele Grüße
[Dein Name]`,
  },
  tpl_first: {
    en: `Dear [Name],

I am going through the research articles we worked on together and noticed that the following ones are behind a paywall (found with this web app: https://lukasroeseler.github.io/pcc/paywall/):

{articles}

As first author, I have uploaded the accepted version of each as a preprint to [preprint server, e.g. PsyArXiv], with a link to the published version (DOI). This is in line with the journals' policies (see the policy links above). Preprint links: [insert links]. I have added you as a contributor so you can see and edit the entries. If you have any concerns or would like something changed, just let me know.

Right now, anyone whose university does not pay for an expensive subscription cannot read these articles. With the preprint online, tools like Unpaywall (https://unpaywall.org) point interested readers straight to the identical free version.

Best wishes
[Your name]`,
    de: `Liebe*r [Name],

ich gehe gerade die Forschungsartikel durch, an denen wir gemeinsam gearbeitet haben, und habe gesehen, dass die folgenden Artikel hinter einer Paywall stehen (gefunden mit dieser Web-App: https://lukasroeseler.github.io/pcc/paywall/):

{articles}

Als Erstautor*in habe ich jeweils die akzeptierte Version als Preprint auf [Preprint-Server, z. B. PsyArXiv] hochgeladen, mit Verweis auf die veröffentlichte Version (DOI). Das ist mit den Policies der Zeitschriften vereinbar (siehe Policy-Links oben). Links zu den Preprints: [Links einfügen]. Ich habe dich als Mitwirkende*n hinzugefügt, damit du die Einträge einsehen und bearbeiten kannst. Wenn du Bedenken hast oder etwas geändert haben möchtest, sag mir bitte kurz Bescheid.

Aktuell kommt man, wenn die eigene Uni keine teure Subscription hat, nicht an diese Artikel. Mit dem Preprint leiten Tools wie Unpaywall (https://unpaywall.org) Interessierte direkt zur inhaltsgleichen freien Version.

Viele Grüße
[Dein Name]`,
  },
  footer: {
    en: 'Part of the <a href="../">Publication Cost Calculator</a>. Looking for a game? Try the ' + A("https://t1p.de/unpaywaller", "Unpaywaller") + ".",
    de: 'Teil des <a href="../">Publication Cost Calculator</a>. Lust auf ein Spiel? Probiere den ' + A("https://t1p.de/unpaywaller", "Unpaywaller") + " aus.",
  },
};

let lang = "en";
try { lang = localStorage.getItem("fyk-lang") || ((navigator.language || "").startsWith("de") ? "de" : "en"); } catch (e) { /* ignore */ }

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
  refreshMoney();
  buildMessage(true);
}

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) e.append(kid);
  return e;
}

let cur = "EUR";
let usdRate = 1.12; // fallback; replaced by the live ECB rate when available
try { cur = localStorage.getItem("fyk-cur") === "USD" ? "USD" : "EUR"; } catch (e) { /* ignore */ }
fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD")
  .then((r) => r.json())
  .then((d) => { if (d && d.rates && d.rates.USD) { usdRate = d.rates.USD; refreshMoney(); } })
  .catch(() => {});

// all prices are stored in EUR and converted for display
function money(eurAmount) {
  if (cur === "USD") return (eurAmount * usdRate).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return eurAmount.toLocaleString(lang === "de" ? "de-DE" : "en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function opfUrl(journal) {
  if (!journal) return "https://openpolicyfinder.jisc.ac.uk/";
  return "https://openpolicyfinder.jisc.ac.uk/search?search=" + encodeURIComponent(journal) +
    "&per_page=10&publication_page=1&publisher_page=1&funder_page=1";
}

function priceFor(publisher) {
  const name = publisher || "";
  const hit = PRICES.find((p) => p.re.test(name));
  return hit ? { eur: hit.eur, listed: true } : { eur: DEFAULT_PRICE, listed: false };
}

/* ---------- parsing ---------- */
function splitReferences(text) {
  const rawLines = text.split(/\r\n|\r|\n/);
  const lines = rawLines.map((l) => l.trim());
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (!nonEmpty.length) return [];
  const numbered = /^(\[\d+\]|\(\d+\)|\d+[.)])\s+/;
  const numCount = nonEmpty.filter((l) => numbered.test(l)).length;
  if (numCount >= Math.max(2, Math.floor(nonEmpty.length * 0.5))) {
    const refs = [];
    let cur = "";
    for (const line of lines) {
      if (numbered.test(line)) {
        if (cur.trim()) refs.push(cur.trim());
        cur = line.replace(numbered, "");
      } else if (line) cur += " " + line;
    }
    if (cur.trim()) refs.push(cur.trim());
    return refs.map((r) => r.replace(/\s+/g, " ")).filter((r) => r.length > 10);
  }
  if (rawLines.some((l) => l.trim() === "")) {
    const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 10);
    if (paras.length > 1) return paras;
  }
  return nonEmpty.filter((l) => l.length > 10);
}

function extractDoi(ref) {
  const m = ref.match(/\b10\.\d{4,9}\/[^\s"<>]+/i);
  return m ? m[0].replace(/[.,;:)\]}]+$/, "") : null;
}

function titleMatches(title, ref) {
  const words = (title || "").toLowerCase().match(/[a-zäöüß]{4,}/g) || [];
  if (!words.length) return false;
  const hay = ref.toLowerCase();
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits / words.length >= 0.7;
}

/* ---------- API calls ---------- */
async function fetchRetry(url, retries = 4) {
  for (let i = 0; ; i++) {
    const res = await fetch(url);
    if (res.status !== 429 || i >= retries) return res;
    await sleep(1000 * (i + 1));
  }
}

async function crossrefSearch(ref, email) {
  const p = new URLSearchParams({ "query.bibliographic": ref, rows: "1" });
  if (email) p.set("mailto", email);
  const res = await fetchRetry("https://api.crossref.org/works?" + p);
  if (!res.ok) return null;
  const item = (((await res.json()).message || {}).items || [])[0];
  if (!item) return null;
  const title = (item.title || [])[0] || "";
  return titleMatches(title, ref) ? item : null;
}

async function crossrefWork(doi, email) {
  const q = email ? "?mailto=" + encodeURIComponent(email) : "";
  const res = await fetchRetry("https://api.crossref.org/works/" + encodeURIComponent(doi) + q);
  if (!res.ok) return null;
  return (await res.json()).message || null;
}

async function openAlexWork(doi, email) {
  const q = email ? "?mailto=" + encodeURIComponent(email) : "";
  const res = await fetchRetry("https://api.openalex.org/works/https://doi.org/" + encodeURIComponent(doi) + q);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("OpenAlex " + res.status);
  return res.json();
}

async function unpaywall(doi, email) {
  if (!email) return null;
  try {
    const res = await fetchRetry("https://api.unpaywall.org/v2/" + encodeURIComponent(doi) + "?email=" + encodeURIComponent(email));
    if (!res.ok) return null;
    const d = await res.json();
    if (d.error) return null;
    const loc = d.best_oa_location;
    return d.is_oa && loc ? { url: loc.url_for_pdf || loc.url || null } : { url: null, closed: true };
  } catch (e) {
    return null;
  }
}

/* ---------- one reference ---------- */
async function checkReference(ref, email) {
  let doi = extractDoi(ref);
  let cr = null;
  if (!doi) {
    try { cr = await crossrefSearch(ref, email); } catch (e) { cr = null; }
    if (cr) doi = cr.DOI;
    await sleep(100);
  }
  if (!doi) return { ref, found: false };

  let work = null;
  let oaError = false; // OpenAlex unreachable or rate-limited: OA status is then unknown, not "closed"
  try { work = await openAlexWork(doi, email); } catch (e) { oaError = true; }

  let title, year, journal, publisher, free = false, freeUrl = null, oaStatus = null;
  if (work) {
    const src = (work.primary_location && work.primary_location.source) || {};
    title = work.title || work.display_name;
    year = work.publication_year;
    journal = src.display_name || null;
    publisher = src.host_organization_name || null;
    const oa = work.open_access || {};
    free = !!oa.is_oa;
    oaStatus = oa.oa_status || null;
    const best = work.best_oa_location || {};
    freeUrl = best.landing_page_url || best.pdf_url || oa.oa_url || null;
  } else {
    if (!cr) { try { cr = await crossrefWork(doi, email); } catch (e) { cr = null; } }
    if (!cr) return { ref, found: false, doi };
    title = (cr.title || [])[0];
    year = ((cr.issued || {})["date-parts"] || [[]])[0][0] || null;
    journal = (cr["container-title"] || [])[0] || null;
    publisher = cr.publisher || null;
  }
  let unknown = false;
  if (!free) {
    const up = await unpaywall(doi, email);
    if (up && !up.closed) { free = true; freeUrl = up.url; oaStatus = oaStatus || "unpaywall"; }
    else if (oaError && !(up && up.closed)) unknown = true;
  }
  const price = free || unknown ? null : priceFor(publisher);
  return { ref, found: true, unknown, doi, title: title || ref, year, journal, publisher, free, freeUrl, oaStatus, price };
}

/* ---------- run ---------- */

async function pool(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function run() {
  const refs = splitReferences($("refs").value);
  if (!refs.length) { $("refs").focus(); return; }
  const email = $("email").value.trim();
  $("go").disabled = true;
  $("results").classList.add("hidden");
  $("progress-wrap").classList.remove("hidden");
  results = new Array(refs.length);
  let done = 0;
  const tick = () => {
    $("progress-label").textContent = t("progress", { done, total: refs.length });
    $("bar-fill").style.width = (100 * done / refs.length) + "%";
  };
  tick();
  await pool(refs, 3, async (ref, i) => {
    try { results[i] = await checkReference(ref, email); }
    catch (e) { results[i] = { ref, found: false, error: true }; }
    done++; tick();
  });
  $("progress-wrap").classList.add("hidden");
  $("go").disabled = false;
  render();
}

/* ---------- rendering ---------- */
function doiLink(doi) {
  return el("a", { href: "https://doi.org/" + doi, target: "_blank", rel: "noopener noreferrer", text: "DOI" });
}

function metaLine(r) {
  const bits = [r.journal, r.year, r.publisher].filter(Boolean);
  return bits.join(" · ");
}

function render(scroll = true) {
  const total = results.length;
  const found = results.filter((r) => r.found);
  const unknownList = found.filter((r) => r.unknown);
  const checked = found.filter((r) => !r.unknown);
  const free = checked.filter((r) => r.free);
  const paywalled = checked.filter((r) => !r.free).sort((a, b) => b.price.eur - a.price.eur);
  const notFound = results.filter((r) => !r.found);
  const cost = paywalled.reduce((s, r) => s + r.price.eur, 0);

  $("s-found").textContent = found.length + " " + t("of") + " " + total;
  const pct = checked.length ? Math.round((100 * free.length) / checked.length) : 0;
  $("s-free").replaceChildren(free.length + " " + t("of") + " " + checked.length + " ", el("small", { text: "(" + pct + "%)" }));
  $("s-cost").textContent = checked.length ? money(cost) : "\u2013";
  let sub = !checked.length && unknownList.length ? t("cost_sub_unk")
    : paywalled.length ? t("cost_sub_some", { n: paywalled.length }) : t("cost_sub_none");
  if (checked.length && unknownList.length) sub += " " + t("cost_sub_plus_unk", { n: unknownList.length });
  $("s-cost-sub").textContent = sub;

  $("n-paywalled").textContent = "(" + paywalled.length + ")";
  $("paywall-hint").textContent = paywalled.length ? t("paywall_hint") : "";
  $("paywalled-list").replaceChildren(...paywalled.map((r) => {
    const links = el("div", { class: "art-links" }, doiLink(r.doi),
      el("a", { href: opfUrl(r.journal), target: "_blank", rel: "noopener noreferrer", text: t("check_rights") }));
    const price = el("span", { class: "price", title: r.price.listed ? t("price_listed") : t("price_default"), text: "~" + money(r.price.eur) });
    return el("li", {}, el("div", { class: "art-title" }, r.title, price), el("div", { class: "art-meta", text: metaLine(r) }), links);
  }));

  $("n-free").textContent = free.length;
  $("free-details").classList.toggle("hidden", !free.length);
  $("free-list").replaceChildren(...free.map((r) => {
    const links = el("div", { class: "art-links" }, doiLink(r.doi));
    if (r.freeUrl) links.append(el("a", { href: r.freeUrl, target: "_blank", rel: "noopener noreferrer", text: t("free_version") }));
    return el("li", {}, el("div", { class: "art-title" }, r.title, el("span", { class: "tag-ok", text: "  " + t("open_tag") + (r.oaStatus ? " (" + r.oaStatus + ")" : "") })),
      el("div", { class: "art-meta", text: metaLine(r) }), links);
  }));

  $("n-unk").textContent = unknownList.length;
  $("unk-details").classList.toggle("hidden", !unknownList.length);
  $("unk-list").replaceChildren(...unknownList.map((r) => el("li", {}, el("div", { class: "art-title", text: r.title }),
    el("div", { class: "art-meta", text: metaLine(r) }), el("div", { class: "art-links" }, doiLink(r.doi)))));

  $("n-nf").textContent = notFound.length;
  $("nf-details").classList.toggle("hidden", !notFound.length);
  $("nf-list").replaceChildren(...notFound.map((r) => el("li", {}, el("div", { class: "raw", text: r.ref }))));

  $("results").classList.remove("hidden");
  buildMessage(false);
  if (scroll) $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- CSV ---------- */
function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv() {
  const head = ["status", "title", "year", "journal", "publisher", "doi", "estimated_price_eur", "free_version_url", "reference"];
  const rows = results.map((r) => [
    !r.found ? "not found" : r.unknown ? "unchecked" : r.free ? "free" : "paywalled",
    r.title, r.year, r.journal, r.publisher, r.doi, r.price ? r.price.eur : "", r.freeUrl, r.ref,
  ]);
  const csv = "﻿" + [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: "free-your-knowledge.csv" });
  document.body.append(a); a.click(); a.remove();
}

/* ---------- FAQ price table ---------- */
function buildPriceTable() {
  const tbl = $("price-table");
  tbl.replaceChildren(
    el("tr", {}, el("th", { text: t("th_publisher") }), el("th", { text: t("th_price") })),
    ...PRICES.map((p) => el("tr", {}, el("td", { text: p.name }), el("td", { text: "~" + money(p.eur) })))
  );
  $("default-price").textContent = t("default_price", { p: money(DEFAULT_PRICE) });
}

/* ---------- message to co-authors ---------- */
let msgMode = "not";
let msgDirty = false;

function articlesBlock(paywalled) {
  return paywalled.map((r) => {
    const meta = metaLine(r);
    return "* " + r.title + " (~" + money(r.price.eur) + ")\n" +
      (meta ? "  " + meta + "\n" : "") +
      "  DOI: https://doi.org/" + r.doi + "\n" +
      "  " + t("check_rights") + ": " + opfUrl(r.journal);
  }).join("\n\n");
}

function buildMessage(force) {
  const paywalled = results.filter((r) => r.found && !r.unknown && !r.free).sort((a, b) => b.price.eur - a.price.eur);
  $("msg-section").classList.toggle("hidden", !paywalled.length);
  if (!paywalled.length || (msgDirty && !force)) return;
  $("msg-text").value = t(msgMode === "first" ? "tpl_first" : "tpl_not").replace("{articles}", () => articlesBlock(paywalled));
  msgDirty = false;
}

function refreshMoney() {
  $("currency-select").value = cur;
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === msgMode));
  buildPriceTable();
  if (results.length && !$("results").classList.contains("hidden")) render(false);
}

const EXAMPLE = [
  "1. Open Science Collaboration (2015). Estimating the reproducibility of psychological science. Science, 349(6251), aac4716. https://doi.org/10.1126/science.aac4716",
  "2. Kahneman, D., & Tversky, A. (1979). Prospect theory: An analysis of decision under risk. Econometrica, 47(2), 263-291.",
  "3. Simmons, J. P., Nelson, L. D., & Simonsohn, U. (2011). False-positive psychology: Undisclosed flexibility in data collection and analysis allows presenting anything as significant. Psychological Science, 22(11), 1359-1366. https://doi.org/10.1177/0956797611417632",
  "4. Ioannidis, J. P. A. (2005). Why most published research findings are false. PLoS Medicine, 2(8), e124. https://doi.org/10.1371/journal.pmed.0020124",
].join("\n");

$("go").addEventListener("click", run);
$("example").addEventListener("click", () => { $("refs").value = EXAMPLE; });
$("csv").addEventListener("click", downloadCsv);
document.querySelectorAll(".lang-btn").forEach((b) => b.addEventListener("click", () => {
  lang = b.dataset.lang;
  try { localStorage.setItem("fyk-lang", lang); } catch (e) { /* ignore */ }
  applyLang();
}));
$("currency-select").addEventListener("change", (e) => {
  cur = e.target.value === "USD" ? "USD" : "EUR";
  try { localStorage.setItem("fyk-cur", cur); } catch (e2) { /* ignore */ }
  refreshMoney();
});

/* theme: same storage key and default as the Publication Cost Calculator */
const ICON_SUN = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>';
const ICON_MOON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function applyTheme(th) {
  document.documentElement.setAttribute("data-theme", th);
  $("theme-btn").innerHTML = th === "dark" ? ICON_SUN : ICON_MOON;
}
applyTheme(document.documentElement.getAttribute("data-theme") || "dark");
$("theme-btn").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
  applyTheme(next);
});
document.querySelectorAll(".mode-btn").forEach((b) => b.addEventListener("click", () => {
  msgMode = b.dataset.mode;
  refreshMoney();
  buildMessage(true);
}));
$("msg-text").addEventListener("input", () => { msgDirty = true; });
$("msg-copy").addEventListener("click", async () => {
  const ta = $("msg-text");
  try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand("copy"); }
  $("msg-copied").classList.remove("hidden");
  setTimeout(() => $("msg-copied").classList.add("hidden"), 2000);
});
applyLang();

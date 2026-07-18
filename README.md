# Publication Cost Calculator

A static, client-side web tool that estimates the article processing charges
(APCs) behind a reference list: total cost, average cost, cost per citation,
cost per year since your first publication, a cost-distribution histogram,
two citation-impact scatter plots, an open-access type breakdown (overall
and by year), a total-cost-by-OA-type chart, a citations-by-cost-tier chart,
a cost-by-publication-year chart, a free-PDF-availability chart, and a
sortable per-article table with OA type, free-PDF flag, price source,
citation count, journal mean citedness, and Altmetric attention.

Everything runs in the browser. No backend, no build step, no data storage:
just static files you can host on GitHub Pages. Available in English and
German (toggle top-right), with a plain-language glossary for anyone
unfamiliar with APCs, OA types, or these metrics. A companion, standing
analysis for the whole University of Munster lives alongside it; see
[`munster-report/`](munster-report/index.html) below.

## Hosting on GitHub Pages

1. Create a new GitHub repository (or a folder in an existing one) and push
   the contents of this folder (`index.html`, `style.css`, `app.js`, `favicon.svg`,
   `mucos-logo.png`, and the `munster-report/` folder).
2. In the repo settings, enable **Pages** and deploy from the branch/folder
   containing these files.
3. Visit the generated `https://<user>.github.io/<repo>/` URL.

No secrets, API keys, or server config are required to host the calculator
itself. The `munster-report/` companion report additionally relies on a
scheduled GitHub Actions workflow (`.github/workflows/munster-report.yml`)
that needs no secrets either, since it commits back with the repo's own
built-in `GITHUB_TOKEN`.

## How to use it

1. **(Optional) Contact email**, shown up front above the input area: Crossref,
   OpenAlex, and Unpaywall serve requests faster when they can identify the
   caller (and Unpaywall requires it at all, to check PDF availability). Your
   email is sent directly from your browser to those APIs only; it is never
   stored anywhere.
2. **Provide references**, via one of:
   - Paste a reference list (one per line, or a numbered list) into the text box.
   - Upload a `.txt`, `.pdf`, or `.docx` file containing the reference list.
   - Upload a `.bib` (BibTeX) file. This is also how to use a Google Scholar
     library here: Scholar has no public API and blocks client-side access
     entirely (confirmed: even a bare cross-origin request is rejected), so
     there is no automatic-fetch mode. Instead, on your Scholar profile, tick
     the box above your article list to select everything, click **Export**,
     choose **BibTeX**, and upload the downloaded file here.
   - Enter an **ORCID iD** to pull your public works list directly from
     ORCID. Accepts a bare ID (`0000-0002-1825-0097`), `orcid.org/...`, or a
     full `https://orcid.org/...` URL. This also fetches the person's name
     and checks every work for retractions (see below).
3. **Review & confirm** the parsed list (you can edit or deselect entries),
   then click **Calculate costs**.
4. Read the **Results**, and use the per-row **Hide** checkbox in the table
   to remove any article that was matched to the wrong DOI (or that you
   simply don't want counted) from every total, chart, and export, without
   deleting your input.

## Extra options

- **Currency**: choose EUR, USD, or GBP (top-right); all figures convert
  live from the underlying USD values via
  [frankfurter.app](https://www.frankfurter.app/) (ECB reference rates).
- **First-authorship filter** (in Advanced options): enter your ORCID iD and
  tick "count first-authorship papers only towards costs" to restrict all
  totals, charts, and KPIs to papers where OpenAlex's author-position data
  confirms you as first author. Other rows stay visible in the table, dimmed
  and struck through, rather than disappearing.
- The cost histogram uses fixed, color-coded tiers rather than a dynamic
  scale, so the colors mean the same thing every time: **green** = free
  (€0) as its own category, **yellow** = up to €400, **red** = up to
  €2,500, **dark red** = above €2,500 (thresholds are defined in EUR and
  converted to whichever currency is selected, so an article's tier never
  changes just because you switched currency).
- **Sortable table**: click any column header with a ↕ arrow (reference
  title, OA type, cost, citations, or journal mean citedness) to sort the
  table by that column; click again to reverse the direction. Rows without a
  value for the chosen column always sink to the bottom regardless of
  direction, and sorting never changes totals, charts, or exports, since
  those always use every (non-hidden) row.

## Using this for a hiring committee (Berufungskommission)

When you fetch works by ORCID iD, the report becomes candidate-oriented:

- The **candidate's name** (from ORCID's public profile) and their **ORCID
  iD** are shown at the top of the results and in the HTML export title,
  so anyone reading the report knows whose record it is.
- Every work is checked against OpenAlex's `is_retracted` flag. If any
  retracted work is found among the (non-hidden) publications, a prominent
  warning banner appears above the statistics, and the specific row is
  marked with a **RETRACTED** badge, in both the on-screen view and the
  exported HTML report.
- Use the per-row **Hide** checkbox to remove anything that was matched to
  the wrong DOI before sharing the report; hidden rows are dropped from
  every statistic, chart, and export, including the retraction check.

## Citation, attention, and access metrics

Alongside cost, each row also shows:

- **Citations**: the article's own citation count (`cited_by_count` from OpenAlex).
- **Journal mean citedness (2yr)**: the hosting journal's 2-year mean
  citedness (OpenAlex `summary_stats.2yr_mean_citedness`, comparable in spirit
  to a journal impact factor), fetched once per journal and cached. This is a
  snapshot of the journal's overall citation rate over its most recently
  tracked 2-year window, not a prediction for the specific article.
- **Altmetric**: the article's Altmetric Attention Score, shown as Altmetric's
  official donut badge (click through for the full breakdown). Altmetric's raw
  API requires a paid key, so this uses their free, officially supported
  embeddable badge widget instead.
- **Free PDF availability** (per-row table column and an aggregate chart;
  requires a contact email): checked via [Unpaywall](https://unpaywall.org),
  regardless of formal OA type. Preprints are always counted as having a
  PDF, without an extra API call, since their host repositories serve one
  directly.

The two scatter plots read together: the first plots APC cost against actual
citations; the second plots the journal's mean citedness against the same
article's actual citations, so a point above the general trend is
outperforming its journal's typical citation rate. Both show the paper title
on hover.

## How pricing works

For each reference:

1. If a DOI isn't already known (for example from a `.bib` file or ORCID
   record), the tool searches [Crossref](https://api.crossref.org) using the
   reference text to find the best-matching DOI.
2. The DOI is looked up in [OpenAlex](https://openalex.org), which tracks:
   - `apc_paid`: an actual recorded payment (sourced from the
     [OpenAPC](https://openapc.net) initiative's public dataset of real,
     reported APC payments). Trusted whenever present, regardless of OA
     status, since it is a verified transaction.
   - `apc_list`: the journal's list price for that publication year. Only used
     as a cost basis when the OA status is `gold` or `hybrid` (meaning the
     paid-OA route was actually the one used for this article); for
     `green`/`bronze`/`closed` articles, a populated `apc_list` just reflects
     an optional fee the article did not use, so it is ignored there.
   - `open_access.oa_status`: `gold`, `hybrid`, `bronze`, `green`, `closed`,
     or `diamond`.
   - `type`: used to detect preprints directly (see below).
3. Cost is assigned as follows:
   - Actual paid APC found: use it.
   - **Preprint** (`type: "preprint"`, covering arXiv, the OSF preprint family
     such as PsyArXiv/SocArXiv/MetaArXiv, SSRN, medRxiv, bioRxiv, Zenodo,
     preprints.org, and similar repositories): cost is **€0**, its own
     category, and it always counts as having a free PDF.
   - **Diamond** OA: cost is **€0**, the ideal case, highlighted distinctly
     from a plain "gold" badge. Detected in three ways, in order: OpenAlex's
     own `diamond` classification; a `gold`-OA journal with no APC pricing
     anywhere in OpenAlex's source record; or, when OpenAlex is inconclusive,
     a fallback lookup in [DOAJ](https://doaj.org) by the journal's ISSN,
     which lists `has_apc` for every journal it indexes.
   - List-price APC found for a `gold`/`hybrid` article: use it, flagged as a
     list price (the actual amount paid may differ due to waivers, discounts,
     or institutional agreements).
   - `green` OA: the article is hosted in a subscription journal, but a free
     self-archived copy exists elsewhere. Cost is **€0** and the badge reads
     "closed (green available)" rather than a plain "green", since the
     journal itself is not open access.
   - `bronze`/`closed` with no paid APC: cost is inferred as **€0** (typically
     no APC applies to these routes). This is a best-effort inference, not an
     independently verified fact, and is labelled as such.
   - `gold`/`hybrid` OA with no APC data anywhere, or no OpenAlex record at
     all: cost is **undetermined** and excluded from the cost totals.

All costs are stored internally in USD (OpenAlex's own `value_usd`
conversion) and converted to your selected display currency.

## Getting reference/benchmark APC values by discipline

This tool prices whatever is in *your* reference list, but you may also want
a sense of what is typical in a field, for example to sanity-check a result
or to budget for a paper you haven't written yet. Each priced row also shows
an OpenAlex **field** tag (such as "Psychology" or "Economics, Econometrics
and Finance"), so results already carry a discipline label you can group by.

Two complementary ways to get field-level reference values:

**1. Discipline journal lists and rankings**, useful for identifying
*representative* journals in a field, whose list-price APC you can then look
up directly (via the publisher, DOAJ, or by running one of their DOIs through
this tool):

| Discipline | Useful lists/rankings |
|---|---|
| Psychology | Scimago Journal Rank (SJR), subject category "Psychology" and its subcategories; Clarivate Journal Citation Reports (JCR) "Psychology" categories; APA's own journal list |
| Economics | RePEc/IDEAS journal rankings (Simple Impact Factor, Aggregate Rank); Scimago category "Economics, Econometrics and Finance"; Chartered Association of Business Schools (ABS) Academic Journal Guide; AEA journal family |
| Medicine | Clarivate JCR medical categories (e.g. "Medicine, General & Internal"); DOAJ subject browse "Medicine"; ICMJE-recommended journal list |
| Neuroscience | Scimago category "Neuroscience" and subcategories; JCR category "Neurosciences"; Society for Neuroscience's *JNeurosci* as a benchmark journal |
| Management | Financial Times FT Research Rank (the "FT50" list); ABS Academic Journal Guide (management/strategy sections); UT Dallas Top 100 business school research ranking journal list |
| Marketing | Same ABS/FT50 lists (marketing sections); American Marketing Association journals (*Journal of Marketing*, *Journal of Marketing Research*) |

Keep in mind these lists rank journals by prestige and impact, not by price.
A top-ranked journal can be subscription-only (no APC to the author) or a
hybrid/gold journal with a high APC, so use them to pick *which* journals to
check, not as cost figures themselves.

**2. Data-driven field averages.** Since OpenAlex tags essentially every work
with a field, and OpenAPC/OpenAlex hold real APC figures for a large share of
gold/hybrid OA output, you can query OpenAlex directly for a live average, for
example for Psychology:

```
https://api.openalex.org/works?filter=primary_topic.field.id:fields/33,has_apc_list:true&sort=cited_by_count:desc&per_page=50
```

(swap the field ID; 33 is Psychology, and OpenAlex's `/fields` endpoint lists
all field IDs) and average the `apc_list.value_usd` of the returned works.
This is more representative of *actual* pricing than a prestige ranking,
though it is still list price, not necessarily the amount paid.

## PCC at the University of Munster (living institutional report)

Alongside the single-reference-list calculator above, [`munster-report/`](munster-report/index.html)
is a standing analysis covering every publication OpenAlex associates with
the University of Munster as a whole (identified by its stable
[ROR identifier](https://ror.org/00pd74e08), unaffected by the university's
recent rename from "Westfalische Wilhelms-Universitat Munster (WWU)"). It is
linked from the calculator's footer.

- **`munster-report/crawl.js`**: a Node script that pages through OpenAlex's
  works API for the institution, estimates each work's APC cost with the
  same priority logic as the calculator above, and writes the results to
  `munster-report/data/` (a full CSV and JSON Lines export, plus a compact
  columnar `dataset.json` the report's charts read directly).
- **Resumable by design**: OpenAlex's free tier meters usage at roughly
  $1/day per contact email (resetting at midnight UTC), and a university's
  full output can run into the hundreds of thousands of works, far more than
  one day's budget can fetch. The crawler checkpoints its cursor position to
  `data/progress.json` after every page, so a run that gets cut off (by the
  daily budget or by its own conservative per-run request cap) resumes
  exactly where it left off next time. Once the full backlog has been
  fetched once, later runs switch to a cheap "delta" pass that only asks for
  works created or changed since the last run.
- **Fails safe**: if a run errors out partway through (a bug, a transient
  network failure), `crawl.js` still checkpoints and writes out everything it
  fetched before the failure, and the GitHub Actions workflow commits that
  partial data (`if: always()` on the commit step) rather than discarding it,
  then reports the run as failed so it stays visible. Nothing is ever lost to
  a bad run; at worst, progress just pauses until the next scheduled run.
- **Scheduled automatically, once a day**: `.github/workflows/munster-report.yml`
  runs the crawler daily via GitHub Actions and commits the updated data back
  to the repo. It runs daily rather than weekly specifically because
  OpenAlex's budget itself resets daily, so a daily cadence is what lets the
  initial backlog crawl actually make use of each day's budget instead of
  sitting idle for most of the week.
- **Do you need an OpenAlex account?** No account is required: the crawler
  works entirely on OpenAlex's free, anonymous "polite pool" (identified only
  by a contact email), and its resumable design means a large backlog just
  takes longer to complete rather than failing. If you want it to go faster,
  check [openalex.org/pricing](https://openalex.org/pricing) for any current
  paid/higher-budget tier or API key option; `crawl.js` already reads an
  optional `OPENALEX_API_KEY` environment variable, so if you obtain a key,
  add it as a GitHub Actions repository secret named `OPENALEX_API_KEY` and
  the crawler will pick it up automatically, no code changes needed.
- **The report page** shows a progress bar and plain-language status line
  reflecting how much of the institution's output has been loaded so far
  (useful while the initial backlog crawl is still in progress), KPIs, an
  OA-type breakdown, a free-to-read-availability chart, cost-by-year and
  citations-by-cost-tier charts, and top-15 charts for cost by publisher and
  by discipline, filterable by a Munster-first-author toggle, publisher, and
  discipline. A full methods section on the page itself documents exactly
  where every field comes from and its known limitations.

## Known limitations

- **Reference parsing is heuristic.** It looks for numbered-list markers
  (`1.`, `[1]`, `(1)`) or blank-line-separated paragraphs; otherwise it
  assumes one reference per line. Always check the review step before
  calculating, and use the per-row Hide checkbox afterward if a match looks
  wrong.
- **DOI matching via Crossref is a best-effort bibliographic search**, not
  exact identifier matching. For ambiguous or incomplete references it can
  occasionally match the wrong article. The matched title is shown next to
  each result so you can sanity-check it.
- **List price is not the same as amount paid.** Most APC figures come from
  publisher list prices, not verified transactions, unless OpenAlex has an
  OpenAPC record for that specific article.
- **Google Scholar** requires a manual BibTeX export (see above); there is no
  automatic-fetch mode, since Scholar has no public API and blocks
  client-side requests outright.
- **Diamond OA detection can occasionally be wrong** in the rare case where
  neither OpenAlex nor DOAJ has pricing data on file, even though the journal
  actually does charge an APC; it is a best-effort inference layered across
  three sources, not a guarantee.
- **Retraction checks depend on OpenAlex's `is_retracted` flag**, which is
  generally reliable for well-known retraction databases (Retraction Watch,
  Crossref) but is not a substitute for checking the publisher's own
  retraction notice before making a decision based on this report.
- Rate limits: the tool processes a handful of requests at a time and adds a
  small delay between calls to stay within the public, unauthenticated usage
  limits of Crossref, OpenAlex, ORCID, Unpaywall, and DOAJ. Very large
  reference lists (in the hundreds) will take a few minutes.

## Data sources

- [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/): bibliographic search to DOI
- [OpenAlex API](https://docs.openalex.org/): OA status, APC list/paid prices, citation counts, journal mean citedness, retraction status, work type
- [OpenAPC](https://openapc.net): underlying source of OpenAlex's `apc_paid` data
- [DOAJ API](https://doaj.org/api/docs): fallback diamond-OA detection by ISSN
- [ORCID Public API](https://info.orcid.org/documentation/): public works list and person name by ORCID iD
- [Unpaywall API](https://unpaywall.org/products/api): free PDF availability
- [Altmetric](https://www.altmetric.com/): attention score badge widget
- [ROR API](https://ror.org): stable institution identifier used by the Munster living report
- [GitHub Actions](https://docs.github.com/actions): daily scheduled crawl for the Munster living report

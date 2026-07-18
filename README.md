# Publication Cost Calculator

A static, client-side web tool that estimates the article processing charges
(APCs) behind a reference list: total cost, average cost, a cost-distribution
histogram, and a per-article breakdown with OA type, price source, citation
count, journal mean citedness, and Altmetric attention.

Everything runs in the browser. No backend, no build step, no data storage —
just static files you can host on GitHub Pages.

## Hosting on GitHub Pages

1. Create a new GitHub repository (or a folder in an existing one) and push
   the contents of this folder (`index.html`, `style.css`, `app.js`).
2. In the repo settings, enable **Pages** → deploy from the branch/folder
   containing these files.
3. Visit the generated `https://<user>.github.io/<repo>/` URL.

No secrets, API keys, or server config are required.

## How to use it

1. **(Optional) Contact email** — Crossref and OpenAlex serve requests faster
   and more reliably when they can identify the caller ("polite pool"). Your
   email is sent directly from your browser to those APIs only; it is never
   stored anywhere.
2. **Provide references**, via one of:
   - Paste a reference list (one per line, or a numbered list) into the text box.
   - Upload a `.txt`, `.pdf`, or `.docx` file containing the reference list.
   - Upload a `.bib` (BibTeX) file.
   - Enter an **ORCID iD** to pull your public works list directly from ORCID.
   - **Google Scholar**: Scholar has no public API, so this tool cannot fetch
     a profile automatically (and scraping it client-side would be blocked by
     CORS and against its terms of service). Instead, go to your Scholar
     profile → select all articles → **Export** → **BibTeX**, then upload the
     downloaded `.bib` file.
3. **Review & confirm** the parsed list (you can edit/deselect entries), then
   click **Calculate costs**.
4. Read the **Results**: total cost, average cost per article, average cost
   per article that actually had an APC (excludes free/non-APC routes), how
   many articles could be priced, a cost-distribution histogram, and a full
   per-article table you can export as **CSV** or as a self-contained **HTML
   report** (includes the histogram image, so it's shareable as a single file).

## Citation & attention metrics

Alongside cost, each row also shows:

- **Citations** — the article's own citation count (`cited_by_count` from OpenAlex).
- **Journal mean citedness (2yr)** — the hosting journal's 2-year mean
  citedness (OpenAlex `summary_stats.2yr_mean_citedness`, comparable in spirit
  to a journal impact factor), fetched once per journal and cached.
- **Altmetric** — the journal article's Altmetric Attention Score, shown as
  Altmetric's official donut badge (click through for the full breakdown).
  Altmetric's raw API requires a paid key, so this uses their free, officially
  supported embeddable badge widget instead.

## How pricing works

For each reference:

1. If a DOI isn't already known (e.g. from a `.bib` file or ORCID record), the
   tool searches [Crossref](https://api.crossref.org) using the reference
   text to find the best-matching DOI.
2. The DOI is looked up in [OpenAlex](https://openalex.org), which tracks:
   - `apc_paid` — an actual recorded payment (sourced from the
     [OpenAPC](https://openapc.net) initiative's public dataset of real,
     reported APC payments). Used when available — this is the most reliable
     figure.
   - `apc_list` — the journal's list price for that publication year, when no
     actual payment record exists. This is what a journal *advertises*, not
     necessarily what was paid (institutional agreements, waivers, and
     discounts are common and not reflected here).
   - `open_access.oa_status` — one of `gold`, `hybrid`, `bronze`, `green`, or
     `closed`.

3. Cost is assigned as follows:
   - Actual paid APC found → use it.
   - List-price APC found → use it, flagged as a list price.
   - No APC data, but the OA route is `green`, `bronze`, or `closed` → cost is
     inferred as **$0** (these routes typically don't involve an author-paid
     APC — subscription access or self-archiving). This is a best-effort
     inference, not a verified fact, and is labelled as such.
   - `gold`/`hybrid` OA with no APC data, or no OpenAlex record at all → cost
     is **undetermined** and excluded from the cost totals.

All costs are reported in **USD**, using OpenAlex's own currency conversion
(`value_usd`).

## Getting reference/benchmark APC values by discipline

This tool prices whatever is in *your* reference list, but you may also want a
sense of "what's typical" in a field — e.g. to sanity-check a result, or to
budget for a paper you haven't written yet. Each priced row also shows an
OpenAlex **field** tag (e.g. "Psychology", "Economics, Econometrics and
Finance"), so results already carry a discipline label you can group by.

Two complementary ways to get field-level reference values:

**1. Discipline journal lists/rankings** — good for identifying *representative*
journals in a field, whose list-price APC you can then look up directly (via
the publisher, DOAJ, or by running one of their DOIs through this tool):

| Discipline | Useful lists/rankings |
|---|---|
| Psychology | Scimago Journal Rank (SJR), subject category "Psychology" and its subcategories; Clarivate Journal Citation Reports (JCR) "Psychology" categories; APA's own journal list |
| Economics | RePEc/IDEAS journal rankings (Simple Impact Factor, Aggregate Rank); Scimago category "Economics, Econometrics and Finance"; Chartered Association of Business Schools (ABS) Academic Journal Guide; AEA journal family |
| Medicine | Clarivate JCR medical categories (e.g. "Medicine, General & Internal"); DOAJ subject browse "Medicine"; ICMJE-recommended journal list |
| Neuroscience | Scimago category "Neuroscience" and subcategories; JCR category "Neurosciences"; Society for Neuroscience's *JNeurosci* as a benchmark journal |
| Management | Financial Times FT Research Rank (the "FT50″ list); ABS Academic Journal Guide (management/strategy sections); UT Dallas Top 100 business school research ranking journal list |
| Marketing | Same ABS/FT50 lists (marketing sections); American Marketing Association journals (*Journal of Marketing*, *Journal of Marketing Research*) |

Keep in mind these lists rank journals by prestige/impact, not by price — a
top-ranked journal can be subscription-only (APC $0 to the author) or a
hybrid/gold journal with a high APC, so use them to pick *which* journals to
check, not as cost figures themselves.

**2. Data-driven field averages** — since OpenAlex tags essentially every work
with a field, and OpenAPC/OpenAlex hold real APC figures for a large share of
gold/hybrid OA output, you can query OpenAlex directly for a live average, e.g.
for Psychology:

```
https://api.openalex.org/works?filter=primary_topic.field.id:fields/33,has_apc_list:true&sort=cited_by_count:desc&per_page=50
```

(swap the field ID — 33 is Psychology; OpenAlex's `/fields` endpoint lists all
field IDs) and average the `apc_list.value_usd` of the returned works. This is
more representative of *actual* pricing than a prestige ranking, though it's
still list-price, not necessarily amount paid. If it'd be useful, this could be
added as a "compare to typical field cost" feature directly in the tool —
happy to build that next if you want it.

## Known limitations

- **Reference parsing is heuristic.** It looks for numbered-list markers
  (`1.`, `[1]`, `(1)`) or blank-line-separated paragraphs; otherwise it
  assumes one reference per line. Always check the review step before
  calculating.
- **DOI matching via Crossref is a best-effort bibliographic search**, not
  exact identifier matching — for ambiguous or incomplete references it can
  occasionally match the wrong article. The matched title is shown next to
  each result so you can sanity-check it.
- **List price ≠ amount paid.** Most APC figures come from publisher list
  prices, not verified transactions, unless OpenAlex has an OpenAPC record
  for that specific article.
- **Google Scholar** requires a manual BibTeX export (see above) — there is
  no way to query a Scholar profile directly from a browser-based tool.
- Rate limits: the tool processes a handful of requests at a time and adds a
  small delay between calls to stay within the public, unauthenticated usage
  limits of Crossref/OpenAlex/ORCID. Very large reference lists (100s of
  entries) will take a few minutes.

## Data sources

- [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) — bibliographic search → DOI
- [OpenAlex API](https://docs.openalex.org/) — OA status, APC list/paid prices
- [OpenAPC](https://openapc.net) — underlying source of OpenAlex's `apc_paid` data
- [ORCID Public API](https://info.orcid.org/documentation/) — public works list by ORCID iD

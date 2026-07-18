# Publication Cost Calculator

A static, client-side web tool that estimates the article processing charges
(APCs) behind a reference list: total cost, average cost, cost per citation,
cost per year since your first publication, a cost-distribution histogram,
two cost-vs-citations scatter plots, an open-access type breakdown (overall
and by year), a free-PDF-availability chart, and a per-article table with OA
type, price source, citation count, journal mean citedness, and Altmetric
attention.

Everything runs in the browser. No backend, no build step, no data storage:
just static files you can host on GitHub Pages. Available in English and
German (toggle top-right), with a plain-language glossary for anyone
unfamiliar with APCs, OA types, or these metrics.

## Hosting on GitHub Pages

1. Create a new GitHub repository (or a folder in an existing one) and push
   the contents of this folder (`index.html`, `style.css`, `app.js`).
2. In the repo settings, enable **Pages** and deploy from the branch/folder
   containing these files.
3. Visit the generated `https://<user>.github.io/<repo>/` URL.

No secrets, API keys, or server config are required.

## How to use it

1. **(Optional) Contact email**, in Advanced options: Crossref, OpenAlex, and
   Unpaywall serve requests faster when they can identify the caller (and
   Unpaywall requires it at all, to check PDF availability). Your email is
   sent directly from your browser to those APIs only; it is never stored
   anywhere.
2. **Provide references**, via one of:
   - Paste a reference list (one per line, or a numbered list) into the text box.
   - Upload a `.txt`, `.pdf`, or `.docx` file containing the reference list.
   - Upload a `.bib` (BibTeX) file.
   - Enter an **ORCID iD** to pull your public works list directly from
     ORCID. Accepts a bare ID (`0000-0002-1825-0097`), `orcid.org/...`, or a
     full `https://orcid.org/...` URL.
   - **Google Scholar**: paste a profile link or user ID. Scholar has no
     public API, so this tool cannot fetch a profile automatically (client-side
     scraping would be blocked by CORS and against its terms of service).
     Instead it extracts the profile ID and shows you exactly what to do: open
     your profile, select all articles, click Export, choose BibTeX, then
     upload the downloaded `.bib` file with the Upload option.
3. **Review & confirm** the parsed list (you can edit or deselect entries),
   then click **Calculate costs**.
4. Read the **Results**, and use the per-row **Hide** checkbox in the table
   to remove any article that was matched to the wrong DOI (or that you
   simply don't want counted) from every total and chart, without deleting
   your input.

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
- **Free PDF availability** (aggregate chart only, requires a contact email):
  checked via [Unpaywall](https://unpaywall.org), regardless of formal OA type.

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
3. Cost is assigned as follows:
   - Actual paid APC found: use it.
   - `diamond` OA (OpenAlex's own classification, or a `gold` journal with no
     APC pricing on record anywhere): cost is **€0**, since diamond OA is
     free to read and free to publish.
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
  way to query a Scholar profile directly from a browser-based tool.
- **Diamond OA detection is a heuristic** when OpenAlex hasn't classified a
  work as `diamond` directly: a `gold` OA journal with no APC pricing found
  anywhere in OpenAlex's records is treated as diamond, which can occasionally
  be wrong if pricing data is simply missing rather than genuinely absent.
- Rate limits: the tool processes a handful of requests at a time and adds a
  small delay between calls to stay within the public, unauthenticated usage
  limits of Crossref, OpenAlex, ORCID, and Unpaywall. Very large reference
  lists (in the hundreds) will take a few minutes, and now involve more
  requests per article than earlier versions of this tool.

## Data sources

- [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/): bibliographic search to DOI
- [OpenAlex API](https://docs.openalex.org/): OA status, APC list/paid prices, citation counts, journal mean citedness
- [OpenAPC](https://openapc.net): underlying source of OpenAlex's `apc_paid` data
- [ORCID Public API](https://info.orcid.org/documentation/): public works list by ORCID iD
- [Unpaywall API](https://unpaywall.org/products/api): free PDF availability
- [Altmetric](https://www.altmetric.com/): attention score badge widget

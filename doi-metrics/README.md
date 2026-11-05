# DOI Metrics Explorer

A static, client-side website: enter a DOI and get

- **OpenAlex**: citation count, full citations-per-year history (plot + CSV), FWCI, normalized citation percentile
- **OpenAlex mean citedness**: 2-year mean citedness, h-index and i10-index for the journal and each author
- **Altmetric**: Attention Score and a link to the full details, via the official embeddable badge
- **BIP! Scholar / Finder**: Popularity, Influence, Impulse and citation-count impact classes (C1 to C5)
- **Crossref**: citation count, for comparison

This is one of the tools in the [Publication Cost Calculator](https://github.com/LukasRoeseler/pcc) repo.
It lives in the `doi-metrics/` folder and is reachable from the top navigation bar of the
Publication Cost Calculator and the Paywall Checker. It shares their design, theme and the
English / German language toggle.

Live (inside the pcc repo): `https://<your-username>.github.io/<repo-name>/doi-metrics/`
Shareable links: `https://<your-username>.github.io/<repo-name>/doi-metrics/?doi=10.1038/nature12373`

## Deploy on GitHub Pages

The site runs entirely in the browser: no server, no build step, no API keys.

1. Host it as part of the pcc repo (already done: it lives in `doi-metrics/`).
2. Make sure Pages serves the repo from the root folder (see the pcc README for the exact steps).
3. Visit `https://<your-username>.github.io/<repo-name>/doi-metrics/`.

The `.nojekyll` file tells GitHub Pages to serve the files as-is, without running Jekyll.

## Polite API access

Enter your email in the form. It is stored in your browser's `localStorage` only and appended as
`mailto=` to OpenAlex and Crossref requests, which routes you to their faster, more reliable "polite pool".

## Notes and limits

- **Altmetric**: the public JSON API now returns 403 (it requires a key), so the Attention Score is
  shown with the official, CORS-free embeddable badge widget instead of the raw API.
- **BIP!**: the DOI must be fully URL-encoded in the request (the slash as `%2F`), otherwise the
  server returns 404. The API is CORS-enabled, so it is called directly.
- **Citation history** uses `cites:<work>` grouped by `publication_year` (full history). If that fails it falls back to `counts_by_year` (last ~10 years).
- **2-year mean citedness** is OpenAlex's impact-factor-like measure: mean citations received in a given year by works published in the two preceding years.
- OpenAlex author disambiguation is algorithmic and can be imperfect.

## Run locally

    python3 -m http.server 8000
    # open http://localhost:8000/doi-metrics/

## License
MIT

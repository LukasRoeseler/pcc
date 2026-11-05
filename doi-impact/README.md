# 📈 DOI Impact Explorer

A static, client-side website: enter a DOI and get

- **OpenAlex**: citation count, full citations-per-year history (plot + CSV), FWCI, normalized citation percentile
- **OpenAlex mean citedness**: 2-year mean citedness, h-index and i10-index for the journal and each author
- **Altmetric**: Attention Score and breakdown (news, policy, blogs, social, Mendeley readers)
- **BIP! Scholar / Finder**: Popularity, Influence, Impulse and citation-count impact classes
- **Crossref**: citation count, for comparison

This is one of the tools in the [Publication Cost Calculator](https://github.com/LukasRoeseler/pcc) repo.
It lives in the `doi-impact/` folder and is reachable from the top navigation bar of the
Publication Cost Calculator and the Paywall Checker.

Live (inside the pcc repo): `https://<your-username>.github.io/<repo-name>/doi-impact/`
Shareable links: `https://<your-username>.github.io/<repo-name>/doi-impact/?doi=10.1038/nature12373`

## Deploy on GitHub Pages

The site runs entirely in the browser: no server, no build step, no API keys.

1. Host it as part of the pcc repo (already done: it lives in `doi-impact/`).
2. Make sure Pages serves the repo from the root folder (see the pcc README for the exact steps).
3. Visit `https://<your-username>.github.io/<repo-name>/doi-impact/`.

The `.nojekyll` file tells GitHub Pages to serve the files as-is, without running Jekyll.

## Polite API access

Enter your email in the form. It is stored in your browser's `localStorage` only and appended as
`mailto=` to OpenAlex and Crossref requests, which routes you to their faster, more reliable "polite pool".

## Notes and limits

- **Altmetric** free API is rate-limited and intended for non-commercial use. DOIs without attention data return 404 ("no data").
- **BIP!** API availability and CORS may vary. If it fails, a link to BIP! Finder is shown.
- **Citation history** uses `cites:<work>` grouped by `publication_year` (full history). If that fails it falls back to `counts_by_year` (last ~10 years).
- **2-year mean citedness** is OpenAlex's impact-factor-like measure: mean citations received in a given year by works published in the two preceding years.
- OpenAlex author disambiguation is algorithmic and can be imperfect.

## Run locally

    python3 -m http.server 8000
    # open http://localhost:8000/doi-impact/

## License
MIT

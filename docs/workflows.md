# Workflows

Everything runs on GitHub Actions and Cloudflare free tiers.

| Schedule (UTC) | Workflow | What it does |
|---|---|---|
| Daily 03:00 | `scrape-prices` | Scrapes all providers, commits `data/prices/`, archives history, dispatches `deploy`. Opens or updates one issue if any scraper fails. |
| On dispatch or push to main | `deploy` | Builds the site, publishes to Cloudflare Pages, smoke-tests `/go/*` and the homepage. |
| After `deploy` succeeds | `indexnow-ping` | Notifies IndexNow. |
| Monday 06:00 | `market-report` | Publishes a report computed from the scraped data, then dispatches `deploy`. No LLM. |
| Daily 07:00, and on PR/push | `site-health` | Checks affiliate wiring, links and data freshness. |
| Daily 10:00 | `affiliate-sync` | HEAD-checks provider URLs, opens an issue if broken. |
| Wednesday 09:00 | `revenue-sync` | Pulls pageviews into `data/revenue.json`. |
| Sunday 09:00 | `sitemap-submit` | Submits the sitemap to Bing. |
| 1st of month 09:00 | `monetization-check` | Opens an issue when pageviews pass the threshold. |
| On PR | `lighthouse-ci` | Lighthouse audit. |

A commit pushed with `GITHUB_TOKEN` does not start other workflows, so anything that changes the site must dispatch `deploy` explicitly.

Price rows older than `MAX_PRICE_AGE_DAYS` (`src/lib/pricing.ts`) are never shown. The freshness gate fails only when fewer than four feeds are live.

## Configuration

GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BING_WEBMASTER_API_KEY`, `INDEXNOW_KEY`.

GitHub variables, read at build time: `PUBLIC_ADSENSE_SLOT` (AdSense unit id, ad units stay off until set), `OWNER_EMAIL` (published contact address).

Cloudflare Pages environment variables: the `*_REF` affiliate codes listed as `affiliate_param_env` in `data/providers.json`. A provider with no code redirects without attribution and earns nothing. The `ANALYTICS` D1 binding enables click logging (`schema.sql`).

# Workflows

## Automated Chain (every Monday)

| Time (UTC) | Workflow | Trigger | What it does |
|------------|----------|---------|--------------|
| 03:00 | `scrape-prices` | schedule | Scrapes all 15 GPU providers, commits `data/prices/` |
| ~03:30 | `generate-content` | dispatched by scrape-prices | Generates copy via Groq/Qwen3-32B, commits `data/generated/` + `src/content/` |
| ~04:00 | `deploy` | dispatched by generate-content | Builds Astro site, deploys to Cloudflare Pages |
| ~04:05 | `indexnow-ping` | workflow_run (deploy success) | Pings IndexNow to request re-indexation |

## Recurring Standalone

| Schedule | Workflow | What it does |
|----------|----------|--------------|
| Wed 09:00 | `revenue-sync` | Pulls 30-day pageviews from Cloudflare Analytics, writes `data/revenue.json` |
| Sun 09:00 | `sitemap-submit` | Submits `sitemap.xml` to Bing Webmaster |
| Daily 10:00 | `affiliate-sync` | HEAD-checks all `/go/*` affiliate destinations, opens GitHub issue if broken |
| Daily 14:00 | `social-syndicate` | Posts new content to dev.to and Hashnode |
| 1st of month 09:00 | `seo-audit` | Checks Google Search Console indexation, opens issue if problems found |
| 1st of month 09:00 | `monetization-check` | Opens issue to enable Ezoic when pageviews > 10,000 |
| 1st of month 10:00 | `awesome-lists-pr` | Submits pricegpu.com to awesome-* lists on GitHub |
| Every 3 months (1st) | `dead-page-cleanup` | Adds `noindex` to dead pages, commits changes |

## On Pull Requests

| Trigger | Workflow | What it does |
|---------|----------|--------------|
| PR → main | `lighthouse-ci` | Runs Lighthouse audit, requires Performance ≥ 95, posts result as PR comment |

## Manual Runs (workflow_dispatch)

All workflows support manual dispatch. To test the full chain:

1. Run `scrape-prices` → automatically chains through generate-content → deploy → indexnow-ping
2. Run `revenue-sync` → then run `monetization-check` to test threshold logic

## Dependencies

```
scrape-prices
  └─ dispatches → generate-content
                    └─ dispatches → deploy
                                      └─ triggers → indexnow-ping

revenue-sync → writes data/revenue.json
                 └─ read by → monetization-check
```

## Secrets Required

| Secret | Used by |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | deploy, revenue-sync |
| `CLOUDFLARE_ACCOUNT_ID` | deploy, revenue-sync |
| `GROQ_API_KEY` | generate-content |
| `GOOGLE_SEARCH_CONSOLE_SA_JSON` | seo-audit, dead-page-cleanup |
| `BING_WEBMASTER_API_KEY` | sitemap-submit |
| `INDEXNOW_KEY` | indexnow-ping |
| `DEVTO_API_KEY` | social-syndicate |
| `HASHNODE_API_KEY` | social-syndicate |
| `HASHNODE_PUBLICATION_ID` | social-syndicate |
| `GITHUB_TOKEN` | all workflows (auto-provided) |

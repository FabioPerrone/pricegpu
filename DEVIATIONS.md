# DEVIATIONS.md

Deviations from PROJECT_SPEC1.md, per §19.

---

## 1. Astro version: 6.x instead of 5.x

**Spec**: Astro 5.x  
**Actual**: Astro 6.1.10  
**Reason**: `create-astro@latest` installs Astro 6 as of April 2026. Astro 6 is backwards-compatible with Astro 5 page templates and configuration. No functional difference for SSG.

---

## 2. Content generation model: Groq (Qwen3-32B) instead of Claude Haiku 4.5

**Spec**: Claude Haiku 4.5 (primary), Claude Sonnet 4.6 (escalation)  
**Actual**: Groq Qwen3-32B (primary, free tier), OpenRouter Qwen3.5-Plus (paid fallback)  
**Reason**: User decision. Groq provides Qwen3-32B free via an OpenAI-compatible endpoint (60 RPM limit). For ~1,600 initial pages at ~2k tokens input + ~800 tokens output, the Groq free tier handles everything without cost. Weekly regeneration of 10–50 changed pages is well within limits. The Groq API is OpenAI SDK-compatible, requiring only a base URL + model name swap in `scripts/generate-copy.ts`. Escalation path uses OpenRouter Qwen3.5-Plus (~$0.26/M input) instead of Claude Sonnet 4.6. The deterministic template fallback is unchanged.

---

## 3. `@astrojs/sitemap` not used; custom sitemap pages used instead

**Spec**: `src/pages/sitemap-[index].xml.ts`  
**Actual**: Same — custom sitemap endpoint. No deviation, just noting that the built-in integration was intentionally skipped in favour of the spec's custom approach.

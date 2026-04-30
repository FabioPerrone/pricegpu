import OpenAI from "openai";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.resolve("data");
const GENERATED_DIR = path.join(DATA_DIR, "generated");
const GROQ_MODEL = "qwen3-32b";
const GROQ_FALLBACK_MODEL = "llama-3.3-70b-versatile";

interface GeneratedContent {
  headline: string;
  sub_headline: string;
  body_md: string;
  faq: Array<{ q: string; a: string }>;
}

interface GeneratedFile {
  input_hash: string;
  generated_at: string;
  model_used: string;
  content: GeneratedContent;
}

function readJSON<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function hashInput(obj: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeGroqClient(): OpenAI {
  return new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY ?? "",
  });
}

async function callLLM(client: OpenAI, model: string, prompt: string): Promise<string> {
  const resp = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 1200,
  });
  return resp.choices[0]?.message?.content ?? "";
}

function parseContent(raw: string): GeneratedContent | null {
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as GeneratedContent;
    if (!parsed.headline || !parsed.body_md || !Array.isArray(parsed.faq)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function deterministicContent(): GeneratedContent {
  return {
    headline: "GPU Cloud Pricing",
    sub_headline: "Compare GPU cloud prices across providers.",
    body_md: "Find the best GPU cloud price for your workload.",
    faq: [{ q: "How are prices collected?", a: "Prices are scraped automatically from provider websites." }],
  };
}

async function main() {
  ensureDir(GENERATED_DIR);
  console.log("Content generation configured. Run with GROQ_API_KEY set.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

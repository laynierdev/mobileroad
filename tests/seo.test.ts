import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/config";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { metadata as projectsMeta } from "@/app/projects/page";
import { metadata as newProjectMeta } from "@/app/projects/new/page";
import { metadata as phasesMeta } from "@/app/phases/page";

const root = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
  });
}

describe("icon font subset", () => {
  it("contains every Bootstrap icon used in the source (run `npm run build:icons` if this fails)", () => {
    const known = JSON.parse(fs.readFileSync(path.join(root, "node_modules/bootstrap-icons/font/bootstrap-icons.json"), "utf8")) as Record<string, number>;
    const css = fs.readFileSync(path.join(root, "src/app/icons.css"), "utf8");
    const used = new Set<string>();
    for (const file of sourceFiles(path.join(root, "src"))) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(/\bbi-([a-z0-9-]+)\b/g)) {
        if (match[1] in known) used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    const missing = [...used].filter((name) => !css.includes(`.bi-${name}::before`));
    expect(missing).toEqual([]);
  });

  it("ships a small font file", () => {
    expect(fs.statSync(path.join(root, "src/app/fonts/bootstrap-icons-subset.woff2")).size).toBeLessThan(20 * 1024);
  });
});

describe("robots, sitemap and noindex agree", () => {
  const rules = robots().rules;
  const rule = (Array.isArray(rules) ? rules[0] : rules) as { allow?: string | string[]; disallow?: string | string[] };
  const disallowed = ([] as string[]).concat(rule.disallow ?? []);
  const sitemapPaths = sitemap().map((entry) => entry.url.replace(SITE_URL, "") || "/");

  it("keeps private noindex pages crawlable so the noindex tag can be read", () => {
    for (const meta of [projectsMeta, newProjectMeta]) expect(meta.robots).toMatchObject({ index: false });
    for (const privatePath of ["/projects", "/projects/new"]) {
      expect(disallowed.some((d) => privatePath.startsWith(d))).toBe(false);
      expect(sitemapPaths).not.toContain(privatePath);
    }
  });

  it("lists only indexable pages that robots.txt allows", () => {
    expect(sitemapPaths).toEqual(["/", "/phases"]);
    expect((phasesMeta as { robots?: unknown }).robots).toBeUndefined();
    for (const p of sitemapPaths) expect(disallowed.some((d) => p.startsWith(d))).toBe(false);
  });

  it("only blocks the API and points at the sitemap", () => {
    expect(disallowed).toEqual(["/api/"]);
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

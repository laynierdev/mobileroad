import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { mockProvider } from "@/ai/mockProvider";
import { POST as parseRoute } from "@/app/api/documents/parse/route";
import { buildDemoProject } from "@/data/demoProject";
import { DocumentError, MAX_DOCUMENT_BYTES, parseDocument } from "@/documents/parse";
import { buildProjectFromRoadmap } from "@/domain/projectBuilder";
import { projectSchema } from "@/domain/schemas";
import { createKeyValueProjectRepository } from "@/repositories/projectRepository";
import { makeProject, makeFeature, TODAY } from "./fixtures";

const enc = (s: string) => new TextEncoder().encode(s);

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

async function makeDocx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

function makePdf(text: string): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${`BT /F1 12 Tf 20 100 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return enc(body);
}

describe("document parsing", () => {
  it("reads TXT and Markdown", async () => {
    expect((await parseDocument("req.txt", enc("Users must log in.\r\n\r\n\r\n\r\nAdmins manage orders."))).text).toBe("Users must log in.\n\nAdmins manage orders.");
    expect((await parseDocument("spec.md", enc("# Spec\n- Pay by card"))).kind).toBe("text");
  });

  it("reads DOCX and PDF", async () => {
    expect((await parseDocument("a.docx", await makeDocx("Customers can track orders"))).text).toContain("Customers can track orders");
    expect((await parseDocument("a.pdf", makePdf("Drivers accept deliveries"))).text).toContain("Drivers accept deliveries");
  });

  it.each([
    ["unsupported type", "a.exe", enc("hello world"), "unsupported"],
    ["empty file", "a.txt", new Uint8Array(0), "empty"],
    ["binary posing as text", "a.txt", new Uint8Array([104, 0, 105]), "corrupted"],
    ["fake PDF", "a.pdf", enc("this is not a pdf"), "corrupted"],
    ["fake DOCX", "a.docx", enc("not a zip file"), "corrupted"],
    ["broken DOCX archive", "a.docx", new Uint8Array([0x50, 0x4b, 1, 2, 3, 4]), "corrupted"],
    ["whitespace only", "a.txt", enc("   \n \n"), "no_text"],
  ])("rejects %s with a clear error", async (_n, name, bytes, code) => {
    await expect(parseDocument(name, bytes)).rejects.toMatchObject({ name: "DocumentError", code });
  });

  it("refuses oversized content instead of truncating it", async () => {
    await expect(parseDocument("big.txt", enc("a".repeat(60_001)))).rejects.toMatchObject({ code: "too_long" });
    await expect(parseDocument("big.txt", new Uint8Array(MAX_DOCUMENT_BYTES + 1).fill(97))).rejects.toBeInstanceOf(DocumentError);
  });

  it("serves the upload route", async () => {
    const send = (file: File | null) => {
      const form = new FormData();
      if (file) form.append("file", file);
      return parseRoute(new Request("http://x/api/documents/parse", { method: "POST", body: form }));
    };
    const ok = await send(new File(["The app must support push notifications."], "r.txt", { type: "text/plain" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, text: "The app must support push notifications." });
    const bad = await send(new File(["x"], "r.exe"));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toContain("Unsupported");
    expect((await send(null)).status).toBe(400);
  });
});

describe("multi-project repository", () => {
  it("saves, lists, loads, switches and deletes projects independently", () => {
    const store = memoryStore();
    const repo = createKeyValueProjectRepository(store);
    expect(repo.initialized()).toBe(false);
    const a = { ...makeProject([makeFeature("a")]), id: "a", name: "Alpha" };
    const b = { ...makeProject([makeFeature("b")]), id: "b", name: "Beta" };
    repo.save(a);
    repo.save(b);
    repo.setActiveId("b");
    expect(repo.initialized()).toBe(true);
    expect(repo.list().map((p) => p.name).sort()).toEqual(["Alpha", "Beta"]);
    expect(repo.load("a")?.features[0].id).toBe("a");
    expect(repo.getActiveId()).toBe("b");

    repo.save({ ...a, name: "Alpha 2" });
    expect(repo.list()).toHaveLength(2);
    expect(repo.load("a")?.name).toBe("Alpha 2");

    repo.remove("b");
    expect(repo.load("b")).toBeNull();
    expect(repo.list().map((p) => p.id)).toEqual(["a"]);
    expect(repo.getActiveId()).toBeNull();
  });

  it("migrates the single-project storage of earlier versions", () => {
    const store = memoryStore();
    const legacy = buildDemoProject(TODAY);
    store.setItem("mobileroad.project.v1", JSON.stringify(legacy));
    const repo = createKeyValueProjectRepository(store);
    expect(repo.list().map((p) => p.id)).toEqual([legacy.id]);
    expect(repo.getActiveId()).toBe(legacy.id);
    expect(repo.load(legacy.id)).toEqual(legacy);
    expect(store.getItem("mobileroad.project.v1")).toBeNull();
  });

  it("backs up corrupted data instead of destroying it", () => {
    const store = memoryStore();
    const repo = createKeyValueProjectRepository(store);
    repo.save({ ...makeProject([]), id: "x", name: "X" });
    store.setItem("mobileroad.project.x", "{broken");
    expect(repo.load("x")).toBeNull();
    expect(store.getItem("mobileroad.corrupt.x")).toBe("{broken");
    expect(repo.list()).toHaveLength(0);
  });
});

describe("building a project from a reviewed roadmap", () => {
  it("creates a valid project with groups, phases and not-started features", async () => {
    const roadmap = await mockProvider.generateRoadmap({ brief: "Customers can order food. Drivers accept deliveries. Admins manage menus.", projectName: "FoodGo" });
    const project = buildProjectFromRoadmap(
      { name: " FoodGo ", description: "Food delivery", targetAudience: "Diners", businessGoals: ["Grow"], platform: "both", techStack: "", teamSize: 3, experienceLevel: "none" },
      roadmap,
      TODAY,
      "foodgo",
    );
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(project.name).toBe("FoodGo");
    expect(project.isDemo).toBe(false);
    expect(project.phases).toHaveLength(roadmap.phases.length);
    expect(project.features).toHaveLength(roadmap.features.length);
    expect(project.features.every((f) => f.status === "not_started" && f.checkpoints.length === 6)).toBe(true);
    expect(new Set(project.features.map((f) => f.id)).size).toBe(project.features.length);
    expect(project.features.every((f) => project.groups.some((g) => g.id === f.groupId))).toBe(true);
    expect(project.features.every((f) => f.schedule.kickoff! >= "2026-06-15")).toBe(true);
    expect(project.targetLaunchDate).toBeTruthy();
  });

  it("honours an explicit launch date and supports an empty feature list", async () => {
    const roadmap = await mockProvider.generateRoadmap({ brief: "A simple notes app for students." });
    const project = buildProjectFromRoadmap(
      { name: "Notes", description: "", targetAudience: "", businessGoals: [], platform: "ios", techStack: "", targetLaunchDate: "2027-01-31" },
      { ...roadmap, features: [] },
      TODAY,
    );
    expect(project.targetLaunchDate).toBe("2027-01-31");
    expect(project.features).toEqual([]);
    expect(projectSchema.safeParse(project).success).toBe(true);
  });
});

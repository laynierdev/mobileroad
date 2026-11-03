import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_DOCUMENT_CHARS = 60_000;

export type DocumentErrorCode = "unsupported" | "too_large" | "empty" | "corrupted" | "no_text" | "too_long";

export class DocumentError extends Error {
  constructor(
    readonly code: DocumentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

export type DocumentKind = "pdf" | "docx" | "text";

const TEXT_EXTENSIONS = ["txt", "md", "markdown", "text"];

export function detectKind(fileName: string): DocumentKind | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (TEXT_EXTENSIONS.includes(ext)) return "text";
  return null;
}

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);

function normalize(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface ParsedDocument {
  text: string;
  kind: DocumentKind;
}

/**
 * Extracts plain text from a PDF, DOCX, TXT or Markdown file. Never truncates silently:
 * content over the limit is rejected so the user can trim it or paste the relevant part.
 */
export async function parseDocument(fileName: string, bytes: Uint8Array): Promise<ParsedDocument> {
  const kind = detectKind(fileName);
  if (!kind) throw new DocumentError("unsupported", "Unsupported file type. Use PDF, DOCX, TXT or Markdown, or paste the text instead.");
  if (bytes.byteLength === 0) throw new DocumentError("empty", "The file is empty.");
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new DocumentError("too_large", `The file is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB. Paste the relevant part instead.`);

  let text: string;
  if (kind === "text") {
    if (bytes.includes(0)) throw new DocumentError("corrupted", "The file does not look like a text file.");
    text = new TextDecoder("utf-8").decode(bytes);
  } else if (kind === "pdf") {
    if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) throw new DocumentError("corrupted", "This file is not a valid PDF.");
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const result = await extractText(pdf, { mergePages: true });
      text = result.text;
    } catch {
      throw new DocumentError("corrupted", "The PDF could not be read. It may be damaged or password protected. Paste the text instead.");
    }
  } else {
    if (!startsWith(bytes, [0x50, 0x4b])) throw new DocumentError("corrupted", "This file is not a valid DOCX document.");
    try {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = result.value;
    } catch {
      throw new DocumentError("corrupted", "The DOCX could not be read. It may be damaged. Paste the text instead.");
    }
  }

  text = normalize(text);
  if (!text) {
    throw new DocumentError("no_text", kind === "pdf" ? "No text was found. The PDF may be a scanned image. Paste the text instead." : "The document contains no text.");
  }
  if (text.length > MAX_DOCUMENT_CHARS) {
    throw new DocumentError("too_long", `The document has ${text.length.toLocaleString()} characters; the limit is ${MAX_DOCUMENT_CHARS.toLocaleString()}. Paste the most relevant part instead.`);
  }
  return { text, kind };
}

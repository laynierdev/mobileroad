import { NextResponse } from "next/server";
import { DocumentError, MAX_DOCUMENT_BYTES, parseDocument } from "@/documents/parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Seconds. Vercel functions stop after their configured duration. */
export const maxDuration = 30;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, code: "unsupported", error: "Upload a file using multipart form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, code: "unsupported", error: "No file was provided." }, { status: 400 });
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ ok: false, code: "too_large", error: "The file is too large. Paste the relevant part instead." }, { status: 413 });
  }

  try {
    const { text, kind } = await parseDocument(file.name, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ ok: true, text, kind, fileName: file.name });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: 422 });
    }
    return NextResponse.json({ ok: false, code: "corrupted", error: "The file could not be processed. Paste the text instead." }, { status: 500 });
  }
}

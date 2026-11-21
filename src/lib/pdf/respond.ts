import "server-only";

export function pdfResponse(bytes: Buffer | Uint8Array, filename: string, download: boolean) {
  const safe = filename.replace(/[^\w.-]+/g, "-");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safe}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import type { StoredReport } from "@/lib/reports/generate";
import { renderReportHtml } from "@/lib/reports/render";

// Response helpers for report HTML/PDF. Links carry a secret token, so pages
// are never indexed, cached publicly, or leaked through the Referer header.

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function reportHtmlResponse(data: StoredReport, frameAncestors: "'none'" | "'self'") {
  const html = renderReportHtml(data, data.branding);
  return new Response(html, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; frame-ancestors ${frameAncestors}; base-uri 'none'; form-action 'none'`,
    },
  });
}

export function pdfResponse(bytes: Buffer, filename: string, inline = true) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^a-z0-9.-]/gi, "-")}"`,
    },
  });
}

export function goneResponse() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Link unavailable</title></head><body style="font-family:Arial,sans-serif;max-width:520px;margin:15vh auto;padding:0 20px;color:#161A1C"><h1 style="font-size:22px">This report link isn’t available</h1><p style="line-height:1.5;color:#4A4F52">It may have expired or been revoked. Ask the agency that sent it for a new link — the PDF attached to the original email still works.</p></body></html>`,
    { status: 404, headers: { ...PRIVATE_HEADERS, "Content-Type": "text/html; charset=utf-8" } },
  );
}

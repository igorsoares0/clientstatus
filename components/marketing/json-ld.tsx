// Structured data as <script type="application/ld+json">. "<" is escaped so a string in the data
// can't close the script tag (Next.js JSON-LD guide).

export type JsonLdData = Record<string, unknown>;

export function jsonLdString(data: JsonLdData): string {
  return JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
}

export function JsonLd({ data }: { data: JsonLdData }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}

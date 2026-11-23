import type { Metadata } from "next";
import { SslChecker } from "@/components/tools/ssl-checker";
import { ToolPage } from "@/components/tools/tool-page";
import { getTool } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";

const tool = getTool("ssl-checker");

export const metadata: Metadata = pageMetadata(tool.seo);

export default function Page() {
  return (
    <ToolPage tool={tool}>
      <SslChecker />
    </ToolPage>
  );
}

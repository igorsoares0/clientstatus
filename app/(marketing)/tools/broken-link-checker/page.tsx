import type { Metadata } from "next";
import { LinkChecker } from "@/components/tools/link-checker";
import { ToolPage } from "@/components/tools/tool-page";
import { getTool } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";

const tool = getTool("broken-link-checker");

export const metadata: Metadata = pageMetadata(tool.seo);

export default function Page() {
  return (
    <ToolPage tool={tool}>
      <LinkChecker />
    </ToolPage>
  );
}

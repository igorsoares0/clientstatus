import { readFile } from "node:fs/promises";
import path from "node:path";

const MAILBOX = path.join(process.cwd(), ".dev-mailbox", "emails.jsonl");

type Mail = { sentAt: string; to: string; subject: string; text: string };

/** Waits for the newest email to `to` whose subject matches, and returns the first URL in it. */
export async function linkFromLatestEmail(to: string, subject: RegExp, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await readFile(MAILBOX, "utf8").catch(() => "");
    const mail = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Mail)
      .filter((m) => m.to === to && subject.test(m.subject))
      .at(-1);
    const url = mail?.text.match(/https?:\/\/\S+/)?.[0];
    if (url) return url;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email matching ${subject} for ${to}`);
}

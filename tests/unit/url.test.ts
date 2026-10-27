import { describe, expect, it } from "vitest";
import { isPrivateIp, normalizeSiteUrl } from "@/lib/url";

function ok(raw: string) {
  const r = normalizeSiteUrl(raw);
  if (!r.ok) throw new Error(`expected ok for ${raw}: ${r.error}`);
  return r.value;
}
function err(raw: string) {
  const r = normalizeSiteUrl(raw);
  if (r.ok) throw new Error(`expected error for ${raw}`);
  return r;
}

describe("normalizeSiteUrl", () => {
  it("adds https and canonicalises the URL", () => {
    expect(ok("harbourdental.co.uk")).toEqual({
      baseUrl: "https://harbourdental.co.uk",
      hostname: "harbourdental.co.uk",
      registrableDomain: "harbourdental.co.uk",
      https: true,
    });
    expect(ok("  HTTPS://Shop.Kiln-Coffee.com/ ").baseUrl).toBe("https://shop.kiln-coffee.com");
    expect(ok("http://example.com").https).toBe(false);
  });

  it("keeps paths and queries but drops fragments and trailing slashes", () => {
    expect(ok("https://www.hollisortho.com/book/").baseUrl).toBe("https://www.hollisortho.com/book");
    expect(ok("example.com/a?b=1#top").baseUrl).toBe("https://example.com/a?b=1");
  });

  it("uses the hostname without www as identity and finds the registrable domain", () => {
    const v = ok("https://www.shop.example.co.uk");
    expect(v.hostname).toBe("shop.example.co.uk");
    expect(v.registrableDomain).toBe("example.co.uk");
  });

  it("converts internationalised domains to punycode", () => {
    expect(ok("bücher.de").hostname).toBe("xn--bcher-kva.de");
  });

  it("rejects unsupported schemes and credentials", () => {
    expect(err("ftp://files.example.com").error).toBe("ftp:// isn’t supported — http or https only");
    expect(err("https://user:pw@example.com").error).toBe("Contains a username or password");
  });

  it("blocks private and local addresses", () => {
    for (const raw of [
      "http://localhost:3000",
      "192.168.1.20",
      "10.0.0.1",
      "http://169.254.169.254/latest",
      "[::1]",
      "printer.local",
      "db.internal",
    ]) {
      expect(err(raw)).toMatchObject({ error: "Private or local address — blocked for safety", blocked: true });
    }
  });

  it("asks for a domain instead of a public IP", () => {
    expect(err("8.8.8.8").error).toBe("Use the website’s domain name, not an IP address");
  });

  it("requires a public domain", () => {
    expect(err("intranet").error).toBe("Needs a public domain name");
    expect(err("example.notarealtld").error).toBe("Needs a public domain name");
    expect(err("").error).toBe("URL is required");
    expect(err("https://exa mple.com").error).toBe("Not a valid web address");
  });
});

describe("isPrivateIp", () => {
  it("classifies IPv4 and IPv6 ranges", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("172.20.1.1")).toBe(true);
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
    expect(isPrivateIp("93.184.216.34")).toBe(false);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIp("2606:4700::1111")).toBe(false);
  });
});

import type { CheckStatus } from "@/lib/generated/prisma/enums";
import type { Probe } from "@/lib/error-probes";
import type { PageSeo, SitemapPage } from "@/lib/seo";
import type { ToolSlug } from "@/lib/tools/limits";

// /errors/[slug] (docs/pseo-plan.md §6). Browser wording comes from Chromium's and Firefox's own
// string files, status codes from MDN and RFC 9110, Cloudflare errors from Cloudflare's docs; all
// read on `verifiedAt`. How Client Status treats each error isn't written here as a claim: each
// entry lists probes that run the product's classifiers (lib/error-probes.ts), and the unit test
// fails if a probe's result stops matching `expect`.

export type ErrorGroup = "certificate" | "connection" | "http" | "cloudflare";

export type ErrorEntry = {
  slug: string;
  /** The code as people search for it. */
  code: string;
  name: string;
  group: ErrorGroup;
  /** The same error under other browsers' names. */
  aliases: string[];
  seo: PageSeo;
  meaning: string;
  visitor: string;
  /** Most likely first. */
  causes: { title: string; text: string }[];
  fixes: string[];
  /** How Client Status treats it, in words; the probes below prove it. */
  clientStatus: string;
  probes: { probe: Probe; expect: CheckStatus }[];
  tool: ToolSlug | null;
  related: [string, string];
  /** Platform pages where this error is worth a link. */
  platforms: string[];
  sources: string[];
  verifiedAt: string;
};

const VERIFIED = "2026-11-22";

const CHROMIUM_NET = "https://chromium.googlesource.com/chromium/src/+/HEAD/net/base/net_error_list.h";
const CHROME_PAGES = "https://chromium.googlesource.com/chromium/src/+/HEAD/components/error_page_strings.grdp";
const CHROME_CERT =
  "https://chromium.googlesource.com/chromium/src/+/HEAD/components/security_interstitials_strings.grdp";
const FIREFOX =
  "https://github.com/mozilla-firefox/firefox/blob/main/toolkit/locales/en-US/toolkit/neterror/certError.ftl";
const RFC9110 = "https://www.rfc-editor.org/rfc/rfc9110.html";
const RETRY_AFTER = "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After";
const CF_SSL_MODES = "https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/";
const mdn = (status: number) => `https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/${status}`;
const cf = (status: number) =>
  `https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-${status}/`;

const CF_VISITOR =
  "Cloudflare’s own error page with the code, showing the visitor’s browser and Cloudflare as working and the host as the part that failed.";

const CF_DOWN =
  "Client Status checks the site through Cloudflare, the way a visitor reaches it. A 52x page is a server error, so it counts as a failed check, and two in a row open a downtime incident and email your team. The incident shows the code, so you know to look behind Cloudflare.";

function cloudflare(
  status: number,
  name: string,
  rest: Omit<ErrorEntry, "slug" | "code" | "name" | "group" | "aliases" | "seo" | "visitor" | "verifiedAt"> & {
    description: string;
  },
): ErrorEntry {
  const { description, ...entry } = rest;
  return {
    slug: `cloudflare-error-${status}`,
    code: `Cloudflare error ${status}`,
    name,
    group: "cloudflare",
    aliases: [],
    seo: {
      title: `Cloudflare error ${status}: causes and fixes`,
      description,
      path: `/errors/cloudflare-error-${status}`,
    },
    visitor: CF_VISITOR,
    verifiedAt: VERIFIED,
    ...entry,
  };
}

export const ERRORS: readonly ErrorEntry[] = [
  // --- Certificates and TLS ---------------------------------------------------------------------
  {
    slug: "err-cert-date-invalid",
    code: "NET::ERR_CERT_DATE_INVALID",
    name: "Certificate expired or not yet valid",
    group: "certificate",
    aliases: ["SEC_ERROR_EXPIRED_CERTIFICATE (Firefox)"],
    seo: {
      title: "NET::ERR_CERT_DATE_INVALID: causes and fixes",
      description:
        "What NET::ERR_CERT_DATE_INVALID means on a client site, why certificates expire unnoticed, how to fix it fast and how to hear about it weeks before.",
      path: "/errors/err-cert-date-invalid",
    },
    meaning:
      "The browser rejected the site’s certificate because today’s date falls outside the dates it’s valid for. Almost always the certificate has expired. Occasionally it isn’t valid yet, or the visitor’s own clock is wrong.",
    visitor:
      "Chrome shows “Your connection is not private” with NET::ERR_CERT_DATE_INVALID in the details. Firefox shows “Warning: Potential Security Risk Ahead” and names the date the certificate expired. Visitors can click past it, but most leave, and forms and checkouts look unsafe.",
    causes: [
      {
        title: "Automatic renewal stopped",
        text: "Free certificates last a few months and depend on automatic renewal. A DNS change, a migrated site, a firewall blocking the validation request or a lapsed hosting plan stops renewal without anyone noticing.",
      },
      {
        title: "A bought certificate wasn’t replaced",
        text: "Certificates bought for a year are often renewed by hand. The reminder went to someone who has left, or the new certificate was never installed.",
      },
      {
        title: "The server still serves the old one",
        text: "The certificate was renewed, but the web server, load balancer or CDN wasn’t reloaded, or one of several servers still has the old file.",
      },
      {
        title: "The visitor’s clock is wrong",
        text: "If only one person sees it, check their device’s date. Chrome shows a separate “Your clock is behind” or “Your clock is ahead” page when it can tell the clock is the problem.",
      },
    ],
    fixes: [
      "Check the certificate from outside to see the expiry date the server actually serves, not the one in a dashboard.",
      "Renew it wherever it’s issued: the host’s control panel, the CDN, or your ACME client (such as Certbot) on your own server.",
      "Reload every server and proxy that handles HTTPS, then check again from outside.",
      "Find out why renewal failed (DNS no longer pointing at the server, a blocked validation path, an expired plan) so it doesn’t happen again at the next renewal.",
    ],
    clientStatus:
      "The SSL check reads the certificate every 6 hours and warns your team 30, 14, 7 and 1 days before it expires, while there’s still time to renew. If it expires anyway, the SSL check opens an incident. The uptime check deliberately doesn’t judge certificates, so an expired one shows as an SSL problem, not as downtime.",
    probes: [
      { probe: { check: "ssl", problem: "expired" }, expect: "failure" },
      { probe: { check: "uptime", status: 200 }, expect: "success" },
    ],
    tool: "ssl-checker",
    related: ["err-cert-authority-invalid", "err-cert-common-name-invalid"],
    platforms: ["wordpress", "drupal"],
    sources: [CHROMIUM_NET, CHROME_CERT, FIREFOX],
    verifiedAt: VERIFIED,
  },
  {
    slug: "err-cert-authority-invalid",
    code: "NET::ERR_CERT_AUTHORITY_INVALID",
    name: "Certificate not trusted",
    group: "certificate",
    aliases: ["SEC_ERROR_UNKNOWN_ISSUER (Firefox)"],
    seo: {
      title: "NET::ERR_CERT_AUTHORITY_INVALID explained",
      description:
        "Why browsers don’t trust a client site’s certificate: missing intermediates, self-signed certificates or interception. How to fix each and spot it early.",
      path: "/errors/err-cert-authority-invalid",
    },
    meaning:
      "The browser couldn’t trace the certificate back to an authority it trusts. The certificate is self-signed, was issued by an authority browsers don’t trust, or the server isn’t sending the intermediate certificate that links it to a trusted root.",
    visitor:
      "Chrome shows “Your connection is not private” with NET::ERR_CERT_AUTHORITY_INVALID. Firefox says it doesn’t trust the site “because its certificate issuer is unknown, the certificate is self-signed, or the server is not sending the correct intermediate certificates.”",
    causes: [
      {
        title: "Missing intermediate certificate",
        text: "The server sends only the site’s own certificate, not the chain. Some browsers fill the gap themselves and others don’t, so the site works on one device and fails on another.",
      },
      {
        title: "A self-signed or default certificate",
        text: "A new server, a control panel or a staging setup still uses the certificate it generated for itself, often after a migration.",
      },
      {
        title: "Software intercepting HTTPS",
        text: "If only some visitors see it, antivirus or a company network may be replacing certificates on their side. Firefox shows a separate message when it detects this.",
      },
    ],
    fixes: [
      "Check from outside whether the chain is complete; an outside check doesn’t borrow intermediates from a browser cache.",
      "Install the full chain: on most servers that means the “fullchain” file from your certificate authority or ACME client rather than the single certificate.",
      "Replace self-signed certificates with one from a public authority; most hosts and CDNs issue one for free.",
      "If one visitor is affected and the chain is fine, ask which antivirus or network they’re on.",
    ],
    clientStatus:
      "The SSL check validates the chain without fetching missing intermediates, so a broken chain is reported even if your own browser happens to load the site. A self-signed or untrusted certificate opens an SSL incident and emails your team. The uptime check still counts the site as up.",
    probes: [
      { probe: { check: "ssl", problem: "untrusted-chain" }, expect: "failure" },
      { probe: { check: "ssl", problem: "self-signed" }, expect: "failure" },
    ],
    tool: "ssl-checker",
    related: ["err-cert-date-invalid", "err-cert-common-name-invalid"],
    platforms: [],
    sources: [CHROMIUM_NET, CHROME_CERT, FIREFOX],
    verifiedAt: VERIFIED,
  },
  {
    slug: "err-cert-common-name-invalid",
    code: "NET::ERR_CERT_COMMON_NAME_INVALID",
    name: "Certificate for the wrong name",
    group: "certificate",
    aliases: ["SSL_ERROR_BAD_CERT_DOMAIN (Firefox)"],
    seo: {
      title: "NET::ERR_CERT_COMMON_NAME_INVALID explained",
      description:
        "Why a client site’s certificate doesn’t match its address: www vs bare domain, a freshly connected custom domain or shared hosting. How to fix each case.",
      path: "/errors/err-cert-common-name-invalid",
    },
    meaning:
      "The certificate is valid, but not for the address the visitor opened. Every certificate lists the names it covers, and if the hostname isn’t one of them the browser refuses it.",
    visitor:
      "Chrome shows “Your connection is not private” with NET::ERR_CERT_COMMON_NAME_INVALID. Firefox says the certificate is “not valid for” the site and, when it can, lists the names it is valid for, which is often the quickest clue.",
    causes: [
      {
        title: "www and the bare domain aren’t both covered",
        text: "The certificate covers www.example.com but visitors reach example.com, or the other way round.",
      },
      {
        title: "A custom domain was just connected",
        text: "Hosted builders and CDNs issue the certificate after the domain points at them. Until then, or while a record still points at the old host, visitors get someone else’s certificate.",
      },
      {
        title: "Shared hosting serves a default certificate",
        text: "On a shared IP address, a server with no certificate for this site falls back to its default one, issued for another domain or the host itself.",
      },
      {
        title: "Deeper subdomains",
        text: "A wildcard such as *.example.com covers shop.example.com but not eu.shop.example.com.",
      },
    ],
    fixes: [
      "Compare the names listed in the certificate with the exact address that fails.",
      "Reissue the certificate with every hostname the site answers on, including www and the bare domain.",
      "On hosted platforms, check the DNS records match the platform’s instructions exactly, then wait for its certificate to be issued.",
      "Redirect extra hostnames to one address only once each has a valid certificate: the browser checks the certificate before it sees the redirect.",
    ],
    clientStatus:
      "The SSL check compares the certificate with the hostname you monitor and opens an SSL incident when they don’t match. It checks that one hostname, so if visitors use both www and the bare domain, add the other as its own site.",
    probes: [{ probe: { check: "ssl", problem: "hostname" }, expect: "failure" }],
    tool: "ssl-checker",
    related: ["err-cert-authority-invalid", "err-ssl-version-or-cipher-mismatch"],
    platforms: ["webflow", "squarespace", "wix", "shopify", "framer"],
    sources: [CHROMIUM_NET, CHROME_CERT, FIREFOX],
    verifiedAt: VERIFIED,
  },
  {
    slug: "err-ssl-protocol-error",
    code: "ERR_SSL_PROTOCOL_ERROR",
    name: "Secure connection failed",
    group: "certificate",
    aliases: ["Secure Connection Failed (Firefox)"],
    seo: {
      title: "ERR_SSL_PROTOCOL_ERROR: causes and fixes",
      description:
        "What ERR_SSL_PROTOCOL_ERROR means when a client site won’t open over HTTPS, the usual server-side causes, how to fix them and how monitoring reports it.",
      path: "/errors/err-ssl-protocol-error",
    },
    meaning:
      "The browser and the server started a secure connection but couldn’t complete the TLS handshake. Chrome uses this code as a catch-all when the server’s answer doesn’t make sense as TLS.",
    visitor:
      "Chrome shows “This site can’t provide a secure connection” and says the site “sent an invalid response”. Firefox shows “Secure Connection Failed”. Unlike certificate warnings, there’s no way to click past it.",
    causes: [
      {
        title: "Port 443 isn’t speaking HTTPS",
        text: "The server answers on the HTTPS port with plain HTTP, often after a server or control-panel change removed the HTTPS configuration.",
      },
      {
        title: "A broken TLS configuration",
        text: "A missing certificate file, a typo in the server’s TLS settings, or a proxy in front of the site that handles TLS incorrectly.",
      },
      {
        title: "Something in between",
        text: "A firewall, antivirus or network filter on the visitor’s side can break the handshake. If only one network is affected, suspect it.",
      },
    ],
    fixes: [
      "Test from outside to see whether the handshake fails for everyone or only for one visitor.",
      "Check that the server has an HTTPS listener with a certificate on port 443, and read its error log at the time of the failure.",
      "If the error started right after a server, CDN or firewall change, undo that change first.",
    ],
    clientStatus:
      "Both checks see it. The uptime check records “TLS handshake failed” as a failed check, so two in a row open a downtime incident, and the SSL check opens an SSL incident.",
    probes: [
      { probe: { check: "uptime", error: "ERR_SSL_WRONG_VERSION_NUMBER" }, expect: "failure" },
      { probe: { check: "ssl", problem: "handshake" }, expect: "failure" },
    ],
    tool: "ssl-checker",
    related: ["err-ssl-version-or-cipher-mismatch", "cloudflare-error-525"],
    platforms: [],
    sources: [CHROMIUM_NET, CHROME_PAGES, FIREFOX],
    verifiedAt: VERIFIED,
  },
  {
    slug: "err-ssl-version-or-cipher-mismatch",
    code: "ERR_SSL_VERSION_OR_CIPHER_MISMATCH",
    name: "No common TLS version or cipher",
    group: "certificate",
    aliases: ["SSL_ERROR_NO_CYPHER_OVERLAP (Firefox)"],
    seo: {
      title: "ERR_SSL_VERSION_OR_CIPHER_MISMATCH fixes",
      description:
        "Why ERR_SSL_VERSION_OR_CIPHER_MISMATCH appears on a client site: no certificate at the CDN yet, or only old TLS versions. How to fix it and catch it.",
      path: "/errors/err-ssl-version-or-cipher-mismatch",
    },
    meaning:
      "The browser and the server have no TLS version or cipher in common, so no secure connection can be set up. On Cloudflare it usually means no certificate covers that hostname yet.",
    visitor:
      "Chrome shows “This site can’t provide a secure connection” and says the site “uses an unsupported protocol”. Firefox shows “Secure Connection Failed” with SSL_ERROR_NO_CYPHER_OVERLAP.",
    causes: [
      {
        title: "No certificate for the hostname at the CDN",
        text: "Cloudflare documents this error for hostnames its certificate doesn’t cover: a certificate still being issued after the domain was added (15 minutes to 24 hours), a DNS record that isn’t proxied, an expired custom certificate, or a multi-level subdomain.",
      },
      {
        title: "Only old TLS versions enabled",
        text: "TLS 1.0 and 1.1 were formally deprecated in 2021 (RFC 8996) and current browsers refuse them. An old server or appliance that offers nothing newer fails here.",
      },
      {
        title: "A restricted cipher list",
        text: "A hand-tuned server configuration that only allows ciphers the browser doesn’t support.",
      },
    ],
    fixes: [
      "On Cloudflare, check the edge certificate status under SSL/TLS, make sure the record is proxied, and allow time for issuance on new domains.",
      "On your own server, enable TLS 1.2 and 1.3 and use the server’s current recommended cipher settings.",
      "For deeper subdomains, get a certificate that names them explicitly.",
    ],
    clientStatus:
      "The handshake fails for Client Status too, so the uptime check records “TLS handshake failed” as a failed check and the SSL check opens an SSL incident.",
    probes: [
      { probe: { check: "uptime", error: "ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE" }, expect: "failure" },
      { probe: { check: "ssl", problem: "handshake" }, expect: "failure" },
    ],
    tool: "ssl-checker",
    related: ["err-ssl-protocol-error", "err-cert-common-name-invalid"],
    platforms: [],
    sources: [
      CHROMIUM_NET,
      CHROME_PAGES,
      "https://developers.cloudflare.com/ssl/troubleshooting/version-cipher-mismatch/",
      "https://www.rfc-editor.org/rfc/rfc8996.html",
    ],
    verifiedAt: VERIFIED,
  },

  // --- DNS, connections and redirects -----------------------------------------------------------
  {
    slug: "dns-probe-finished-nxdomain",
    code: "DNS_PROBE_FINISHED_NXDOMAIN",
    name: "Domain doesn’t resolve",
    group: "connection",
    aliases: ["ERR_NAME_NOT_RESOLVED (Chrome)", "“Hmm. We’re having trouble finding that site.” (Firefox)"],
    seo: {
      title: "DNS_PROBE_FINISHED_NXDOMAIN explained",
      description:
        "Why a client site shows DNS_PROBE_FINISHED_NXDOMAIN: an expired domain, changed DNS records or a missing hostname. How to check each and fix it quickly.",
      path: "/errors/dns-probe-finished-nxdomain",
    },
    meaning:
      "The domain name doesn’t resolve to an address: DNS answered that the name doesn’t exist (NXDOMAIN). Without an address, the browser has nothing to connect to.",
    visitor:
      "Chrome shows “This site can’t be reached” and says the server IP address could not be found. Firefox says “Hmm. We’re having trouble finding that site.”",
    causes: [
      {
        title: "The domain registration lapsed",
        text: "When a registration expires, the domain stops resolving once the registrar suspends it, and the site and often the email disappear together.",
      },
      {
        title: "DNS records changed or deleted",
        text: "A nameserver change during a migration, a deleted A or CNAME record, or a DNS zone that wasn’t recreated at the new provider.",
      },
      {
        title: "One hostname has no record",
        text: "The bare domain works but www has no record, or a new subdomain was never added.",
      },
      {
        title: "The visitor’s network",
        text: "If only one person is affected, their DNS resolver or a content filter may be at fault.",
      },
    ],
    fixes: [
      "Check the domain’s registration status and expiry date first.",
      "Look up the records from outside (dig or an online DNS lookup) for exactly the hostname that fails.",
      "Confirm the nameservers at the registrar match the DNS provider where you edit records.",
      "After fixing, allow for caching: resolvers can keep the failed answer for a while.",
    ],
    clientStatus:
      "A name that doesn’t resolve is a failed check (“Domain doesn’t resolve”), so it opens a downtime incident after two checks. A temporary DNS failure is inconclusive instead. Separately, the daily domain check reads the registration’s expiry date from the registry and warns 30, 14, 7 and 1 days ahead, where the registry publishes it.",
    probes: [
      { probe: { check: "uptime", error: "ENOTFOUND" }, expect: "failure" },
      { probe: { check: "uptime", error: "EAI_AGAIN" }, expect: "inconclusive" },
    ],
    tool: "domain-expiry-checker",
    related: ["err-connection-refused", "cloudflare-error-523"],
    platforms: ["squarespace", "wix", "shopify"],
    sources: [CHROMIUM_NET, CHROME_PAGES, FIREFOX],
    verifiedAt: VERIFIED,
  },
  {
    slug: "err-connection-refused",
    code: "ERR_CONNECTION_REFUSED",
    name: "Connection refused",
    group: "connection",
    aliases: ["“Unable to connect” (Firefox)"],
    seo: {
      title: "ERR_CONNECTION_REFUSED: causes and fixes",
      description:
        "What ERR_CONNECTION_REFUSED means for a client site: a stopped web server, DNS pointing at the wrong machine or a firewall. How to find which and fix it.",
      path: "/errors/err-connection-refused",
    },
    meaning:
      "The domain resolved, but nothing accepted the connection: the machine at that address replied that no service is listening on the web port.",
    visitor:
      "Chrome shows “This site can’t be reached” and says the site “refused to connect”. Firefox shows “Unable to connect”.",
    causes: [
      {
        title: "The web server isn’t running",
        text: "Nginx, Apache or the app server crashed, or didn’t start again after a restart or update.",
      },
      {
        title: "DNS points at the wrong machine",
        text: "After a migration, a record still points at the old server, which no longer runs the site.",
      },
      {
        title: "A firewall rejects the port",
        text: "A new firewall rule or security tool rejects connections on port 80 or 443.",
      },
      {
        title: "HTTPS was never set up",
        text: "The site answers on port 80, but nothing listens on 443, so https:// addresses are refused.",
      },
    ],
    fixes: [
      "Check whether it fails for everyone or only on one network.",
      "Confirm DNS points at the server that hosts the site today.",
      "Check that the web server is running and listening on ports 80 and 443, and read its logs for why it stopped.",
      "Review recent firewall changes.",
    ],
    clientStatus:
      "A refused connection is a failed check (“Connection refused”), so two in a row open a downtime incident and email your team. Behind Cloudflare, the same problem at your server shows up as error 521 instead.",
    probes: [{ probe: { check: "uptime", error: "ECONNREFUSED" }, expect: "failure" }],
    tool: null,
    related: ["cloudflare-error-521", "dns-probe-finished-nxdomain"],
    platforms: [],
    sources: [CHROMIUM_NET, CHROME_PAGES, FIREFOX],
    verifiedAt: VERIFIED,
  },
  {
    slug: "err-too-many-redirects",
    code: "ERR_TOO_MANY_REDIRECTS",
    name: "Redirect loop",
    group: "connection",
    aliases: ["“The page isn’t redirecting properly” (Firefox)"],
    seo: {
      title: "ERR_TOO_MANY_REDIRECTS: causes and fixes",
      description:
        "Why a client site loops with ERR_TOO_MANY_REDIRECTS: HTTPS forced in two places, conflicting www rules or a CMS site address. How to trace and fix it.",
      path: "/errors/err-too-many-redirects",
    },
    meaning:
      "The page sent the browser to another address, which sent it on again, round in a loop, until the browser gave up.",
    visitor:
      "Chrome shows “This page isn’t working” and says the site “redirected you too many times”. Firefox shows “The page isn’t redirecting properly”.",
    causes: [
      {
        title: "HTTPS forced in two places that disagree",
        text: "Cloudflare documents the classic case: in its Flexible SSL mode, Cloudflare reaches the server over HTTP, the server redirects to HTTPS, and the visitor is sent round again.",
      },
      {
        title: "Conflicting www rules",
        text: "One layer (the CDN, the host, .htaccess or an SEO plugin) redirects the bare domain to www, and another redirects www back.",
      },
      {
        title: "The CMS’s own site address",
        text: "A CMS that stores its address, like WordPress’s Site Address, redirects requests to it. If it doesn’t match the protocol or hostname the server sees, it loops.",
      },
      {
        title: "Cookies, for one visitor",
        text: "Less often a login or consent cookie loops for one person only; Firefox suggests cookies as a possible cause.",
      },
    ],
    fixes: [
      "Follow the redirects from outside (curl -IL or a redirect checker) to see which addresses the loop goes through.",
      "On Cloudflare, use the Full or Full (strict) SSL mode once the server has a certificate, instead of Flexible.",
      "Decide which layer owns the HTTPS and www redirects, and remove the rule from the others.",
      "Check the CMS’s configured site address matches the real one, including https and www.",
    ],
    clientStatus:
      "The uptime check follows up to 5 redirects. A loop is recorded as “Redirect loop” and counts as a failed check, so a site stuck in one opens a downtime incident after two checks. The weekly audit also lists internal links that loop or pass through more than 3 redirects.",
    probes: [{ probe: { check: "uptime", error: "redirect-loop" }, expect: "failure" }],
    tool: "broken-link-checker",
    related: ["cloudflare-error-526", "http-404-not-found"],
    platforms: ["wordpress"],
    sources: [
      CHROMIUM_NET,
      CHROME_PAGES,
      FIREFOX,
      "https://developers.cloudflare.com/ssl/troubleshooting/too-many-redirects/",
    ],
    verifiedAt: VERIFIED,
  },

  // --- HTTP status codes ------------------------------------------------------------------------
  {
    slug: "http-500-internal-server-error",
    code: "HTTP 500",
    name: "Internal Server Error",
    group: "http",
    aliases: [],
    seo: {
      title: "HTTP 500 Internal Server Error explained",
      description:
        "What a 500 Internal Server Error on a client site usually means (an update, server config or resource limits), where to look first and how monitoring sees it.",
      path: "/errors/http-500-internal-server-error",
    },
    meaning:
      "The server received the request but hit an error it didn’t handle, so it couldn’t produce the page. It’s a generic status: the cause is in the server’s or application’s logs, not in the response.",
    visitor:
      "Whatever error page the site or host shows, from a blank page to the CMS’s own message; WordPress, for example, shows “There has been a critical error on this website.” When the server sends no page of its own, Chrome shows “This page isn’t working”.",
    causes: [
      {
        title: "An update with a fatal error",
        text: "A theme, plugin, module or core update that crashes, or that needs a newer PHP version than the server runs.",
      },
      {
        title: "Server configuration",
        text: "A broken .htaccess or server rule, or wrong file permissions after a migration.",
      },
      {
        title: "Resource limits",
        text: "The application runs out of memory or hits a host limit on heavy pages.",
      },
      {
        title: "A failing dependency",
        text: "The database or an API the page needs is down, and the code doesn’t handle it.",
      },
    ],
    fixes: [
      "Check whether every page fails or only some: one failing template points at code, everything failing points at configuration or the database.",
      "Read the server’s and application’s error logs from the time of the first failure.",
      "Roll back the most recent update or change, then fix it on staging.",
      "Use the CMS’s debug mode only briefly, and never show debug output to visitors.",
    ],
    clientStatus:
      "A 500 is a server error, so it counts as a failed check on every site: two in a row open a downtime incident and email your team. If a broken site still answers 200 with an error message, a status check can’t tell; that’s the limit of checking from outside.",
    probes: [{ probe: { check: "uptime", status: 500 }, expect: "failure" }],
    tool: "website-health-report",
    related: ["http-502-bad-gateway", "http-503-service-unavailable"],
    platforms: ["wordpress", "drupal"],
    sources: [mdn(500), RFC9110, CHROME_PAGES],
    verifiedAt: VERIFIED,
  },
  {
    slug: "http-502-bad-gateway",
    code: "HTTP 502",
    name: "Bad Gateway",
    group: "http",
    aliases: [],
    seo: {
      title: "HTTP 502 Bad Gateway: causes and fixes",
      description:
        "What a 502 Bad Gateway on a client site means: the app behind the proxy crashed, restarted or is overloaded. Where to look, how to fix it, how it’s monitored.",
      path: "/errors/http-502-bad-gateway",
    },
    meaning:
      "A proxy or gateway in front of the site (a load balancer, a CDN, or a web server passing requests to PHP or Node) got an invalid response, or none, from the server behind it.",
    visitor:
      "A short “502 Bad Gateway” page from whatever sits in front: nginx, the host or the CDN. Sites behind Cloudflare more often show Cloudflare’s own 52x errors.",
    causes: [
      {
        title: "The application crashed or is overloaded",
        text: "PHP-FPM, Node or another app server behind the proxy stopped, ran out of workers, or was restarted.",
      },
      {
        title: "A deploy or restart in progress",
        text: "Brief 502s while the app server restarts and the proxy still sends it requests.",
      },
      {
        title: "A misconfigured upstream",
        text: "After a server change, the proxy points at the wrong port or socket.",
      },
    ],
    fixes: [
      "Read the proxy’s error log; it usually names the upstream that failed and how.",
      "Restart the application service, then check its own logs for why it stopped.",
      "If it happens under load, raise worker limits or find the slow requests tying them up.",
      "If it only happens during deploys, keep the old process serving until the new one is ready.",
    ],
    clientStatus:
      "A 502 counts as a failed check. After a first failure, Client Status checks again 30 seconds later and only opens an incident if that fails too, so a short restart doesn’t email your team.",
    probes: [{ probe: { check: "uptime", status: 502 }, expect: "failure" }],
    tool: null,
    related: ["http-504-gateway-timeout", "cloudflare-error-520"],
    platforms: [],
    sources: [mdn(502), RFC9110],
    verifiedAt: VERIFIED,
  },
  {
    slug: "http-503-service-unavailable",
    code: "HTTP 503",
    name: "Service Unavailable",
    group: "http",
    aliases: [],
    seo: {
      title: "HTTP 503 Service Unavailable explained",
      description:
        "A 503 on a client site means maintenance mode, overload or bot protection. How to tell which, how to fix it, and why monitoring treats bot checks differently.",
      path: "/errors/http-503-service-unavailable",
    },
    meaning:
      "The server is up but temporarily can’t handle the request: it’s overloaded, in maintenance mode, or refusing traffic on purpose. It may say when to try again in a Retry-After header.",
    visitor:
      "Usually a maintenance page or a short “Service Unavailable” message. Some bot protection also answers 503 with a challenge page, such as Cloudflare’s “Just a moment…”.",
    causes: [
      {
        title: "Maintenance mode",
        text: "A CMS or host maintenance mode during updates; if an update failed half-way, the site can stay in it.",
      },
      {
        title: "Overload or host limits",
        text: "A traffic spike, a full worker pool or the hosting plan’s resource limits.",
      },
      {
        title: "Bot protection",
        text: "Challenge pages sent with 503 to clients that look automated.",
      },
    ],
    fixes: [
      "Check whether maintenance mode is on and whether the last update finished.",
      "Compare the host’s resource usage with the time the errors started.",
      "If people see the site normally and only tools get 503, it’s probably bot protection: allow your monitoring’s user agent rather than turning protection off.",
    ],
    clientStatus:
      "A plain 503 is a server error, so it counts as a failed check. A 503 carrying a bot challenge is recognised and treated as inconclusive: it’s left out of the uptime figure and never alerts on its own, because the site is up for people.",
    probes: [
      { probe: { check: "uptime", status: 503 }, expect: "failure" },
      { probe: { check: "uptime", status: 503, challenge: true }, expect: "inconclusive" },
    ],
    tool: null,
    related: ["http-429-too-many-requests", "http-502-bad-gateway"],
    platforms: ["drupal"],
    sources: [mdn(503), RETRY_AFTER, RFC9110],
    verifiedAt: VERIFIED,
  },
  {
    slug: "http-504-gateway-timeout",
    code: "HTTP 504",
    name: "Gateway Timeout",
    group: "http",
    aliases: [],
    seo: {
      title: "HTTP 504 Gateway Timeout: causes and fixes",
      description:
        "A 504 Gateway Timeout means a client site’s server answered too slowly for the proxy. Common causes, how to fix slow requests, and how timeouts are monitored.",
      path: "/errors/http-504-gateway-timeout",
    },
    meaning: "A proxy or gateway in front of the site waited for the server behind it and gave up before it answered.",
    visitor:
      "A “504 Gateway Timeout” page from the host, load balancer or proxy. Behind Cloudflare, the equivalent is error 524.",
    causes: [
      {
        title: "Slow requests",
        text: "A page doing heavy work, like a big export, an import or a slow database query, takes longer than the proxy’s timeout.",
      },
      {
        title: "An overloaded application",
        text: "Every worker is busy, so new requests queue until the proxy gives up.",
      },
      {
        title: "A slow dependency",
        text: "The page waits on an API or service that isn’t answering.",
      },
    ],
    fixes: [
      "Find which URLs time out, and how long they take, in the application’s logs.",
      "Move long jobs such as exports, imports and bulk emails into a background queue.",
      "Fix the slow query or add caching; raise the proxy’s timeout only as a stopgap.",
    ],
    clientStatus:
      "If the 504 arrives within the check’s timeout (10 seconds by default, up to 20), it counts as a failed check. If the proxy waits longer than that, the check times out first, and a timeout is inconclusive: left out of the uptime figure and never alerting on its own.",
    probes: [
      { probe: { check: "uptime", status: 504 }, expect: "failure" },
      { probe: { check: "uptime", error: "TimeoutError" }, expect: "inconclusive" },
    ],
    tool: null,
    related: ["cloudflare-error-524", "http-502-bad-gateway"],
    platforms: [],
    sources: [mdn(504), RFC9110],
    verifiedAt: VERIFIED,
  },
  {
    slug: "http-403-forbidden",
    code: "HTTP 403",
    name: "Forbidden",
    group: "http",
    aliases: [],
    seo: {
      title: "HTTP 403 Forbidden: causes and fixes",
      description:
        "Why a client site answers 403 Forbidden: firewall rules, bot protection or file permissions. How to tell a real block from a bot check, and how it’s monitored.",
      path: "/errors/http-403-forbidden",
    },
    meaning:
      "The server understood the request and refuses it. Unlike 401, logging in usually won’t help: the server has decided this client may not see this resource.",
    visitor: "A “403 Forbidden” or “Access denied” page, a firewall’s block page, or a bot check.",
    causes: [
      {
        title: "Firewall or security rules",
        text: "A web application firewall, security plugin or host rule blocks the visitor’s IP address, country or browser.",
      },
      {
        title: "A bot check",
        text: "Challenge pages are often sent with 403 to clients that don’t run JavaScript, monitoring tools included.",
      },
      {
        title: "Permissions after a migration",
        text: "Wrong file permissions, or a folder with no index file and directory listing turned off.",
      },
    ],
    fixes: [
      "Check whether real visitors are blocked or only automated tools.",
      "Find the blocked request in the firewall or security plugin log, and the rule that matched.",
      "Allow your monitoring by user agent or IP address instead of turning protection off; Client Status identifies itself as ClientStatusBot.",
      "Fix permissions and index files after migrations.",
    ],
    clientStatus:
      "By default a 4xx response is recorded and shown on the site but not counted as down, because it often means a block rather than an outage; you can set a site to count any error as down. A 403 carrying a bot challenge is inconclusive. In the weekly audit, a link answering 403 is reported as inconclusive, not broken.",
    probes: [
      { probe: { check: "uptime", status: 403 }, expect: "success" },
      { probe: { check: "uptime", status: 403, policy: "non_success" }, expect: "failure" },
      { probe: { check: "uptime", status: 403, challenge: true }, expect: "inconclusive" },
      { probe: { check: "audit", status: 403, internal: true }, expect: "inconclusive" },
    ],
    tool: null,
    related: ["http-429-too-many-requests", "http-503-service-unavailable"],
    platforms: [],
    sources: [mdn(403), RFC9110],
    verifiedAt: VERIFIED,
  },
  {
    slug: "http-404-not-found",
    code: "HTTP 404",
    name: "Not Found",
    group: "http",
    aliases: [],
    seo: {
      title: "HTTP 404 Not Found on client sites",
      description:
        "Why 404s pile up on client sites after redesigns and migrations, how to find the broken links causing them, when to redirect, and how they’re monitored.",
      path: "/errors/http-404-not-found",
    },
    meaning:
      "The server works, but there’s nothing at that address. On a client site it usually means a page moved or was deleted and the links to it weren’t updated.",
    visitor:
      "The site’s “page not found” page. Visitors arriving from old links, ads or emails hit a dead end, and search engines eventually drop the address.",
    causes: [
      {
        title: "Changed slugs or URL structure",
        text: "A renamed page, a CMS migration or a new URL structure without redirects from the old addresses.",
      },
      {
        title: "Deleted pages and products",
        text: "Pages removed while menus, posts and other sites still link to them.",
      },
      {
        title: "Typos in links",
        text: "A mistyped link in content, a menu or a template.",
      },
      {
        title: "The home page itself",
        text: "If the site’s main address returns 404, the site may have moved or its document root changed.",
      },
    ],
    fixes: [
      "Crawl the site for broken internal links and fix them where they’re written.",
      "Add 301 redirects from old addresses to the closest current page.",
      "Use 410 Gone for pages removed on purpose.",
      "Make the 404 page useful, with search and links to the main sections.",
    ],
    clientStatus:
      "On the monitored address, a 404 is recorded but not counted as down unless the site is set to count any error as down. Across the site, the weekly audit finds internal links that answer 404 or 410, requests each twice before calling it broken, and lists the page each one is on. Broken internal links also open an incident.",
    probes: [
      { probe: { check: "uptime", status: 404 }, expect: "success" },
      { probe: { check: "uptime", status: 404, policy: "non_success" }, expect: "failure" },
      { probe: { check: "audit", status: 404, internal: true }, expect: "failure" },
    ],
    tool: "broken-link-checker",
    related: ["err-too-many-redirects", "http-403-forbidden"],
    platforms: ["wordpress", "webflow", "squarespace", "wix", "shopify", "framer", "drupal"],
    sources: [mdn(404), RFC9110],
    verifiedAt: VERIFIED,
  },
  {
    slug: "http-429-too-many-requests",
    code: "HTTP 429",
    name: "Too Many Requests",
    group: "http",
    aliases: [],
    seo: {
      title: "HTTP 429 Too Many Requests explained",
      description:
        "What 429 Too Many Requests means, why it hits crawlers and monitoring more than people, how to tune rate limits, and why it isn’t counted as downtime.",
      path: "/errors/http-429-too-many-requests",
    },
    meaning:
      "The client sent too many requests in a given time and the server is rate-limiting it. The response may include a Retry-After header saying how long to wait.",
    visitor:
      "Real visitors rarely see it. It mostly hits crawlers, monitoring, API clients and offices where many people share one IP address.",
    causes: [
      {
        title: "Tight rate limits",
        text: "Host, CDN or firewall limits set too low for normal traffic, or counting a whole office behind one IP address as a single client.",
      },
      {
        title: "Aggressive tools",
        text: "SEO crawlers, scrapers or several monitoring services hitting the site at the same time.",
      },
      {
        title: "Login and API protection",
        text: "Brute-force protection on login forms and APIs that also catches legitimate use.",
      },
    ],
    fixes: [
      "Find the rate-limit rule that fired and check its thresholds against real traffic.",
      "Allow the tools you rely on by user agent or IP address instead of loosening limits for everyone.",
      "Respect Retry-After in your own integrations.",
    ],
    clientStatus:
      "A 429 means the server is up and answering, so Client Status never counts it as down: it’s inconclusive, left out of the uptime figure, and never alerts on its own. Links that answer 429 in the audit are inconclusive too, not broken. The audit waits between requests to each host and honours robots.txt crawl delays, so it rarely triggers limits.",
    probes: [
      { probe: { check: "uptime", status: 429 }, expect: "inconclusive" },
      { probe: { check: "audit", status: 429, internal: false }, expect: "inconclusive" },
    ],
    tool: null,
    related: ["http-403-forbidden", "http-503-service-unavailable"],
    platforms: [],
    sources: [mdn(429), "https://www.rfc-editor.org/rfc/rfc6585.html", RETRY_AFTER],
    verifiedAt: VERIFIED,
  },

  // --- Cloudflare 52x ---------------------------------------------------------------------------
  cloudflare(520, "Web server returns an unknown error", {
    description:
      "Cloudflare error 520 means the server behind Cloudflare sent an empty or malformed response. The usual causes, how to fix each, and how monitoring reports it.",
    meaning:
      "Cloudflare reached the site’s server, but the response was empty, malformed or otherwise unexpected, so Cloudflare shows its own 520 page instead.",
    causes: [
      {
        title: "The server crashed mid-request",
        text: "Crashes or misconfiguration at the origin. Cloudflare notes that 520s are common with PHP applications that crash the web server.",
      },
      {
        title: "Cloudflare is blocked at the server",
        text: "A firewall or security plugin blocks some of Cloudflare’s IP addresses.",
      },
      {
        title: "Headers too large",
        text: "Response headers over Cloudflare’s 128 KB limit, often from too many cookies.",
      },
      {
        title: "Broken HTTP/2 at the origin",
        text: "The server offers HTTP/2 to Cloudflare but doesn’t handle it correctly.",
      },
    ],
    fixes: [
      "Read the server’s error log at the times of the 520s, looking for crashes.",
      "Allow every Cloudflare IP range in the server’s firewall and security plugins.",
      "Look for oversized cookies or headers on the failing pages.",
      "As a temporary workaround, Cloudflare suggests setting the DNS record to DNS-only, which takes Cloudflare out of the path.",
    ],
    clientStatus: CF_DOWN,
    probes: [{ probe: { check: "uptime", status: 520 }, expect: "failure" }],
    tool: null,
    related: ["cloudflare-error-521", "http-502-bad-gateway"],
    platforms: [],
    sources: [cf(520)],
  }),
  cloudflare(521, "Web server is down", {
    description:
      "Cloudflare error 521 means the server behind Cloudflare refused the connection: it’s stopped, or it’s blocking Cloudflare. How to tell which and fix it.",
    meaning:
      "The origin server refused Cloudflare’s connection. To Cloudflare the server looks down, although it may only be blocking Cloudflare.",
    causes: [
      {
        title: "The web server is offline",
        text: "The web server application stopped or crashed.",
      },
      {
        title: "Cloudflare is blocked",
        text: "A firewall, security tool or rate limit at the server rejects Cloudflare’s IP addresses.",
      },
      {
        title: "Nothing listens on the port Cloudflare uses",
        text: "In Full or Full (strict) mode Cloudflare connects on port 443; in Flexible mode, on port 80. If the server isn’t listening there, the connection is refused.",
      },
    ],
    fixes: [
      "Check that the web server is running, and read its logs for crashes.",
      "Allow every Cloudflare IP range in the server’s firewall and security software.",
      "Match the server to the SSL mode: HTTPS with a valid certificate on 443 for Full (strict), port 80 for Flexible.",
    ],
    clientStatus: CF_DOWN,
    probes: [{ probe: { check: "uptime", status: 521 }, expect: "failure" }],
    tool: null,
    related: ["err-connection-refused", "cloudflare-error-522"],
    platforms: [],
    sources: [cf(521), CF_SSL_MODES],
  }),
  cloudflare(522, "Connection timed out", {
    description:
      "Cloudflare error 522 means Cloudflare couldn’t connect to the server in time. Common causes, how to fix them, and how timeouts like this affect monitoring.",
    meaning:
      "Cloudflare tried to connect to the origin server and got no answer in time: no reply to the connection attempt within 19 seconds, or no data within 90 seconds of connecting.",
    causes: [
      {
        title: "Cloudflare is blocked or rate-limited",
        text: "Cloudflare calls this the most common cause: a firewall, .htaccess rule or iptables blocking or rate-limiting some Cloudflare IP ranges.",
      },
      {
        title: "An overloaded or offline server",
        text: "The server is too busy to accept new connections, or is down.",
      },
      {
        title: "The wrong origin address",
        text: "The IP address in Cloudflare’s DNS no longer matches the server, often after a move or an IP change at the host.",
      },
    ],
    fixes: [
      "Allow every Cloudflare IP range at the server and the host’s firewall.",
      "Check the A and AAAA records in Cloudflare against the server’s current IP address.",
      "Check the server’s load and connection limits around the time of the errors.",
    ],
    clientStatus:
      "Cloudflare waits up to 19 seconds before answering with 522, while Client Status waits 10 seconds by default (20 at most). So during a 522 outage most checks time out before Cloudflare answers, and a timeout is inconclusive: left out of the uptime figure, and it doesn’t open an incident. When the 522 page does arrive in time, it counts as a failed check.",
    probes: [
      { probe: { check: "uptime", status: 522 }, expect: "failure" },
      { probe: { check: "uptime", error: "UND_ERR_HEADERS_TIMEOUT" }, expect: "inconclusive" },
    ],
    tool: null,
    related: ["cloudflare-error-524", "cloudflare-error-521"],
    platforms: [],
    sources: [cf(522)],
  }),
  cloudflare(523, "Origin is unreachable", {
    description:
      "Cloudflare error 523 means Cloudflare has no route to the server’s IP address, usually a wrong origin IP after a move. How to check it and get the site back.",
    meaning:
      "Cloudflare couldn’t reach the origin server at all: no network route leads to the IP address it has for the server.",
    causes: [
      {
        title: "The origin IP address is wrong",
        text: "After a migration or an IP change at the host, the A or AAAA record in Cloudflare points at an address the server no longer uses.",
      },
      {
        title: "A routing problem",
        text: "A network issue between Cloudflare and the host, or at the host itself.",
      },
      {
        title: "Cloud network routes",
        text: "On AWS, Cloudflare mentions an overly broad VPC route (such as 172.0.0.0/8) capturing traffic meant for Cloudflare’s 172.64.0.0/13 range.",
      },
    ],
    fixes: [
      "Confirm the A and AAAA records in Cloudflare’s DNS match the server’s current addresses.",
      "Ask the host for a traceroute from the server to a Cloudflare IP address.",
      "On AWS, review route tables for routes that swallow Cloudflare’s ranges.",
    ],
    clientStatus: CF_DOWN,
    probes: [{ probe: { check: "uptime", status: 523 }, expect: "failure" }],
    tool: null,
    related: ["cloudflare-error-522", "dns-probe-finished-nxdomain"],
    platforms: [],
    sources: [cf(523)],
  }),
  cloudflare(524, "A timeout occurred", {
    description:
      "Cloudflare error 524 means the server took over 125 seconds to answer. What causes slow responses, how to fix them, and what monitoring can and can’t see.",
    meaning:
      "Cloudflare connected to the origin server, but the server didn’t send a response within Cloudflare’s proxy read timeout, 125 seconds by default.",
    causes: [
      {
        title: "A long-running request",
        text: "A large export, import or database query that the page waits for.",
      },
      {
        title: "An overloaded server",
        text: "The server is short of resources and can’t return anything in time.",
      },
    ],
    fixes: [
      "Find the slow URLs and their response times in the server’s logs.",
      "Cloudflare suggests running long processes in the background with status polling instead of one long request.",
      "Or serve long-running endpoints from a subdomain that isn’t proxied (DNS-only); Enterprise plans can raise the timeout.",
    ],
    clientStatus:
      "Client Status waits at most 20 seconds (10 by default), far less than Cloudflare’s 125, so it doesn’t see the 524 itself: a check against a page that slow times out, and a timeout is inconclusive, left out of the uptime figure without opening an incident. Pages that answer but take over 3 seconds mark the site as degraded after two slow checks in a row.",
    probes: [{ probe: { check: "uptime", error: "TimeoutError" }, expect: "inconclusive" }],
    tool: null,
    related: ["http-504-gateway-timeout", "cloudflare-error-522"],
    platforms: [],
    sources: [cf(524), "https://developers.cloudflare.com/fundamentals/reference/connection-limits/"],
  }),
  cloudflare(525, "SSL handshake failed", {
    description:
      "Cloudflare error 525 means the HTTPS handshake between Cloudflare and the server failed. Why it happens in Full and Full (strict) mode and how to fix it.",
    meaning:
      "With Cloudflare’s SSL mode set to Full or Full (strict), Cloudflare connects to the origin over HTTPS, and that handshake failed.",
    causes: [
      {
        title: "No valid certificate on the server",
        text: "The origin has no certificate installed, often after a migration or when the site was only ever reached through Cloudflare.",
      },
      {
        title: "Port 443 isn’t open",
        text: "The server or its firewall doesn’t accept HTTPS connections.",
      },
      {
        title: "No SNI or no shared cipher",
        text: "The server doesn’t support SNI, or none of its ciphers match Cloudflare’s.",
      },
    ],
    fixes: [
      "Install a certificate on the server; a free Cloudflare Origin CA certificate works for this connection.",
      "Make sure port 443 is open and the server answers HTTPS for the site’s hostname.",
      "If 525s come and go, read the server’s TLS error logs at those times.",
    ],
    clientStatus:
      "The SSL check sees the certificate Cloudflare shows visitors, which is usually fine, so it won’t flag a problem between Cloudflare and your server. The uptime check sees the 525 page itself: it’s a server error, so it counts as a failed check and opens a downtime incident after two.",
    probes: [{ probe: { check: "uptime", status: 525 }, expect: "failure" }],
    tool: null,
    related: ["cloudflare-error-526", "err-ssl-protocol-error"],
    platforms: [],
    sources: [cf(525), CF_SSL_MODES],
  }),
  cloudflare(526, "Invalid SSL certificate", {
    description:
      "Cloudflare error 526 means the certificate on the server behind Cloudflare is expired, self-signed or for the wrong name. How to fix it and how it gets caught.",
    meaning:
      "With Cloudflare’s SSL mode set to Full (strict), Cloudflare couldn’t validate the certificate on the origin server: it’s expired, self-signed, for the wrong name or missing its chain.",
    causes: [
      {
        title: "The origin certificate expired",
        text: "Visitors never see the origin certificate, so when its renewal stops nobody notices until Cloudflare refuses it.",
      },
      {
        title: "A self-signed certificate",
        text: "Fine in Full mode, but Full (strict) requires a certificate Cloudflare can trust.",
      },
      {
        title: "Wrong name or missing chain",
        text: "The hostname isn’t in the certificate, or the server doesn’t send its intermediate certificates.",
      },
    ],
    fixes: [
      "Renew or replace the certificate on the server, with the full chain and the right hostnames.",
      "Use a free Cloudflare Origin CA certificate if the server is only reached through Cloudflare.",
      "Cloudflare lists switching to Full as a quick fix; it stops checking the origin certificate, so treat it as temporary.",
    ],
    clientStatus:
      "Visitors and the SSL check both see Cloudflare’s valid certificate, while the expired one sits on the server, so Client Status can’t warn you before the origin certificate expires. It does catch the outage: the uptime check gets the 526 page, a server error, and opens a downtime incident after two failed checks.",
    probes: [{ probe: { check: "uptime", status: 526 }, expect: "failure" }],
    tool: null,
    related: ["cloudflare-error-525", "err-cert-date-invalid"],
    platforms: [],
    sources: [cf(526), CF_SSL_MODES],
  }),
];

export const ERROR_GROUPS: readonly { id: ErrorGroup; title: string; intro: string }[] = [
  {
    id: "certificate",
    title: "Certificate and HTTPS errors",
    intro: "What browsers show when a site’s certificate or secure connection fails.",
  },
  {
    id: "connection",
    title: "DNS, connection and redirect errors",
    intro: "When the browser can’t find the site, can’t connect, or goes round in circles.",
  },
  {
    id: "http",
    title: "HTTP status codes",
    intro: "Errors the site’s own server answers with.",
  },
  {
    id: "cloudflare",
    title: "Cloudflare 52x errors",
    intro: "Cloudflare answering for a server behind it that failed.",
  },
];

export const ERRORS_HUB: PageSeo = {
  title: "Website error glossary for agencies",
  description:
    "Browser, HTTP and Cloudflare errors on client sites: what each means, the likely causes, how to fix it, and how Client Status classifies it, from its own code.",
  path: "/errors",
};

export function getError(slug: string): ErrorEntry | undefined {
  return ERRORS.find((e) => e.slug === slug);
}

export function errorPages(): SitemapPage[] {
  return [
    { path: ERRORS_HUB.path, lastModified: VERIFIED },
    ...ERRORS.map((e) => ({ path: e.seo.path, lastModified: e.verifiedAt })),
  ];
}

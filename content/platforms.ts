import type { PageSeo, SitemapPage } from "@/lib/seo";

// /for/[platform] (docs/pseo-plan.md §5.2). Platform facts come from each platform's own help or
// developer docs, listed in `sources` and read on `verifiedAt`; nothing is filled from memory.
// Product claims match the code: Client Status checks from outside (status codes, certificates,
// RDAP, a polite crawl). It never logs into a CMS, runs updates or reads page text for errors.

export type Platform = {
  slug: string;
  name: string;
  seo: PageSeo;
  heading: string;
  intro: string;
  /** Platform-specific ways client sites break, from the platform's docs. */
  failures: { title: string; text: string }[];
  /** What Client Status catches on this platform, and how. */
  catches: string[];
  /** What it doesn't do here (and what to use instead). */
  limits: string[];
  /** How agencies package care for this platform: practical suggestions, not platform facts. */
  packaging: string[];
  alternatives: string[];
  templates: string[];
  sources: string[];
  verifiedAt: string;
};

const VERIFIED = "2026-11-22";

const DOWN_SETTING =
  "Each site has a “What counts as down” setting: server errors and failed connections by default, or any error status.";

export const PLATFORMS: readonly Platform[] = [
  {
    slug: "wordpress",
    name: "WordPress",
    seo: {
      title: "Website monitoring for WordPress sites",
      description:
        "Monitor client WordPress sites from outside: catch update-related critical errors, broken permalinks, expiring certificates and domains, with monthly reports.",
      path: "/for/wordpress",
    },
    heading: "Monitoring client WordPress sites",
    intro:
      "Self-hosted WordPress puts updates, plugins and the certificate in different hands: WordPress core, dozens of plugin authors and the host. Client Status watches the result from the outside, the way a visitor sees it.",
    failures: [
      {
        title: "An update takes the front end down",
        text: "Minor core releases install automatically by default, and since WordPress 5.5 admins can switch on automatic updates plugin by plugin; they run twice a day via WP-Cron. When an update causes a fatal PHP error, visitors see “There has been a critical error on this website.” Recovery mode only pauses the faulty plugin for the admin’s own session, and its email can fail to arrive.",
      },
      {
        title: "Permalinks change and old links break",
        text: "WordPress’s own documentation calls permalinks permanent and says they should never be changed. Renaming a slug or switching the permalink structure leaves old links, in menus, posts and other sites, pointing at nothing.",
      },
      {
        title: "The certificate belongs to the host",
        text: "WordPress works over HTTPS once a certificate is installed on the web server; WordPress itself doesn’t issue or renew it. If the host’s renewal stops, nothing in the dashboard says so until visitors get a browser warning.",
      },
      {
        title: "Site Health stops at the dashboard",
        text: "Tools › Site Health checks things like the PHP version, background updates, HTTPS and loopback requests. It doesn’t check broken links, certificate expiry or the domain’s registration.",
      },
    ],
    catches: [
      "The default critical-error page is sent with HTTP 500, so a broken update counts as a failure; after two failed checks in a row your team gets one email.",
      "Broken links left by changed slugs, found in the weekly audit with the page each one is on.",
      "Certificate expiry warnings 30, 14, 7 and 1 days ahead, whoever the host is.",
      "Domain expiry from the registry, where the registry publishes it.",
    ],
    limits: [
      "A custom php-error.php template may not send a 500 status; if it answers 200, a status check can’t tell the page is an error.",
      "It doesn’t log into wp-admin, run updates, take backups or read Site Health. Pair it with a management tool for that.",
      "It doesn’t check plugins for known vulnerabilities.",
    ],
    packaging: [
      "Keep updates and backups in a WordPress management tool, and use outside monitoring as the check that the update didn’t break anything.",
      "Schedule automatic plugin updates for a time your team is around, so an alert arrives while someone can act on it.",
      "Put the monthly report next to your update log in the same email: what you changed, and proof the site stayed up.",
    ],
    alternatives: ["managewp", "mainwp", "infinitewp"],
    templates: ["website-maintenance-report-template", "website-care-plan-report"],
    sources: [
      "https://developer.wordpress.org/advanced-administration/upgrade/upgrading/",
      "https://wordpress.org/documentation/article/plugins-themes-auto-updates/",
      "https://wordpress.org/documentation/article/recovery-mode/",
      "https://wordpress.org/documentation/article/customize-permalinks/",
      "https://developer.wordpress.org/advanced-administration/security/https/",
      "https://wordpress.org/documentation/article/site-health-screen/",
      "https://developer.wordpress.org/reference/classes/wp_fatal_error_handler/display_default_error_template/",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "webflow",
    name: "Webflow",
    seo: {
      title: "Website monitoring for Webflow sites",
      description:
        "Monitor client Webflow sites: catch lapsed site plans, SSL that can’t renew after DNS changes, broken links after slug edits, and domains about to expire.",
      path: "/for/webflow",
    },
    heading: "Monitoring client Webflow sites",
    intro:
      "Webflow hosts the site and issues its certificate, so a lot is handled for you. What remains is everything that depends on DNS, billing and edits, and that’s where client sites quietly break.",
    failures: [
      {
        title: "SSL renews only while DNS points at Webflow",
        text: "Webflow renews certificates automatically, but only while the domain’s DNS points at Webflow and the site loads from its servers. CAA records have to allow Webflow’s certificate providers, or the certificate can fail to issue or renew.",
      },
      {
        title: "A cancelled site plan unpublishes the site",
        text: "When a site plan is cancelled, Webflow removes the custom domains at the end of the billing period and the site is unpublished. Cancelling immediately takes it offline straight away.",
      },
      {
        title: "Old DNS records block publishing",
        text: "Since 13 January 2026, Webflow blocks publishing to custom domains still pointing at its legacy DNS records. The live site stays up, but new changes can’t go out until the records are updated.",
      },
      {
        title: "Changed URLs need a manual 301",
        text: "Titles and meta descriptions are set per page, and Webflow’s SEO checklist says to set up a 301 redirect whenever you change a URL. Without one, links to the old address break.",
      },
    ],
    catches: [
      `A lapsed plan or moved domain stops the site loading on its address; uptime checks catch it. ${DOWN_SETTING}`,
      "Certificates that stop renewing after a DNS change, with warnings 30, 14, 7 and 1 days before expiry.",
      "Broken links and pages without a title or meta description, in the weekly audit.",
      "Domain expiry from the registry; Webflow’s certificate doesn’t help if the domain itself lapses.",
    ],
    limits: [
      "It can’t see the legacy-DNS publishing block: the live site keeps working, so nothing fails from outside.",
      "It doesn’t see Webflow billing, the Designer or form submissions.",
      "It doesn’t render JavaScript, so content added only by scripts isn’t audited.",
    ],
    packaging: [
      "Agree who holds the site plan and card before launch; a lapsed plan is the most common way a Webflow site disappears.",
      "Keep a redirect list per site and add to it whenever a slug changes.",
      "Include DNS and CAA checks in your handover checklist for every new domain.",
    ],
    alternatives: ["oh-dear", "uptimerobot"],
    templates: ["monthly-website-report-for-clients", "ssl-certificate-report"],
    sources: [
      "https://help.webflow.com/hc/en-us/articles/33961362849811-SSL-hosting",
      "https://help.webflow.com/hc/en-us/articles/33961341714835-Why-does-my-domain-show-an-error-status",
      "https://help.webflow.com/hc/en-us/articles/40102090399635-Webflow-Refund-Policy",
      "https://help.webflow.com/hc/en-us/articles/46207072138131-What-happens-if-I-don-t-update-my-DNS-settings-by-the-deadline",
      "https://university.webflow.com/resources/checklists/seo-checklist",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "shopify",
    name: "Shopify",
    seo: {
      title: "Website monitoring for Shopify stores",
      description:
        "Monitor client Shopify stores from outside: frozen stores, certificates stuck after DNS or Cloudflare changes, broken product links and domain renewals.",
      path: "/for/shopify",
    },
    heading: "Monitoring client Shopify stores",
    intro:
      "Shopify runs the hosting, checkout and certificates. Stores still go dark for reasons outside the code: billing, domains, DNS and URL changes. Client Status watches the storefront the way a shopper reaches it.",
    failures: [
      {
        title: "Unpaid bills freeze the store",
        text: "Customers can’t view a frozen store, and when a store is frozen or deactivated its custom domains are disconnected. Paused stores keep the storefront up but turn off checkout.",
      },
      {
        title: "Certificates stay pending after DNS changes",
        text: "Shopify issues certificates automatically once the A and www CNAME records point at it, which can take up to 48 hours. Shopify doesn’t support Cloudflare’s proxy, and CAA records must allow letsencrypt.org, pki.goog and ssl.com, or the certificate can’t be issued.",
      },
      {
        title: "Changed handles break links",
        text: "When a product, collection or page URL changes, the redirect is something you create in Content › Menus › URL redirects. Redirects only work from addresses that return 404.",
      },
      {
        title: "Third-party domains renew elsewhere",
        text: "Domains bought outside Shopify are paid for and renewed at that provider. Shopify-managed domains renew 14 days before expiry, if auto-renew is on and the account is active.",
      },
    ],
    catches: [
      `A frozen store or disconnected domain stops the storefront loading on its address; uptime checks catch it. ${DOWN_SETTING}`,
      "Certificate problems after a DNS or proxy change, and expiry warnings 30, 14, 7 and 1 days ahead.",
      "Broken product and collection links in the weekly audit, with the page each is on.",
      "Domain expiry for third-party domains, where the registry publishes the date.",
    ],
    limits: [
      "It doesn’t test checkout, payments, orders or apps; a paused store with checkout off still looks up from outside.",
      "While a store is password-protected, checks and audits only see the password page.",
      "If bot protection challenges a check, it’s marked inconclusive and shown as a gap, never counted as up or down.",
    ],
    packaging: [
      "Add every client store once it’s public; before that, the password page is all there is to monitor.",
      "Note who renews the domain for each store: the client’s registrar or Shopify.",
      "Point clients to Shopify’s status page for platform-wide incidents, and to your report for their store.",
    ],
    alternatives: ["uptimerobot", "statuscake"],
    templates: ["broken-links-report", "uptime-report-template"],
    sources: [
      "https://help.shopify.com/en/manual/domains/managing-domains/secure-connections.md",
      "https://help.shopify.com/en/manual/domains/troubleshoot-issues-with-domains.md",
      "https://help.shopify.com/en/manual/domains/add-a-domain/connecting-domains.md",
      "https://help.shopify.com/en/manual/domains/managing-domains/renewing-shopify-managed-domains.md",
      "https://help.shopify.com/en/manual/your-account/manage-billing/billing-charges/frozen-store.md",
      "https://help.shopify.com/en/manual/your-account/manage-orgs-and-stores/manage-pricing-plan/deactivate-store.md",
      "https://help.shopify.com/en/manual/online-store/menus-and-links/url-redirect.md",
      "https://help.shopify.com/en/manual/online-store/themes/password-page.md",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "squarespace",
    name: "Squarespace",
    seo: {
      title: "Website monitoring for Squarespace sites",
      description:
        "Monitor client Squarespace sites: catch certificates blocked by CAA records or DNS changes on third-party domains, broken links and domain renewals in time.",
      path: "/for/squarespace",
    },
    heading: "Monitoring client Squarespace sites",
    intro:
      "Squarespace issues and renews certificates for you, but only for domains it can reach. With third-party domains, the DNS records and the renewal live somewhere else, and that’s where problems start.",
    failures: [
      {
        title: "Certificates depend on DNS records you don’t control",
        text: "Squarespace protects connected domains with free Let’s Encrypt certificates that refresh every 90 days, once the domain points correctly at Squarespace. A third-party domain needs a verification CNAME, a www CNAME and four A records; Squarespace allows up to 48 hours for it to connect.",
      },
      {
        title: "CAA records can block the certificate",
        text: "If the domain provider uses CAA restrictions, the certificate authority can’t issue a certificate until a CAA record allows letsencrypt.org.",
      },
      {
        title: "No third-party certificates",
        text: "Squarespace doesn’t install third-party certificates. Moving a domain away from another SSL provider, such as a CDN, means HTTPS is unavailable while DNS changes and the new certificate is generated.",
      },
    ],
    catches: [
      "Certificates that fail to renew after a DNS or CAA change, with warnings 30, 14, 7 and 1 days before expiry.",
      `The site not loading on its address after DNS changes; uptime checks catch it. ${DOWN_SETTING}`,
      "Domain expiry for domains registered outside Squarespace, where the registry publishes the date.",
      "Broken links and missing titles or descriptions, in the weekly audit.",
    ],
    limits: [
      "It doesn’t see Squarespace billing or the editor.",
      "It doesn’t render JavaScript, so content added only by scripts isn’t audited.",
    ],
    packaging: [
      "Write down where each client’s domain is registered and who can change its DNS; most Squarespace SSL issues start there.",
      "Check CAA records once when you connect a domain, and again if the client changes DNS provider.",
      "Use the monthly report’s dates to remind clients of renewals they pay for themselves.",
    ],
    alternatives: ["uptimerobot", "hetrixtools"],
    templates: ["ssl-certificate-report", "monthly-website-report-for-clients"],
    sources: [
      "https://support.squarespace.com/hc/en-us/articles/205815898-Understanding-SSL-certificates",
      "https://support.squarespace.com/hc/en-us/articles/360028492471-Troubleshooting-SSL",
      "https://support.squarespace.com/hc/en-us/articles/360035485391-DNS-records-for-connecting-third-party-domains",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "wix",
    name: "Wix",
    seo: {
      title: "Website monitoring for Wix sites",
      description:
        "Monitor client Wix sites: catch an expired plan or domain taking the site off its address, SSL warnings from missing DNS records and broken blog links.",
      path: "/for/wix",
    },
    heading: "Monitoring client Wix sites",
    intro:
      "On Wix, the plan, the domain and the DNS records each decide whether the site shows up on its own address. Any of them can lapse or change without the site itself changing at all.",
    failures: [
      {
        title: "An ended plan moves the site off its domain",
        text: "When a Premium plan ends, the site’s address reverts to the free Wix URL and Wix ads appear. Cancelling the plan doesn’t cancel the domain, which renews separately.",
      },
      {
        title: "An expired Wix domain is disconnected",
        text: "Wix domains renew automatically. If one expires, there’s a grace period of about 30 days during which the domain is no longer connected to the site; some TLDs, such as .de, .fr and .nl, skip the grace period.",
      },
      {
        title: "Missing DNS records mean “Not secure”",
        text: "Wix generates the certificate once a domain is connected. With the pointing method, both the A record and the www CNAME are needed; without both, visitors can see a security warning. Wix doesn’t support DNS proxies such as Cloudflare for pointed domains.",
      },
      {
        title: "Blog posts don’t get automatic redirects",
        text: "Wix creates a 301 automatically when you change a page’s URL slug, but not for Wix Blog posts. Old blog links break unless you add the redirect yourself.",
      },
    ],
    catches: [
      `The site no longer loading on its domain after a plan or domain lapses; uptime checks catch it. ${DOWN_SETTING}`,
      "Domain expiry warnings before the domain is disconnected, where the registry publishes the date.",
      "Certificate problems from missing DNS records, and expiry warnings 30, 14, 7 and 1 days ahead.",
      "Broken blog links after a slug change, in the weekly audit.",
    ],
    limits: [
      "It doesn’t see Wix billing, ads or the editor.",
      "It doesn’t render JavaScript, so content that only appears after scripts run isn’t audited.",
    ],
    packaging: [
      "Track the plan renewal and the domain renewal as two separate dates for each client.",
      "Prefer connecting by name servers where you can; Wix can’t help with pointed-domain DNS problems.",
      "After a blog clean-up, run an audit before the next report so broken links don’t reach the client first.",
    ],
    alternatives: ["uptimerobot", "statuscake"],
    templates: ["website-care-plan-report", "broken-links-report"],
    sources: [
      "https://support.wix.com/en/article/canceling-a-wix-premium-or-studio-plan",
      "https://support.wix.com/en/article/domain-life-cycle",
      "https://support.wix.com/en/article/about-ssl-and-https",
      "https://support.wix.com/en/article/connecting-a-domain-to-wix-using-the-pointing-method",
      "https://support.wix.com/en/article/setting-up-a-301-redirect-for-a-page-on-your-site",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "framer",
    name: "Framer",
    seo: {
      title: "Website monitoring for Framer sites",
      description:
        "Monitor client Framer sites: catch SSL blocked by AAAA, CAA or proxy settings, broken links after slug changes, and domains that renew at another registrar.",
      path: "/for/framer",
    },
    heading: "Monitoring client Framer sites",
    intro:
      "Framer hosts the site and provisions and renews its certificates, but it doesn’t manage DNS or, in most cases, the domain. Those live with the registrar, and so do most of the problems.",
    failures: [
      {
        title: "Stray DNS records block the certificate",
        text: "Framer doesn’t support IPv6, so leftover AAAA records can prevent certificates from being issued. CAA records must allow Let’s Encrypt, ZeroSSL and Google Trust Services, and a Cloudflare proxy has to be set to DNS only.",
      },
      {
        title: "Redirects don’t follow slug changes",
        text: "If you change a page’s path in the canvas or CMS, Framer doesn’t update the redirect settings for you. Old links break until you add a redirect under Site Settings › Hosting › Redirects.",
      },
      {
        title: "The domain renews somewhere else",
        text: "Framer isn’t a domain registrar: domains stay with the client’s provider, which handles renewal. The exception is a free domain through Hover on a yearly plan, which renews automatically at the standard rate.",
      },
    ],
    catches: [
      "Certificates that fail after a DNS or CAA change, with warnings 30, 14, 7 and 1 days before expiry.",
      "Domain expiry at the registrar, where the registry publishes the date.",
      "Broken links after a slug change and pages missing a title or description, in the weekly audit.",
      `The site not loading on its domain; uptime checks catch it. ${DOWN_SETTING}`,
    ],
    limits: [
      "It doesn’t see Framer plans, billing or the editor.",
      "It doesn’t render JavaScript, so content that only appears after scripts run isn’t audited.",
    ],
    packaging: [
      "Clean up AAAA and extra A records when you connect a domain; it’s the most common reason SSL won’t issue.",
      "Keep a redirect list per site and add to it whenever a path changes.",
      "Ask clients who renews the domain, and put that date in the report.",
    ],
    alternatives: ["oh-dear", "updown-io"],
    templates: ["ssl-certificate-report", "broken-links-report"],
    sources: [
      "https://www.framer.com/help/articles/troubleshooting-custom-domain-issues/",
      "https://www.framer.com/help/articles/how-to-connect-a-custom-domain/",
      "https://www.framer.com/help/articles/how-to-setup-redirects-to-maintain-seo-ranking/",
      "https://www.framer.com/help/articles/is-framer-a-domain-registrar/",
    ],
    verifiedAt: VERIFIED,
  },
  {
    slug: "drupal",
    name: "Drupal",
    seo: {
      title: "Website monitoring for Drupal sites",
      description:
        "Monitor client Drupal sites around security release windows and major-version end of life: catch broken updates, broken aliases, SSL and domain expiry.",
      path: "/for/drupal",
    },
    heading: "Monitoring client Drupal sites",
    intro:
      "Drupal sites are updated on a schedule set by the security team, and each major version has a fixed end of life. Updates are when things break; Client Status tells you whether the site survived them.",
    failures: [
      {
        title: "Security releases come on Wednesdays",
        text: "Security release windows are every Wednesday for contributed projects and one Wednesday a month (usually the third) for core, between 16:00 and 22:00 UTC. Highly critical issues can be released outside the window.",
      },
      {
        title: "Updates aren’t unattended",
        text: "Automatic Updates is a contributed module, not part of core, and fully unattended updates during cron aren’t supported yet. Someone runs each update, and something can break when they do.",
      },
      {
        title: "Major versions reach end of life",
        text: "Drupal 7 reached end of life on 5 January 2025, and Drupal 10 does on 9 December 2026. Sites still on those versions stop getting security releases.",
      },
      {
        title: "Changed aliases break links",
        text: "Redirects when a URL alias changes come from the contributed Redirect module, which Pathauto can use to create them automatically. Without that, old links break.",
      },
    ],
    catches: [
      `A site that errors after an update; uptime checks catch it, and your team gets one email after two failed checks. ${DOWN_SETTING}`,
      "Broken links from changed aliases, in the weekly audit.",
      "Certificate expiry warnings 30, 14, 7 and 1 days ahead, and domain expiry where the registry publishes it.",
    ],
    limits: [
      "It doesn’t check which Drupal version or modules a site runs, or watch security advisories.",
      "It doesn’t run updates or composer; use your own deployment process for that.",
    ],
    packaging: [
      "Plan update time around the Wednesday windows and check the monitoring dashboard afterwards.",
      "Put each site’s Drupal major version and its end-of-life date in your client notes.",
      "Install Redirect (with Pathauto, if you use it) on every site before content editors start renaming pages.",
    ],
    alternatives: ["oh-dear", "uptimerobot"],
    templates: ["website-maintenance-report-template", "uptime-report-template"],
    sources: [
      "https://www.drupal.org/drupal-security-team/security-release-numbers-and-release-timing",
      "https://www.drupal.org/about/core/policies/core-release-cycles/schedule",
      "https://www.drupal.org/project/automatic_updates",
      "https://www.drupal.org/project/redirect",
    ],
    verifiedAt: VERIFIED,
  },
];

export const PLATFORMS_HUB: PageSeo = {
  title: "Website monitoring by platform",
  description:
    "How client sites on WordPress, Webflow, Shopify, Squarespace, Wix, Framer and Drupal break, what outside monitoring catches on each, and what it can’t see.",
  path: "/for",
};

export function getPlatform(slug: string): Platform | undefined {
  return PLATFORMS.find((p) => p.slug === slug);
}

export function platformPages(): SitemapPage[] {
  return [
    { path: PLATFORMS_HUB.path, lastModified: VERIFIED },
    ...PLATFORMS.map((p) => ({ path: p.seo.path, lastModified: p.verifiedAt })),
  ];
}

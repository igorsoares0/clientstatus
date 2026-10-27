import type { SVGProps } from "react";

// Icon rules (design README "Icons"): 24 viewBox, currentColor stroke 1.75,
// square caps, miter joins, 15–16px, aria-hidden. Only used in the sidebar nav,
// search fields and primary add/import buttons — never on headings, rows or statuses.

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className="shrink-0"
      {...props}
    >
      {children}
    </svg>
  );
}

export const OverviewIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </Icon>
);

export const WebsitesIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9" />
  </Icon>
);

export const ClientsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7" width="18" height="13" />
    <path d="M8.5 7V4h7v3M3 12.5h18" />
  </Icon>
);

export const IncidentsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 2.5 20h19L12 3.5z" />
    <path d="M12 10v4.5M12 17.2v.1" />
  </Icon>
);

export const ReportsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 2.5h8.5L19 7v14.5H6z" />
    <path d="M14 2.5V7.5h5M9 12.5h7M9 16.5h7" />
  </Icon>
);

export const TeamIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20.5c.7-3.6 3.3-5.8 6.5-5.8s5.8 2.2 6.5 5.8M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 15c1.9.9 3.1 2.8 3.5 5.5" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h11M18 6h3M3 12h4M11 12h10M3 18h12M19 18h2" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Icon>
);

export const BillingIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="5" width="19" height="14" />
    <path d="M2.5 10h19M6 15h4" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon size={15} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const UploadIcon = (p: IconProps) => (
  <Icon size={15} {...p}>
    <path d="M12 15V4M7 8.5 12 4l5 4.5M4 15v5h16v-5" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon size={15} {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </Icon>
);

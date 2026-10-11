const PATHS = {
  check: <><circle cx="12" cy="12" r="10" /><path d="m8 12.5 3 3 5-6" /></>,
  warn: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  xcircle: <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 11v6M12 7h.01" /></>,
  factory: <><path d="M3 21V10l6 4V10l6 4V6h6v15z" /><path d="M7 21v-3M12 21v-3M17 21v-3" /></>,
  truck: <><path d="M2 6h11v10H2zM13 10h4l4 3v3h-8z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  depot: <><path d="M3 10 12 4l9 6v10H3z" /><path d="M8 20v-6h8v6M8 17h8" /></>,
  pharmacy: <><rect x="3" y="3" width="18" height="18" /><path d="M12 8v8M8 12h8" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="4" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  report: <path d="M5 3v18M5 4h13l-3 4 3 4H5" />,
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M17 4a4 4 0 0 1 0 8M22 21v-2a5 5 0 0 0-3-4.6" /></>,
  box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8" /></>,
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0" />,
  plus: <path d="M12 5v14M5 12h14" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg className={`ic ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export const ROLE_ICON = { MANUFACTURER: "factory", IMPORTER: "factory", DISTRIBUTOR: "depot", CARRIER: "truck", PHARMACY: "pharmacy" } as const satisfies Record<string, IconName>;

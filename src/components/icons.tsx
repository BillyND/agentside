const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

type P = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, children: React.ReactNode, box = 20) => (
  <svg className={className} width={size} height={size} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">{children}</svg>
);

export const IconHistory = ({ size = 18, className }: P) =>
  svg(size, className, <><path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6" {...stroke} /><path d="M3.5 3.5v3h3" {...stroke} /><path d="M10 6.5V10l2.5 1.5" {...stroke} /></>);
export const IconNewChat = ({ size = 18, className }: P) =>
  svg(size, className, <><path d="M16.5 10A6.5 6.5 0 1 1 10 3.5" {...stroke} /><path d="M3.8 15.6 3 17l1.6-.6" {...stroke} /><path d="M15 2.5v5M12.5 5h5" {...stroke} /></>);
export const IconMore = ({ size = 18, className }: P) =>
  svg(size, className, <><circle cx="5" cy="10" r="1.2" fill="currentColor" /><circle cx="10" cy="10" r="1.2" fill="currentColor" /><circle cx="15" cy="10" r="1.2" fill="currentColor" /></>);
export const IconChevron = ({ size = 12, className }: P) => svg(size, className, <path d="M6 8l4 4 4-4" {...stroke} strokeWidth={1.8} />);
export const IconChevronRight = ({ size = 12, className }: P) => svg(size, className, <path d="M8 6l4 4-4 4" {...stroke} strokeWidth={1.8} />);
export const IconArrowUp = ({ size = 16, className }: P) => svg(size, className, <path d="M10 16V4M5 9l5-5 5 5" {...stroke} strokeWidth={2} />);
export const IconStop = ({ size = 12, className }: P) => svg(size, className, <rect x="4" y="4" width="12" height="12" rx="2.5" fill="currentColor" />);
export const IconFolder = ({ size = 14, className }: P) =>
  svg(size, className, <path d="M2.5 6A1.5 1.5 0 0 1 4 4.5h3.2l1.6 1.7H16A1.5 1.5 0 0 1 17.5 7.7v7.8A1.5 1.5 0 0 1 16 17H4a1.5 1.5 0 0 1-1.5-1.5z" {...stroke} />);
export const IconCheck = ({ size = 14, className }: P) => svg(size, className, <path d="M4.5 10.5l3.5 3.5 7.5-8" {...stroke} strokeWidth={1.8} />);
export const IconBack = ({ size = 16, className }: P) => svg(size, className, <path d="M12 4l-6 6 6 6" {...stroke} strokeWidth={1.8} />);
export const IconSearch = ({ size = 14, className }: P) => svg(size, className, <><circle cx="9" cy="9" r="5.5" {...stroke} /><path d="M13 13l4 4" {...stroke} /></>);
export const IconSettings = ({ size = 16, className }: P) =>
  svg(size, className, <><circle cx="10" cy="10" r="2.5" {...stroke} /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" {...stroke} /></>);

/** Mode button glyph: fast-forward when edits/actions are auto-approved. */
export const IconMode = ({ size = 18, className, auto }: P & { auto?: boolean }) =>
  auto
    ? svg(size, className, <><path d="M4 5.5l5 4.5-5 4.5z" {...stroke} /><path d="M10 5.5l5 4.5-5 4.5z" {...stroke} /></>)
    : svg(size, className, <><path d="M10 3l6 2.5v4.3c0 3.4-2.5 6.1-6 7.2-3.5-1.1-6-3.8-6-7.2V5.5z" {...stroke} /></>);

/** AgentDock mark: a docked node with orbiting satellites. */
export const Logo = ({ size = 28, className }: P) => (
  <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="5.2" fill="currentColor" />
    <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3.2 4.1" opacity="0.55" />
    <circle cx="27" cy="16" r="2.4" fill="currentColor" />
    <circle cx="10.5" cy="6.5" r="1.8" fill="currentColor" opacity="0.8" />
    <circle cx="10.5" cy="25.5" r="1.8" fill="currentColor" opacity="0.6" />
  </svg>
);

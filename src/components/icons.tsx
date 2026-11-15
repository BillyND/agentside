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

export const IconCopy = ({ size = 15, className }: P) =>
  svg(size, className, <><rect x="7" y="7" width="9.5" height="9.5" rx="2" {...stroke} /><path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6a1.5 1.5 0 0 0 1.5 1.5H7" {...stroke} /></>);
export const IconArrowDown = ({ size = 16, className }: P) => svg(size, className, <path d="M10 4v12M5 11l5 5 5-5" {...stroke} strokeWidth={1.8} />);
export const IconPlus = ({ size = 18, className }: P) => svg(size, className, <path d="M10 4v12M4 10h12" {...stroke} strokeWidth={1.7} />);
export const IconClose = ({ size = 12, className }: P) => svg(size, className, <path d="M5 5l10 10M15 5L5 15" {...stroke} strokeWidth={2} />);
export const IconMic = ({ size = 18, className }: P) =>
  svg(size, className, <><rect x="7.25" y="2.75" width="5.5" height="9.5" rx="2.75" {...stroke} /><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" {...stroke} /></>);

/** Mode glyph: hand = ask first, fast-forward = acts without asking, list = plan. */
export const IconMode = ({ size = 18, className, auto, plan }: P & { auto?: boolean; plan?: boolean }) => {
  if (plan) return svg(size, className, <><path d="M7 5.5h9M7 10h9M7 14.5h9" {...stroke} /><circle cx="3.8" cy="5.5" r="0.9" fill="currentColor" /><circle cx="3.8" cy="10" r="0.9" fill="currentColor" /><circle cx="3.8" cy="14.5" r="0.9" fill="currentColor" /></>);
  if (auto) return svg(size, className, <><path d="M3.5 5l5.5 5-5.5 5z" {...stroke} /><path d="M10 5l5.5 5-5.5 5z" {...stroke} /></>);
  return svg(size, className, <path d="M7 10V4.8a1.3 1.3 0 0 1 2.6 0V9m0-.5V3.8a1.3 1.3 0 0 1 2.6 0V9m0-.3V5a1.3 1.3 0 0 1 2.6 0v6.2c0 3.4-2.4 5.8-5.6 5.8-2 0-3.3-.9-4.4-2.4L3.3 11.4a1.3 1.3 0 0 1 2-1.6L7 11.5" {...stroke} />);
};

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

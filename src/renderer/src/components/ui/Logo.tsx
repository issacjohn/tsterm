export function Logo({ size = 30 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="logo-mark"
    >
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#0C0E0A" />
      <rect x="1.5" y="1.5" width="37" height="37" rx="9.5" stroke="#C9F45A" strokeOpacity="0.28" />
      <path
        d="M9.5 14.5L16 20L9.5 25.5"
        stroke="#EEF0E8"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19 25.5H27.5" stroke="#C9F45A" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="30" cy="10.5" r="2.1" fill="#C9F45A" />
    </svg>
  )
}

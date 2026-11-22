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
      <rect x="1" y="1" width="38" height="38" rx="11" fill="#101e26" stroke="#2b4b4e" />
      <path d="M1 11C1 5.477 5.477 1 11 1H29C34.523 1 39 5.477 39 11V12H1V11Z" fill="#152a30" />
      <path d="M11.5 14.5L18.5 20L11.5 25.5" stroke="#6EE7C8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 25.5H28.5" stroke="#E8F4F0" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="31.5" cy="9.5" r="2.4" fill="#F2B35C" />
      <circle cx="8.5" cy="9.5" r="1.6" fill="#6EE7C8" opacity="0.6" />
    </svg>
  )
}

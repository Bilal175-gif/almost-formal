export function Star({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`doodle ${className}`}
      viewBox="0 0 60 75"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m29 4-5 64M7 25l43 24M49 14 12 58 28 8l12 53L7 26l44-10-39 42"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function Smile({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`doodle smile ${className}`}
      viewBox="0 0 90 90"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M77 18C65 3 37 4 19 20 3 34 6 62 21 76c17 15 45 7 56-9 12-16 10-34 0-49Z"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="m32 29-1 13m22-15 1 13M24 50c9 24 30 24 40-2"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function ArrowDoodle({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`doodle ${className}`}
      viewBox="0 0 90 110"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M68 5c10 41-2 66-47 86m2-21L16 96l28-3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function Globe() {
  return (
    <svg
      className="doodle globe"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="48" stroke="currentColor" strokeWidth="3" />
      <ellipse
        cx="60"
        cy="60"
        rx="25"
        ry="48"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M12 60h96M60 12v96M18 35c25 12 58 12 84 0M18 85c25-12 58-12 84 0M30 20c-12 25-12 55 0 80M90 20c12 25 12 55 0 80"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
}

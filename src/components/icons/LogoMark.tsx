export default function LogoMark({
  className,
  size = 22,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle
        cx="11.5"
        cy="10.5"
        r="5.1"
        stroke="currentColor"
        strokeWidth="1.75"
        fill="color-mix(in oklab, currentColor 20%, transparent)"
      />
      <path
        d="M8.6 14.4c1.5 3.4 4.8 5.6 8.6 4.7-3.3-.6-6.1-2.4-8.6-4.7Z"
        fill="currentColor"
        opacity="0.42"
      />
    </svg>
  );
}

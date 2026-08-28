export default function SunMark({
  className,
  size = 20,
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
        cx="12"
        cy="12"
        r="4"
        stroke="currentColor"
        strokeWidth="1.75"
        fill="color-mix(in oklab, currentColor 20%, transparent)"
      />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 12 + Math.cos(rad) * 6.4;
        const y1 = 12 + Math.sin(rad) * 6.4;
        const x2 = 12 + Math.cos(rad) * 8.8;
        const y2 = 12 + Math.sin(rad) * 8.8;
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

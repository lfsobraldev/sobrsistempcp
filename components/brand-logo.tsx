export function BrandLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`sobral-logo ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-label="Sobral"
      role="img"
    >
      S
    </span>
  );
}

import { DoorMark } from "@/components/door-art";

export function BrandLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return <DoorMark size={size} className={`sobral-logo ${className}`.trim()} />;
}

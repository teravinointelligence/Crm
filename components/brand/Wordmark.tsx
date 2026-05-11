import { cn } from "@/lib/utils";

type Props = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};

export function Wordmark({ size = "md", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-display font-semibold tracking-[0.18em] text-brand-carmesi",
        sizes[size],
        className,
      )}
      aria-label="TERAVINO"
    >
      TERAVINO
      <span className="ml-1 inline-block h-1.5 w-1.5 -translate-y-[2px] rounded-full bg-brand-oro" />
    </span>
  );
}

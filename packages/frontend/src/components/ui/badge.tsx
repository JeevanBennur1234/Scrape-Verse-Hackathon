import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]",
  {
    variants: {
      tone: {
        default: "border-border text-muted-foreground",
        healthy: "border-healthy/30 text-healthy",
        degraded: "border-degraded/30 text-degraded",
        failed: "border-failed/30 text-failed",
        healing: "border-healing/30 text-healing",
        simulated: "border-simulated/30 text-simulated",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}

export function statusTone(status: string): NonNullable<VariantProps<typeof badgeVariants>["tone"]> {
  switch (status) {
    case "HEALTHY":
    case "RECOVERED":
      return "healthy";
    case "DEGRADED":
    case "GRADED":
      return "degraded";
    case "FAILING":
    case "ESCALATED":
    case "DETECTED":
      return "failed";
    case "HEALING":
      return "healing";
    case "PENDING_SETUP":
      return "default";
    default:
      return "default";
  }
}

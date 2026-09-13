import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { UserRole } from "@/lib/auth/session";

const planConfig: Record<UserRole, { tone: BadgeTone; label: string }> = {
  free: { tone: "neutral", label: "FREE" },
  premium: { tone: "success", label: "PRO" },
};

export function PlanBadge({
  role,
  className = "",
}: {
  role: UserRole | null;
  className?: string;
}) {
  if (!role) {
    return (
      <Badge tone="neutral" className={["text-[10px] tracking-wider uppercase", className].join(" ")}>
        —
      </Badge>
    );
  }
  const { tone, label } = planConfig[role];
  return (
    <Badge tone={tone} className={["text-[10px] tracking-wider uppercase", className].join(" ")}>
      {label}
    </Badge>
  );
}

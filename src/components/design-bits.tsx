import { FileText } from "lucide-react";
import { Badge } from "./ui";

const labels: Record<string, [string, "neutral" | "brass" | "olive" | "clay"]> =
  {
    DRAFT: ["Internal draft", "neutral"],
    PENDING: ["Waiting for approval", "brass"],
    APPROVED: ["Approved", "olive"],
    CHANGES_REQUESTED: ["Changes requested", "clay"],
  };

export function DesignStatusBadge({ status }: { status: string }) {
  const [label, tone] = labels[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function DesignThumb({
  url,
  type,
  title,
}: {
  url: string;
  type: string;
  title: string;
}) {
  if (type === "pdf") {
    return (
      <a
        href={url}
        target="_blank"
        className="grid aspect-[4/3] w-full place-items-center rounded-lg bg-ivory text-muted hover:text-brass"
      >
        <span className="flex flex-col items-center gap-1 text-sm font-semibold">
          <FileText size={32} />
          Open PDF
        </span>
      </a>
    );
  }
  return (
    <a href={url} target="_blank">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={title}
        className="aspect-[4/3] w-full rounded-lg object-cover"
      />
    </a>
  );
}

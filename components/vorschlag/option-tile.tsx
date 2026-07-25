import { cn } from "@/lib/utils";

export function OptionTile({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[64px] rounded-lg border p-4 text-sm font-medium text-center transition-colors flex items-center justify-center",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-input hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

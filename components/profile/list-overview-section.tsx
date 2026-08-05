import { ListOverviewRow } from "@/components/profile/list-overview-row";
import { GuestProfileCta } from "@/components/profile/guest-profile-cta";
import { NewListPicker } from "@/components/profile/new-list-picker";
import type { ListOverviewRowData } from "@/lib/list-overview";

/** The "kuratierte Listen" grid -- same rendering on a foreign profile visit and on the owner's own My Taste tab. */
export function ListOverviewSection({
  rows,
  isGuest,
  isOwner,
}: {
  rows: ListOverviewRowData[];
  isGuest: boolean;
  isOwner: boolean;
}) {
  return (
    <div className="w-full flex flex-col gap-2">
      {rows.map((row) => (
        <ListOverviewRow
          key={row.key}
          title={row.title}
          icon={row.icon}
          preview={row.preview}
          itemCount={row.itemCount}
          noteCount={row.noteCount}
          savedCount={row.savedCount}
          href={row.href}
          shareUrl={row.href}
          tier={row.tier}
          tierProgressLabel={row.tierProgress}
          isCurrentLocation={row.isCurrentLocation}
          statsText={row.statsText}
          hasTip={row.hasTip}
        />
      ))}
      {isGuest && <GuestProfileCta variant="row" />}
      {isOwner && <NewListPicker />}
    </div>
  );
}

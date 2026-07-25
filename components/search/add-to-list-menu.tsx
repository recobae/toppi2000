"use client";

import Link from "next/link";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ListSummary = {
  id: string;
  title: string;
  category: string;
};

export function filterListsForMediaType(
  lists: ListSummary[],
  mediaType: "movie" | "tv",
): ListSummary[] {
  return lists.filter(
    (list) => list.category === mediaType || list.category === "watchlist",
  );
}

export function AddToListMenu({
  isLoggedIn,
  isLoadingLists,
  lists,
  addingListId,
  onAdd,
}: {
  isLoggedIn: boolean;
  isLoadingLists: boolean;
  lists: ListSummary[];
  addingListId: string | null;
  onAdd: (list: ListSummary) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="w-full">
          <ListPlus />
          Zur Liste hinzufügen
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {!isLoggedIn ? (
          <DropdownMenuItem asChild>
            <Link href="/auth/login">Zum Hinzufügen anmelden</Link>
          </DropdownMenuItem>
        ) : isLoadingLists ? (
          <DropdownMenuItem disabled>Listen werden geladen…</DropdownMenuItem>
        ) : lists.length === 0 ? (
          <DropdownMenuItem disabled>Keine Listen gefunden</DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuLabel>Liste auswählen</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {lists.map((list) => (
              <DropdownMenuItem
                key={list.id}
                disabled={addingListId === list.id}
                onSelect={() => onAdd(list)}
              >
                {addingListId === list.id ? "Wird hinzugefügt…" : list.title}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

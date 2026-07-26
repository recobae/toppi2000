"use client";

import Link from "next/link";
import { ListPlus, Star } from "lucide-react";
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
  preselectedListId,
}: {
  isLoggedIn: boolean;
  isLoadingLists: boolean;
  lists: ListSummary[];
  addingListId: string | null;
  onAdd: (list: ListSummary) => void;
  preselectedListId?: string | null;
}) {
  const sortedLists = preselectedListId
    ? [...lists].sort((a, b) => {
        if (a.id === preselectedListId) return -1;
        if (b.id === preselectedListId) return 1;
        return 0;
      })
    : lists;

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
            {sortedLists.map((list) => {
              const isPreselected = list.id === preselectedListId;
              return (
                <DropdownMenuItem
                  key={list.id}
                  disabled={addingListId === list.id}
                  onSelect={() => onAdd(list)}
                  className={isPreselected ? "font-semibold" : undefined}
                >
                  {isPreselected && <Star className="size-3.5 fill-current" />}
                  {addingListId === list.id ? "Wird hinzugefügt…" : list.title}
                  {isPreselected && (
                    <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                      Empfohlen
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

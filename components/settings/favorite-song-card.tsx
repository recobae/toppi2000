"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Music2, Pause, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SongResult } from "@/lib/itunes";

const SEARCH_DEBOUNCE_MS = 400;

export type FavoriteSong = {
  title: string;
  artist: string | null;
  previewUrl: string;
  artworkUrl: string | null;
};

/**
 * Search-and-pick UI for the favorite-song-snippet feature: debounced
 * search against /api/settings/song-search, optional preview-in-list
 * playback, single-song save straight to profiles (mirrors the notes-
 * visibility card's "save immediately on pick" pattern, not the
 * username/home-city forms' separate-submit pattern -- there's no
 * meaningful "draft" state for a song pick).
 */
export function FavoriteSongCard({
  userId,
  initialSong,
}: {
  userId: string;
  initialSong: FavoriteSong | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [current, setCurrent] = useState<FavoriteSong | null>(initialSong);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/settings/song-search?q=${encodeURIComponent(term)}`);
        if (response.ok && !cancelled) {
          const data: { results: SongResult[] } = await response.json();
          setResults(data.results);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  const togglePreview = (song: SongResult) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (previewingId === song.id) {
      audio.pause();
      setPreviewingId(null);
      return;
    }
    audio.src = song.previewUrl;
    audio.play().catch(() => {});
    setPreviewingId(song.id);
  };

  const handleSelect = async (song: SongResult) => {
    audioRef.current?.pause();
    setPreviewingId(null);
    setIsSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        favorite_song_title: song.title,
        favorite_song_artist: song.artist,
        favorite_song_preview_url: song.previewUrl,
        favorite_song_artwork_url: song.artworkUrl,
        favorite_song_updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      setMessage("Song konnte nicht gespeichert werden.");
    } else {
      setCurrent({
        title: song.title,
        artist: song.artist,
        previewUrl: song.previewUrl,
        artworkUrl: song.artworkUrl,
      });
      setMessage("Gespeichert!");
      setQuery("");
      setResults([]);
    }
    setIsSaving(false);
  };

  const handleRemove = async () => {
    setIsSaving(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        favorite_song_title: null,
        favorite_song_artist: null,
        favorite_song_preview_url: null,
        favorite_song_artwork_url: null,
        favorite_song_updated_at: null,
      })
      .eq("id", userId);

    if (error) {
      setMessage("Konnte nicht entfernt werden.");
    } else {
      setCurrent(null);
      setMessage("Entfernt.");
    }
    setIsSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Lieblingssong</CardTitle>
        <CardDescription>
          Wird als Ausschnitt abgespielt, wenn jemand auf dein Profilbild tippt.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {current && (
          <div className="flex items-center gap-3 rounded-md border border-input px-3 py-2">
            {current.artworkUrl ? (
              <Image
                src={current.artworkUrl}
                alt=""
                width={40}
                height={40}
                className="rounded shrink-0"
              />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                <Music2 className="size-4 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{current.title}</p>
              {current.artist && (
                <p className="text-xs text-muted-foreground truncate">{current.artist}</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={handleRemove}
            >
              Entfernen
            </Button>
          </div>
        )}

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Titel oder Künstler suchen…"
        />

        {isSearching && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Suche…
          </div>
        )}

        {results.length > 0 && (
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
            {results.map((song) => (
              <div
                key={song.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent"
              >
                <button
                  type="button"
                  onClick={() => togglePreview(song)}
                  aria-label={previewingId === song.id ? "Pause" : `${song.title} anhören`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-input"
                >
                  {previewingId === song.id ? (
                    <Pause className="size-3.5" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                </button>
                {song.artworkUrl ? (
                  <Image
                    src={song.artworkUrl}
                    alt=""
                    width={32}
                    height={32}
                    className="rounded shrink-0"
                  />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
                    <Music2 className="size-3.5 text-muted-foreground" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleSelect(song)}
                  disabled={isSaving}
                  className="min-w-0 flex-1 text-left disabled:opacity-50"
                >
                  <p className="text-sm font-medium truncate">{song.title}</p>
                  {song.artist && (
                    <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
      <audio ref={audioRef} onEnded={() => setPreviewingId(null)} className="hidden" />
    </Card>
  );
}

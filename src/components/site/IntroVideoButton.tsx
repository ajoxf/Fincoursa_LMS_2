"use client";
import { useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { brand } from "./brand";

// Set NEXT_PUBLIC_INTRO_PLAYBACK_ID to a *public* Mux playback ID for the marketing intro video.
const playbackId = process.env.NEXT_PUBLIC_INTRO_PLAYBACK_ID;

/** Large rounded poster under the hero with a play button; plays the intro video inline. */
export function IntroVideo() {
  const [playing, setPlaying] = useState(false);
  const poster = playbackId ? `https://image.mux.com/${playbackId}/thumbnail.webp?width=1600&time=3` : brand.heroPoster;

  if (playing && playbackId) {
    return (
      <div className="overflow-hidden rounded-xl bg-black">
        <MuxPlayer playbackId={playbackId} autoPlay streamType="on-demand" accentColor="#d6fd3b" metadata={{ video_title: "FinCoursa intro" }} />
      </div>
    );
  }
  return (
    <div className="relative aspect-[1080/608] overflow-hidden rounded-xl bg-[#1a1410]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-black/35" />
      {playbackId && (
        <button onClick={() => setPlaying(true)} aria-label="Watch intro video"
          className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 transition hover:scale-105 hover:bg-white">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden><path d="M6 3.5v15l13-7.5z" fill="#2b1d12" /></svg>
        </button>
      )}
    </div>
  );
}

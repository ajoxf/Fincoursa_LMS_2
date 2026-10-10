"use client";
import { useState } from "react";
import MuxPlayer from "@mux/mux-player-react";

// Set NEXT_PUBLIC_INTRO_PLAYBACK_ID to a *public* Mux playback ID for the marketing intro video.
const playbackId = process.env.NEXT_PUBLIC_INTRO_PLAYBACK_ID;

export function IntroVideoButton() {
  const [open, setOpen] = useState(false);
  if (!playbackId) return <span className="text-sm text-on-dark/60">▶ Watch Intro Video</span>;
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-sm font-semibold underline-offset-4 hover:underline">▶ Watch Intro Video</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <MuxPlayer playbackId={playbackId} autoPlay streamType="on-demand" metadata={{ video_title: "FinCoursa intro" }} />
          </div>
        </div>
      )}
    </>
  );
}

"use client";
import MuxPlayer from "@mux/mux-player-react";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { notifyLessonCompleted } from "@/app/actions/progress";

const BEAT_SECONDS = 15;

/**
 * Signed Mux playback + server-side progress tracking.
 * Only seconds actually played (not seeked) count toward completion; the server caps each beat.
 */
export function VideoLesson({ lessonId, courseId, playbackId, tokens, startAt, track, watermark, title, viewerId }: {
  lessonId: string; courseId: string; playbackId: string; tokens: Record<string, string | undefined>; startAt: number;
  track: boolean; watermark?: string; title: string; viewerId?: string;
}) {
  const router = useRouter();
  const watched = useRef(0);
  const lastTime = useRef<number | null>(null);
  const position = useRef(startAt);
  const completed = useRef(false);

  const flush = useCallback(async () => {
    if (!track) return;
    const delta = Math.round(watched.current);
    if (delta <= 0) return;
    watched.current -= delta;
    const { data } = await createClient().rpc("record_video_progress", {
      p_lesson: lessonId, p_position: Math.floor(position.current), p_delta_seconds: delta,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.completed && !completed.current) {
      completed.current = true;
      if (Number(row.progress_pct) >= 100) notifyLessonCompleted(courseId);
      router.refresh(); // update the sidebar tick and progress bar
    }
  }, [lessonId, courseId, track, router]);

  useEffect(() => {
    const id = setInterval(flush, BEAT_SECONDS * 1000);
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onHide); flush(); };
  }, [flush]);

  return (
    <div className="relative overflow-hidden rounded-card bg-black">
      <MuxPlayer
        playbackId={playbackId}
        tokens={{ playback: tokens["playback-token"], thumbnail: tokens["thumbnail-token"], storyboard: tokens["storyboard-token"] }}
        startTime={startAt > 5 ? startAt : undefined}
        streamType="on-demand"
        accentColor="var(--fc-accent)"
        metadata={{ video_id: lessonId, video_title: title, viewer_user_id: viewerId }}
        onTimeUpdate={(e) => {
          const t = (e.target as HTMLMediaElement).currentTime;
          const prev = lastTime.current;
          // count normal playback only: small forward steps, ignore seeks
          if (prev !== null && t > prev && t - prev < 2) watched.current += t - prev;
          lastTime.current = t;
          position.current = t;
        }}
        onSeeking={(e) => { lastTime.current = (e.target as HTMLMediaElement).currentTime; }}
        onPause={flush}
        onEnded={flush}
      />
      {watermark && (
        <div className="pointer-events-none absolute right-3 top-3 select-none text-xs text-white/40">{watermark}</div>
      )}
    </div>
  );
}

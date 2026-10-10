import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCourse } from "@/lib/catalog";
import { getSessionUser } from "@/lib/auth";
import { getEnrollment } from "@/lib/learning";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { signPlayback } from "@/lib/mux";
import { VideoLesson } from "@/components/player/VideoLesson";
import { CompleteButton } from "@/components/player/CompleteButton";
import { QuizLesson, type QuizQuestion } from "@/components/player/QuizLesson";

export const metadata: Metadata = { robots: { index: false } };

type Body = {
  text?: string;
  files?: { name: string; path: string }[];
  pass_pct?: number;
  questions?: (QuizQuestion & { correct?: string })[];
};

export default async function LessonPage({ params }: PageProps<"/learn/[course]/[lesson]">) {
  const { course: slug, lesson: lessonId } = await params;
  if (!isSupabaseConfigured) redirect(`/courses/${slug}`);
  const course = await getCourse(slug);
  if (!course) notFound();
  const lessons = course.chapters.flatMap((c) => c.lessons);
  const idx = lessons.findIndex((l) => l.id === lessonId);
  if (idx === -1) notFound();
  const lesson = lessons[idx];

  const user = await getSessionUser();
  const enrollment = user ? await getEnrollment(course.id) : null;
  const supabase = await createClient();
  const { data: unlocked } = await supabase.rpc("lesson_unlocked", { p_lesson: lessonId });
  if (!unlocked) {
    if (!user) redirect(`/users/sign_in?next=/learn/${slug}/${lessonId}`);
    if (!enrollment) redirect(`/courses/${slug}`);
  }

  const [{ data: full }, { data: body }, { data: progressRows }] = await Promise.all([
    supabase.from("lessons").select("id, type, video_asset_id, drip_days").eq("id", lessonId).single(),
    supabase.from("lesson_bodies").select("body").eq("lesson_id", lessonId).maybeSingle(),
    user
      ? supabase.from("lesson_progress").select("lesson_id, completed_at, last_position_seconds").eq("course_id", course.id).eq("user_id", user.id)
      : Promise.resolve({ data: [] as { lesson_id: string; completed_at: string | null; last_position_seconds: number }[] }),
  ]);
  const progress = new Map((progressRows ?? []).map((p) => [p.lesson_id, p]));
  const b = (body?.body ?? {}) as Body;

  // Video: sign playback only after the access check above
  let video: { playbackId: string; tokens: Record<string, string | undefined> } | null = null;
  if (full?.type === "video" && full.video_asset_id && unlocked) {
    const { data: asset } = await createAdminClient()
      .from("video_assets").select("playback_id, status").eq("id", full.video_asset_id).single();
    if (asset?.playback_id && asset.status === "ready") {
      video = { playbackId: asset.playback_id, tokens: await signPlayback(asset.playback_id, user?.id ?? "preview") };
    }
  }

  // Files: short-lived signed links from private storage
  const files = unlocked && b.files?.length
    ? await Promise.all(b.files.map(async (f) => {
        const { data } = await createAdminClient().storage.from("course-files").createSignedUrl(f.path, 3600);
        return { name: f.name, url: data?.signedUrl ?? "#" };
      }))
    : [];

  const prev = lessons[idx - 1];
  const next = lessons[idx + 1];
  const tracking = Boolean(enrollment);

  return (
    <div className="flex min-h-screen flex-col bg-surface lg:flex-row">
      <aside className="border-b border-line bg-bg lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="border-b border-line p-5">
          <Link href={enrollment ? "/dashboard" : `/courses/${slug}`} className="text-sm text-muted hover:underline">← {enrollment ? "My courses" : "Course page"}</Link>
          <h1 className="mt-2 font-semibold text-primary">{course.title}</h1>
          {enrollment && (
            <div className="mt-3">
              <div className="h-2 rounded-full bg-surface"><div className="h-2 rounded-full bg-accent" style={{ width: `${enrollment.progress_pct}%` }} /></div>
              <p className="mt-1 text-xs text-muted">{Math.round(Number(enrollment.progress_pct))}% complete</p>
            </div>
          )}
        </div>
        <nav className="p-3">
          {course.chapters.map((ch) => (
            <div key={ch.id} className="mb-3">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">{ch.title}</p>
              {ch.lessons.map((l) => {
                const done = progress.get(l.id)?.completed_at;
                return (
                  <Link key={l.id} href={`/learn/${slug}/${l.id}`}
                    className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${l.id === lessonId ? "bg-surface font-semibold" : "hover:bg-surface"}`}>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${done ? "border-success bg-success text-white" : "border-line"}`}>{done ? "✓" : ""}</span>
                    <span className="line-clamp-2">{l.title}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-primary">{lesson.title}</h2>

          <div className="mt-6">
            {!unlocked ? (
              <div className="fc-card p-8 text-center">
                <p className="font-semibold">This lesson unlocks {full?.drip_days ? `${full.drip_days} days after you enrolled` : "soon"}.</p>
              </div>
            ) : full?.type === "video" ? (
              video ? (
                <VideoLesson lessonId={lessonId} courseId={course.id} playbackId={video.playbackId} tokens={video.tokens}
                  startAt={progress.get(lessonId)?.last_position_seconds ?? 0} track={tracking}
                  watermark={user?.email ?? undefined} title={lesson.title} viewerId={user?.id} />
              ) : (
                <div className="fc-card flex aspect-video items-center justify-center text-muted">{full.video_asset_id ? "Video is processing — check back shortly." : "The video for this lesson is coming soon."}</div>
              )
            ) : full?.type === "quiz" ? (
              <QuizLesson lessonId={lessonId} courseId={course.id} passPct={b.pass_pct ?? 70}
                // never send correct answers to the browser
                questions={(b.questions ?? []).map((q) => ({ id: q.id, prompt: q.prompt, options: q.options }))} canSubmit={tracking} />
            ) : null}

            {unlocked && b.text && <div className="fc-card mt-6 whitespace-pre-line p-6 leading-relaxed">{b.text}</div>}
            {files.length > 0 && (
              <ul className="fc-card mt-6 divide-y divide-line">
                {files.map((f) => <li key={f.name}><a href={f.url} className="block p-4 font-medium text-primary hover:underline">⬇ {f.name}</a></li>)}
              </ul>
            )}
            {unlocked && tracking && full && !["video", "quiz"].includes(full.type) && (
              <div className="mt-6"><CompleteButton lessonId={lessonId} courseId={course.id} done={Boolean(progress.get(lessonId)?.completed_at)} /></div>
            )}
          </div>

          <div className="mt-10 flex justify-between gap-4">
            {prev ? <Link href={`/learn/${slug}/${prev.id}`} className="fc-btn fc-btn-outline">← Previous</Link> : <span />}
            {next ? <Link href={`/learn/${slug}/${next.id}`} className="fc-btn fc-btn-dark">Next lesson →</Link>
              : enrollment && <Link href="/dashboard" className="fc-btn fc-btn-primary">Finish</Link>}
          </div>
        </div>
      </main>
    </div>
  );
}

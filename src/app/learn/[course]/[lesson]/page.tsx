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
import { brand } from "@/components/site/brand";
import { VideoLesson } from "@/components/player/VideoLesson";
import { CompleteButton } from "@/components/player/CompleteButton";
import { CurriculumNav, type NavChapter } from "@/components/player/CurriculumNav";
import { QuizLesson, type QuizQuestion } from "@/components/player/QuizLesson";

export const metadata: Metadata = { robots: { index: false } };

type Body = {
  text?: string;
  files?: { name: string; path: string }[];
  pass_pct?: number;
  questions?: (QuizQuestion & { correct?: string })[];
};

export default async function LessonPage({ params, searchParams }: PageProps<"/learn/[course]/[lesson]">) {
  const { course: slug, lesson: lessonId } = await params;
  const focus = (await searchParams).focus === "1";
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
  const previewing = !enrollment && Boolean(user && (user.roles.includes("admin") || user.roles.includes("instructor")));

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

  const next = lessons[idx + 1];
  const nextHref = next ? `/learn/${slug}/${next.id}${focus ? "?focus=1" : ""}` : null;
  const tracking = Boolean(enrollment);
  const done = Boolean(progress.get(lessonId)?.completed_at);
  const autoCompletes = full?.type === "video" || full?.type === "quiz";
  const pct = enrollment ? Math.round(Number(enrollment.progress_pct)) : 0;

  const chapters: NavChapter[] = course.chapters.map((ch) => ({
    id: ch.id, title: ch.title,
    lessons: ch.lessons.map((l) => ({ id: l.id, title: l.title, type: l.type, duration_seconds: l.duration_seconds, done: Boolean(progress.get(l.id)?.completed_at), locked: false })),
  }));

  const expandIcon = focus
    ? <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
    : <path d="M10 2h4v4M14 2 9 7M6 14H2v-4M2 14l5-5" />;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {previewing && (
        <div className="bg-[#04192f] px-4 py-3 text-[15px] text-white">You are previewing <b>all course lessons</b></div>
      )}
      <header className="relative flex h-16 items-center justify-center bg-[#141414] px-4 text-white">
        <Link href={enrollment ? "/dashboard" : "/"} className="absolute left-4 flex items-center gap-3 text-sm md:left-8">
          <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden><path d="M7.5 2 2.5 7l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="hidden sm:inline">Go to Home</span>
        </Link>
        <Link href="/" aria-label={brand.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logoFooter} alt={brand.name} className="h-7 w-auto md:h-8" />
        </Link>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        {!focus && (
          <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-[368px] lg:overflow-y-auto">
            <div className="rounded bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,.12)]">
              <h1 className="text-[28px] font-medium leading-snug text-ink/90">{course.title}</h1>
              <div className="mt-5 h-1 rounded-full bg-[#d4d6db]"><div className="h-1 rounded-full bg-ink" style={{ width: `${pct}%` }} /></div>
              <p className="mt-3 text-[15px] text-ink/90"><b>{pct}%</b> complete</p>
            </div>
            <div className="mt-4"><CurriculumNav slug={slug} chapters={chapters} currentId={lessonId} /></div>
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col rounded bg-white shadow-[0_1px_4px_rgba(0,0,0,.12)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ink/90">{lesson.title}</h2>
            <Link href={`/learn/${slug}/${lessonId}${focus ? "" : "?focus=1"}`} aria-label={focus ? "Show course contents" : "Hide course contents"} className="p-1 text-ink hover:opacity-70">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>{expandIcon}</svg>
            </Link>
          </div>

          <div className="flex-1">
            {!unlocked ? (
              <div className="p-16 text-center">
                <p className="font-semibold">This lesson unlocks {full?.drip_days ? `${full.drip_days} days after you enrolled` : "soon"}.</p>
              </div>
            ) : full?.type === "video" ? (
              video ? (
                <VideoLesson lessonId={lessonId} courseId={course.id} playbackId={video.playbackId} tokens={video.tokens}
                  startAt={progress.get(lessonId)?.last_position_seconds ?? 0} track={tracking}
                  watermark={user?.email ?? undefined} title={lesson.title} viewerId={user?.id} />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-surface text-muted">{full.video_asset_id ? "Video is processing. Check back shortly." : "The video for this lesson is coming soon."}</div>
              )
            ) : full?.type === "quiz" ? (
              <div className="mx-auto max-w-[680px] px-4 py-10">
                <QuizLesson lessonId={lessonId} courseId={course.id} passPct={b.pass_pct ?? 70}
                  // never send correct answers to the browser
                  questions={(b.questions ?? []).map((q) => ({ id: q.id, prompt: q.prompt, options: q.options }))} canSubmit={tracking} />
              </div>
            ) : full?.type === "audio" && files[0] ? (
              <div className="mx-auto max-w-[680px] px-4 pt-12">
                <audio controls preload="metadata" src={files[0].url} className="w-full" controlsList="nodownload" />
              </div>
            ) : null}

            {unlocked && b.text && (
              <div className="mx-auto max-w-[680px] whitespace-pre-line px-4 py-12 text-[15px] leading-relaxed text-ink/90">{b.text}</div>
            )}
            {files.length > 0 && full?.type !== "audio" && (
              <ul className="mx-auto mb-12 max-w-[680px] divide-y divide-line rounded border border-line">
                {files.map((f) => (
                  <li key={f.name}>
                    <a href={f.url} className="flex items-center gap-3 p-4 text-[15px] font-medium text-ink hover:bg-surface">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" /></svg>
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col items-center gap-2 border-t border-line px-4 py-4">
            {autoCompletes && tracking && !done && full?.type === "video" && (
              <p className="text-xs text-muted">Watch the video to complete this lesson.</p>
            )}
            <CompleteButton lessonId={lessonId} courseId={course.id} nextHref={nextHref}
              mode={tracking && unlocked && !done && !autoCompletes ? "complete" : "continue"} />
          </div>
        </main>
      </div>
    </div>
  );
}

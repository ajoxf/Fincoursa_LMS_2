"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewOffers } from "@/lib/reviews";
import { sendReviewReceived } from "@/lib/email/events";

/** Buyer sends feedback and a review for one order. The team approves it and tops up the cashback. */
export async function submitReview(orderId: string, form: FormData) {
  const user = await requireUser(`/review/${orderId}`);
  const back = (m: string): never => redirect(`/review/${orderId}?err=${encodeURIComponent(m)}`);
  const offer = (await reviewOffers(user.id)).find((o) => o.orderId === orderId);
  if (!offer) back("This order can't be reviewed for cashback, or you've already sent a review for it.");
  const rating = Number(form.get("rating"));
  const feedback = String(form.get("feedback") ?? "").trim();
  const review = String(form.get("review") ?? "").trim();
  if (!(rating >= 1 && rating <= 5)) back("Choose a rating from 1 to 5.");
  if (feedback.length < 20) back("Please write at least a couple of sentences of feedback (20 characters or more).");
  if (review.length < 20) back("Please write a short review (20 characters or more).");
  if (feedback.length > 4000 || review.length > 1500) back("That's a bit long. Feedback can be up to 4,000 characters and the review up to 1,500.");
  const { data, error } = await createAdminClient().from("course_reviews").insert({
    order_id: orderId, user_id: user.id, course_id: offer!.courseId, rating: Math.round(rating),
    feedback, review, can_publish: form.get("can_publish") === "on",
  }).select("id").single();
  if (error) back(error.code === "23505" ? "You've already sent a review for this order." : "Something went wrong. Please try again.");
  await sendReviewReceived(data!.id).catch((e) => console.error("[review] team email", e));
  revalidatePath("/dashboard");
  redirect(`/review/${orderId}?sent=1`);
}

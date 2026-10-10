# Lesson content

Lesson types: `video`, `text`, `pdf`, `download`, `quiz` (also `audio`, `live` reserved).
Protected content sits in `lesson_bodies.body` (JSON):

```json
{
  "text": "Notes shown under the video, or the lesson itself for text lessons",
  "files": [{ "name": "Workbook.pdf", "path": "commodities/workbook.pdf" }],
  "pass_pct": 70,
  "questions": [
    { "id": "q1", "prompt": "A rising 200-day moving average suggests…",
      "options": [{ "id": "a", "text": "a long-term uptrend" }, { "id": "b", "text": "a short squeeze" }],
      "correct": "a" }
  ]
}
```

- `files[].path` is a path in the private `course-files` Storage bucket. Students get 1-hour signed links.
- `correct` is never sent to the browser. Grading happens in `submit_quiz()`.
- Lesson options: `is_preview` (free preview), `drip_days` (unlock N days after enrolment),
  `is_required` (counts toward completion), `completion_threshold` (default 0.9 of the video).

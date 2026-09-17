import { NextResponse } from "next/server";
import { getMistakeSelectionTreeForUser } from "~backend/services/question-progress";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, assertSameOrigin, applySecurityHeaders } from "../../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const flat = await getMistakeSelectionTreeForUser(userId);

    // Group the flat (subject, topic, subtopic) rows into a subject → topic →
    // subtopic tree, each node carrying the number of wrong questions available.
    const subjectMap = new Map<
      string,
      { subject: string; count: number; topics: Map<string, { topic: string; count: number; subtopics: Map<string, number> }> }
    >();
    for (const row of flat) {
      let subj = subjectMap.get(row.subject);
      if (!subj) {
        subj = { subject: row.subject, count: 0, topics: new Map() };
        subjectMap.set(row.subject, subj);
      }
      subj.count += row.count;

      let topic = subj.topics.get(row.topic);
      if (!topic) {
        topic = { topic: row.topic, count: 0, subtopics: new Map() };
        subj.topics.set(row.topic, topic);
      }
      topic.count += row.count;
      if (row.subtopic) {
        topic.subtopics.set(row.subtopic, (topic.subtopics.get(row.subtopic) ?? 0) + row.count);
      }
    }

    const subjects = [...subjectMap.values()]
      .sort((a, b) => b.count - a.count)
      .map((s) => ({
        subject: s.subject,
        count: s.count,
        topics: [...s.topics.values()]
          .sort((a, b) => b.count - a.count)
          .map((t) => ({
            topic: t.topic,
            count: t.count,
            subtopics: [...t.subtopics.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([subtopic, count]) => ({ subtopic, count })),
          })),
      }));

    const res = NextResponse.json({ subjects });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

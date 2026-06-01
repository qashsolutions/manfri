// GET /api/v1/screening?requisition_id=&candidate_id= — the candidate×req fit detail
// (= getMatchDetail). Assembles the MatchDetail: transparent subscores (0.8·core/0.2·nice),
// CORE/NICE skills, advisory review + authenticity flags, and 15 screening questions
// (5/5/5 + answer keys) generated via Gemini (LLM) with a deterministic fallback, cached in
// screen_question_set keyed on (candidate, req) + an input hash. RLS-scoped via withOrg.
// If ids are omitted, defaults to the first open requisition and its top-fit candidate.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { activeModelId, aiEnabled } from "@/lib/ai/model";
import { llmQuestions } from "@/lib/ai/questions";
import { allAdvisoryFlags } from "@/lib/domain/authenticity";
import { type JdSkillInput, scoreCandidate } from "@/lib/domain/match";
import { deterministicQuestions, type QuestionInputs, questionsInputHash, type ScreenQ } from "@/lib/domain/questions";
import { getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CandRow {
  id: string;
  name: string | null;
  email: string | null;
  parsed_jsonb: Record<string, unknown> | null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const url = new URL(req.url);
  const reqIdParam = url.searchParams.get("requisition_id") || null;
  const candIdParam = url.searchParams.get("candidate_id") || null;

  const generator = aiEnabled() ? activeModelId("capable") : "deterministic-template@1";

  // Step 1 — load everything deterministic + the existing cached question row (short tx).
  const loaded = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const reqRows = reqIdParam
      ? await sql<{ id: string; title: string }[]>`select id, title from requisition where id = ${reqIdParam} and deleted_at is null limit 1`
      : await sql<{ id: string; title: string }[]>`select id, title from requisition where deleted_at is null and status = 'open' order by created_at limit 1`;
    const requisition = reqRows[0];
    if (!requisition) return null;

    const jd = await sql<{ name: string; tier: string; weight: number }[]>`
      select name, tier, weight::float8 as weight from jd_skill where requisition_id = ${requisition.id} order by sort_order`;
    const jdSkills: JdSkillInput[] = jd.map((s) => ({ name: s.name, tier: s.tier as "core" | "nice", weight: s.weight }));

    const cands = await sql<CandRow[]>`
      select c.id, c.name, c.email, r.parsed_jsonb
      from candidate c left join resume r on r.candidate_id = c.id and r.is_current
      where c.deleted_at is null`;

    let candidate: CandRow | undefined;
    if (candIdParam) {
      candidate = cands.find((c) => c.id === candIdParam);
    } else {
      // top-fit candidate by transparent skill overlap
      candidate = [...cands]
        .map((c) => ({ c, fit: scoreCandidate(((c.parsed_jsonb?.skills as string[] | undefined) ?? []), jdSkills).fit }))
        .sort((a, b) => b.fit - a.fit || a.c.id.localeCompare(b.c.id))[0]?.c;
    }
    if (!candidate) return null;

    const cached = await sql<{ input_hash: string; questions: ScreenQ[]; model_id: string }[]>`
      select input_hash, questions, model_id from screen_question_set
      where candidate_id = ${candidate.id} and requisition_id = ${requisition.id} limit 1`;

    return { requisition, jdSkills, candidate, cached: cached[0] ?? null };
  });

  if (!loaded) return notFound("no requisition or candidate available");
  const { requisition, jdSkills, candidate } = loaded;
  const parsed = candidate.parsed_jsonb;
  const resumeSkills = (parsed?.skills as string[] | undefined) ?? [];

  const breakdown = scoreCandidate(resumeSkills, jdSkills);
  const coreSkills = jdSkills.filter((s) => s.tier === "core").map((s) => s.name);
  const niceSkills = jdSkills.filter((s) => s.tier === "nice").map((s) => s.name);
  const corePresent = breakdown.skills.filter((s) => s.tier === "core" && s.present).length;
  const nicePresent = breakdown.skills.filter((s) => s.tier === "nice" && s.present).length;

  const inputs: QuestionInputs = {
    jdTitle: requisition.title,
    jdCore: coreSkills,
    jdNice: niceSkills,
    resumeSkills,
    experienceYears: (parsed?.total_experience_years as number | null | undefined) ?? null,
  };
  const inputHash = questionsInputHash(inputs, generator);

  // Step 2 — questions: reuse cache if fresh, else generate (LLM → deterministic) + cache.
  let questions: ScreenQ[];
  if (loaded.cached && loaded.cached.input_hash === inputHash) {
    questions = loaded.cached.questions;
  } else {
    const llm = await llmQuestions(inputs);
    questions = llm ?? deterministicQuestions(inputs);
    const usedModel = llm ? generator : "deterministic-template@1";
    await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
      await sql`
        insert into screen_question_set (org_id, candidate_id, requisition_id, input_hash, model_id, questions)
        values (${ctx.orgId}, ${candidate.id}, ${requisition.id}, ${inputHash}, ${usedModel}, ${sql.json(questions as never)})
        on conflict (candidate_id, requisition_id)
        do update set input_hash = excluded.input_hash, model_id = excluded.model_id, questions = excluded.questions, created_at = now()`;
    });
  }

  const matchDetail = {
    candidate: candidate.name ?? candidate.email ?? "—",
    candidateId: candidate.id,
    req: requisition.title,
    reqId: requisition.id,
    coreSkills,
    niceSkills,
    subScores: [
      {
        label: "CORE skill coverage",
        weight: 0.8,
        score: Math.round(breakdown.core_coverage * 100),
        evidence: `${corePresent}/${coreSkills.length} CORE skills evidenced in the résumé`,
      },
      {
        label: "NICE-to-have coverage",
        weight: 0.2,
        score: Math.round(breakdown.nice_coverage * 100),
        evidence: `${nicePresent}/${niceSkills.length} NICE-to-have skills present`,
      },
    ],
    reviewFlags: allAdvisoryFlags(parsed).map((f) => ({ severity: f.severity, label: f.code, detail: f.message })),
    questions: questions.map((q) => ({ tier: q.tier, q: q.q, answer: q.answer })),
  };
  return NextResponse.json(matchDetail);
}

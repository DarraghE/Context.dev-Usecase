"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Course } from "@/db/schema";
import { formatWhen } from "./ui";

type MenuRow = {
  id: string;
  version: number;
  courses: { courses: Course[]; unused_memories_worth_considering: string[] };
  createdBy: "chef" | "system";
  model: string | null;
  promptVersion: string | null;
  validation: { regenerated: number[]; flagged: number[] } | null;
  createdAt: string;
};
type MemoryLite = { id: string; dish: string; event_label: string; date: string | null };

function CourseEditor({ c, onSave, onCancel }: { c: Course; onSave: (c: Course) => void; onCancel: () => void }) {
  const [d, setD] = useState(c);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
    >
      <div>
        <label htmlFor={`t-${c.position}`}>Title</label>
        <input id={`t-${c.position}`} type="text" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
      </div>
      <div>
        <label htmlFor={`d-${c.position}`}>Description</label>
        <textarea id={`d-${c.position}`} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={4} />
      </div>
      <div>
        <label htmlFor={`s-${c.position}`}>Line for the printed menu card</label>
        <input id={`s-${c.position}`} type="text" value={d.story_for_menu_card} onChange={(e) => setD({ ...d, story_for_menu_card: e.target.value })} />
      </div>
      <div>
        <label htmlFor={`a-${c.position}`}>Allergens (comma-separated)</label>
        <input id={`a-${c.position}`} type="text" value={d.allergens.join(", ")} onChange={(e) => setD({ ...d, allergens: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
      </div>
      <fieldset>
        <legend>Dietary variants</legend>
        {d.dietary_variants.map((v, i) => (
          <div key={i} className="grid-2" style={{ marginBottom: 8 }}>
            <div>
              <label htmlFor={`vf-${c.position}-${i}`}>For</label>
              <input id={`vf-${c.position}-${i}`} type="text" value={v.for} onChange={(e) => setD({ ...d, dietary_variants: d.dietary_variants.map((x, j) => (j === i ? { ...x, for: e.target.value } : x)) })} />
            </div>
            <div>
              <label htmlFor={`vc-${c.position}-${i}`}>Change</label>
              <input id={`vc-${c.position}-${i}`} type="text" value={v.change} onChange={(e) => setD({ ...d, dietary_variants: d.dietary_variants.map((x, j) => (j === i ? { ...x, change: e.target.value } : x)) })} />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, dietary_variants: [...d.dietary_variants, { for: "", change: "" }] })}>
          Add a variant
        </button>
      </fieldset>
      <div className="row">
        <button className="btn btn-primary btn-sm" type="submit">
          Apply
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** §11.8 Chef › Menu builder (US-7 AC4/AC5). */
export function MenuBuilder({ allergies }: { allergies: string[] }) {
  const [menus, setMenus] = useState<MenuRow[] | null>(null);
  const [memories, setMemories] = useState<MemoryLite[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Course[] | null>(null); // unsaved local edits
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instr, setInstr] = useState<Record<number, string>>({});

  const load = useCallback(async (selectId?: string) => {
    const [r1, r2] = await Promise.all([fetch("/api/chef/menus", { cache: "no-store" }), fetch("/api/chef/memories?view=ranked", { cache: "no-store" })]);
    if (r1.ok) {
      const ms: MenuRow[] = (await r1.json()).menus;
      setMenus(ms);
      setSelected((cur) => selectId ?? cur ?? ms[0]?.id ?? null);
    }
    if (r2.ok) setMemories((await r2.json()).memories);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => menus?.find((m) => m.id === selected) ?? null, [menus, selected]);
  useEffect(() => {
    setDraft(null);
    setEditing(null);
  }, [selected]);
  const courses = draft ?? current?.courses.courses ?? [];
  const memById = new Map(memories.map((m) => [m.id, m]));

  const run = async (label: string, fn: () => Promise<Response>) => {
    setBusy(label);
    setError(null);
    try {
      const r = await fn();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Request failed");
      await load(j.menu?.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const generate = () => run("generate", () => fetch("/api/chef/menus", { method: "POST" }));
  const regenerate = (pos: number) =>
    run(`regen-${pos}`, () => fetch(`/api/chef/menus/${current!.id}/courses/${pos}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: instr[pos] || null }) }));
  const save = () =>
    run("save", () => fetch(`/api/chef/menus/${current!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courses: draft }) }));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...courses];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setDraft(next.map((c, k) => ({ ...c, position: k + 1 })));
  };

  if (!menus) return <p className="row muted"><span className="spinner" aria-hidden="true" /> Loading…</p>;

  return (
    <div className="stack-lg">
      <div className="row-between">
        <div className="row">
          <button className="btn btn-primary" onClick={generate} disabled={!!busy || memories.length === 0} data-testid="generate-menu">
            {busy === "generate" ? <span className="spinner" aria-hidden="true" /> : null}
            {menus.length ? "Generate a fresh draft" : "Draft the menu"}
          </button>
          {draft ? (
            <>
              <button className="btn btn-approve" onClick={save} disabled={!!busy}>
                {busy === "save" ? <span className="spinner" aria-hidden="true" /> : null}Save as new version
              </button>
              <button className="btn btn-ghost" onClick={() => setDraft(null)}>
                Discard edits
              </button>
            </>
          ) : null}
        </div>
        {menus.length ? (
          <div className="row">
            <label htmlFor="version" className="visually-hidden">
              Version
            </label>
            <select id="version" value={selected ?? ""} onChange={(e) => setSelected(e.target.value)} style={{ width: "auto" }}>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  Version {m.version} · {m.createdBy === "chef" ? "your edit" : "generated"} · {formatWhen(m.createdAt)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {memories.length === 0 ? <div className="alert alert-info">No approved memories yet. The couple needs to approve at least one memory before a draft can be made.</div> : null}
      {busy === "generate" ? (
        <div className="alert alert-info" role="status">
          Drafting five courses from {memories.length} approved memories, then checking every course against {allergies.length ? allergies.join(", ") : "the constraints"}…
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {current ? (
        <>
          <div className="row">
            {current.validation?.regenerated.length ? (
              <span className="badge badge-amber">
                Course {current.validation.regenerated.join(", ")} regenerated once by the allergy check
              </span>
            ) : null}
            {current.validation?.flagged.length ? <span className="badge badge-danger">Course {current.validation.flagged.join(", ")} flagged for you</span> : <span className="badge badge-sage">All courses pass the allergy check</span>}
            {current.model ? <span className="badge">{current.model} · {current.promptVersion}</span> : null}
            {draft ? <span className="badge badge-info">Unsaved edits</span> : null}
          </div>

          <div className="grid-2" style={{ alignItems: "start" }}>
            <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }} aria-label="Courses">
              {courses.map((c, i) => (
                <li key={`${c.position}-${c.title}`} className="card course" data-testid="course" data-course={c.course}>
                  <div className="course-num" aria-hidden="true">
                    {i + 1}
                  </div>
                  <div className="stack" style={{ marginTop: 0 }}>
                    <div>
                      <div className="course-kind">{c.course}</div>
                      {editing === i ? null : <h3>{c.title}</h3>}
                    </div>
                    {c.flagged_for_chef ? (
                      <div className="alert alert-danger" role="alert">
                        {c.flagged_for_chef}
                      </div>
                    ) : null}
                    {editing === i ? (
                      <CourseEditor
                        c={c}
                        onCancel={() => setEditing(null)}
                        onSave={(nc) => {
                          setDraft(courses.map((x, k) => (k === i ? nc : x)));
                          setEditing(null);
                        }}
                      />
                    ) : (
                      <>
                        <p style={{ margin: 0 }}>{c.description}</p>
                        <p className="quote" style={{ margin: 0 }}>
                          {c.story_for_menu_card}
                        </p>
                        <div className="chips" aria-label="Memories this course draws on">
                          {c.memory_ids.length ? (
                            c.memory_ids.map((id) => (
                              <Link key={id} className="chip" href={`/chef/memories/${id}`} data-testid="memory-chip">
                                ♥ {memById.get(id)?.dish ?? "memory"}
                                {memById.get(id) ? <span className="muted"> · {memById.get(id)!.event_label}</span> : null}
                              </Link>
                            ))
                          ) : (
                            <span className="badge">Structural course</span>
                          )}
                        </div>
                        <div className="row small">
                          <strong>Allergens:</strong>
                          {c.allergens.length ? c.allergens.map((a) => <span key={a} className="badge">{a}</span>) : <span className="muted">none listed</span>}
                        </div>
                        {c.dietary_variants.length ? (
                          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                            {c.dietary_variants.map((v) => (
                              <li key={v.for + v.change}>
                                <strong>{v.for}:</strong> {v.change}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {c.seasonality_note ? <p className="small muted" style={{ margin: 0 }}>🌱 {c.seasonality_note}</p> : null}
                        {c.suggested_ingredients?.length ? (
                          <p className="small" style={{ margin: 0 }}>
                            <strong>Suggested ingredients:</strong> {c.suggested_ingredients.join(", ")}
                            {c.allergens.some((a) => /milk|dairy/i.test(a)) ? <span className="muted"> · dairy-heavy — could map to wholesaler products later</span> : null}
                          </p>
                        ) : null}
                        <div className="row">
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(i)}>
                            Edit
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${c.title} up`}>
                            ↑
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === courses.length - 1} aria-label={`Move ${c.title} down`}>
                            ↓
                          </button>
                        </div>
                        {!draft ? (
                          <div className="row">
                            <label htmlFor={`instr-${c.position}`} className="visually-hidden">
                              Instruction for regenerating {c.course}
                            </label>
                            <input
                              id={`instr-${c.position}`}
                              type="text"
                              placeholder="Optional: e.g. lighter, more Finnish"
                              value={instr[c.position] ?? ""}
                              onChange={(e) => setInstr({ ...instr, [c.position]: e.target.value })}
                              style={{ flex: "1 1 180px", minHeight: 36, padding: "6px 10px" }}
                            />
                            <button className="btn btn-ghost btn-sm" onClick={() => regenerate(c.position)} disabled={!!busy}>
                              {busy === `regen-${c.position}` ? <span className="spinner" aria-hidden="true" /> : null}Regenerate course
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <aside className="stack" aria-label="Menu card preview">
              <div className="menu-card-preview">
                <div className="ornament">✦ ✦ ✦</div>
                <h2 style={{ marginTop: 10 }}>Wedding Menu</h2>
                {courses.map((c) => (
                  <div className="c" key={`p-${c.position}-${c.title}`}>
                    <div className="t">{c.title}</div>
                    <div className="s">{c.story_for_menu_card}</div>
                  </div>
                ))}
                <div className="ornament">✦ ✦ ✦</div>
              </div>
              {current.courses.unused_memories_worth_considering.length ? (
                <div className="card soft">
                  <h3>Also worth considering</h3>
                  <div className="chips">
                    {current.courses.unused_memories_worth_considering.map((id) => (
                      <Link key={id} className="chip" href={`/chef/memories/${id}`}>
                        {memById.get(id)?.dish ?? "memory"}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </>
      ) : memories.length ? (
        <div className="card empty">
          <h2>No draft yet</h2>
          <p>Draft a five-course menu (amuse, starter, main, pre-dessert, dessert) from the {memories.length} approved memories.</p>
        </div>
      ) : null}
    </div>
  );
}

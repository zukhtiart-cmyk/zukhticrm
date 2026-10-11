"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { moveLead } from "./actions";
import { SavedCheck } from "@/components/feedback";

export type BoardLead = {
  id: string;
  name: string;
  status: string;
  source: string;
  meta: string;
  followUp: string | null;
  overdue: boolean;
};

type Drag = {
  id: string;
  x: number;
  y: number;
  offX: number;
  offY: number;
  w: number;
  over: string | null;
};

/**
 * The lead pipeline as a board you can rearrange: drag a card to another stage (long-press on a phone)
 * and it's saved straight away. Tapping a card still opens the lead.
 */
export function LeadBoard({
  columns,
  labels,
  leads: initial,
}: {
  columns: string[];
  labels: Record<string, string>;
  leads: BoardLead[];
}) {
  const router = useRouter();
  const [leads, setLeads] = useState(initial);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    ok: boolean;
    won?: boolean;
    key: number;
  } | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  dragRef.current = drag;

  useEffect(() => setLeads(initial), [initial]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // While dragging on a phone, stop the page from scrolling under your finger.
  useEffect(() => {
    if (!drag) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, [!!drag]); // eslint-disable-line react-hooks/exhaustive-deps

  function begin(e: React.PointerEvent, lead: BoardLead) {
    if (e.button !== 0) return;
    const card = e.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const touch = e.pointerType !== "mouse";
    let started = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const startDrag = (x: number, y: number) => {
      started = true;
      justDragged.current = true;
      navigator.vibrate?.(12);
      setDrag({
        id: lead.id,
        x,
        y,
        offX: start.x - rect.left,
        offY: start.y - rect.top,
        w: rect.width,
        over: lead.status,
      });
    };
    if (touch) timer = setTimeout(() => startDrag(start.x, start.y), 280);

    const move = (ev: PointerEvent) => {
      if (!started) {
        const moved = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
        if (touch) {
          if (moved > 10 && timer) {
            clearTimeout(timer); // it's a scroll, not a drag
            timer = null;
            cleanup();
          }
          return;
        }
        if (moved < 6) return;
        startDrag(ev.clientX, ev.clientY);
      }
      const under = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-col]");
      setDrag((d) =>
        d
          ? {
              ...d,
              x: ev.clientX,
              y: ev.clientY,
              over: under?.dataset.col ?? null,
            }
          : d,
      );
      // Scroll the board sideways near its edges.
      const sc = scroller.current;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (ev.clientX < r.left + 48) sc.scrollLeft -= 14;
        else if (ev.clientX > r.right - 48) sc.scrollLeft += 14;
      }
    };
    const up = () => {
      if (timer) clearTimeout(timer);
      cleanup();
      const d = dragRef.current;
      setDrag(null);
      if (started && d?.over && d.over !== lead.status) drop(lead, d.over);
      setTimeout(() => (justDragged.current = false), 50);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  async function drop(lead: BoardLead, status: string) {
    const before = lead.status;
    setLeads((all) =>
      all.map((l) => (l.id === lead.id ? { ...l, status } : l)),
    );
    setLanded(lead.id);
    setTimeout(() => setLanded(null), 700);
    const res = await moveLead(lead.id, status);
    if (res.error) {
      setLeads((all) =>
        all.map((l) => (l.id === lead.id ? { ...l, status: before } : l)),
      );
      setToast({ text: res.error, ok: false, key: Date.now() });
      return;
    }
    setToast({
      text:
        status === "WON"
          ? `${lead.name} is won! Open the lead to start the project.`
          : `${lead.name} moved to ${labels[status]}.`,
      ok: true,
      won: status === "WON",
      key: Date.now(),
    });
    router.refresh();
  }

  const dragging = drag ? leads.find((l) => l.id === drag.id) : null;

  return (
    <>
      <div
        ref={scroller}
        className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0"
      >
        {columns.map((status) => {
          const items = leads.filter((l) => l.status === status);
          const target =
            drag && drag.over === status && dragging?.status !== status;
          return (
            <div
              key={status}
              data-col={status}
              className={`w-72 shrink-0 snap-start rounded-2xl p-1.5 transition-colors duration-200 ${target ? "bg-brass-soft/70 outline-dashed outline-2 outline-brass/60" : drag ? "bg-ivory/60" : ""}`}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-ink/70">
                  {labels[status]}
                </h2>
                <span
                  key={items.length}
                  className="zk-pop grid h-6 min-w-6 place-items-center rounded-full bg-paper px-1.5 text-xs font-semibold text-muted shadow-sm"
                >
                  {items.length}
                </span>
              </div>
              <div className="grid min-h-16 gap-2">
                {items.map((l) => (
                  <Link
                    key={l.id}
                    href={`/leads/${l.id}`}
                    draggable={false}
                    onPointerDown={(e) => begin(e, l)}
                    onClick={(e) => justDragged.current && e.preventDefault()}
                    onContextMenu={(e) => drag && e.preventDefault()}
                    aria-description="Drag to another stage to move it"
                    className={`card block cursor-grab select-none p-3 transition hover:border-brass/40 active:cursor-grabbing ${drag?.id === l.id ? "opacity-30" : ""} ${landed === l.id ? "zk-pop ring-2 ring-brass/60" : ""}`}
                    style={{ WebkitTouchCallout: "none" }}
                  >
                    <LeadCardBody lead={l} />
                  </Link>
                ))}
                {!items.length && (
                  <p
                    className={`rounded-xl border border-dashed px-3 py-4 text-center text-xs transition ${target ? "border-brass text-brass" : "border-line text-muted"}`}
                  >
                    {target ? "Drop here" : "None"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {drag && dragging && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-50"
          style={{
            width: drag.w,
            transform: `translate(${drag.x - drag.offX}px, ${drag.y - drag.offY}px) rotate(2.5deg)`,
          }}
        >
          <div
            className="card p-3 shadow-2xl ring-2 ring-brass/40"
            style={{ transform: "scale(1.04)" }}
          >
            <LeadCardBody lead={dragging} />
          </div>
        </div>
      )}

      {toast && (
        <div
          key={toast.key}
          role="status"
          className="zk-pop fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit max-w-[90vw] items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 text-sm text-paper shadow-2xl lg:bottom-8"
        >
          {toast.ok ? (
            <SavedCheck size={toast.won ? 26 : 20} />
          ) : (
            <span className="text-clay">!</span>
          )}
          {toast.text}
        </div>
      )}
    </>
  );
}

function LeadCardBody({ lead }: { lead: BoardLead }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{lead.name}</p>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-ivory px-2.5 py-0.5 text-xs font-semibold text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          {lead.source}
        </span>
      </div>
      {lead.meta && <p className="mt-1 text-xs text-muted">{lead.meta}</p>}
      {lead.followUp && (
        <p
          className={`mt-2 text-xs font-semibold ${lead.overdue ? "text-clay" : "text-muted"}`}
        >
          Follow up {lead.followUp}
        </p>
      )}
    </>
  );
}

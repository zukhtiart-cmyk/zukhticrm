"use client";

import { useState } from "react";
import { ZukiFace } from "@/components/zuki";
import { AssistantPanel } from "./assistant-panel";
import { primeSpeech } from "@/lib/speech-client";

/** Floating Zuki button: one place to tell the CRM anything, from any page. */
/** `place`: crm = above the phone bottom bar; desk = above the desk's sticky save buttons. */
export function AssistantFab({ place = "desk" }: { place?: "crm" | "desk" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {!open && (
        <button
          onClick={() => {
            primeSpeech();
            setOpen(true);
          }}
          className={`no-print fixed right-4 z-40 grid h-16 w-16 place-items-center rounded-full border-2 border-brass bg-paper shadow-xl transition active:scale-95 ${place === "crm" ? "bottom-24 lg:bottom-6" : "bottom-36"}`}
          aria-label="Ask Zuki"
          title="Ask Zuki — speak or type anything"
        >
          <span className="zk-fab-bob">
            <ZukiFace size={44} />
          </span>
          <style>{`.zk-fab-bob{display:block;animation:zkfab 3s ease-in-out infinite}@keyframes zkfab{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}@media (prefers-reduced-motion: reduce){.zk-fab-bob{animation:none}}`}</style>
        </button>
      )}
      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  );
}

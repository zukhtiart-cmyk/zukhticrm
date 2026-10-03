import type { OrderStatus, StageStatus } from "@/db/schema";

/** What the AI proposes; the person reviews and edits this before anything is saved. */
export type VoiceProposal = {
  summary: string;
  stageUpdates: { stageId: string; status: StageStatus; progress: number; note?: string }[];
  payments: { milestoneId: string; amount: number; reference?: string; paidOn?: string }[];
  orders: { orderId: string | null; item: string; vendor?: string; status: OrderStatus; eta?: string }[];
  visits: { visitId: string | null; title: string; at: string }[];
  designNotes: string[];
  issues: string[];
  clientMessage: string;
  clarification: string | null;
};

export type UnderstandResult = {
  transcript: string;
  proposal: VoiceProposal;
  aiMode: "claude" | "basic";
  notice?: string;
  audioUrl?: string;
  /** Project lists for the review card's dropdowns */
  options: {
    stages: { id: string; name: string; status: string; progress: number }[];
    milestones: { id: string; label: string; amount: number; status: string }[];
    orders: { id: string; item: string; vendor: string | null; status: string; eta: string | null }[];
    visits: { id: string; title: string; at: string }[];
    currency: string;
    clientName: string;
  };
};

/** Turns an Anthropic SDK error into a plain explanation, keeping Anthropic's own message. */
export function explainAiError(e: unknown) {
  const err = e as {
    status?: number;
    message?: string;
    error?: { error?: { type?: string; message?: string } };
  };
  const status = err?.status;
  const raw = err?.error?.error?.message || err?.message || String(e);
  const type = err?.error?.error?.type;
  let hint = "";
  if (/credit balance/i.test(raw))
    hint =
      "Anthropic says the credit balance is too low for the organisation this API key belongs to. If you have credit, the key in Vercel is probably from a different organisation/workspace — create a new key in the same organisation that has the credit, update ANTHROPIC_API_KEY in Vercel and redeploy.";
  else if (status === 401)
    hint =
      "The API key isn't valid — copy a fresh key into ANTHROPIC_API_KEY in Vercel and redeploy.";
  else if (status === 403)
    hint =
      "This key isn't allowed to use the model — check the key's workspace permissions.";
  else if (status === 404 || /model/i.test(raw))
    hint =
      "The model name isn't available to this key — remove ANTHROPIC_MODEL in Vercel (or set it to a model your account can use) and redeploy.";
  else if (status === 429)
    hint =
      "Rate limit reached — wait a minute, or raise limits in the Anthropic console.";
  else if (status && status >= 500)
    hint = "Anthropic is having a temporary problem — try again shortly.";
  return {
    status: status ?? null,
    type: type ?? null,
    message: String(raw).slice(0, 300),
    hint,
  };
}

/** Short reason for notices: our hint if we recognise it, plus Anthropic's own words. */
export function shortAiReason(e: unknown) {
  const x = explainAiError(e);
  const said = `${x.status ? `${x.status}: ` : ""}${x.message.slice(0, 160)}`;
  return x.hint ? `${x.hint.split(" — ")[0]} — Anthropic: "${said}"` : `Anthropic: "${said}"`;
}

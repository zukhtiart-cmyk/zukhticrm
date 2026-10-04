import "server-only";
import Anthropic from "@anthropic-ai/sdk";

type Params = Anthropic.Messages.MessageCreateParamsNonStreaming & {
  tools: Anthropic.Messages.Tool[];
};

/**
 * Calls Claude and returns the input of the named tool, as fast as possible.
 * 1st try: forced tool use with thinking switched off (quickest, and models that think by default accept it).
 * If the model rejects that (400/404), 2nd try: let the model choose, with an instruction to use the tool.
 */
export async function callTool<T>(
  client: Anthropic,
  params: Params,
  toolName: string,
): Promise<T> {
  const pick = (res: Anthropic.Messages.Message) => {
    const block = res.content.find(
      (b) => b.type === "tool_use" && b.name === toolName,
    );
    if (!block || block.type !== "tool_use")
      throw new Error("The AI didn't return a result. Try again.");
    return block.input as T;
  };
  const opts = { timeout: 40_000, maxRetries: 1 };
  try {
    return pick(
      await client.messages.create(
        {
          ...params,
          thinking: { type: "disabled" },
          tool_choice: { type: "tool", name: toolName },
        },
        opts,
      ),
    );
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 400 && status !== 404) throw e;
    console.warn(
      `callTool(${toolName}): forced tool use rejected (${status}: ${(e as Error).message}); retrying with auto`,
    );
    const system = `${typeof params.system === "string" ? params.system : ""}\n\nYou must answer by calling the ${toolName} tool exactly once.`;
    return pick(
      await client.messages.create(
        { ...params, system, tool_choice: { type: "auto" } },
        opts,
      ),
    );
  }
}

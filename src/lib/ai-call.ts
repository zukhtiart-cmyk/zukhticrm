import "server-only";
import Anthropic from "@anthropic-ai/sdk";

type Params = Anthropic.Messages.MessageCreateParamsNonStreaming & { tools: Anthropic.Messages.Tool[] };

/**
 * Calls Claude and returns the input of the named tool.
 * Tries forced tool use first; some models reject a forced tool choice (e.g. when they think by default),
 * so on a 400 it retries letting the model choose, with an instruction to use the tool.
 */
export async function callTool<T>(client: Anthropic, params: Params, toolName: string): Promise<T> {
  const pick = (res: Anthropic.Messages.Message) => {
    const block = res.content.find((b) => b.type === "tool_use" && b.name === toolName);
    if (!block || block.type !== "tool_use") throw new Error("The AI didn't return a result. Try again.");
    return block.input as T;
  };
  try {
    return pick(await client.messages.create({ ...params, tool_choice: { type: "tool", name: toolName } }));
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 400 && status !== 404) throw e;
    const system = `${typeof params.system === "string" ? params.system : ""}\n\nYou must answer by calling the ${toolName} tool exactly once.`;
    return pick(await client.messages.create({ ...params, system, tool_choice: { type: "auto" } }));
  }
}

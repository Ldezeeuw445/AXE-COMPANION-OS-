/**
 * OpenAI client for llmRouter.
 * Thin wrapper around the openai SDK so llmRouter can import a consistent shape.
 */
import OpenAI from "openai";
import type { AxeResponse, AxeToolCall } from "@/services/axeService";

function getClient(): OpenAI {
  const apiKey =
    process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_API_KEY ?? "";
  return new OpenAI({ apiKey });
}

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export async function openaiChat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: {
    tools?: OpenAI.Chat.ChatCompletionTool[];
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<AxeResponse> {
  const client = getClient();
  const res = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    tools: options.tools?.length ? options.tools : undefined,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 1024,
  });
  const choice = res.choices[0];
  type FuncTC = { id: string; function: { name: string; arguments: string } };
  const toolCalls: AxeToolCall[] = (choice?.message?.tool_calls ?? [])
    .filter((tc): tc is typeof tc & FuncTC => "function" in tc)
    .map((tc) => ({
      id: (tc as FuncTC).id,
      tool: (tc as FuncTC).function.name as AxeToolCall["tool"],
      args: JSON.parse((tc as FuncTC).function.arguments || "{}") as Record<string, unknown>,
    })) as AxeToolCall[];
  return {
    content: choice?.message?.content ?? null,
    toolCalls,
  };
}

export async function openaiChatStreaming(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  onToken: (text: string) => void,
  options: {
    tools?: OpenAI.Chat.ChatCompletionTool[];
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<AxeResponse> {
  const client = getClient();
  const stream = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    tools: options.tools?.length ? options.tools : undefined,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 1024,
    stream: true,
  });
  let full = "";
  for await (const chunk of stream) {
    const tok = chunk.choices[0]?.delta?.content ?? "";
    if (tok) { onToken(tok); full += tok; }
  }
  return { content: full || null, toolCalls: [] };
}

export async function openaiSimpleChat(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string | null> {
  const r = await openaiChat(messages, options);
  return r.content;
}

export async function openaiSimpleChatStreaming(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  onToken: (text: string) => void,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string | null> {
  const r = await openaiChatStreaming(messages, onToken, options);
  return r.content;
}

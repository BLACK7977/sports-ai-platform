import "server-only";
import type {
  LLMProvider,
  ChatMessage,
  ChatOptions,
} from "@/types/ai";
import { getEnv } from "@/lib/config/env";

type OpenAiSdkShape = {
  chat: {
    completions: {
      create: (p: {
        model: string;
        messages: { role: string; content: string }[];
        temperature?: number;
        max_tokens?: number;
        stream?: boolean;
      }) => Promise<{
        choices: { message: { content: string | null } }[];
      }>;
    };
  };
};

export class OpenAILlmProvider implements LLMProvider {
  readonly id = "openai";
  readonly name = "OpenAI LLM Provider";
  private client: OpenAiSdkShape | null = null;

  private async getClient(): Promise<OpenAiSdkShape> {
    if (this.client) return this.client;
    const mod = await import("openai");
    const bag = mod as unknown as {
      default?: unknown;
      OpenAI?: new (opts: { apiKey?: string }) => OpenAiSdkShape;
    };
    const Ctor: new (opts: { apiKey?: string }) => OpenAiSdkShape =
      (bag.OpenAI as unknown as new (opts: { apiKey?: string }) => OpenAiSdkShape) ??
      ((bag.default as unknown as { OpenAI?: new (opts: { apiKey?: string }) => OpenAiSdkShape })
        ?.OpenAI as unknown as new (opts: { apiKey?: string }) => OpenAiSdkShape) ??
      (bag.default as unknown as new (opts: { apiKey?: string }) => OpenAiSdkShape);
    const env = getEnv();
    this.client = new Ctor({ apiKey: env.OPENAI_API_KEY });
    return this.client;
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<string> {
    const env = getEnv();
    const client = await this.getClient();
    const result = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      stream: false,
    });
    const content = result.choices?.[0]?.message?.content ?? "";
    return content;
  }
}

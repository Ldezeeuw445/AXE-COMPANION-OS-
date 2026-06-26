import OpenAI from "openai";

export type AIProvider = "ollama" | "openai";

export interface AIClientConfig {
  provider: AIProvider;
  baseURL?: string;
  apiKey?: string;
  model: string;
}

/**
 * Detect which AI provider to use based on environment variables.
 * Priority: Ollama (if OLLAMA_BASE_URL is set) → OpenAI (if OPENAI_API_KEY is set)
 */
export function getAIConfig(): AIClientConfig | null {
  const ollamaBaseURL = process.env.OLLAMA_BASE_URL;
  const ollamaModel = process.env.OLLAMA_MODEL;
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.OPENAI_MODEL;

  // Try Ollama first if configured
  if (ollamaBaseURL) {
    return {
      provider: "ollama",
      baseURL: ollamaBaseURL,
      model: ollamaModel || "llama3.2",
    };
  }

  // Fallback to OpenAI
  if (openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      model: openaiModel || "gpt-4o",
    };
  }

  return null;
}

/**
 * Get the model name for a specific use case.
 * Respects env overrides, falls back to sensible defaults per provider.
 */
export function getModelForProvider(
  config: AIClientConfig,
  overrideModel?: string
): string {
  if (overrideModel) return overrideModel;
  return config.model;
}

/**
 * Create an OpenAI-compatible client.
 * Ollama exposes an OpenAI-compatible API at /v1/chat/completions.
 */
export function createAIClient(config: AIClientConfig): OpenAI {
  if (config.provider === "ollama") {
    return new OpenAI({
      baseURL: `${config.baseURL}/v1`,
      apiKey: "ollama", // Ollama doesn't need a real key but the client requires one
      dangerouslyAllowBrowser: false,
    });
  }

  return new OpenAI({
    apiKey: config.apiKey!,
    dangerouslyAllowBrowser: false,
  });
}

/**
 * Unified wrapper: try the primary provider, fallback on failure.
 * Returns the completion response or throws if both fail.
 */
export async function createChatCompletion(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const config = getAIConfig();

  if (!config) {
    throw new Error(
      "No AI provider configured. Set OLLAMA_BASE_URL (and optionally OLLAMA_MODEL) or OPENAI_API_KEY."
    );
  }

  const client = createAIClient(config);
  const model = getModelForProvider(config, params.model);

  try {
    console.log(`[aiProvider] Using ${config.provider} with model ${model}`);
    return await client.chat.completions.create({
      ...params,
      model,
    });
  } catch (err) {
    const primaryError = err instanceof Error ? err.message : String(err);
    console.error(`[aiProvider] ${config.provider} failed:`, primaryError);

    // If Ollama failed and OpenAI is available, fallback
    if (config.provider === "ollama" && process.env.OPENAI_API_KEY) {
      console.log("[aiProvider] Falling back to OpenAI...");
      const fallbackConfig: AIClientConfig = {
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-4o",
      };
      const fallbackClient = createAIClient(fallbackConfig);
      const fallbackModel = getModelForProvider(fallbackConfig, params.model);

      try {
        const response = await fallbackClient.chat.completions.create({
          ...params,
          model: fallbackModel,
        });
        console.log("[aiProvider] Fallback to OpenAI succeeded");
        return response;
      } catch (fallbackErr) {
        const fallbackError =
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error("[aiProvider] OpenAI fallback also failed:", fallbackError);
        throw new Error(
          `Ollama failed: ${primaryError}. OpenAI fallback failed: ${fallbackError}`
        );
      }
    }

    // If OpenAI failed and Ollama is available, fallback
    if (config.provider === "openai" && process.env.OLLAMA_BASE_URL) {
      console.log("[aiProvider] Falling back to Ollama...");
      const fallbackConfig: AIClientConfig = {
        provider: "ollama",
        baseURL: process.env.OLLAMA_BASE_URL,
        model: process.env.OLLAMA_MODEL || "llama3.2",
      };
      const fallbackClient = createAIClient(fallbackConfig);
      const fallbackModel = getModelForProvider(fallbackConfig, params.model);

      try {
        const response = await fallbackClient.chat.completions.create({
          ...params,
          model: fallbackModel,
        });
        console.log("[aiProvider] Fallback to Ollama succeeded");
        return response;
      } catch (fallbackErr) {
        const fallbackError =
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error("[aiProvider] Ollama fallback also failed:", fallbackError);
        throw new Error(
          `OpenAI failed: ${primaryError}. Ollama fallback failed: ${fallbackError}`
        );
      }
    }

    throw err;
  }
}

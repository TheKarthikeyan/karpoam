import { z } from 'zod';
import type { ProviderAdapter, ProviderGenerateParams, ProviderGenerateResult } from './types';

const PROVIDER_NAME = 'openai';

// Model cascade: prioritize 2.5M/day pool first, then 250K/day pool
// Note: gpt-5-mini doesn't support temperature param, so gpt-4.1-mini is primary
const MODEL_CASCADE = [
  'gpt-4.1-mini',   // Primary - proven, supports temperature, 2.5M pool
  'gpt-5-mini',     // Backup - newest mini, 2.5M pool (no temp support)
  'gpt-5.1',        // Premium - newest full, 250K pool
  'gpt-4o',         // Final fallback - reliable, 250K pool
] as const;

type OpenAIModel = (typeof MODEL_CASCADE)[number];

function isValidModel(model?: string): model is OpenAIModel {
  return !!model && MODEL_CASCADE.includes(model as OpenAIModel);
}

function ensureSchemaName(name?: string) {
  if (name && name.trim().length > 0) {
    return name.trim();
  }
  return 'ResponseSchema';
}

function buildAbortController(timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return { controller: undefined, clear: () => undefined };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const clear = () => clearTimeout(timer);

  return { controller, clear };
}

function extractTextFromChoice(choice: any): string {
  if (!choice) return '';

  const message = choice.message ?? choice.delta ?? {};
  const { content } = message;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part) continue;
      if (typeof part === 'string') {
        return part;
      }
      if (typeof part.text === 'string') {
        return part.text;
      }
      if (typeof part.output_text === 'string') {
        return part.output_text;
      }
      if (typeof part.data === 'string') {
        return part.data;
      }
    }
  }

  if (typeof message.text === 'string') {
    return message.text;
  }

  return '';
}

function normalizeUsage(raw: any, latencyMs: number | undefined) {
  if (!raw) {
    return latencyMs ? { latencyMs } : undefined;
  }

  const promptTokens =
    raw.prompt_tokens ??
    raw.promptTokens ??
    raw.input_tokens ??
    raw.inputTokens;
  const completionTokens =
    raw.completion_tokens ??
    raw.completionTokens ??
    raw.output_tokens ??
    raw.outputTokens;
  const totalTokens =
    raw.total_tokens ?? raw.totalTokens ??
    (typeof promptTokens === 'number' && typeof completionTokens === 'number'
      ? promptTokens + completionTokens
      : undefined);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    latencyMs,
  };
}

function isRetryableError(error: any): boolean {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : '';
  const status = error.status ?? error.code;
  return (
    status === 503 ||
    status === 429 ||
    message.includes('503') ||
    message.includes('429') ||
    message.toLowerCase().includes('overload') ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('capacity') ||
    // Model parameter limitations (e.g., temperature not supported) - try next model
    message.toLowerCase().includes('unsupported_value') ||
    message.toLowerCase().includes('does not support')
  );
}

function describeError(error: any): string {
  if (!error) return 'unknown error';
  const status = error.status ?? error.code;
  const message =
    error?.message ??
    (typeof error === 'string' ? error : error?.toString?.() ?? '');

  if (status === 503 || message.includes('503')) return 'overloaded';
  if (status === 429 || message.toLowerCase().includes('rate limit'))
    return 'rate limited';
  if (message.toLowerCase().includes('unsupported_value') || message.toLowerCase().includes('does not support'))
    return 'unsupported parameter';
  if (status === 401 || message.toLowerCase().includes('unauthorized'))
    return 'authentication failed';
  if (status === 400 || message.includes('400')) return 'invalid request';
  if (status === 408 || message.toLowerCase().includes('timeout'))
    return 'timeout';

  return 'unknown error';
}

function buildModelList(model?: string): string[] {
  if (isValidModel(model)) {
    return [
      model,
      ...MODEL_CASCADE.filter((candidate) => candidate !== model),
    ];
  }
  return [...MODEL_CASCADE];
}

interface BuildPayloadResult {
  payload: Record<string, any>;
  isWrappedArray: boolean;
}

function buildPayload(params: ProviderGenerateParams, model: string): BuildPayloadResult {
  let isWrappedArray = false;
  
  const payload: Record<string, any> = {
    model,
    messages: [
      {
        role: 'user',
        content: params.prompt,
      },
    ],
  };

  if (typeof params.temperature === 'number') {
    payload.temperature = params.temperature;
  }
  if (typeof params.topP === 'number') {
    payload.top_p = params.topP;
  }
  if (typeof params.maxOutputTokens === 'number') {
    payload.max_tokens = params.maxOutputTokens;
  }

  if (params.zodSchema) {
    try {
      let jsonSchema = z.toJSONSchema(params.zodSchema);
      
      // OpenAI requires root schema to be type: "object", not "array"
      // Wrap array schemas in an object with an "items" property
      if (jsonSchema.type === 'array') {
        jsonSchema = {
          type: 'object',
          properties: {
            items: jsonSchema,
          },
          required: ['items'],
          additionalProperties: false,
        };
        isWrappedArray = true;
      }
      
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: ensureSchemaName(params.schemaName),
          schema: jsonSchema,
          // Note: strict mode requires ALL properties in 'required' array
          // The Zod schemas in this project use optional fields, so we disable strict
          strict: false,
        },
      };
    } catch (error) {
      console.error('[OpenAI] Failed to convert Zod schema to JSON schema', error);
      throw new Error(
        error instanceof Error
          ? `Failed to convert schema: ${error.message}`
          : 'Failed to convert schema'
      );
    }
  }

  return { payload, isWrappedArray };
}

export function createOpenAIAdapter(): ProviderAdapter {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is required to use the OpenAI provider. Set the environment variable and try again.'
    );
  }

  const baseUrl =
    process.env.OPENAI_API_BASE_URL?.replace(/\/$/, '') ?? 'https://api.openai.com/v1';

  return {
    name: PROVIDER_NAME,
    defaultModel: MODEL_CASCADE[0],
    async generate(params: ProviderGenerateParams): Promise<ProviderGenerateResult> {
      const models = buildModelList(params.model);
      let lastError: unknown;
      const promptLength = params.prompt.length;

      for (const modelName of models) {
        const { controller, clear } = buildAbortController(params.timeoutMs);
        const requestStartedAt = Date.now();

        try {
          const { payload, isWrappedArray } = buildPayload(params, modelName);
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller?.signal,
          });

          const responseText = await response.text();
          let parsed: any;

          try {
            parsed = responseText ? JSON.parse(responseText) : undefined;
          } catch (parseError) {
            console.error('[OpenAI] Failed to parse JSON response', parseError);
            throw new Error('OpenAI API returned a non-JSON response.');
          }

          if (!response.ok) {
            const message =
              parsed?.error?.message ||
              parsed?.message ||
              response.statusText ||
              'Unknown error';
            const code = parsed?.error?.code || parsed?.code;
            const error = new Error(
              `OpenAI API error${code ? ` (${code})` : ''}: ${message}`
            );
            (error as any).status = response.status;
            throw error;
          }

          const latencyMs = Date.now() - requestStartedAt;
          const choice = Array.isArray(parsed?.choices)
            ? parsed.choices[0]
            : undefined;
          let content = extractTextFromChoice(choice);

          if (!content) {
            console.warn(
              `[OpenAI] Model ${modelName} returned empty response, trying next...`
            );
            continue;
          }

          // If we wrapped an array schema, unwrap the response
          if (isWrappedArray) {
            try {
              const parsedContent = JSON.parse(content);
              if (parsedContent && 'items' in parsedContent) {
                content = JSON.stringify(parsedContent.items);
              }
            } catch {
              // If parsing fails, return content as-is
            }
          }

          const usage = normalizeUsage(parsed?.usage, latencyMs);

          console.log(
            `[OpenAI][${modelName}] latency=${latencyMs}ms promptChars=${promptLength} ` +
              `promptTokens=${usage?.promptTokens ?? 'n/a'} completionTokens=${
                usage?.completionTokens ?? 'n/a'
              } totalTokens=${usage?.totalTokens ?? 'n/a'}`
          );

          return {
            content,
            rawResponse: parsed,
            provider: PROVIDER_NAME,
            model: parsed?.model ?? modelName,
            usage,
          };
        } catch (error) {
          lastError = error;

          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('OpenAI request timed out.');
          }

          const description = describeError(error);

          if (!isRetryableError(error)) {
            console.error(
              `[OpenAI] Model ${modelName} failed with non-retryable error (${description}):`,
              error
            );
            throw new Error(
              `OpenAI API error (${description}): ${
                error instanceof Error ? error.message : 'Unknown error'
              }`
            );
          }

          console.warn(
            `[OpenAI] Model ${modelName} ${description}, attempting next fallback...`
          );
        } finally {
          clear();
        }
      }

      const description = describeError(lastError);
      throw new Error(
        `All OpenAI models failed. Last error type: ${description}. ${
          lastError instanceof Error ? lastError.message : 'Unknown error'
        }`
      );
    },
  };
}


type ChatRequestBody = {
  message?: unknown;
  model?: unknown;
};

type ApiResult = {
  answer?: string;
  error?: unknown;
  [key: string]: unknown;
};

const PORT = Number(Bun.env.PORT || 3000);
const html = Bun.file("public/index.html");

const providers = {
  claude: {
    key: "ANTHROPIC_API_KEY",
    models: ["claude-sonnet-4-5"],
  },
  gemini: {
    key: "GEMINI_API_KEY",
    models: ["gemini-3.8-flash", "gemini-3.7-flash"],
  },
  groq: {
    key: "GROQ_API_KEY",
    models: ["openai/gpt-oss-20b"],
  },
  openrouter: {
    key: "OPENROUTER_API_KEY",
    models: ["openrouter/free"],
  },
  cohere: {
    key: "COHERE_API_KEY",
    models: ["command-a-plus-05-2026"],
  },
  zai: {
    key: "ZAI_API_KEY",
    models: ["glm-5.3"],
  },
  sambanova: {
    key: "SAMBANOVA_API_KEY",
    models: ["GLM-5.3", "Meta-Llama-3.3-70B-Instruct"],
  },
  freellm: {
    key: "FREELLM_API_KEY",
    models: [
      "auto",
      "fusion",
      "claude-opus-4-5",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "auto:free-claude-code",
      "dots3-note-preview",
      "qwen3.8-27b",
      "gpt-oss-120b",
      "gpt-oss-20b",
      "nemotron-3-ultra-550b",
      "qwen3.6-27b",
      "gemma-4-31b",
      "qwen3.5-397b",
      "gemma-4-26b-a4b",
      "kilo-auto",
      "qwen3.5-9b",
      "free-router",
      "nemotron-3.5-lightning",
      "north-mini-code",
      "nemotron-3-nano-30b-reasoning",
      "nemotron-3-nano-omni-reasoning",
      "lfm2.5-2.6b",
      "llama-3.3-70b",
      "mistral-small-3.2-24b",
      "qwen2.5-vl-72b",
      "qwen3guard-gen-8b",
      "qwen3guard-gen-0.6b",
    ],
  },
} as const;

type ProviderName = keyof typeof providers;

function getError(data: ApiResult): string {
  if (typeof data.error === "string") return data.error;

  const error: unknown = data.error;

  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error
  ) {
    return String(
      (error as { message: unknown }).message
    );
  }

  return "Provider API request failed.";
}

async function readJson(response: Response): Promise<ApiResult> {
  return (await response.json()) as ApiResult;
}

async function safeFetch(
  url: string,
  options: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Request timed out. 30 seconds baad dobara try karein.");
    }

    throw error;
  }
}

async function openAIRequest(
  url: string,
  apiKey: string,
  model: string,
  message: string,
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  const response = await safeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: message }],
      max_tokens: 2048,
    }),
  });

  const data = await readJson(response);

  if (!response.ok) throw new Error(getError(data));

  const choices = data.choices as
    | Array<{ message?: { content?: unknown } }>
    | undefined;

  const content = choices?.[0]?.message?.content;

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (
          part &&
          typeof part === "object" &&
          "text" in part
        ) {
          return String(part.text);
        }
        return "";
      })
      .join("\n");
  }

  throw new Error("Provider ne empty response diya.");
}

async function askProvider(
  provider: ProviderName,
  model: string,
  message: string
): Promise<string> {
  const apiKey = Bun.env[providers[provider].key];

  if (!apiKey) {
    throw new Error(`${provider} ki API key .env mein nahi mili.`);
  }

  if (
    !(providers[provider].models as readonly string[]).includes(model)
  ) {
    throw new Error("Selected model supported nahi hai.");
  }

  // FREELLM API GATEWAY
  if (provider === "freellm") {
    const baseURL = (
      Bun.env.FREELLM_BASE_URL ||
      "http://127.0.0.1:31415/v1"
    ).replace(/\/+$/, "");

    return openAIRequest(
      `${baseURL}/chat/completions`,
      apiKey,
      model,
      message
    );
  }

  // CLAUDE
  if (provider === "claude") {
    const response = await safeFetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [{ role: "user", content: message }],
        }),
      }
    );

    const data = await readJson(response);

    if (!response.ok) throw new Error(getError(data));

    const content = data.content as
      | Array<{ type?: string; text?: string }>
      | undefined;

    return (content || [])
      .filter((item) => item.type === "text")
      .map((item) => item.text || "")
      .join("\n");
  }

  // GEMINI
  if (provider === "gemini") {
    const response = await safeFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: message }],
            },
          ],
        }),
      }
    );

    const data = await readJson(response);

    if (!response.ok) throw new Error(getError(data));

    const candidates = data.candidates as
      | Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>
      | undefined;

    return (candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("\n");
  }

  // GROQ
  if (provider === "groq") {
    return openAIRequest(
      "https://api.groq.com/openai/v1/chat/completions",
      apiKey,
      model,
      message
    );
  }

  // OPENROUTER
  if (provider === "openrouter") {
    return openAIRequest(
      "https://openrouter.ai/api/v1/chat/completions",
      apiKey,
      model,
      message,
      {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "USMANI AI",
      }
    );
  }

  // COHERE
  if (provider === "cohere") {
    const response = await safeFetch(
      "https://api.cohere.com/v2/chat",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: message }],
        }),
      }
    );

    const data = await readJson(response);

    if (!response.ok) throw new Error(getError(data));

    const result = data.message as
      | { content?: Array<{ text?: string }> }
      | undefined;

    return (result?.content || [])
      .map((part) => part.text || "")
      .join("\n");
  }

  // Z.AI
  if (provider === "zai") {
    return openAIRequest(
      "https://api.z.ai/api/paas/v4/chat/completions",
      apiKey,
      model,
      message
    );
  }

  // SAMBANOVA
  if (provider === "sambanova") {
    return openAIRequest(
      "https://api.sambanova.ai/v1/chat/completions",
      apiKey,
      model,
      message
    );
  }

  throw new Error("Unknown provider.");
}

Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/health") {
      const status: Record<string, boolean> = {};

      for (const [name, config] of Object.entries(providers)) {
        status[name] = Boolean(Bun.env[config.key]);
      }

      return Response.json({
        status: "online",
        app: "USMANI AI",
        providers: status,
      });
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      try {
        const body = (await req.json()) as ChatRequestBody;

        const message =
          typeof body.message === "string"
            ? body.message.trim()
            : "";

        const selected =
          typeof body.model === "string"
            ? body.model.trim()
            : "";

        if (!message) {
          return Response.json(
            { error: "Message empty hai." },
            { status: 400 }
          );
        }

        const separator = selected.indexOf("|");

        let provider: string;
        let model: string;

        if (separator > 0) {
          provider = selected.slice(0, separator);
          model = selected.slice(separator + 1);
        } else if (selected.startsWith("gemini-")) {
          provider = "gemini";
          model = selected;
        } else {
          provider = "claude";
          model = selected || "claude-sonnet-4-5";
        }

        if (!(provider in providers)) {
          return Response.json(
            { error: "Selected provider supported nahi hai." },
            { status: 400 }
          );
        }

        const answer = await askProvider(
          provider as ProviderName,
          model,
          message
        );

        return Response.json({
          answer,
          provider,
          model,
        });
      } catch (error) {
        console.error("Chat API Error:", error);

        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Server request failed.",
          },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "API route not found." },
        { status: 404 }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`USMANI AI running at http://localhost:${PORT}`);

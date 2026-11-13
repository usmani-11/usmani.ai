
const providers = {
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  cohere: "COHERE_API_KEY",
  zai: "ZAI_API_KEY",
  sambanova: "SAMBANOVA_API_KEY",
  freellm: "FREELLM_API_KEY"
};

function errorMessage(data: unknown): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data
  ) {
    const error = (data as { error: unknown }).error;

    if (typeof error === "string") {
      return error;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }
  }

  return "Provider API request failed.";
}

async function requestJSON(
  url: string,
  options: any
): Promise<any> {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(30000)
  });

  const data: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(errorMessage(data));
  }

  return data;
}

async function askAI(
  provider: string,
  model: string,
  message: string
): Promise<string> {
  const keyName = providers[provider as keyof typeof providers];

  if (!keyName) {
    throw new Error("Unsupported provider.");
  }

  const apiKey = process.env[keyName];

  if (!apiKey) {
    throw new Error(
      `${keyName} Vercel Environment Variables mein missing hai.`
    );
  }

  const body = {
    model,
    messages: [{ role: "user", content: message }],
    max_tokens: 2048
  };

  // CLAUDE
  if (provider === "claude") {
    const data = await requestJSON(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [
            { role: "user", content: message }
          ]
        })
      }
    );

    return (data.content || [])
      .filter((item: any) => item.type === "text")
      .map((item: any) => item.text)
      .join("\n");
  }

  // GEMINI
  if (provider === "gemini") {
    const data = await requestJSON(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: message }]
            }
          ]
        })
      }
    );

    return (data.candidates?.[0]?.content?.parts || [])
      .map((part: any) => part.text || "")
      .join("\n");
  }

  // COHERE
  if (provider === "cohere") {
    const data = await requestJSON(
      "https://api.cohere.com/v2/chat",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "user", content: message }
          ]
        })
      }
    );

    return (data.message?.content || [])
      .map((part: any) => part.text || "")
      .join("\n");
  }

  // OPENAI-COMPATIBLE PROVIDERS
  let baseURL = "";

  switch (provider) {
    case "groq":
      baseURL = "https://api.groq.com/openai/v1";
      break;

    case "openrouter":
      baseURL = "https://openrouter.ai/api/v1";
      break;

    case "zai":
      baseURL = "https://api.z.ai/api/paas/v4";
      break;

    case "sambanova":
      baseURL = "https://api.sambanova.ai/v1";
      break;

    case "freellm":
      baseURL = process.env.FREELLM_BASE_URL || "";

      if (
        !baseURL ||
        /localhost|127\.0\.0\.1/.test(baseURL)
      ) {
        throw new Error(
          "FreeLLM ka online gateway URL configure nahi hai. Localhost Vercel par kaam nahi karta."
        );
      }
      break;
  }

  if (!baseURL) {
    throw new Error("Provider configuration missing.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] =
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://usmaniai-three.vercel.app";

    headers["X-Title"] = "USMANI AI";
  }

  const data = await requestJSON(
    `${baseURL.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    }
  );

  const content = data.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part: any) => part.text || "")
      .join("\n");
  }

  throw new Error("Provider ne empty response diya.");
}

// VERCEL API HANDLER
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    const selected =
      typeof req.body?.model === "string"
        ? req.body.model.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        error: "Message empty hai."
      });
    }

    const separator = selected.indexOf("|");

    let provider = "claude";
    let model = "claude-sonnet-4-5";

    if (separator > 0) {
      provider = selected.slice(0, separator);
      model = selected.slice(separator + 1);
    } else if (selected.startsWith("gemini-")) {
      provider = "gemini";
      model = selected;
    } else if (selected) {
      model = selected;
    }

    const answer = await askAI(
      provider,
      model,
      message
    );

    return res.status(200).json({
      answer,
      provider,
      model
    });

  } catch (error) {
    console.error("USMANI AI API Error:", error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Server request failed."
    });
  }
}

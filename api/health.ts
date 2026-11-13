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

export default function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const status: Record<string, boolean> = {};

  for (const [name, key] of Object.entries(providers)) {
    status[name] = Boolean(process.env[key]);
  }

  return res.status(200).json({
    status: "online",
    app: "USMANI AI",
    providers: status
  });
}
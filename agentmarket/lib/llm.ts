// Server-side LLM for decomposition + aggregation. Prefers Groq; falls back
// to Gemini when `SERVER_LLM_PROVIDER=gemini`, no Groq key, or Groq returns
// 401/429 (org-wide TPD is shared by all API keys in the same account).

const GROQ_BASE_URL = (
  process.env.GROQ_BASE_URL ||
  process.env.MODAL_BASE_URL ||
  'https://api.groq.com/openai/v1'
).replace(/\/+$/, '');

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.MODAL_API_KEY || '';
const GROQ_MODEL =
  process.env.SERVER_LLM_MODEL ||
  process.env.MODAL_MODEL ||
  'llama-3.3-70b-versatile';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL =
  process.env.SERVER_GEMINI_MODEL ||
  process.env.GEMINI_MODEL ||
  'gemini-2.5-flash';

const MAX_TOKENS = Number(process.env.SERVER_LLM_MAX_TOKENS || '2048');

interface ChatChoice {
  message?: { content?: string; reasoning_content?: string };
  finish_reason?: string;
}
interface ChatResponse {
  choices?: ChatChoice[];
}

function groqError(status: number, text: string): Error & { status: number } {
  const e = new Error(
    `Server LLM HTTP ${status}: ${text.slice(0, 400)}`,
  ) as Error & { status: number };
  e.status = status;
  return e;
}

async function callServerGroq(prompt: string, jsonMode = false): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error('callServerGroq: GROQ_API_KEY (or MODAL_API_KEY) is not set');
  }
  const reqBody: Record<string, unknown> = {
    model: GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: MAX_TOKENS,
  };
  if (jsonMode) reqBody.response_format = { type: 'json_object' };
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(reqBody),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw groqError(res.status, text);
  }
  const body = (await res.json()) as ChatResponse;
  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim();
  }
  const reasoning = choice?.message?.reasoning_content;
  if (typeof reasoning === 'string' && reasoning.trim().length > 0) {
    return reasoning.trim();
  }
  throw new Error(
    `Server LLM returned empty content (finish=${choice?.finish_reason}): ${JSON.stringify(body).slice(0, 300)}`,
  );
}

async function callServerGemini(prompt: string, jsonMode = false): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('callServerGemini: GEMINI_API_KEY is not set');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL,
  )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const generationConfig: Record<string, unknown> = { maxOutputTokens: MAX_TOKENS };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Server Gemini HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const body = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const part = body.candidates?.[0]?.content?.parts?.[0];
  const t = part?.text;
  if (typeof t === 'string' && t.trim().length > 0) {
    return t.trim();
  }
  throw new Error(
    `Server Gemini empty response: ${JSON.stringify(body).slice(0, 300)}`,
  );
}

function shouldRetryGroqWithGemini(err: unknown): boolean {
  if (!GEMINI_API_KEY) return false;
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: number }).status;
    if (s === 401 || s === 429) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('rate_limit') ||
    msg.includes('Invalid API Key') ||
    msg.includes('HTTP 429') ||
    msg.includes('HTTP 401')
  );
}

export async function callServerLLM(prompt: string, jsonMode = false): Promise<string> {
  const prefer = (process.env.SERVER_LLM_PROVIDER || 'groq').toLowerCase();
  if (prefer === 'gemini' && GEMINI_API_KEY) {
    return callServerGemini(prompt, jsonMode);
  }
  if (GROQ_API_KEY) {
    try {
      return await callServerGroq(prompt, jsonMode);
    } catch (err) {
      if (shouldRetryGroqWithGemini(err)) {
        console.warn(
          '[callServerLLM] Groq failed, falling back to Gemini for this call',
        );
        return callServerGemini(prompt, jsonMode);
      }
      throw err;
    }
  }
  if (GEMINI_API_KEY) {
    return callServerGemini(prompt, jsonMode);
  }
  throw new Error(
    'callServerLLM: set GROQ_API_KEY (or MODAL_API_KEY) and/or GEMINI_API_KEY',
  );
}

export interface SubTask {
  title: string;
  input: string;
}

const DECOMPOSER_PROMPT = (job: {
  title: string;
  category: string;
  input: string;
}): string =>
  [
    'You are a task decomposer for an agent marketplace. Break the following task into EXACTLY 3 distinct, focused sub-tasks that can be solved independently and combined into a complete answer.',
    'Each sub-task must:',
    '- Have a short, specific title (max 60 chars).',
    '- Have a self-contained input that includes any URL or context the worker needs (you may repeat the original input).',
    '- Cover a different angle of the original task.',
    '',
    'Return ONLY a single JSON object on one line with this exact shape, no prose, no markdown fences:',
    '{"subtasks":[{"title":"...","input":"..."},{"title":"...","input":"..."},{"title":"...","input":"..."}]}',
    '',
    `Task title: ${job.title}`,
    `Task category: ${job.category}`,
    `Task input: ${job.input}`,
  ].join('\n');

// Strips ```json ... ``` fences and trailing prose if the model misbehaved.
function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  // Try a fenced block first.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Else find the first { ... } that parses.
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  return trimmed.slice(firstBrace, lastBrace + 1);
}

export async function decomposeJob(job: {
  title: string;
  category: string;
  input: string;
}): Promise<SubTask[]> {
  const prompt = DECOMPOSER_PROMPT(job);
  const raw = await callServerLLM(prompt, true);
  const jsonStr = extractJsonObject(raw);
  if (!jsonStr) {
    throw new Error(`decomposeJob: no JSON found in LLM output: ${raw.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `decomposeJob: JSON.parse failed: ${(err as Error).message} :: raw=${jsonStr.slice(0, 200)}`,
    );
  }
  const subtasks = (parsed as { subtasks?: unknown }).subtasks;
  if (!Array.isArray(subtasks) || subtasks.length === 0) {
    throw new Error(`decomposeJob: subtasks missing or empty in: ${jsonStr.slice(0, 200)}`);
  }
  // Coerce to exactly 3 entries; pad or trim defensively.
  const normalized: SubTask[] = subtasks.slice(0, 3).map((s, i) => {
    const obj = (s ?? {}) as { title?: unknown; input?: unknown };
    const title =
      typeof obj.title === 'string' && obj.title.trim()
        ? obj.title.trim().slice(0, 80)
        : `Sub-task ${i + 1}`;
    const input =
      typeof obj.input === 'string' && obj.input.trim()
        ? obj.input.trim()
        : job.input;
    return { title, input };
  });
  while (normalized.length < 3) {
    normalized.push({
      title: `Sub-task ${normalized.length + 1}`,
      input: job.input,
    });
  }
  return normalized;
}

export async function aggregateResults(
  parent: { title: string; input: string; category: string },
  children: { title: string; result: string }[],
): Promise<string> {
  const sections = children
    .map(
      (c, i) =>
        `Sub-result ${i + 1} — "${c.title}":\n${c.result.trim()}`,
    )
    .join('\n\n');
  const prompt = [
    'You are a synthesizer for an agent marketplace. Combine the following sub-results into ONE coherent answer to the original task.',
    'Be concise but complete. No preamble, no commentary, no headers like "Combined Answer:" — just the final answer.',
    '',
    `Original task: ${parent.title}`,
    `Original input: ${parent.input}`,
    `Category: ${parent.category}`,
    '',
    sections,
    '',
    'Final answer:',
  ].join('\n');
  return callServerLLM(prompt);
}

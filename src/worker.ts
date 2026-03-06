import { Hono } from 'hono';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
import { LifeCycleManager } from './LifeCycleManager';

const assetManifest = JSON.parse(manifestJSON);

export { LifeCycleManager };

type Env = {
  BIOME_STATE: DurableObjectNamespace;
  AI: any;
  DB: D1Database;
  R2: R2Bucket;
  VECTOR_INDEX: VectorizeIndex;
  __STATIC_CONTENT: any;
};

const app = new Hono<{ Bindings: Env }>();

// ── 静态资源处理函数 ──
async function handleStaticAssets(c: any) {
  const url = new URL(c.req.url);
  try {
    const asset = await getAssetFromKV(
      {
        request: c.req.raw,
        waitUntil: (promise: Promise<any>) => c.executionCtx.waitUntil(promise),
      },
      {
        ASSET_NAMESPACE: c.env.__STATIC_CONTENT,
        ASSET_MANIFEST: assetManifest,
      }
    );

    const response = new Response(asset.body, asset);
    if (url.pathname.endsWith('.js')) {
      response.headers.set('Content-Type', 'application/javascript');
    }
    return response;
  } catch (e) {
    // 404 降级到 index.html (SPA 支持)
    try {
      return await getAssetFromKV(
        {
          request: new Request(`${url.origin}/index.html`),
          waitUntil: (promise: Promise<any>) => c.executionCtx.waitUntil(promise),
        },
        {
          ASSET_NAMESPACE: c.env.__STATIC_CONTENT,
          ASSET_MANIFEST: assetManifest,
        }
      );
    } catch (inner) {
      return c.text('Not Found', 404);
    }
  }
}

// ── Helper functions ──
function hashTags(envTags: string[], prompt: string): string {
  const combined = [...envTags.sort(), prompt].join('|');
  return Array.from(new TextEncoder().encode(combined))
    .reduce((a, b) => a + b, 0)
    .toString(36);
}

function generatePrompt(envTags: string[], prompt: string, genome: any): string {
  return `You are the Evolutionary Adjudicator for Project Morpho. 
Current environment: ${envTags.join(', ')}
User mutation intent: "${prompt}"
Current Genome Snapshot: ${JSON.stringify(genome || {})}

CRITICAL RULES:
1. You MUST reject any non-biological or mechanical mutations. PROHIBITED structures include gears, jets, metal joints, tracks, guns, lasers, or any artificial concepts. If the intent violates this, return a JSON with status: "REJECTED", a short "reasoning", and a "suggestion".
2. Assess physical constraint & ATP cost. Give an internal score (0-100). If it's too unrealistic biologically, reject it.
3. Assess the design's multi-dimensional attributes by outputting the following root-level keys inside the JSON: "sensory_complexity" (0-10), "aggressiveness" (0-10), "divinity" (0-10), along with a short atmospheric text "narrative_evaluation".
4. If accepted (status: "SUCCESS"), return a mutated JSON genome with updated morphology/traits matching the intent under the "patches" key.
5. Output ONLY valid JSON, do not include markdown blocks or explanations outside the JSON.`;
}

async function checkChatLimit(env: Env, bioId: string): Promise<{ allowed: boolean, remaining: number }> {
  const today = new Date().toISOString().split('T')[0];
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS UserStats (
        bioId TEXT PRIMARY KEY,
        lastChatDate TEXT,
        chatCount INTEGER
      )
    `).run();

    const stats = await env.DB.prepare("SELECT * FROM UserStats WHERE bioId = ?").bind(bioId).first() as any;

    if (!stats || stats.lastChatDate !== today) {
      await env.DB.prepare("INSERT OR REPLACE INTO UserStats (bioId, lastChatDate, chatCount) VALUES (?, ?, ?)")
        .bind(bioId, today, 1).run();
      return { allowed: true, remaining: 9 };
    }

    if (stats.chatCount >= 10) {
      return { allowed: false, remaining: 0 };
    }

    await env.DB.prepare("UPDATE UserStats SET chatCount = chatCount + 1 WHERE bioId = ?").bind(bioId).run();
    return { allowed: true, remaining: 10 - (stats.chatCount + 1) };
  } catch (e) {
    console.error("D1 UserStats error:", e);
    return { allowed: true, remaining: -1 };
  }
}

async function getMutation(env: Env, envTags: string[], prompt: string, currentGenome: any) {
  const cacheKey = hashTags(envTags, prompt);
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS mutation_cache (
        cache_key TEXT PRIMARY KEY,
        genome_patch TEXT,
        success_rate REAL DEFAULT 1.0
      )
    `).run();

    const cached = await env.DB.prepare(
      "SELECT genome_patch FROM mutation_cache WHERE cache_key = ? AND success_rate > 0.8"
    ).bind(cacheKey).first() as any;

    if (cached) {
      console.log("[Cache] ⚡ Hit! Reusing evolution path for:", prompt);
      return JSON.parse(cached.genome_patch);
    }
  } catch (e) {
    console.error('D1 query failed:', e);
  }

  console.log("[AI] 🧠 Calling LLM for new evolution path...");
  const aiResult = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    prompt: generatePrompt(envTags, prompt, currentGenome)
  });

  let processedResult = aiResult;
  if (typeof aiResult === 'string') {
    try { processedResult = JSON.parse(aiResult); } catch (e) { }
  }

  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO mutation_cache (cache_key, genome_patch) VALUES (?, ?)"
    ).bind(cacheKey, JSON.stringify(processedResult)).run();
  } catch (e) {
    console.error('D1 insert failed:', e);
  }

  return processedResult;
}

// ── API Routes ──

// WebSocket
app.all('/ws', (c) => {
  const id = c.env.BIOME_STATE.idFromName("GLOBAL_BIOME");
  const stub = c.env.BIOME_STATE.get(id);
  return stub.fetch(c.req.raw);
});

// Mutate
app.post('/api/mutate', async (c) => {
  const body = await c.req.json() as any;
  const { intent, bioId, envTags, currentGenome } = body;

  const limit = await checkChatLimit(c.env, bioId || "anonymous");
  if (!limit.allowed) {
    return c.json({
      error: 'NEURAL_EXHAUSTED',
      message: '你的神经索无法再承受更多位面信息，今天请休息吧。'
    }, 429);
  }

  const mutationProposal = await getMutation(c.env, envTags || [], intent, currentGenome);

  const id = c.env.BIOME_STATE.idFromName(bioId || "GLOBAL_BIOME");
  const obj = c.env.BIOME_STATE.get(id);

  const response = await obj.fetch(new Request('http://dummy/evolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutation: mutationProposal, intent })
  }));

  const finalRes = new Response(response.body, response);
  finalRes.headers.set('X-Chats-Remaining', limit.remaining.toString());
  return finalRes;
});

// Admin: Trigger Disaster
app.post('/api/admin/trigger-disaster', async (c) => {
  const body = await c.req.json() as any;
  const id = c.env.BIOME_STATE.idFromName("GLOBAL_BIOME");
  const stub = c.env.BIOME_STATE.get(id);

  return stub.fetch(new Request('http://dummy/admin/trigger-disaster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }));
});

// Memory: Save
app.post('/api/memory/save', async (c) => {
  const { user_input, ai_response, current_genome_snapshot, timestamp } = await c.req.json<any>();
  const text = [user_input, ai_response, current_genome_snapshot].filter(Boolean).join(' | ');

  const vecId = Math.abs(
    Array.from(new TextEncoder().encode(timestamp + user_input.slice(0, 20)))
      .reduce((a, b) => a + b, 0)
  ).toString(36);

  const embeddingResult = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [text.slice(0, 512)]
  });
  const vector = embeddingResult?.data?.[0] ?? [];

  if (c.env.VECTOR_INDEX && vector.length > 0) {
    await c.env.VECTOR_INDEX.upsert([{
      id: vecId,
      values: vector,
      metadata: { user_input: user_input.slice(0, 200), ai_response: ai_response.slice(0, 200), timestamp }
    }]);
  }
  return c.json({ status: 'saved', id: vecId });
});

// Memory: Recent
app.get('/api/memory/recent', async (c) => {
  const n = parseInt(c.req.query('n') ?? '3');
  const zero = new Array(768).fill(0);
  let memories: any[] = [];
  if (c.env.VECTOR_INDEX) {
    const result = await c.env.VECTOR_INDEX.query(zero, { topK: n, returnMetadata: true });
    memories = (result.matches ?? []).map((m: any) => m.metadata);
  }
  return c.json(memories);
});

// Static Assets Fallback
app.get('*', (c) => handleStaticAssets(c));

// ── Export Worker ──
export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const day = new Date().getDate();
    const id = env.BIOME_STATE.idFromName("GLOBAL_BIOME");
    const stub = env.BIOME_STATE.get(id);

    if (day === 30 || day === 1) {
      console.log("[🌋 Cron] 纪元终结检定触发：大酸化大灾变启动！");
      ctx.waitUntil(stub.fetch(new Request('http://dummy/admin/trigger-disaster', {
        method: 'POST',
        body: JSON.stringify({ environment: '大酸化纪元', intensity: 1.0 })
      })));
    } else if (day % 7 === 0) {
      console.log("[🧊 Cron] 周期扰动触发：全球寒潮即将来临...");
      ctx.waitUntil(stub.fetch(new Request('http://dummy/admin/trigger-disaster', {
        method: 'POST',
        body: JSON.stringify({ environment: '短暂寒潮', intensity: 0.5 })
      })));
    }

    ctx.waitUntil(this.compressMemories(env));
  },

  async compressMemories(env: Env) {
    console.log("[🗓️ Cron] 记忆坍缩引擎启动：正在扫描超过 24 小时的长效对话...");
    if (!env.VECTOR_INDEX) return;
    // Future implementation
  }
};

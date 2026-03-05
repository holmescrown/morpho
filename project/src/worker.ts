// src/worker.ts - Project Morpho Core Worker
import { LifeCycleManager } from './LifeCycleManager';

export { LifeCycleManager };

// 生成缓存键
type Env = {
  BIOME_STATE: DurableObjectNamespace;
  AI: any;
  DB: any;
  R2: any;
};

function hashTags(envTags: string[], prompt: string): string {
  const combined = [...envTags.sort(), prompt].join('|');
  return Array.from(new TextEncoder().encode(combined))
    .reduce((a, b) => a + b, 0)
    .toString(36);
}

function generatePrompt(envTags: string[], prompt: string): string {
  return `You are an evolutionary engine for Project Morpho. 
Current environment tags: ${envTags.join(', ')}
User prompt: ${prompt}
Return a mutated JSON genome with updated traits, considering metabolic balance and physical constraints.
Output ONLY valid JSON.`;
}

async function getMutation(env: Env, envTags: string[], prompt: string) {
  // 1. 语义去重：查询 D1 数据库中是否存在类似的成功进化路径
  const cacheKey = hashTags(envTags, prompt);
  try {
    const cached = await env.DB.prepare(
      "SELECT genome_patch FROM mutation_cache WHERE cache_key = ? AND success_rate > 0.8"
    ).bind(cacheKey).first();

    if (cached) {
      return JSON.parse(cached.genome_patch); // 命中缓存，省掉 AI 钱
    }
  } catch (e) {
    console.log('D1 query failed, falling back to AI:', e);
  }

  // 2. 缓存未命中，调用 Workers AI
  const aiResult = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    prompt: generatePrompt(envTags, prompt)
  });

  // 3. 异步存入 D1，供全球玩家共享
  try {
    await env.DB.prepare(
      "INSERT INTO mutation_cache (cache_key, genome_patch) VALUES (?, ?)"
    ).bind(cacheKey, JSON.stringify(aiResult)).run();
  } catch (e) {
    console.log('D1 insert failed:', e);
  }

  return aiResult;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // 处理 WebSocket 连接请求
    if (url.pathname === '/ws') {
      const id = env.BIOME_STATE.idFromName("GLOBAL_BIOME");
      const stub = env.BIOME_STATE.get(id);
      return stub.fetch(request);
    }

    // 处理突变请求
    if (url.pathname === '/api/mutate') {
      try {
        const { prompt, bioId, envTags } = await request.json();

        // 获取突变建议（优先从缓存）
        const mutationProposal = await getMutation(env, envTags || [], prompt);

        // 路由到 Durable Object 进行 Wasm 校验和状态更新
        const id = env.BIOME_STATE.idFromName(bioId || "default");
        const obj = env.BIOME_STATE.get(id);

        // 传递当前基因组和突变建议
        const response = await obj.fetch(new Request('http://dummy/evolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mutation: mutationProposal })
        }));

        return response;
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Mutation failed', details: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response("Project Morpho API Edge", { status: 200 });
  }
};

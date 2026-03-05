// src/worker.ts - Project Morpho Core Worker
import { LifeCycleManager } from './LifeCycleManager';

export { LifeCycleManager };

// 生成缓存键
type Env = {
  MORPHO_BIOME: any; // DurableObjectNamespace - 由 Cloudflare Runtime 提供
  MORPHO_AI: any;
  MORPHO_DB: any;
  MORPHO_R2: any;
  MORPHO_VECTOR: any;
};

import { runMutationPipeline, MutationRequest, buildParsePrompt } from './promptEngine';

// P0.5 核心：两段式 LLM 处理流水线
// 层1（裁判）→ 层2（解析）→ Wasm 物理校验
async function processMutationRequest(
  env: any,
  intent: string,
  targetPart: 'morphology' | 'metabolism' | 'genetics',
  currentGenome: any,
  environmentContext?: string
) {
  const req: MutationRequest = { targetPart, intent, currentGenome, environmentContext };

  const { adjudication, parse } = await runMutationPipeline(req, (model, params) =>
    env.MORPHO_AI.run(model, params)
  );

  return { adjudication, parse };
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // 处理 WebSocket 连接请求
    if (url.pathname === '/ws') {
      const id = env.MORPHO_BIOME.idFromName("GLOBAL_BIOME");
      const stub = env.MORPHO_BIOME.get(id);
      return stub.fetch(request);
    }

    // P0.5 突变请求：两段式 LLM 流水线（裁判→解析→Wasm）
    if (url.pathname === '/api/mutate') {
      try {
        const gmSecret = request.headers.get('x-gm-secret');
        const isGM = gmSecret === 'MorphoGod'; // 临时 GM 密钥

        const body = await request.json() as {
          intent: string;
          targetPart?: 'morphology' | 'metabolism' | 'genetics';
          bioId?: string;
          environmentContext?: string;
          currentGenome?: any;
        };
        const { intent, targetPart = 'morphology', bioId, environmentContext, currentGenome } = body;

        let finalAdjudicationScore = 100;
        let finalParse: any = null;

        if (isGM) {
          // GM 模式：绕过系统裁判，直接进入解析阶段
          console.log('GM Access Granted');
          const req: MutationRequest = { targetPart, intent, currentGenome, environmentContext };
          const parseRaw = await env.MORPHO_AI.run('@cf/meta/llama-3.1-8b-instruct', {
            prompt: buildParsePrompt(req), // 直接调用解析 Prompt
            max_tokens: 512,
          });

          try {
            const text = parseRaw.response || parseRaw.result || '{}';
            const match = text.match(/\{[\s\S]*\}/);
            finalParse = match ? JSON.parse(match[0]) : { patches: [], semanticMemoryEntry: 'GM Force Mutation' };
          } catch {
            finalParse = { patches: [], semanticMemoryEntry: 'GM Parsing Failed' };
          }
        } else {
          // 标准模式：执行裁判 + 解析流水线
          const { adjudication, parse } = await processMutationRequest(
            env, intent, targetPart, currentGenome || {}, environmentContext
          );

          if (adjudication.verdict === 'REJECTED') {
            return new Response(JSON.stringify({
              status: 'REJECTED',
              score: adjudication.score,
              reasoning: adjudication.reasoning,
              suggestion: adjudication.suggestion
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          finalAdjudicationScore = adjudication.score;
          finalParse = parse;
        }

        // 裁判通过或 GM 强制：将结果送往 DO 验证物理合法性
        const id = env.MORPHO_BIOME.idFromName(bioId || 'default');
        const obj = env.MORPHO_BIOME.get(id);
        const response = await obj.fetch(new Request('http://dummy/evolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mutation: finalParse,
            adjudicationScore: finalAdjudicationScore,
            evolutionContext: environmentContext
          })
        }));

        return response;
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Mutation failed', details: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // P0.7 GM 管理接口：手动触发灾难 (需 x-gm-secret)
    if (url.pathname === '/api/admin/trigger-disaster') {
      const gmSecret = request.headers.get('x-gm-secret');
      if (gmSecret !== 'MorphoGod') {
        return new Response('Unauthorized', { status: 401 });
      }

      try {
        const { environment, intensity } = await request.json() as any;
        const id = env.MORPHO_BIOME.idFromName("GLOBAL_BIOME");
        const stub = env.MORPHO_BIOME.get(id);

        // 发送灾变指令到全局 BIOME Durable Object
        const response = await stub.fetch(new Request('http://dummy/admin/trigger-disaster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-gm-secret': 'MorphoGod' },
          body: JSON.stringify({ environment, intensity })
        }));

        return response;
      } catch (e) {
        return new Response(String(e), { status: 500 });
      }
    }

    // P1 进化树查询接口
    if (url.pathname === '/api/evolution-tree') {
      try {
        // 查询最近的 50 个物种向量进行聚类分析
        const topN = 50;
        const results = await env.MORPHO_VECTOR.query([0.1, 0.2], { // 哑查询以获取最近项
          topK: topN,
          returnMetadata: true
        });

        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to fetch tree data', details: String(e) }), {
          status: 500
        });
      }
    }

    // P3: 创造者之眼 — 多模态照片解析接口
    if (url.pathname === '/api/analyze-photo' && request.method === 'POST') {
      try {
        const body = await request.json() as { imageBase64: string };
        const { imageBase64 } = body;

        if (!imageBase64) {
          return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400 });
        }

        // 调用 Workers AI 多模态视觉模型解析环境
        const visionResult = await env.MORPHO_AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
          image: baseToUint8Array(imageBase64),
          prompt: `Analyze this photo and describe in 1 sentence what environmental pressures a microorganism would feel here. Focus on: light intensity, temperature clues, moisture, and chemical composition. Output a JSON with: { "environmentTag": "...", "lightTemp": "warm|cool|neutral", "pressure": "high|medium|low", "description": "..." }. Output ONLY valid JSON.`,
          max_tokens: 256
        });

        // 解析 AI 输出
        let analyzed: any = {};
        try {
          const text = visionResult.description || visionResult.response || '{}';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          analyzed = jsonMatch ? JSON.parse(jsonMatch[0]) : { environmentTag: text, lightTemp: 'neutral', pressure: 'medium', description: text };
        } catch (parseErr) {
          analyzed = { environmentTag: '\u672a知环境', lightTemp: 'neutral', pressure: 'medium', description: String(visionResult) };
        }

        return new Response(JSON.stringify(analyzed), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Photo analysis failed', details: String(e) }), { status: 500 });
      }
    }

    return new Response("Project Morpho API Edge", { status: 200 });
  }
};

// 工具：Base64 转 Uint8Array
function baseToUint8Array(base64: string): Uint8Array {
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

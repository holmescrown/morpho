import { loadPhysicsWasm } from './wasmLoader';
import { generateGenomeVector, syncToVectorize } from './vectorizeUtils';

interface Env {
  AI: any;
  DB: any;
  R2: any;
  VECTOR_INDEX: any;
  BIOME_STATE: DurableObjectNamespace;
}

export class LifeCycleManager {
  state: DurableObjectState;
  env: Env;
  sessions: WebSocket[] = [];
  currentGenome: any;
  physicsEngine: any = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // 初始原始孢子基因组 (涵盖 P0.5 前端兼容与后端新规范)
    this.currentGenome = {
      metadata: { genome_id: "morpho_origin_001", generation: 0 },
      morphology: {
        l_system_rules: { iterations: 2 },
        hox_segments: [{ scaling: { length: 1.0, radius: 5.0, porosity: 0.2 }, joints: [{ stiffness: 0.5 }] }],
        surface: { texture: "chitinous", reflectivity: 0.1, permeability: 0.05 }
      },
      metabolism: {
        energy_storage_capacity: 100,
        basal_metabolic_rate: 0.05,
        efficiency_coefficients: { locomotion: 1.2, thermal_regulation: 0.8, neural_processing: 2.5 },
        diet_type: "photosynthetic"
      },
      genetics: {
        mutation_rate: 0.02,
        recessive_traits: [],
        semantic_memory: ["太古时代：诞生于富含矿物质的浅海"]
      },
      // 兼容旧版前端和物理验证的回退字段
      complexity: 1.0,
      traits: ["basal_metabolism"],
      turgor_pressure: 1.0,
      radius: 5.0,
      color: 0x44aa88,
      energy_reserve: 100.0,
      adaptability: 1.0
    };

    // 异步初始化 Wasm
    this.state.blockConcurrencyWhile(async () => {
      await this.initPhysics();
    });
  }

  private async initPhysics() {
    try {
      // 在生产环境中，我们可以从 R2 或 KV 获取 Wasm 二进制
      // 也可以将其作为 Base64 嵌入代码（虽不推荐但简单）
      // 这里暂时使用模拟的二进制加载逻辑
      const response = await this.env.R2.get('physics.wasm');
      const wasmBinary = response ? await response.arrayBuffer() : new Uint8Array();

      if (wasmBinary.byteLength > 0) {
        this.physicsEngine = await loadPhysicsWasm(wasmBinary);
      }
    } catch (e) {
      console.error("Physics Engine Init Failed:", e);
    }
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader === "websocket") {
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      this.state.acceptWebSocket(server);
      this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client
      } as ResponseInit & { webSocket: WebSocket });
    }

    const url = new URL(request.url);
    // 处理来自 Worker 的管理/测试请求
    if (url.pathname === '/admin/trigger-disaster') {
      try {
        const { environment, intensity } = await request.json() as any;

        // 广播灾变消息给所有前端，触发视觉更新和规则变更
        this.broadcast({
          type: 'GLOBAL_DISASTER',
          environment: environment,
          intensity: intensity || 1.0,
          timestamp: Date.now()
        });

        return new Response(JSON.stringify({ status: "SUCCESS", broadcasted: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(String(e), { status: 500 });
      }
    }

    // 处理来自 Worker 的突变请求
    try {
      const body = await request.json() as any;
      const mutation = body.mutation;
      const response = await this.applyEvolution(mutation);
      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ status: "ERROR", error: String(e) }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private handleSession(ws: WebSocket) {
    this.sessions.push(ws);

    // 发送初始基因组给刚连接的前端
    ws.send(JSON.stringify({ type: 'INIT', genome: this.currentGenome }));

    ws.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);

        // 接收到前端传来的"环境天气"刺激
        if (data.type === 'ENVIRONMENT_TRIGGER') {
          // 这里可以添加处理逻辑
        }
      } catch (e) {
        console.error('WebSocket message error:', e);
      }
    });

    ws.addEventListener('close', () => {
      this.sessions = this.sessions.filter(session => session !== ws);
    });
  }

  async applyEvolution(mutationProposal: any) {
    // 1. 深拷贝当前基因组进行模拟验证 (P0.5 规范：通过 JSON Patch 合并改变)
    const newGenome = JSON.parse(JSON.stringify(this.currentGenome));

    // 2. 将 JSON Patch 深度应用到 newGenome
    if (mutationProposal.patches && Array.isArray(mutationProposal.patches)) {
      for (const patch of mutationProposal.patches) {
        if (patch.op === 'replace' || patch.op === 'add') {
          applyJsonPatch(newGenome, patch.path, patch.value);
        }
      }
    }

    // 3. 追加遗传记忆
    if (mutationProposal.semanticMemoryEntry) {
      if (!newGenome.genetics) newGenome.genetics = {};
      if (!newGenome.genetics.semantic_memory) newGenome.genetics.semantic_memory = [];
      newGenome.genetics.semantic_memory.push(mutationProposal.semanticMemoryEntry);
    }

    // 4. 调用 Wasm 模块进行硬核物理审查
    const isValid = await this.wasmValidate(newGenome);
    if (!isValid) {
      return { status: "MALFORMED", genome: this.currentGenome };
    }

    // 5. 计算 ATP 代谢代价
    const atpCost = this.calculateATPCost(this.currentGenome, newGenome);

    // 6. 计算熵减带来的持续消耗
    const entropyCost = this.physicsEngine
      ? this.physicsEngine.calculateEntropy(newGenome.complexity || 1.0, newGenome.adaptability || 1.0)
      : 0.1;

    const totalCost = atpCost + entropyCost;

    if (totalCost > this.currentGenome.energy_reserve) {
      return {
        status: "EXTINCT",
        reason: "ENERGY_EXHAUSTED",
        genome: this.currentGenome
      };
    }

    // 7. 正式更新状态
    newGenome.energy_reserve = this.currentGenome.energy_reserve - atpCost;
    if (newGenome.metadata) newGenome.metadata.generation += 1;
    this.currentGenome = newGenome;

    // 4. 广播给所有连接的前端
    this.broadcast({
      type: "EVOLVE",
      data: this.currentGenome,
      status: "SUCCESS"
    });

    // 5. 异步同步到 Vectorize 向量库 (P1 核心逻辑)
    this.state.waitUntil((async () => {
      try {
        const vector = await generateGenomeVector(this.env.AI, this.currentGenome);
        await syncToVectorize(this.env.VECTOR_INDEX, this.currentGenome, vector);
        console.log(`Vector synced for ${this.currentGenome.metadata?.genome_id || 'unknown'}`);
      } catch (e) {
        console.error("Vectorize Sync Failed:", e);
      }
    })());

    return {
      status: "SUCCESS",
      genome: this.currentGenome
    };
  }

  private async wasmValidate(genome: any): Promise<boolean> {
    const radius = genome.morphology?.hox_segments?.[0]?.scaling?.radius || genome.radius || 5.0;
    const turgor = genome.turgor_pressure || 1.0;

    if (this.physicsEngine) {
      return this.physicsEngine.validateMutation(radius, turgor, genome.complexity || 1.0);
    }

    // 回退到基于 TS 的简单验证
    if (radius < 0.1 || radius > 10.0) return false;

    return true;
  }

  private calculateATPCost(oldGenome: any, newGenome: any): number {
    const oldRadius = oldGenome.morphology?.hox_segments?.[0]?.scaling?.radius || oldGenome.radius || 5.0;
    const newRadius = newGenome.morphology?.hox_segments?.[0]?.scaling?.radius || newGenome.radius || 5.0;
    const oldTraits = oldGenome.traits || [];
    const newTraits = newGenome.traits || [];
    const newTraitsCount = newTraits.filter((t: string) => !oldTraits.includes(t)).length;

    if (this.physicsEngine) {
      return this.physicsEngine.calculateATPCost(oldRadius, newRadius, newTraitsCount);
    }

    // 回退到旧逻辑
    let cost = 0;
    const sizeChange = Math.abs(newRadius - oldRadius);
    cost += sizeChange * 10;
    cost += newTraitsCount * 20;
    return cost;
  }

  private broadcast(message: object) {
    this.sessions.forEach(session => {
      try {
        session.send(JSON.stringify(message));
      } catch (e) {
        console.error('Broadcast error:', e);
      }
    });
  }
}

// 供 P0.5 前端结构使用的深度取值赋值辅助函数
function applyJsonPatch(obj: any, path: string, value: any) {
  // 将 "a.b[0].c" 转换为 ["a", "b", "0", "c"]
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || current[key] === null) {
      current[key] = isNaN(Number(keys[i + 1])) ? {} : [];
    }
    current = current[key];
  }
  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

// WebSocketPair 类型定义
class WebSocketPair {
  constructor() {
    // 实际实现由 Cloudflare Workers 提供
  }
}

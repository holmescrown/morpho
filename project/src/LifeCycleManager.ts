import { loadPhysicsWasm } from './wasmLoader';
import { generateGenomeVector, syncToVectorize } from './vectorizeUtils';

interface Env {
  MORPHO_AI: any;
  MORPHO_DB: any;
  MORPHO_R2: any;
  MORPHO_VECTOR: any;
  MORPHO_BIOME: DurableObjectNamespace;
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

    // 初始原始孢子基因组 (Base Genome)
    this.currentGenome = {
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
      const response = await this.env.MORPHO_R2.get('physics.wasm');
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
      const { mutation } = await request.json();
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
    // 1. 调用 Wasm 模块进行硬核物理审查
    const isValid = await this.wasmValidate(mutationProposal);
    if (!isValid) {
      return { status: "MALFORMED", genome: this.currentGenome };
    }

    // 2. 计算 ATP 代谢代价
    const atpCost = this.calculateATPCost(mutationProposal);

    // 2.5 计算熵减带来的持续消耗
    const entropyCost = this.physicsEngine
      ? this.physicsEngine.calculateEntropy(this.currentGenome.complexity, this.currentGenome.adaptability)
      : 0.1;

    const totalCost = atpCost + entropyCost;

    if (totalCost > this.currentGenome.energy_reserve) {
      return {
        status: "EXTINCT",
        reason: "ENERGY_EXHAUSTED",
        genome: this.currentGenome
      };
    }

    // 3. 更新状态
    this.currentGenome = {
      ...this.currentGenome,
      ...mutationProposal,
      energy_reserve: this.currentGenome.energy_reserve - atpCost
    };

    // 4. 广播给所有连接的前端
    this.broadcast({
      type: "EVOLVE",
      data: this.currentGenome,
      status: "SUCCESS"
    });

    // 5. 异步同步到 Vectorize 向量库 (P1 核心逻辑)
    this.state.waitUntil((async () => {
      try {
        const vector = await generateGenomeVector(this.env.MORPHO_AI, this.currentGenome);
        await syncToVectorize(this.env.MORPHO_VECTOR, this.currentGenome, vector);
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

  private async wasmValidate(mutation: any): Promise<boolean> {
    if (this.physicsEngine) {
      return this.physicsEngine.validateMutation(
        mutation.radius || this.currentGenome.radius,
        mutation.turgor_pressure || this.currentGenome.turgor_pressure,
        this.currentGenome.complexity
      );
    }

    // 回退到基于 TS 的简单验证
    if (mutation.radius && (mutation.radius < 1 || mutation.radius > 20)) {
      return false;
    }

    if (mutation.turgor_pressure && (mutation.turgor_pressure < 0.1 || mutation.turgor_pressure > 5.0)) {
      return false;
    }

    return true;
  }

  private calculateATPCost(mutation: any): number {
    const newTraits = mutation.traits
      ? mutation.traits.filter((t: string) => !this.currentGenome.traits.includes(t))
      : [];

    if (this.physicsEngine) {
      return this.physicsEngine.calculateATPCost(
        this.currentGenome.radius,
        mutation.radius || this.currentGenome.radius,
        newTraits.length
      );
    }

    // 回退到旧逻辑
    let cost = 0;
    if (mutation.radius) {
      const sizeChange = Math.abs(mutation.radius - this.currentGenome.radius);
      cost += sizeChange * 10;
    }
    cost += newTraits.length * 20;
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

// WebSocketPair 类型定义
class WebSocketPair {
  constructor() {
    // 实际实现由 Cloudflare Workers 提供
  }
}

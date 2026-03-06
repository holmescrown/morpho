import { Hono } from 'hono';
import { loadPhysicsWasm } from './wasmLoader';
import { generateGenomeVector, syncToVectorize } from './vectorizeUtils';

interface Env {
  AI: any;
  DB: D1Database;
  R2: R2Bucket;
  VECTOR_INDEX: VectorizeIndex;
  BIOME_STATE: DurableObjectNamespace;
}

export class LifeCycleManager {
  state: DurableObjectState;
  env: Env;
  sessions: WebSocket[] = [];
  currentGenome: any;
  physicsEngine: any = null;
  app = new Hono<{ Bindings: Env }>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // 初始原始孢子基因组 (涵盖 P0.5 前端兼容与后端新规范)
    this.currentGenome = {
      metadata: { genome_id: "morpho_origin_001", generation: 0 },
      morphology: {
        l_system_rules: { iterations: 2 },
        hox_segments: [{ type: "basal", scaling: { length: 1.0, radius: 5.0, porosity: 0.2 }, joints: [{ stiffness: 0.5 }] }],
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

    this.setupRoutes();
  }

  private setupRoutes() {
    // 灾变触发接口
    this.app.post('/admin/trigger-disaster', async (c) => {
      try {
        const { environment, intensity } = await c.req.json() as any;
        this.broadcast({
          type: 'GLOBAL_DISASTER',
          environment: environment,
          intensity: intensity || 1.0,
          timestamp: Date.now()
        });
        return c.json({ status: "SUCCESS", broadcasted: true });
      } catch (e) {
        return c.text(String(e), 500);
      }
    });

    // 演进接口
    this.app.post('/evolve', async (c) => {
      try {
        const body = await c.req.json() as any;
        const mutation = body.mutation;
        const response = await this.applyEvolution(mutation);
        return c.json(response);
      } catch (e) {
        return c.json({ status: "ERROR", error: String(e) }, 400);
      }
    });
  }

  private async initPhysics() {
    try {
      const response = await this.env.R2.get('physics.wasm');
      const wasmBinary = response ? await response.arrayBuffer() : new Uint8Array().buffer as ArrayBuffer;

      if (wasmBinary.byteLength > 0) {
        this.physicsEngine = await loadPhysicsWasm(wasmBinary as ArrayBuffer);
      }
    } catch (e) {
      console.error("Physics Engine Init Failed:", e);
    }
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader === "websocket") {
      // @ts-ignore - WebSocketPair is a global in Cloudflare Workers
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair) as [WebSocket, WebSocket];

      this.state.acceptWebSocket(server);
      this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    return this.app.fetch(request);
  }

  private handleSession(ws: WebSocket) {
    this.sessions.push(ws);
    ws.send(JSON.stringify({ type: 'INIT', genome: this.currentGenome }));

    ws.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === 'ENVIRONMENT_TRIGGER') {
          // Future logic
        }

        if (data.type === 'EAT') {
          const amount = data.amount || 15;
          this.currentGenome.energy_reserve = Math.min(
            (this.currentGenome.energy_reserve || 0) + amount,
            this.currentGenome.metabolism?.energy_storage_capacity || 100
          );
          console.log(`[LifeCycle] Bio ${this.state.id} ate ${amount} energy. New total: ${this.currentGenome.energy_reserve}`);
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
    if (mutationProposal.status === "REJECTED") {
      const reason = mutationProposal.reason || "该形态不符合碳基生物演化法则。";
      this.broadcast({
        type: "MUTATION_REJECTED",
        reason: reason
      });
      return { status: "REJECTED", reason: reason, genome: this.currentGenome };
    }

    const newGenome = JSON.parse(JSON.stringify(this.currentGenome));

    if (mutationProposal.patches && Array.isArray(mutationProposal.patches)) {
      for (const patch of mutationProposal.patches) {
        if (patch.op === 'replace' || patch.op === 'add') {
          applyJsonPatch(newGenome, patch.path, patch.value);
        }
      }
    }

    if (mutationProposal.semanticMemoryEntry) {
      if (!newGenome.genetics) newGenome.genetics = {};
      if (!newGenome.genetics.semantic_memory) newGenome.genetics.semantic_memory = [];
      newGenome.genetics.semantic_memory.push(mutationProposal.semanticMemoryEntry);
    }

    const isValid = await this.wasmValidate(newGenome);
    if (!isValid) {
      return { status: "MALFORMED", genome: this.currentGenome };
    }

    const atpCost = this.calculateATPCost(this.currentGenome, newGenome);
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

    newGenome.energy_reserve = this.currentGenome.energy_reserve - atpCost;
    if (newGenome.metadata) newGenome.metadata.generation += 1;
    this.currentGenome = newGenome;

    this.broadcast({
      type: "EVOLVE",
      data: this.currentGenome,
      status: "SUCCESS"
    });

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

    let cost = 0;
    const sizeChange = Math.abs(newRadius - oldRadius);
    cost += sizeChange * 10;
    cost += newTraitsCount * 20;
    return cost;
  }

  private broadcast(message: object) {
    const msg = JSON.stringify(message);
    this.sessions.forEach(session => {
      try {
        session.send(msg);
      } catch (e) {
        console.error('Broadcast error:', e);
      }
    });
  }
}

function applyJsonPatch(obj: any, path: string, value: any) {
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

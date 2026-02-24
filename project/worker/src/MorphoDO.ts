import { validateATP, calculateMetabolicBalance, predictAdaptability } from './validator';

export class MorphoDO {
  state: DurableObjectState;
  env: Env;
  sessions: WebSocket[];
  genome: any;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
    
    // 初始原始孢子基因组 (Base Genome)
    this.genome = {
      complexity: 1.0,
      traits: ["basal_metabolism"],
      turgor_pressure: 1.0,
      radius: 5.0,
      color: 0x44aa88
    };
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.state.acceptWebSocket(server);
    this.sessions.push(server);

    // 发送初始基因组给刚连接的前端
    server.send(JSON.stringify({ type: 'INIT', genome: this.genome }));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string) {
    const data = JSON.parse(message);
    
    // 接收到移动端传来的"环境天气"刺激
    if (data.type === 'ENVIRONMENT_TRIGGER') {
      await this.mutateGenome(data.environment);
    }
  }

  async mutateGenome(envCondition: string) {
    // 1. 调用 Workers AI (Llama 3) 进行语义突变推理
    const prompt = `
      You are an evolutionary engine. Current genome: ${JSON.stringify(this.genome)}.
      Environment stress: ${envCondition}.
      Return a mutated JSON updating 'radius' (1-20), 'turgor_pressure' (0.5-3.0), and 'color' (Hex).
      Output ONLY valid JSON.
    `;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'system', content: prompt }]
      });

      // 提取 JSON (简单正则处理 MVP)
      const jsonMatch = response.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const mutation = JSON.parse(jsonMatch[0]);
        
        // 2. 物理与 ATP 校验 (调用 validator)
        const validationResult = validateATP(mutation, this.genome);
        
        if (validationResult.isValid) {
          // 3. 计算代谢平衡和适应性
          const metabolicBalance = calculateMetabolicBalance(mutation, envCondition);
          const adaptability = predictAdaptability(mutation, envCondition);
          
          // 4. 更新当前基因组并广播给所有观察者
          this.genome = { 
            ...this.genome, 
            ...mutation, 
            complexity: this.genome.complexity + 0.5,
            adaptability,
            atpCost: validationResult.atpCost,
            metabolicBalance: metabolicBalance.balanced
          };
          
          const broadcastMessage = {
            type: 'MUTATION_UPDATE', 
            genome: this.genome, 
            rationale: response.response,
            atpCost: validationResult.atpCost,
            metabolicBalance
          };
          
          this.broadcast(JSON.stringify(broadcastMessage));
        } else {
          // 验证失败，发送错误信息
          this.broadcast(JSON.stringify({ 
            type: 'ERROR', 
            message: 'Mutation failed validation',
            errors: validationResult.errors
          }));
        }
      }
    } catch (e) {
      this.broadcast(JSON.stringify({ type: 'ERROR', message: 'Mutation collapsed.' }));
    }
  }

  broadcast(message: string) {
    this.sessions.forEach(session => session.send(message));
  }
}

interface Env {
  AI: any;
  MORPHO_ISLAND: DurableObjectNamespace;
}

// 为了 TypeScript 编译通过，添加必要的类型定义
declare class WebSocketPair {
  readonly 0: WebSocket;
  readonly 1: WebSocket;
}

declare function WebSocketPair(): WebSocketPair;

declare interface DurableObjectState {
  acceptWebSocket(ws: WebSocket): void;
}

declare interface DurableObjectNamespace {
  newUniqueId(): string;
  get(id: string): any;
}

declare interface WebSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

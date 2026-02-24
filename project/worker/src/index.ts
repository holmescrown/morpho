import { MorphoDO } from './MorphoDO';
export { MorphoDO };

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    
    // 如果是 WebSocket 连接请求
    if (url.pathname === '/ws') {
      // 这里的 "GLOBAL_ISLAND" 是硬编码的单一生态岛，MVP 阶段大家都看同一个生物
      const id = env.MORPHO_ISLAND.idFromName("GLOBAL_ISLAND");
      const stub = env.MORPHO_ISLAND.get(id);
      return stub.fetch(request);
    }

    return new Response("Project Morpho API Edge", { status: 200 });
  }
};

interface Env {
  MORPHO_ISLAND: DurableObjectNamespace;
}

// 为了 TypeScript 编译通过，添加必要的类型定义
declare interface DurableObjectNamespace {
  idFromName(name: string): any;
  get(id: any): any;
}

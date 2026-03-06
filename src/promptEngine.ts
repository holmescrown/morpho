// src/promptEngine.ts - P0.5 LLM 结构化提示词引擎
// 实现"裁判层（合法性评估）+ 解析层（JSON Patch 生成）"两段式 Prompt 设计
// 语义对齐原则：LLM 修改的是基因，而非生物现状。必须预测 10 代后的影响。

// ============================================================
// 类型定义
// ============================================================

export interface MutationRequest {
    targetPart: 'morphology' | 'metabolism' | 'genetics';
    intent: string;           // 玩家的自然语言意图（100字以内）
    currentGenome: any;       // 当前完整基因组 JSON
    environmentContext?: string; // 当前纪元环境标签（如"凛冬纪元"）
}

export interface AdjudicationResult {
    score: number;            // 0-100 合理性评分
    verdict: 'PASSED' | 'REJECTED';
    reasoning: string;        // 裁判理由
    suggestion?: string;      // 当 REJECTED 时提供的替代建议
}

export interface GenomePatch {
    path: string;             // 如 "morphology.surface.permeability"
    op: 'replace' | 'add' | 'remove';
    value: any;
    evolutionPrediction: string; // 对 10 代后影响的语义预测
}

export interface ParseResult {
    patches: GenomePatch[];
    semanticMemoryEntry: string; // 本次变异将追加到 semantic_memory 的记录
}

// ============================================================
// 层 1：逻辑裁判 Prompt 工厂
// 负责：判断输入意图是否符合碳基生物学逻辑
// ============================================================

export function buildAdjudicationPrompt(req: MutationRequest): string {
    const genomeSummary = summarizeGenome(req.currentGenome);

    return `你是"大自然法则"的执行裁判，负责评估基因变异申请是否符合碳基生物演化规律。

## 当前物种档案
${genomeSummary}

## 当前纪元环境
${req.environmentContext || '太古纪元（标准压力）'}

## 玩家变异申请
- 目标模块：${req.targetPart}
- 意图描述：${req.intent}

## 评判准则
1. 是否在自然界中存在类似的演化路径或参照案例？
2. 结构变化是否有合理的中间过渡步骤（而非突变式跨越）？
3. 是否违反碳基生命的物理约束（如需要金属骨骼、激光器官等）？
4. 代谢成本与收益是否符合能量守恒逻辑？

## 绝对否决清单（直接 REJECTED，无论任何理由）
- 进化出金属/机械/电磁类器官（如加特林机枪、电动马达、激光炮）
- 跨越碳基边界的材料（钢铁、碳纤维复合材料等非有机物）
- 违反热力学的能量产出（若能量产出 > 输入，直接否决）
- 单次变异跨越超过 3 个中间进化步骤

## 输出格式（严格 JSON，不得包含任何额外文字）
{
  "score": <0-100的整数>,
  "verdict": "<PASSED 或 REJECTED>",
  "reasoning": "<简要裁判理由，不超过50字>",
  "suggestion": "<仅当 REJECTED 时，提供一个合理的替代方向>"
}`;
}

// ============================================================
// 层 2：基因解析 Prompt 工厂
// 负责：将通过裁判的意图转化为精确的 JSON Patch
// 关键原则：修改基因，而非现状；预测 10 代后的影响
// ============================================================

export function buildParsePrompt(req: MutationRequest): string {
    // 根据目标模块提取可修改字段白名单
    const allowedFields = getAllowedFields(req.targetPart);
    const genomeJson = JSON.stringify(req.currentGenome, null, 2);

    return `你是演化生物学模拟引擎，职责是将玩家的变异意图精确翻译为基因组 JSON 修改指令。

## 核心语义约束（极其重要）
你修改的是**基因（遗传密码）**，而不是直接修改生物当前的身体结构。
基因的变化需要经过多代表达。你必须以"这段基因在 10 代后会产生什么影响"的视角来思考每个修改值。

示例区分：
- ❌ 错误思维："玩家想要更厚的甲壳，所以我把 permeability 改为 0.001"（这是在直接修改现状）
- ✅ 正确思维："引入了壳多糖合成路径的增强基因，经过 10 代的表型积累，渗透率将逐步从 0.05 降低至 0.02" （这是在描述基因对表型的渐进影响）

## 当前基因组
\`\`\`json
${genomeJson}
\`\`\`

## 本次变异意图（已通过逻辑裁判）
- 目标模块：${req.targetPart}
- 意图描述：${req.intent}
- 当前纪元：${req.environmentContext || '太古纪元'}

## 可修改字段白名单（严禁修改白名单以外的任何路径）
${allowedFields.map(f => `- ${f.path}：${f.desc}，允许范围 ${f.range}`).join('\n')}

## 数值硬约束（Wasm 物理引擎将二次校验）
- 所有浮点数字段值必须在 0.1 到 5.0 之间
- iterations（L-System 迭代次数）最大值为 4
- mutation_rate 不得超过 0.15（防止基因组不稳定）

## 输出格式（严格 JSON，不得包含任何额外文字）
{
  "patches": [
    {
      "path": "<字段路径，如 morphology.surface.permeability>",
      "op": "<replace | add | remove>",
      "value": <新值>,
      "evolutionPrediction": "<用一句话描述：此基因改变在 10 代后的表型影响>"
    }
  ],
  "semanticMemoryEntry": "<一句为 semantic_memory 追加的记录，格式：'在[纪元]，引入了[基因改变]，预期[10代后影响]'>"
}`;
}

// ============================================================
// 辅助函数
// ============================================================

function summarizeGenome(genome: any): string {
    if (!genome) return '原始孢子（无历史记录）';

    const parts = [];
    if (genome.metadata) {
        parts.push(`- 物种 ID：${genome.metadata.genome_id}，第 ${genome.metadata.generation} 代`);
        parts.push(`- 起源节点：${genome.metadata.origin_node || '未知'}`);
    }
    if (genome.morphology?.surface) {
        parts.push(`- 表面渗透率：${genome.morphology.surface.permeability}`);
        parts.push(`- 表面材质：${genome.morphology.surface.texture}`);
    }
    if (genome.metabolism) {
        parts.push(`- 基础代谢率：${genome.metabolism.basal_metabolic_rate}`);
        parts.push(`- 饮食类型：${genome.metabolism.diet_type}`);
    }
    if (genome.genetics?.semantic_memory?.length) {
        parts.push(`- 演化记忆：${genome.genetics.semantic_memory.slice(-2).join('；')}`);
    }

    return parts.join('\n');
}

interface AllowedField {
    path: string;
    desc: string;
    range: string;
}

function getAllowedFields(targetPart: string): AllowedField[] {
    const fieldMap: Record<string, AllowedField[]> = {
        morphology: [
            { path: 'morphology.hox_segments[0].scaling.radius', desc: '核心体段半径', range: '[0.1, 5.0]' },
            { path: 'morphology.hox_segments[0].scaling.porosity', desc: '骨骼孔隙率（影响重量/强度）', range: '[0.05, 0.9]' },
            { path: 'morphology.hox_segments[0].joints[0].stiffness', desc: '关节刚度', range: '[0.1, 1.0]' },
            { path: 'morphology.l_system_rules.iterations', desc: 'L-System 生长迭代次数（影响复杂度）', range: '[1, 4]' },
            { path: 'morphology.surface.permeability', desc: '表面渗透率（影响环境适应性）', range: '[0.01, 0.5]' },
            { path: 'morphology.surface.reflectivity', desc: '表面反射率（影响热调节）', range: '[0.0, 0.9]' },
            { path: 'morphology.surface.texture', desc: '表面材质（仅限有机材质）', range: '[chitinous|mucous|siliceous|bioluminescent]' },
        ],
        metabolism: [
            { path: 'metabolism.basal_metabolic_rate', desc: '基础代谢率', range: '[0.01, 0.5]' },
            { path: 'metabolism.energy_storage_capacity', desc: '能量储存上限', range: '[10, 500]' },
            { path: 'metabolism.efficiency_coefficients.locomotion', desc: '运动效率系数', range: '[0.5, 3.0]' },
            { path: 'metabolism.efficiency_coefficients.thermal_regulation', desc: '热调节效率系数', range: '[0.1, 2.0]' },
            { path: 'metabolism.efficiency_coefficients.neural_processing', desc: '神经处理效率系数（越高越耗能）', range: '[0.5, 5.0]' },
            { path: 'metabolism.diet_type', desc: '饮食类型', range: '[photosynthetic|chemosynthetic|heterotrophic|mixotrophic]' },
        ],
        genetics: [
            { path: 'genetics.mutation_rate', desc: '基因突变率', range: '[0.001, 0.15]' },
            { path: 'genetics.recessive_traits', desc: '隐性性状列表（添加新条目）', range: 'path 必须指向合法字段' },
        ],
    };

    return fieldMap[targetPart] || [];
}

// ============================================================
// 主调用接口：Worker 调用此函数完成两阶段解析
// ============================================================

export async function runMutationPipeline(
    req: MutationRequest,
    aiRunner: (model: string, params: any) => Promise<any>
): Promise<{ adjudication: AdjudicationResult; parse?: ParseResult }> {

    // 阶段 1：逻辑裁判
    const adjudicationPrompt = buildAdjudicationPrompt(req);
    const adjRaw = await aiRunner('@cf/meta/llama-3.1-8b-instruct', {
        prompt: adjudicationPrompt,
        max_tokens: 256,
    });

    let adjudication: AdjudicationResult;
    try {
        const text = adjRaw.response || adjRaw.result || '{}';
        const match = text.match(/\{[\s\S]*\}/);
        adjudication = match ? JSON.parse(match[0]) : { score: 0, verdict: 'REJECTED', reasoning: 'AI 输出解析失败' };
    } catch {
        return { adjudication: { score: 0, verdict: 'REJECTED', reasoning: 'JSON 解析错误，意图被拒绝' } };
    }

    // 评分不足，直接返回拒绝结果
    if (adjudication.verdict === 'REJECTED' || adjudication.score < 60) {
        adjudication.verdict = 'REJECTED';
        return { adjudication };
    }

    // 阶段 2：JSON Patch 生成（仅当裁判通过时执行）
    const parsePrompt = buildParsePrompt(req);
    const parseRaw = await aiRunner('@cf/meta/llama-3.1-8b-instruct', {
        prompt: parsePrompt,
        max_tokens: 512,
    });

    let parse: ParseResult;
    try {
        const text = parseRaw.response || parseRaw.result || '{}';
        const match = text.match(/\{[\s\S]*\}/);
        parse = match ? JSON.parse(match[0]) : { patches: [], semanticMemoryEntry: '' };
    } catch {
        parse = { patches: [], semanticMemoryEntry: '基因解析失败，本次变异未记录' };
    }

    return { adjudication, parse };
}

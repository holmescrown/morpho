// src/vectorizeUtils.ts - 基因组向量化与语义提取工具

export interface Genome {
    metadata: {
        genome_id: string;
        generation: number;
        [key: string]: any;
    };
    morphology: any;
    metabolism: any;
    genetics: {
        semantic_memory: string[];
        [key: string]: any;
    };
}

/**
 * 将复杂的基因组 JSON 转换为一段描述性文本。
 * 这种“语义扁平化”能够帮助嵌入模型更好地理解物种的本质。
 */
export function flattenGenomeToText(genome: Genome): string {
    const m = genome.morphology;
    const meta = genome.metabolism;

    const segments = m.hox_segments.map((s: any) =>
        `${s.type} (scale: ${s.scaling.length}x${s.scaling.radius})`
    ).join(', ');

    const description = [
        `Species ${genome.metadata.genome_id}, Generation ${genome.metadata.generation}.`,
        `Physical Structure: ${segments}.`,
        `Surface Texture: ${m.surface.texture}, Permeability: ${m.surface.permeability}.`,
        `Diet Type: ${meta.diet_type}.`,
        `Evolutionary History: ${genome.genetics.semantic_memory.join('; ')}.`
    ].join(' ');

    return description;
}

/**
 * 使用 Workers AI 生成基因组的向量表示。
 */
export async function generateGenomeVector(ai: any, genome: Genome): Promise<number[]> {
    const text = flattenGenomeToText(genome);

    // 使用 Cloudflare 提供的嵌入模型
    const { data } = await ai.run("@cf/baai/bge-base-en-v1.5", {
        text: [text]
    });

    return data[0];
}

/**
 * 将物种向量推送至 Vectorize 索引。
 */
export async function syncToVectorize(
    vectorizeIndex: any,
    genome: Genome,
    vector: number[]
) {
    await vectorizeIndex.upsert([{
        id: genome.metadata.genome_id,
        values: vector,
        metadata: {
            generation: genome.metadata.generation,
            type: genome.morphology.hox_segments[0]?.type || "unknown"
        }
    }]);
}

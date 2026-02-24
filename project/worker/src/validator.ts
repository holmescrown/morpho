// ATP 审查逻辑 (MVP 版用 TypeScript 实现，后续替换为 Wasm)

/**
 * 验证突变后的基因组是否符合物理和 ATP 约束
 * @param mutation 突变后的基因组
 * @param originalGenome 原始基因组
 * @returns 验证结果
 */
export function validateATP(mutation: any, originalGenome: any = {}): {
  isValid: boolean;
  errors: string[];
  atpCost: number;
} {
  const errors: string[] = [];
  let atpCost = 0;

  // 1. 检查必需字段
  if (!mutation.radius || typeof mutation.radius !== 'number') {
    errors.push('Missing or invalid radius');
  }

  if (!mutation.turgor_pressure || typeof mutation.turgor_pressure !== 'number') {
    errors.push('Missing or invalid turgor_pressure');
  }

  if (!mutation.color) {
    errors.push('Missing color');
  }

  // 2. 物理约束检查
  if (mutation.radius < 1 || mutation.radius > 20) {
    errors.push('Radius must be between 1 and 20');
  }

  if (mutation.turgor_pressure < 0.5 || mutation.turgor_pressure > 3.0) {
    errors.push('Turgor pressure must be between 0.5 and 3.0');
  }

  // 3. ATP 成本计算
  // 基础维护成本
  const baseCost = 1.0;
  
  // 半径变化成本 (更大的体型需要更多能量)
  const radiusCost = Math.abs(mutation.radius - (originalGenome.radius || 5)) * 0.2;
  
  // 复杂度成本
  const complexityCost = (mutation.complexity || 1.0) * 0.5;
  
  // 突变成本 (每次突变都需要能量)
  const mutationCost = 0.5;
  
  atpCost = baseCost + radiusCost + complexityCost + mutationCost;

  // 4. 检查 ATP 成本是否过高
  if (atpCost > 5.0) {
    errors.push('ATP cost too high for this mutation');
  }

  return {
    isValid: errors.length === 0,
    errors,
    atpCost
  };
}

/**
 * 计算生物的代谢平衡
 * @param genome 生物基因组
 * @param environment 环境参数
 * @returns 代谢平衡状态
 */
export function calculateMetabolicBalance(genome: any, environment: string): {
  balanced: boolean;
  energyInput: number;
  energyOutput: number;
  deficit: number;
} {
  // 基础能量输入 (简化模型)
  let energyInput = 1.0;

  // 根据环境调整能量输入
  if (environment.includes('drought')) {
    energyInput *= 0.5; // 干旱减少能量获取
  } else if (environment.includes('flood')) {
    energyInput *= 0.7; // 洪水减少能量获取
  } else if (environment.includes('cold')) {
    energyInput *= 0.6; // 寒冷减少能量获取
  } else if (environment.includes('radiation')) {
    energyInput *= 0.4; // 辐射减少能量获取
  } else if (environment.includes('gravity')) {
    energyInput *= 0.8; // 高重力减少能量获取
  }

  // 能量输出
  const baseOutput = 0.5;
  const sizeOutput = (genome.radius || 5) * 0.1; // 体型越大，能量消耗越多
  const complexityOutput = (genome.complexity || 1.0) * 0.2; // 复杂度越高，能量消耗越多

  const energyOutput = baseOutput + sizeOutput + complexityOutput;
  const deficit = energyInput - energyOutput;

  return {
    balanced: deficit >= 0,
    energyInput,
    energyOutput,
    deficit
  };
}

/**
 * 预测生物在特定环境中的适应性
 * @param genome 生物基因组
 * @param environment 环境参数
 * @returns 适应性评分 (0-1)
 */
export function predictAdaptability(genome: any, environment: string): number {
  let score = 0.5; // 基础评分

  // 根据环境和基因组特征调整评分
  if (environment.includes('drought')) {
    // 较小的体型在干旱中更有优势
    if (genome.radius < 8) {
      score += 0.3;
    } else if (genome.radius > 15) {
      score -= 0.3;
    }
  }

  if (environment.includes('cold')) {
    // 较大的体型在寒冷中更有优势
    if (genome.radius > 12) {
      score += 0.3;
    } else if (genome.radius < 6) {
      score -= 0.3;
    }
  }

  if (environment.includes('radiation')) {
    // 较低的复杂度在辐射环境中更有优势
    if ((genome.complexity || 1.0) < 1.5) {
      score += 0.3;
    } else if ((genome.complexity || 1.0) > 2.5) {
      score -= 0.3;
    }
  }

  if (environment.includes('gravity')) {
    // 较低的体型和较高的膨胀压在高重力中更有优势
    if (genome.radius < 10 && genome.turgor_pressure > 1.5) {
      score += 0.4;
    } else if (genome.radius > 15 && genome.turgor_pressure < 1.0) {
      score -= 0.4;
    }
  }

  // 确保评分在 0-1 范围内
  return Math.max(0, Math.min(1, score));
}

// assembly/index.ts - Project Morpho Wasm Physics Core

/**
 * Validates a mutation proposal based on physical and biological constraints.
 * @param radius The proposed radius of the organism.
 * @param turgor_pressure The proposed turgor pressure.
 * @param complexity The current complexity level.
 * @returns 1 if valid, 0 if invalid.
 */
export function validateMutation(radius: f64, turgor_pressure: f64, complexity: f64): i32 {
  // 1. Structural Integrity Check
  // As radius increases, required turgor pressure to maintain shape increases.
  // But too much pressure for a given complexity leads to collapse or burst.
  
  if (radius < 0.5 || radius > 50.0) return 0;
  if (turgor_pressure < 0.1 || turgor_pressure > 10.0) return 0;
  
  // Complexity-based scaling: Higher complexity can handle more extreme sizes/pressures
  let maxSafeRadius = 10.0 * complexity;
  if (radius > maxSafeRadius) return 0;
  
  return 1;
}

/**
 * Calculates the metabolic (ATP) cost for a mutation.
 * @param oldRadius Previous radius.
 * @param newRadius Proposed radius.
 * @param traitCount Number of new traits being added.
 * @returns The total ATP cost.
 */
export function calculateATPCost(oldRadius: f64, newRadius: f64, traitCount: i32): f64 {
  let cost: f64 = 0;
  
  // Size change cost (Volume based)
  let oldVol = (4.0 / 3.0) * Math.PI * Math.pow(oldRadius, 3);
  let newVol = (4.0 / 3.0) * Math.PI * Math.pow(newRadius, 3);
  
  if (newVol > oldVol) {
    cost += (newVol - oldVol) * 0.5; // Cost to grow
  } else {
    cost += (oldVol - newVol) * 0.1; // Cost to shrink/reorganize
  }
  
  // Trait addition cost (Energy for new biological structures)
  cost += (<f64>traitCount) * 25.0;
  
  return cost;
}

/**
 * Calculates the entropy decay based on environmental pressure.
 * @param complexity Current complexity.
 * @param adaptability Current adaptability score.
 * @returns Entropy increase to be subtracted from energy reserves.
 */
export function calculateEntropy(complexity: f64, adaptability: f64): f64 {
  // Entropy = Complexity^1.5 * e^(-Adaptability)
  return Math.pow(complexity, 1.5) * Math.exp(-adaptability);
}

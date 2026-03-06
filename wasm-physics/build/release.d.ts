/** Exported memory */
export declare const memory: WebAssembly.Memory;
/**
 * assembly/index/validateMutation
 * @param radius `f64`
 * @param turgor_pressure `f64`
 * @param complexity `f64`
 * @returns `i32`
 */
export declare function validateMutation(radius: number, turgor_pressure: number, complexity: number): number;
/**
 * assembly/index/calculateATPCost
 * @param oldRadius `f64`
 * @param newRadius `f64`
 * @param traitCount `i32`
 * @returns `f64`
 */
export declare function calculateATPCost(oldRadius: number, newRadius: number, traitCount: number): number;
/**
 * assembly/index/calculateEntropy
 * @param complexity `f64`
 * @param adaptability `f64`
 * @returns `f64`
 */
export declare function calculateEntropy(complexity: number, adaptability: number): number;

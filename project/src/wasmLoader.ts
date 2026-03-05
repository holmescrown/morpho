// src/wasmLoader.ts - Helper to load the Wasm physics module
export async function loadPhysicsWasm(wasmBinary: ArrayBuffer) {
    const { instance } = await WebAssembly.instantiate(wasmBinary, {
        env: {
            abort: (msg: any, file: any, line: any, col: any) => {
                console.error(`Abort called: ${msg} at ${file}:${line}:${col}`);
            }
        }
    });

    const exports = instance.exports as any;

    return {
        validateMutation: (radius: number, turgor_pressure: number, complexity: number): boolean => {
            return exports.validateMutation(radius, turgor_pressure, complexity) === 1;
        },
        calculateATPCost: (oldRadius: number, newRadius: number, traitCount: number): number => {
            return exports.calculateATPCost(oldRadius, newRadius, traitCount);
        },
        calculateEntropy: (complexity: number, adaptability: number): number => {
            return exports.calculateEntropy(complexity, adaptability);
        }
    };
}

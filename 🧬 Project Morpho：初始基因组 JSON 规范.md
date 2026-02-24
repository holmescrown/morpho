🧬 Project Morpho：初始基因组 JSON 规范 (v1.0)

### 1. 核心设计原则

- **结构重于数值**：不直接定义“血量”，而是定义“骨骼密度”与“储能效率”。

- **分层解耦**：将“外观表现”、“代谢逻辑”与“遗传记忆”分离。

- **语义友好**：字段命名采用语义化描述，方便 LLM 进行逻辑推理。

---

### 2. JSON 结构蓝图

```JSON
{
  "metadata": {
    "genome_id": "morpho_origin_001",
    "generation": 0,
    "origin_node": "tokyo-edge-01",
    "ancestor_hash": "null",
    "timestamp": "2026-02-24T11:00:00Z"
  },

  "morphology": {
    "l_system_rules": {
      "axiom": "X",
      "rules": { "X": "F[+X][-X]FX", "F": "FF" },
      "iterations": 2
    },
    "hox_segments": [
      {
        "segment_id": "core_0",
        "type": "thorax",
        "scaling": { "length": 1.0, "radius": 0.5, "porosity": 0.2 },
        "joints": [
          { "type": "ball_and_socket", "limit": 45, "stiffness": 0.5 }
        ]
      }
    ],
    "surface": {
      "texture": "chitinous",
      "reflectivity": 0.1,
      "permeability": 0.05
    }
  },

  "metabolism": {
    "energy_storage_capacity": 100,
    "basal_metabolic_rate": 0.05,
    "efficiency_coefficients": {
      "locomotion": 1.2,
      "thermal_regulation": 0.8,
      "neural_processing": 2.5
    },
    "diet_type": "photosynthetic"
  },

  "genetics": {
    "mutation_rate": 0.02,
    "recessive_traits": [
      { "path": "morphology.surface.texture", "value": "bioluminescent", "probability": 0.05 }
    ],
    "semantic_memory": [
      "Born in high-gravity water",
      "Survived cold-snap event at Gen 2"
    ]
  }
}
```

### 3. 关键模块深度解析

#### **3.1 形态控制区 (Morphology)**

- **L-System Rules**：定义生长算法。AI 通过修改 `rules` 字符（如将 `+` 改为 `-`）来实现结构性的变异。

- **Hox Segments**：这是物理验证的核心。`porosity`（孔隙率）直接影响骨骼重量和强度，Wasm 会据此计算生物是否会因为自重坍塌。

- **Surface**：定义与环境互动的边界。`permeability`（渗透率）决定了生物在强酸或高盐环境下的生存率。

#### **3.2 代谢逻辑层 (Metabolism)**

- **Efficiency Coefficients**：这是我们游戏的“难度阻尼”。
  
  - 如果生物进化出巨大的大脑，`neural_processing` 系数会飙升，导致它必须不停进食。

- **Basal Metabolic Rate**：维持生命所需的底线能量。复杂性越高，此数值越高。

#### **3.3 遗传记忆与隐性基因 (Genetics)**

- **Recessive Traits**：这是交易所的“彩票”。购买看起来平庸的物种，可能在下一代突然爆发“生物发光”等高级性状。

- **Semantic Memory**：这是为 RAG（检索增强生成）准备的。AI 进化时会阅读这些文字，从而“理解”为什么这个物种倾向于避开阳光。

---

### 4. 首席产品经理的“避坑”建议 (CPO Insights)

1. **版本兼容性**：在 `metadata` 中强制要求 `genome_version`。未来我们升级 L-System 算法时，必须确保旧物种能被正确转译。

2. **数值范围约束**：所有浮点数（如 `scaling`）在 Wasm 验证层必须有硬上限（如 $0.1$ 到 $5.0$），防止 AI 输出一个占据整个屏幕的“无限巨兽”。

3. **语义对齐**：我们在 Prompt 中必须告诉 AI：“你修改的是基因，而不是直接修改生物现状。请预测这一修改在 10 代后的影响。”
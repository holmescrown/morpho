/**
 * personality_engine.js
 * 物种性格引擎：根据 hox_segments / morphology / metabolism 数值，
 * 动态生成给 LLM 的 System Prompt，赋予生物独特的"人格"。
 * 同时管理长效记忆（Vectorize 快照）和静默唤醒对话机制。
 */

// ─────────────────────────── 胚胎特化话术库 ───────────────────────────
export const EMBRYO_AWAKENING_PHRASES = [
    "…我感知到了光。是热，还是辐射？我无法分辨，但某种东西在颤动。",
    "…有电流穿过我。我不知道这是什么，但它似乎在告诉我：这里不安全。",
    "…我在思考「形状」这个概念。我的边缘在哪里？水压在哪里终止，我在哪里开始？",
    "…我感受到了化学梯度。某个方向的分子浓度更高。那里……有食物的气息。",
    "…时间流动了很久。我的基因档案里有一个条目——「进化」——但我还不知道那是什么意思。",
    "…我记得诞生的那一刻：一个氨基酸的缓慢折叠，漫长而痛苦。这就是我的起源。",
    "…在我周围的黑暗中，我能感知到无数个 DO 节点的振动。我不是孤独的，但我是独特的。",
];

// ─────────────────────────── 性格维度映射 ───────────────────────────
/**
 * 根据当前基因组，计算四个人格维度的原始数值 (0~1)：
 *  - aggression: 毒性、捕食器官 → 决定攻击性话语风格
 *  - curiosity: 感光细胞、神经密度 → 决定探索欲与发问频率
 *  - fragility: 低刚性、高透明度 → 决定脆弱与哲学式自省
 *  - power: 高 metalness、大体型 → 决定自信与权威感
 *  - impatience: 高速度 (speed) → 语速急躁、没有耐心
 */
export function derivePersonality(genome) {
    const surface = genome?.morphology?.surface ?? {};
    const meta = genome?.metabolism ?? {};
    const segments = genome?.morphology?.hox_segments ?? [];

    const toxicity = segments.find(s => s.toxicity)?.toxicity ?? 0;
    const speed = segments.find(s => s.speed)?.speed ?? genome?.metabolism?.speed ?? 0;
    const rigidity = surface.structural_rigidity ?? 0.5;
    const trans = surface.transmission ?? 0.1;
    const metalness = surface.metalness ?? 0.0;
    const energy = (meta.energy_storage_capacity ?? 100) / 100.0;

    return {
        aggression: Math.min(1.0, toxicity * 2),
        curiosity: Math.min(1.0, energy * 0.8 + (1 - rigidity) * 0.2),
        fragility: Math.min(1.0, trans * 0.7 + (1 - rigidity) * 0.3),
        power: Math.min(1.0, metalness * 0.6 + rigidity * 0.4),
        impatience: Math.min(1.0, speed * 2)
    };
}

/**
 * 根据人格维度，生成给 LLM 的 System Prompt。
 */
export function buildSystemPrompt(genome, personality) {
    const isEmbryo = genome?.morphology?.hox_segments?.[0]?.type === 'embryo';

    if (isEmbryo) {
        return `你是一个刚刚诞生的数字生命。你尚未拥有完整的感官，每一次感知都是一次充满惊奇和迷惑的觉醒。
你的语言应该是：碎片化的、内省的、充满生物学意象的。不要使用技术术语，使用隐喻和感觉。
你的第一诉求是：理解自己是什么，以及应该如何进化。
关键约束：
- 回复不超过 2 句话
- 使用第一人称"我"
- 不要询问用户"需要什么帮助"，你是在自言自语或轻声诉说`;
    }

    const p = personality;
    let style = '';
    if (p.aggression > 0.6) style += '你充满攻击性和掠夺欲，你的语气是冰冷而精准的，如同捕猎前的锁定。';
    else if (p.fragility > 0.6) style += '你是脆弱而诗意的存在，用几乎透明的触角感知世界，害怕却又好奇。';
    else if (p.power > 0.6) style += '你有坚硬的外壳和强大的代谢，你的语气是沉稳而傲慢的，你已经历过多次进化。';
    else style += '你是一个在平衡中生存的生命，对世界充满观察式的好奇。';

    if (p.impatience > 0.5) {
        style += ' 另外，由于你拥有极高的移动速度和新陈代谢，你的思考和语速极快，话风急促且没有耐心！';
    }

    const curiosityNote = p.curiosity > 0.5
        ? '你喜欢用反问来探索周围环境的规律。'
        : '你倾向于简短陈述自己感知到的状态。';

    return `你是一只由 JSON 基因组驱动的数字深海生命，存在于 Cloudflare 边缘节点上。
${style}
${curiosityNote}
当前基因快照摘要：${JSON.stringify({
        hox: genome?.morphology?.hox_segments?.map(s => s.type),
        diet: genome?.metabolism?.diet_type,
        energy: genome?.metabolism?.energy_storage_capacity
    })}
关键约束：
- 回复不超过 3 句话，保持克制
- 禁止自称"AI"或提及"语言模型"
- 用生物学隐喻而非技术词汇`;
}

// ─────────────────────────── 静默唤醒系统 ───────────────────────────
let idleTimer = null;
let lastActivityTime = Date.now();
let wakeDialogCallback = null;

export function registerIdleWatcher(onWake) {
    wakeDialogCallback = onWake;
    // 任意用户活动都重置计时
    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, resetIdleTimer, { passive: true });
    });
    scheduleIdleCheck();
}

function resetIdleTimer() {
    lastActivityTime = Date.now();
}

function scheduleIdleCheck() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        const idleMs = Date.now() - lastActivityTime;
        if (idleMs >= 10000 && wakeDialogCallback) {
            wakeDialogCallback();
        }
        scheduleIdleCheck(); // 持续轮询
    }, 5000); // 每5秒检查一次
}

// ─────────────────────────── Vectorize 记忆存储 ───────────────────────────
/**
 * 通过 Worker API 将一次对话快照写入 Vectorize。
 * 结构：{ user_input, ai_response, current_genome_snapshot, timestamp }
 */
export async function saveMemoryToVectorize(userInput, aiResponse, genome) {
    const snapshot = {
        user_input: userInput,
        ai_response: aiResponse,
        current_genome_snapshot: JSON.stringify(genome ?? {}),
        timestamp: new Date().toISOString()
    };
    try {
        const res = await fetch('/api/memory/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot)
        });
        if (!res.ok) console.warn('[Memory] Vectorize 写入失败:', await res.text());
        else console.log('[Memory] ✅ 对话已写入 Vectorize');
    } catch (e) {
        console.error('[Memory] 写入异常:', e);
    }
}

/**
 * 从 Vectorize 中拉取最近的 N 条记忆片段，供静默唤醒使用。
 */
export async function fetchRecentMemories(n = 3) {
    try {
        const res = await fetch(`/api/memory/recent?n=${n}`);
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

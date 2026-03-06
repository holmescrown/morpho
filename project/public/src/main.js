import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { TreeRenderer } from './TreeRenderer.js';
import { handlePhotoUpload } from './photoAnalyzer.js';
import { ArchetypeBuilder } from './ArchetypeBuilder.js';
import {
    derivePersonality,
    buildSystemPrompt,
    registerIdleWatcher,
    saveMemoryToVectorize,
    EMBRYO_AWAKENING_PHRASES
} from './personality_engine.js';

window.APP_MODE = 'GENESIS'; // 默认进入正式游戏态

// 1. 基础场景设置
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x003366); // 初始浅海色
scene.fog = new THREE.FogExp2(0x003366, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// 高级照明系统 (海洋仿真版)
const ambientLight = new THREE.AmbientLight(0x101030, 0.4);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0x00f2ff, 1.5);
sunLight.position.set(2, 10, 5);
scene.add(sunLight);

// 辅助点光源（用于纪元光照联控）
const pointLight = new THREE.PointLight(0x00f2ff, 1.0, 50);
pointLight.position.set(0, 5, 0);
scene.add(pointLight);

// 2. 搭建悬浮展台 (Isolated Isle - 带有动态焦散)
const isleGroup = new THREE.Group();
isleGroup.position.set(0, -1.2, 0);

const baseGeo = new THREE.CylinderGeometry(8, 9, 0.8, 64);
const baseMat = new THREE.MeshStandardMaterial({
    color: 0x010101, roughness: 0.1, metalness: 0.5
});
const isle = new THREE.Mesh(baseGeo, baseMat);
isleGroup.add(isle);

const ringGeo = new THREE.TorusGeometry(8.5, 0.1, 16, 100);
const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00f2ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending
});
const ring = new THREE.Mesh(ringGeo, ringMat);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.45;
isleGroup.add(ring);

// 动态焦散投影层
const floorGeo = new THREE.PlaneGeometry(16, 16, 32, 32);
const floorMat = new THREE.MeshPhongMaterial({
    color: 0x001a33, shininess: 100, transparent: true, opacity: 0.6
});
floorMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.fragmentShader = `
        uniform float uTime;
        ${shader.fragmentShader}
    `.replace(
        `#include <color_fragment>`,
        `#include <color_fragment>
        vec2 p = vUv * 10.0;
        float dist = 0.0;
        for(int i=0; i<3; i++) {
            p += sin(p.yx * 1.5 + uTime * 0.5) * 0.5;
            dist += length(p) * 0.05;
        }
        diffuseColor.rgb += vec3(0.1, 0.4, 0.5) * pow(sin(dist * 5.0), 10.0) * 0.5;
        `
    );
    floorMat.userData.shader = shader;
};
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.position.y = 0.46;
isleGroup.add(floorMesh);
scene.add(isleGroup);

// --- 4. Ocean Environment Particles (海雪微粒 - 动态线段版) ---
const partCount = 2000;
const partGeo = new THREE.BufferGeometry();
const posArray = new Float32Array(partCount * 2 * 3); // 线段有两个顶点
for (let i = 0; i < partCount * 2 * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 200;
}
partGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const partMat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending
});
const particles = new THREE.LineSegments(partGeo, partMat);
scene.add(particles);

// 粒子原始位置快照 (用于相对位移计算)
const partPositions = [];
for (let i = 0; i < partCount; i++) {
    partPositions.push(new THREE.Vector3(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200
    ));
}

// 3. 初始化生物体 (基于 ArchetypeBuilder & 双轨制)
const fishGroup = new THREE.Group();
fishGroup.position.y = 1.5;
scene.add(fishGroup);

// Input state for physics
const inputState = { thrust: 0, yaw: 0, pitch: 0 };
const archetypeBuilder = new ArchetypeBuilder(fishGroup, inputState);

window.setAppMode = (type) => {
    window.APP_MODE = type === 'embryo' ? 'GENESIS' : 'SANDBOX';
    archetypeBuilder.build(type);
    const logEl = document.getElementById('ai-log');
    if (logEl) logEl.innerText = `[${window.APP_MODE}] 已切换至形态: ${type.toUpperCase()}`;
};

// 初始加载创世胚胎
archetypeBuilder.build('embryo');

// --- 状态机与感官系统 ---
const GameState = {
    LOGIN: 'LOGIN',
    ORIGIN: 'ORIGIN',
    DESCENT: 'DESCENT',
    LIVING: 'LIVING',
    MUTATION: 'MUTATION',
    LEGACY: 'LEGACY'
};
window.CURRENT_STATE = GameState.LOGIN;

// 初始物理参数
let velocity = new THREE.Vector3();
const ACCEL = 0.005;
const TURN_SPEED = 0.03;
const DAMPING = 0.98;
const BMR = 0.02; // 每帧 ATP 静息消耗

// ── WASD 移动系统 (Deep Sea Navigation) ──
const moveState = { forward: false, backward: false, left: false, right: false, up: false, down: false };
let isPlayerMoving = false;

window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.forward = true; break;
        case 'KeyS': case 'ArrowDown': moveState.backward = true; break;
        case 'KeyA': case 'ArrowLeft': moveState.left = true; break;
        case 'KeyD': case 'ArrowRight': moveState.right = true; break;
        case 'Space': moveState.up = true; break;
        case 'ShiftLeft': moveState.down = true; break;
    }
});

window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.forward = false; break;
        case 'KeyS': case 'ArrowDown': moveState.backward = false; break;
        case 'KeyA': case 'ArrowLeft': moveState.left = false; break;
        case 'KeyD': case 'ArrowRight': moveState.right = false; break;
        case 'Space': moveState.up = false; break;
        case 'ShiftLeft': moveState.down = false; break;
    }
});

// 静默唤醒注册：10s 无操作后生物主动说话，以及 60s 进入深海冥想 (Deep Sleep)
let lastActivityTime = performance.now();
const deepSleepThreshold = 60000; // 60秒
let isDeepSleep = false;

function resetActivity() {
    lastActivityTime = performance.now();
    if (isDeepSleep) {
        isDeepSleep = false;
        // 唤醒光影
        if (window.APP_MODE !== 'GENESIS' && !window.CALAMITY_STATE.isDead) {
            gsap.to(ambientLight.color, { r: 64 / 255, g: 64 / 255, b: 160 / 255, duration: 2.0 });
            gsap.to(sunLight.color, { r: 1.0, g: 1.0, b: 1.0, duration: 2.0 });
            const logEl = document.getElementById('ai-log');
            if (logEl) logEl.innerHTML = `<span style="color:#00ff88;font-style:italic">"感知到外部高维扰动... 视觉皮层重新上线。"</span>`;
        }
    }
}
window.addEventListener('mousemove', resetActivity);
window.addEventListener('keydown', resetActivity);
window.addEventListener('click', resetActivity);
window.addEventListener('pointerdown', resetActivity);

registerIdleWatcher(() => {
    const genome = window.currentGenomeData;
    const isEmbryo = !genome || genome?.morphology?.hox_segments?.[0]?.type === 'embryo';
    const logEl = document.getElementById('ai-log');
    if (!logEl) return;
    if (isEmbryo || window.APP_MODE === 'GENESIS') {
        const phrase = EMBRYO_AWAKENING_PHRASES[Math.floor(Math.random() * EMBRYO_AWAKENING_PHRASES.length)];
        logEl.innerHTML = `<span style="color:#aaffee;font-style:italic">${phrase}</span>`;
    }
});

// 听觉深度滤波器 (Web Audio API - 海洋版)
let audioCtx, noiseNode, filterNode, creakOsc, creakGain;
let audioInitialized = false;
function initAudio() {
    if (audioInitialized) return;
    audioInitialized = true;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;

    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = 20000; // 初始为全频带

    // 模拟深海金属挤压声
    creakOsc = audioCtx.createOscillator();
    creakOsc.frequency.value = 100;
    creakGain = audioCtx.createGain();
    creakGain.gain.value = 0;
    creakOsc.connect(creakGain);
    creakGain.connect(filterNode);
    creakOsc.start();

    // 衰竭心跳音效
    window.heartbeatOsc = audioCtx.createOscillator();
    window.heartbeatOsc.frequency.value = 45; // 极低频
    window.heartbeatGain = audioCtx.createGain();
    window.heartbeatGain.gain.value = 0;
    window.heartbeatOsc.connect(window.heartbeatGain);
    window.heartbeatGain.connect(audioCtx.destination);
    window.heartbeatOsc.start();

    // 变异/排异高频断频(位压碎近似)音效
    window.crushOsc = audioCtx.createOscillator();
    window.crushOsc.type = 'square';
    window.crushOsc.frequency.value = 2000;
    window.crushGain = audioCtx.createGain();
    window.crushGain.gain.value = 0;
    window.crushOsc.connect(window.crushGain);
    window.crushGain.connect(audioCtx.destination);
    window.crushOsc.start();

    // 随机发生器：深海环境音
    setInterval(() => {
        if (!audioCtx) return;
        const depthY = fishGroup.position.y;

        // 1. 深海金属/结构挤压声 (Y < -300)
        if (depthY < -300 && Math.random() > 0.6) {
            const now = audioCtx.currentTime;
            creakOsc.frequency.setValueAtTime(40 + Math.random() * 80, now);
            creakGain.gain.cancelScheduledValues(now);
            creakGain.gain.setValueAtTime(0, now);
            creakGain.gain.linearRampToValueAtTime(0.15, now + 0.2);
            creakGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);
        }

        // 2. 气泡/水流扰动噪声 (动态改变)
        if (velocity.length() > 0.1) {
            filterNode.Q.setTargetAtTime(Math.random() * 5 + 1, audioCtx.currentTime, 0.5);
        }
    }, 3000);

    noiseNode.connect(filterNode);
    filterNode.connect(audioCtx.destination);
    noiseNode.start();
}
// 暴露给 index.html 阶段 1 的 Login 按钮调用
window.initGameAudio = initAudio;

// 阶段 1 -> 2 的过渡状态标识
window._syncComplete = false;
window.onSyncComplete = () => {
    window._syncComplete = true;
    window.CURRENT_STATE = GameState.ORIGIN;
    console.log("[Sensory] Consciousness Sync Complete. Origin Stage active.");

    // 监听初次推进，触发下潜
    const checkFirstMove = () => {
        if (moveState.forward || moveState.up || moveState.down) {
            transitionToDescent();
            window.removeEventListener('keydown', checkFirstMove);
        }
    };
    window.addEventListener('keydown', checkFirstMove);
};

// --- 下潜转场逻辑 ---
function transitionToDescent() {
    if (window.CURRENT_STATE !== GameState.ORIGIN) return;
    window.CURRENT_STATE = GameState.DESCENT;
    window.updateSensoryLog("[ 正在脱离起源点。同步环境深度数据... ]", "#00f2ff");

    // 展台沉降动画
    gsap.to(isle.position, { y: -50, duration: 4, ease: "power2.inOut" });
    gsap.to(ring.position, { y: -50, duration: 4, ease: "power2.inOut" });

    // 环境渐变预览 (随后的每帧通过 updateSensory 持续更新)
    gsap.to(scene.fog, { density: 0.015, duration: 5 });
}

// 全局环境感知总线
window.BIOME_STATE = {
    globalLight: { shallow: new THREE.Color(0x003366), deep: new THREE.Color(0x000510) },
    pressureFactor: 1.0,
    waterDensity: 1.0,
    audioFilterFreq: { max: 20000, min: 400 } // 根据 CPO 指令调整：0m -> 20k, -200m -> 400
};

/**
 * 核心：P1.5 环境感官联动系统 (Sensory Mapping)
 * 构建垂直生态深度，利用物理感官替代传统 UI
 */
window.updateSensory = function (y) {
    const shallowThreshold = -50;
    const abyssThreshold = -200;

    // 计算深度线性插值（0.0 - 1.0）
    const t = Math.min(1.0, Math.max(0.0, (y - shallowThreshold) / (abyssThreshold - shallowThreshold)));

    // 1. 视觉分层映射 (Visual Mapping)
    const shallowColor = window.BIOME_STATE.globalLight.shallow;
    const abyssColor = window.BIOME_STATE.globalLight.deep;
    const targetFogColor = shallowColor.clone().lerp(abyssColor, t);
    const targetDensity = 0.015 + t * 0.035;

    scene.fog.color.copy(targetFogColor);
    scene.fog.density = targetDensity;
    scene.background.copy(targetFogColor);
    renderer.setClearColor(targetFogColor);

    // 2. 焦散控制 (Caustics Decay)
    if (floorMat.userData.shader) {
        floorMat.opacity = THREE.MathUtils.lerp(0.6, 0.0, Math.min(1.0, t * 1.5));
    }

    // 3. 音频压力反馈 (Audio Depth Sync) 
    if (filterNode && audioCtx && audioCtx.state === 'running') {
        const { max, min } = window.BIOME_STATE.audioFilterFreq;
        const targetFreq = Math.max(min, max - (max - min) * t);
        filterNode.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);

        // 深海压迫感增强：Y < -300 时增加 Q 值，模拟闷声
        if (y < -300) {
            filterNode.Q.setTargetAtTime(5.0, audioCtx.currentTime, 0.5);
        } else {
            filterNode.Q.setTargetAtTime(1.0, audioCtx.currentTime, 0.5);
        }
    }
};

// 预定义变异视觉流水线 (P0.5 Mutation Visual Pipeline)
window.MUTATION_PIPELINE = {
    active: false,
    startTime: 0,
    duration: 3.0,
    scanLinePos: 0
};

// 注入扫描光栅 Shader (Injecting Scanline Shader via onBeforeCompile)
function injectMutationShader(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uMutationActive = { value: 0 };
        shader.uniforms.uMutationTime = { value: 0 };
        shader.fragmentShader = `
            uniform float uMutationActive;
            uniform float uMutationTime;
            ${shader.fragmentShader}
        `.replace(
            `#include <emissivemap_fragment>`,
            `#include <emissivemap_fragment>
            if (uMutationActive > 0.5) {
                float scan = sin(vUv.y * 50.0 + uMutationTime * 10.0) * 0.5 + 0.5;
                float glow = pow(scan, 8.0);
                totalEmissiveRadiance += vec3(0.0, 0.95, 1.0) * glow * uMutationActive;
            }
            `
        );
        material.userData.shader = shader;
    };
}
// 将 Shader 注入生物材质池 (预设)
archetypeBuilder.organismState.onMaterialCreated = injectMutationShader;

// --- 金缮 (Kintsugi) 材质替换函数 ---
function applyKintsugiShader(mesh) {
    if (!mesh.material || !mesh.geometry) return;

    // 克隆原有材质并覆盖物理属性为石化/焦岩状
    const kintsugiMat = mesh.material.clone();
    kintsugiMat.color.setHex(0x050505);
    kintsugiMat.roughness = 0.95;
    kintsugiMat.metalness = 0.8;
    kintsugiMat.transparent = false;
    kintsugiMat.emissive.setHex(0x000000); // 移除原有发光

    kintsugiMat.onBeforeCompile = (shader) => {
        shader.uniforms.uKintsugiTime = { value: 0 };
        // 噪声函数 (Simplex 3D 近似)
        shader.fragmentShader = `
            uniform float uKintsugiTime;
            
            // 简单 3D 噪声生成
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i  = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                i = mod289(i);
                vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                float n_ = 0.142857142857;
                vec3 ns = n_ * D.wyz - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_);
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4(x.xy, y.xy);
                vec4 b1 = vec4(x.zw, y.zw);
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                vec3 p0 = vec3(a0.xy, h.x);
                vec3 p1 = vec3(a0.zw, h.y);
                vec3 p2 = vec3(a1.xy, h.z);
                vec3 p3 = vec3(a1.zw, h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
            }

            ${shader.fragmentShader}
        `.replace(
            `#include <emissivemap_fragment>`,
            `#include <emissivemap_fragment>
            
            // 生成裂纹噪声频率
            float noiseVal = snoise(vViewPosition * 5.0);
            
            // 提炼出边缘锐利的裂缝
            float crack = smoothstep(0.4, 0.45, abs(noiseVal));
            
            // 只有裂缝内部透出金光
            vec3 gold = vec3(1.0, 0.84, 0.0);
            float goldIntensity = (1.0 - crack) * 3.0 * (0.8 + 0.2 * sin(uKintsugiTime * 2.0));
            
            totalEmissiveRadiance += gold * goldIntensity;
            `
        );
        mesh.userData.kintsugiShader = shader;
    };
    mesh.material = kintsugiMat;
}

// 纪元劫难状态机 (The Calamity State)
window.CALAMITY_STATE = {
    active: false,
    type: null, // e.g., 'ACIDIFICATION'
    intensity: 0, // 0.0 to 1.0, 控制特效平滑度
    startTime: 0,
    isDead: false
};


// 开发者调试：触发大酸化预警
window.debugTriggerAcidification = () => {
    if (window.CALAMITY_STATE.active) return;
    console.warn("[CALAMITY] 大酸化纪元预警已触发！");
    window.CALAMITY_STATE.active = true;
    window.CALAMITY_STATE.type = 'ACIDIFICATION';
    window.CALAMITY_STATE.startTime = clock.getElapsedTime();

    // 强制 AI 发出痛苦求救
    const logEl = document.getElementById('ai-log');
    if (logEl) {
        logEl.innerHTML = `<span style="color:#ff5555;font-weight:bold;">[AI 伴侣] 造物主，水在灼烧我的表皮...我的能量正在快速流失，我们需要更厚的角质层！</span>`;
    }

    // 如果处于 P1 MVP 的沙盒模式下，为了看清效果我们需要一个 dummy ATP 消耗循环
    if (!window.acidDrainInterval) {
        window.currentGenomeData = window.currentGenomeData || { energy_reserve: 100 };
        window.currentGenomeData.energy_reserve = window.currentGenomeData.energy_reserve || 100;

        window.acidDrainInterval = setInterval(() => {
            if (!window.CALAMITY_STATE.active) return;
            // 模拟 5% ATP 消耗
            window.currentGenomeData.energy_reserve -= 5;
            window.updateMorphology(window.currentGenomeData);

            if (window.currentGenomeData.energy_reserve <= 0) {
                console.error("ATP 耗尽！触发死亡引擎。");
                window.triggerDeathEngine();
            }
        }, 1000);
    }
};

// 开发者调试：强制能量归零暴毙
window.debugForceDeath = () => {
    console.error("[DEATH] 一键暴毙激活！");
    if (window.currentGenomeData) {
        window.currentGenomeData.energy_reserve = 0;
        window.updateMorphology(window.currentGenomeData);
    }
    window.CALAMITY_STATE.isDead = true;
    if (window.heartbeatGain && audioCtx) {
        window.heartbeatGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    }
    const logEl = document.getElementById('ai-log');
    if (logEl) logEl.innerHTML = `<span style="color:#ff3333">[LEGACY] 能量耗尽，化为深海遗迹 (金缮形态)...</span>`;

    // 遍历 fishGroup 下所有 Mesh 并应用金缮着色器
    fishGroup.traverse((child) => {
        if (child.isMesh) {
            applyKintsugiShader(child);
        }
    });

    // 移除游离态水母等额外发光
    if (archetypeBuilder.organismState.arms) archetypeBuilder.organismState.arms.forEach(a => a.visible = false);
    if (archetypeBuilder.organismState.brainLight) archetypeBuilder.organismState.brainLight.intensity = 0;
};

// 命运轮盘与灭绝结算引擎 (The Death Engine)
window.triggerDeathEngine = async () => {
    if (window.CALAMITY_STATE.type === 'DEATH_PROCESSING') return; // 防止重复触发

    console.log("💀 触发灭绝结算引擎...");
    window.CALAMITY_STATE.type = 'DEATH_PROCESSING';

    // 1. 生成化石明信片 (The Fossil Record)
    const logEl = document.getElementById('ai-log');
    if (logEl) logEl.innerHTML = `<span style="color:#ff5555;">[系统警告] 生命体征归零。正在生成化石记录...</span>`;

    // 借用截图功能
    setTimeout(() => {
        window.takePhotograph(); // 原有截图逻辑会下载带字迹的图片
    }, 500);

    // 2. 命运掷骰子
    setTimeout(() => {
        const roll = Math.random();
        console.log(`[命运骰子] 判定值：${roll.toFixed(3)}`);

        if (roll <= 0.9) {
            // 90% 溶解剥离
            if (logEl) logEl.innerHTML = `<span style="color:#aaaaaa;">[90% 物理崩塌] 未能进化出抵抗机制，肉体完全溶解。基因链清空，重置为胚胎。</span>`;

            // 清除酸化能量消耗循环
            if (window.acidDrainInterval) {
                clearInterval(window.acidDrainInterval);
                window.acidDrainInterval = null;
            }

            // 视觉：粒子消散特效
            spawnDissolutionParticles();
            fishGroup.visible = false;
            setTimeout(() => {
                window.CALAMITY_STATE.active = false;
                window.CALAMITY_STATE.type = null;
                window.CALAMITY_STATE.intensity = 0;
                window.currentGenomeData = { type: 'embryo', energy_reserve: 100 };
                window.setAppMode('embryo');
                fishGroup.visible = true;
            }, 3000);

        } else {
            // // MODIFIED: 10% 奇迹返祖 - 核心基因留存逻辑
            if (logEl) logEl.innerHTML = `<span style="color:#ffca28; font-weight:bold;">[10% 进化奇迹] 基因链在崩溃中重组！器官脱落，但核心抗性被刻入骨髓！</span>`;

            // 提取遗传记忆：如果已有抗性，强行保留
            const legacyTraits = {};
            if (window.currentGenomeData?.morphology?.surface?.acid_resistance) {
                legacyTraits.acid_resistance = window.currentGenomeData.morphology.surface.acid_resistance;
            }

            // 清除酸化能量消耗循环
            if (window.acidDrainInterval) {
                clearInterval(window.acidDrainInterval);
                window.acidDrainInterval = null;
            }

            // 视觉：收缩过渡至金缮形态
            window.CALAMITY_STATE.active = false;
            window.CALAMITY_STATE.type = null;
            window.CALAMITY_STATE.intensity = 0;
            triggerMiracleShrinkAnimation(() => {
                window.currentGenomeData = {
                    type: 'kintsugi_remnant',
                    energy_reserve: 50,
                    genetics: {
                        is_immutable: true,
                        legacy_traits: legacyTraits
                    }
                };
                archetypeBuilder.build('kintsugi_remnant');
                console.log("🧬 Genetic Legacy Preserved:", legacyTraits);
            });
        }
    }, 2000);
};

// 初始相机位置，为开场动画做准备
camera.position.set(30, 30, 60);
camera.lookAt(0, 0, 0);

// ── 死亡引擎视觉特效工具函数 ──

// 90% 溶解：粒子消散特效
function spawnDissolutionParticles() {
    const core = archetypeBuilder.organismState.coreMeshRef;
    if (!core) return;

    const particleCount = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    // 从模型表面采样初始位置
    const worldPos = new THREE.Vector3();
    core.getWorldPosition(worldPos);
    for (let i = 0; i < particleCount; i++) {
        // 球面均匀分布 + 随机偏移
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 0.3 + Math.random() * 0.2;
        positions[i * 3] = worldPos.x + r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = worldPos.y + r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = worldPos.z + r * Math.cos(phi);

        velocities.push(new THREE.Vector3(
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15
        ));
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        size: 0.08,
        color: 0x00f2ff,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending
    });

    // --- 海雪粒子系统 (Marine Snow) ---
    let marineSnow;
    function initMarineSnow() {
        const count = 2000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 100;
            velocities[i] = 0.02 + Math.random() * 0.05;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.15,
            transparent: true,
            opacity: 0.4,
            sizeAttenuation: true
        });

        marineSnow = new THREE.Points(geometry, material);
        scene.add(marineSnow);
    }
    initMarineSnow();

    function updateMarineSnow(delta, speed) {
        const positions = marineSnow.geometry.attributes.position.array;
        for (let i = 0; i < positions.length / 3; i++) {
            // 缓慢沉降
            positions[i * 3 + 1] -= 0.01;

            // 随生物反向位移 (模拟流体相对运动)
            positions[i * 3] -= velocity.x * 0.5;
            positions[i * 3 + 1] -= velocity.y * 0.5;
            positions[i * 3 + 2] -= velocity.z * 0.5;

            // 边界循环
            if (positions[i * 3 + 1] < fishGroup.position.y - 50) positions[i * 3 + 1] += 100;
            if (positions[i * 3 + 1] > fishGroup.position.y + 50) positions[i * 3 + 1] -= 100;
            if (positions[i * 3] < fishGroup.position.x - 50) positions[i * 3] += 100;
            if (positions[i * 3] > fishGroup.position.x + 50) positions[i * 3] -= 100;
            if (positions[i * 3 + 2] < fishGroup.position.z - 50) positions[i * 3 + 2] += 100;
            if (positions[i * 3 + 2] > fishGroup.position.z + 50) positions[i * 3 + 2] -= 100;
        }
        marineSnow.geometry.attributes.position.needsUpdate = true;

        // 高速时的粒子大小变化
        marineSnow.material.size = 0.15 + speed * 2;
    }
    const particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    // 1.5 秒扩散 + 渐隐动画
    const startTime = clock.getElapsedTime();
    const duration = 1.5;
    function animateParticles() {
        const elapsed = clock.getElapsedTime() - startTime;
        const t = Math.min(1.0, elapsed / duration);

        const pos = geometry.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
            pos[i * 3] += velocities[i].x * (1.0 - t * 0.5);
            pos[i * 3 + 1] += velocities[i].y * (1.0 - t * 0.5);
            pos[i * 3 + 2] += velocities[i].z * (1.0 - t * 0.5);
        }
        geometry.attributes.position.needsUpdate = true;
        material.opacity = 1.0 - t;

        if (t < 1.0) {
            requestAnimationFrame(animateParticles);
        } else {
            scene.remove(particleSystem);
            geometry.dispose();
            material.dispose();
        }
    }
    animateParticles();
}

// 10% 奇迹：收缩 + 褪色过渡动画
function triggerMiracleShrinkAnimation(onComplete) {
    const core = archetypeBuilder.organismState.coreMeshRef;
    if (!core) { onComplete(); return; }

    const startScale = core.scale.clone();
    const startTime = clock.getElapsedTime();
    const duration = 1.2;
    const originalColor = core.material.color ? core.material.color.clone() : new THREE.Color(0x00f2ff);
    const targetColor = new THREE.Color(0x3a1015); // 暗血色

    function animateShrink() {
        const elapsed = clock.getElapsedTime() - startTime;
        const t = Math.min(1.0, elapsed / duration);
        const easeT = t * t * (3.0 - 2.0 * t); // smoothstep

        // 缩小
        const s = THREE.MathUtils.lerp(1.0, 0.3, easeT);
        core.scale.set(startScale.x * s, startScale.y * s, startScale.z * s);

        // 褪色
        if (core.material.color) {
            core.material.color.copy(originalColor).lerp(targetColor, easeT);
        }
        if (core.material.emissive) {
            core.material.emissive.copy(originalColor).lerp(targetColor, easeT);
        }
        core.material.emissiveIntensity = THREE.MathUtils.lerp(1.0, 0.1, easeT);

        // 剧烈颤抖
        if (t < 0.8) {
            const shake = (1.0 - t) * 0.15;
            core.position.x = (Math.random() - 0.5) * shake;
            core.position.z = (Math.random() - 0.5) * shake;
        }

        if (t < 1.0) {
            requestAnimationFrame(animateShrink);
        } else {
            core.position.set(0, 0, 0);
            onComplete();
        }
    }
    animateShrink();
}

// ── MVP闭环：原始绿藻捕食系统（升级版：深海萤光食物团） ──
window.algaeFoodList = [];
const algaeMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff88,
    emissive: 0x00ff88,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.85,
    roughness: 0.3,
    metalness: 0.0
});
const algaeGeo = new THREE.SphereGeometry(0.15, 8, 8);

window.spawnAlgae = (count = 5) => {
    for (let i = 0; i < count; i++) {
        const algae = new THREE.Mesh(algaeGeo, algaeMaterial.clone());
        algae.position.set(
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 15,
            (Math.random() - 0.5) * 15
        );
        // 微光环
        const glow = new THREE.PointLight(0x00ff88, 0.3, 3);
        algae.add(glow);
        algae.userData.phaseOffset = Math.random() * Math.PI * 2;
        scene.add(algae);
        window.algaeFoodList.push(algae);
    }
};

// 初始散布绿藻
window.spawnAlgae(8);

// 初始化进化树渲染器
const tree = new TreeRenderer(scene);
tree.refreshTree();
setInterval(() => tree.refreshTree(), 30000); // 每 30 秒刷新一次全球生态

// 3. 连接 Cloudflare Durable Object WebSocket
// 注意：本地调试时地址可能是 ws://localhost:8787/ws
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);

        if (data.type === 'INIT' || data.type === 'MUTATION_UPDATE' || data.type === 'EVOLVE') {
            console.log('🧬 Genome Updated:', data.genome || data.data);
            applyGenomeToMorphology(data.genome || data.data);

            // 保存记忆快照至 Vectorize
            saveMemoryToVectorize(
                data.intent || 'WS Genome Sync',
                data.rationale || data.status || '',
                data.genome || data.data
            );

            const logEl = document.getElementById('ai-log');
            if (logEl && (data.rationale || data.status)) {
                logEl.innerText = data.rationale || `Status: ${data.status}`;
            }
        } else if (data.type === 'MUTATION_REJECTED') {
            console.error('🚫 Mutation Rejected:', data.reason);
            window.updateSensoryLog(`[ 裁定受阻 ] ${data.reason}`, "#ff5555");
            if (typeof triggerMutationCeremony === 'function') {
                triggerMutationCeremony('REJECTED');
            }
        } else if (data.type === 'GLOBAL_DISASTER') {
            console.warn(`🌋 全球自然灾害警告: ${data.environment}`);
            window.updateSensoryLog(`[ 纪元浩劫 ] ${data.environment} 降临。`, "#ff3333");
            if (typeof window.debugTriggerAcidification === 'function') {
                window.debugTriggerAcidification();
            }
        }
    } catch (error) {
        console.error('WebSocket message error:', error);
        window.updateSensoryLog(`[ 通讯异常 ] 数据包受损`, "#ff5555");
    }
};

ws.onopen = () => {
    console.log('WebSocket connected');
    // 确保 DOM 元素存在再更新文本
    const logEl = document.getElementById('ai-log');
    if (logEl) {
        logEl.innerText = 'WebSocket 连接成功，等待初始基因组...';
    }
};

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    // 确保 DOM 元素存在再更新文本
    const logEl = document.getElementById('ai-log');
    if (logEl) {
        logEl.innerText = `WebSocket 错误: ${error.message}`;
    }
};

// 4. 将 JSON 基因转化为视觉表现
window.currentGenomeData = null;

// ── MVP: 直接映射 JSON → 3D（含 P0.5 平滑演化逻辑）──
window.updateMorphology = function updateMorphology(genome, isMutation = false) {
    if (!genome) return;
    window.currentGenomeData = genome;

    const core = archetypeBuilder.organismState.coreMeshRef;
    if (!core) return;

    if (isMutation) {
        // 激活变异视觉仪式感 (P0.5)
        window.MUTATION_PIPELINE.active = true;
        window.MUTATION_PIPELINE.startTime = clock.getElapsedTime();
        if (core.material.userData.shader) {
            core.material.userData.shader.uniforms.uMutationActive.value = 1.0;
        }

        // 变异成功的能量脉冲 (瞬时增亮)
        core.material.emissiveIntensity = 5.0;
        setTimeout(() => {
            window.MUTATION_PIPELINE.active = false;
            if (core.material.userData.shader) {
                core.material.userData.shader.uniforms.uMutationActive.value = 0.0;
            }
        }, window.MUTATION_PIPELINE.duration * 1000);
    }

    // 1. 体型平滑插值 (P0.5)
    const targetRadius = genome.morphology?.hox_segments?.[0]?.scaling?.radius || genome.radius || 1.0;
    const targetScale = Math.max(0.1, Math.min(5.0, targetRadius / 3.0));

    // 2. 属性平滑插值 (Lerp)
    const targetTransmission = genome.morphology?.surface?.transmission ?? 0.0;
    const targetMetalness = genome.morphology?.surface?.metalness ?? 0.0;
    const targetEnergy = genome.metabolism?.energy_storage_capacity ?? genome.energy_reserve ?? 100;

    // 利用微小步长在 animate 循环之外实现基础插值同步
    // 正确的做法是在主循环中每一帧检测差值。此处设置目标，animate 循环执行插值
    core.userData.targetScale = targetScale;
    core.userData.targetTransmission = targetTransmission;
    core.userData.targetMetalness = targetMetalness;
    core.userData.targetEmissive = Math.max(0.1, targetEnergy / 100.0);
};

// 扩展 applyGenomeToMorphology 以调用 updateMorphology
function applyGenomeToMorphology(genome) {
    if (!genome) return;
    window.updateMorphology(genome);
    // Genesis态下额外更新 archetypeBuilder 状态
    if (window.APP_MODE === 'GENESIS') {
        const turgor = genome.turgor_pressure ?? 1.0;
        archetypeBuilder.organismState.transmission = Math.min(0.9, turgor * 0.3);
        const complexity = genome.complexity ?? 1.0;
        archetypeBuilder.organismState.metalness = Math.min(0.8, complexity * 0.1);
    }
}

// 演化仪式系统状态 (The Ceremony)
let mutationCeremony = { active: false, type: null, startTime: 0, shakeIntensity: 0 };

// 5. 动画循环 (加入轻微蠕动效果)
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    // 平滑相机入场动画 (Lerp) - 仅在同步完成后开始 (阶段 2: Origin)
    if (!window._syncComplete) {
        // 挂机状态：相机处于高空俯视
        camera.position.lerp(new THREE.Vector3(0, 20, 30), 0.05);
        camera.lookAt(0, -2, 0);
    } else if (!window._cameraIntroComplete && camera.position.distanceTo(fishGroup.position.clone().add(new THREE.Vector3(0, 8, 20))) > 2) {
        // 从高空俯冲到胚胎后上方
        const introTarget = fishGroup.position.clone().add(new THREE.Vector3(0, 8, 20));
        camera.position.lerp(introTarget, 0.02);
        camera.lookAt(fishGroup.position);
    } else {
        window._cameraIntroComplete = true;
    }

    // 缓慢旋转展台，增加仪式感
    if (window.CURRENT_STATE === GameState.ORIGIN || !window._syncComplete) {
        isle.rotation.y -= 0.001;
        ring.rotation.z -= 0.005;
    }

    // 若死亡进入遗迹状态，停止任何加速和能量消耗，播放下沉
    if (window.CALAMITY_STATE.isDead) {
        fishGroup.position.y -= 0.02; // 缓慢下沉
        fishGroup.rotation.z += 0.002; // 缓慢倾斜
        fishGroup.rotation.x += 0.001;

        // 更新金缮 Shader 时间
        fishGroup.traverse((child) => {
            if (child.isMesh && child.userData.kintsugiShader) {
                child.userData.kintsugiShader.uniforms.uKintsugiTime.value = time;
            }
        });
        isPlayerMoving = false;
    } else if (window._syncComplete) {
        // --- 核心运动引擎 2.0 (矢量推进) ---
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(fishGroup.quaternion);

        // 1. 转向 A/D
        if (moveState.left) fishGroup.rotation.y += TURN_SPEED;
        if (moveState.right) fishGroup.rotation.y -= TURN_SPEED;

        // 2. 推进 W/S
        isPlayerMoving = false;
        if (moveState.forward) {
            velocity.addScaledVector(forward, ACCEL);
            isPlayerMoving = true;
        }
        if (moveState.backward) {
            velocity.addScaledVector(forward, -ACCEL * 0.5);
            isPlayerMoving = true;
        }

        // 3. 深度控制 (Space/Shift)
        if (moveState.up) velocity.y += ACCEL;
        if (moveState.down) velocity.y -= ACCEL;

        // 4. ATP 代谢循环
        if (window.currentGenomeData) {
            // 静息消耗 + 运动额外消耗
            const cost = BMR + (isPlayerMoving ? 0.05 : 0);
            window.currentGenomeData.energy_reserve = Math.max(0, window.currentGenomeData.energy_reserve - cost);

            // 低能量警报 (UI 联动)
            const vignette = document.getElementById('vignette-overlay');
            if (vignette) {
                if (window.currentGenomeData.energy_reserve < 20) {
                    vignette.classList.add('low-atp');
                } else {
                    vignette.classList.remove('low-atp');
                }
            }

            // 桌面挂机预警：Hunger (< 10%) 致命衰竭心跳闪烁
            if (window.currentGenomeData.energy_reserve < 10 && archetypeBuilder.organismState.coreMeshRef && !window.CALAMITY_STATE.isDead) {
                const beat = Math.pow(Math.sin(time * 8.0), 4.0); // 心跳曲线
                // 红色高亮脉冲
                archetypeBuilder.organismState.coreMeshRef.material.emissive.setRGB(1.0, 0.0, 0.0);
                archetypeBuilder.organismState.coreMeshRef.material.emissiveIntensity = 1.0 + beat * 3.0;
                // 痛苦微颤
                fishGroup.position.x += (Math.random() - 0.5) * 0.02;
                // 听觉脉冲联动
                if (window.heartbeatGain && audioCtx && audioCtx.state === 'running') {
                    window.heartbeatGain.gain.setTargetAtTime(beat * 0.5, audioCtx.currentTime, 0.05);
                }
            } else if (!window.MUTATION_PIPELINE.active && !window.CALAMITY_STATE.active && archetypeBuilder.organismState.coreMeshRef) {
                // 恢复默认发光色
                archetypeBuilder.organismState.coreMeshRef.material.emissive.setHex(window.currentGenomeData.color || 0x44aa88);
                if (window.heartbeatGain && audioCtx) {
                    window.heartbeatGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
                }
            }

            // Deep Sleep 冥想态进入判定
            if (performance.now() - lastActivityTime > deepSleepThreshold && !isDeepSleep && !window.MUTATION_PIPELINE.active && !window.CALAMITY_STATE.isDead) {
                isDeepSleep = true;
                gsap.to(ambientLight.color, { r: 0.0, g: 0.02, b: 0.08, duration: 4.0 }); // 极深暗蓝
                gsap.to(sunLight.color, { r: 0.0, g: 0.05, b: 0.15, duration: 4.0 });
                const logEl = document.getElementById('ai-log');
                if (logEl) logEl.innerHTML = `<span style="color:#5588aa;font-style:italic">"外界陷入沉寂... 切换至超低功耗冥想态 (Deep Sleep)。"</span>`;
            }

            // 时间流速计算：如果处于 Deep Sleep，呼吸律动时间慢放 3 倍
            let timeDelta = delta;
            if (isDeepSleep) timeDelta *= 0.33;
            time += timeDelta;

            // 桌面挂机预警：Hunger (< 10%) 致命衰竭心跳闪烁
            inputState.thrust = isPlayerMoving ? 1.0 : (Math.sin(time) * 0.2 + 0.2);
        }

        // 应用物理滑行
        velocity.multiplyScalar(DAMPING);
        fishGroup.position.add(velocity);

        // 视角联动 (FOV Stretch & Dynamic Offset)
        const speed = velocity.length();
        const targetFOV = 75 + speed * 120;
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, 0.1);
        camera.updateProjectionMatrix();

        // 优化的第三人称跟随
        const idealOffset = new THREE.Vector3(0, 2, 8);
        idealOffset.applyQuaternion(fishGroup.quaternion);
        const targetCamPos = fishGroup.position.clone().add(idealOffset);
        camera.position.lerp(targetCamPos, 0.1);
        camera.lookAt(fishGroup.position);

        // 深度感官更新 (P1.5) - 统一至 animate 循环末尾处理
        // 更新海雪 - 统一至 animate 循环末尾处理


        // 更新原型动画
        const energyFactor = Math.max(0.2, (window.currentGenomeData?.energy_reserve ?? 100) / 100.0);
        archetypeBuilder.updateAnimations(time, energyFactor);

        // 呼吸感浮动（仅在非主动移动时）
        if (!isPlayerMoving) {
            fishGroup.position.y += Math.sin(time * 2) * 0.003;
        }

        // 相机平滑跟随生物（入场动画结束后）
        if (window._cameraIntroComplete) {
            const cameraOffset = new THREE.Vector3(0, 8, 20);
            const targetCamPos = fishGroup.position.clone().add(cameraOffset);
            camera.position.lerp(targetCamPos, 0.03);
            camera.lookAt(fishGroup.position);
        }

        // ── 实时下潜感官更新 (Sensory Mapping P1.5) ──
        window.updateSensory(fishGroup.position.y);

        // ── 材质演化平滑插值 (Mutation Pipeline P0.5) ──
        const coreMesh = archetypeBuilder.organismState.coreMeshRef;
        if (coreMesh) {
            const lerpFactor = 0.05;
            if (coreMesh.userData.targetScale) {
                const ts = coreMesh.userData.targetScale;
                coreMesh.scale.lerp(new THREE.Vector3(ts, ts, ts), lerpFactor);
            }
            if (coreMesh.userData.targetTransmission !== undefined) {
                coreMesh.material.transmission = THREE.MathUtils.lerp(coreMesh.material.transmission, coreMesh.userData.targetTransmission, lerpFactor);
                coreMesh.material.opacity = Math.max(0.2, 1.0 - coreMesh.material.transmission * 0.6);
            }
            if (coreMesh.userData.targetMetalness !== undefined) {
                coreMesh.material.metalness = THREE.MathUtils.lerp(coreMesh.material.metalness, coreMesh.userData.targetMetalness, lerpFactor);
            }

            // 能量衰减与变异光栅反馈
            if (window.MUTATION_PIPELINE.active) {
                if (coreMesh.material.userData.shader) {
                    coreMesh.material.userData.shader.uniforms.uMutationTime.value = time;
                    coreMesh.material.userData.shader.uniforms.uMutationActive.value = 1.0;
                }
            } else if (coreMesh.userData.targetEmissive !== undefined) {
                coreMesh.material.emissiveIntensity = THREE.MathUtils.lerp(coreMesh.material.emissiveIntensity, coreMesh.userData.targetEmissive, 0.01);
            }
        }

        // ── 海雪微粒同步 (Marine Snow P1.5) ──
        // Points 粒子随相机位移产生相对运动感
        const positions = partGeo.attributes.position.array;
        const camMovement = camera.position.clone().sub(window._lastCamPos || camera.position);
        window._lastCamPos = camera.position.clone();

        for (let i = 0; i < partCount; i++) {
            const idx = i * 6;
            const p = partPositions[i];

            // 基础沉降 + 相机反馈（反向偏移）
            p.y -= 0.02;
            p.x -= camMovement.x * 0.5;
            p.z -= camMovement.z * 0.5;

            // 循环边界检测
            if (p.x - camera.position.x > 100) p.x -= 200;
            else if (p.x - camera.position.x < -100) p.x += 200;
            if (p.y - camera.position.y > 100) p.y -= 200;
            else if (p.y - camera.position.y < -100) p.y += 200;
            if (p.z - camera.position.z > 100) p.z -= 200;
            else if (p.z - camera.position.z < -100) p.z += 200;

            positions[idx] = p.x;
            positions[idx + 1] = p.y;
            positions[idx + 2] = p.z;
            // 拉伸效果复写：如果是移动中，同步顶点 B 实现视觉暂留
            positions[idx + 3] = p.x - velocity.x * 2.0;
            positions[idx + 4] = p.y - velocity.y * 2.0;
            positions[idx + 5] = p.z - velocity.z * 2.0;
        }
        partGeo.attributes.position.needsUpdate = true;

        // ── 纪元劫难环境异变复写 ──
        if (window.CALAMITY_STATE.active && window.CALAMITY_STATE.type === 'ACIDIFICATION') {
            const calElapsed = time - window.CALAMITY_STATE.startTime;
            // 平滑进入灾难状态 (5秒拉满)
            window.CALAMITY_STATE.intensity = Math.min(1.0, calElapsed / 5.0);

            const acidColor = new THREE.Color(0x4A0E17); // 危险的铁锈红
            scene.fog.color.lerp(acidColor, window.CALAMITY_STATE.intensity);
            scene.fog.density += window.CALAMITY_STATE.intensity * 0.02; // 更浑浊

            // // MODIFIED: 生理痛苦高频抖动 - 增强抖动效果
            if (window.CALAMITY_STATE.intensity > 0) {
                const shake = window.CALAMITY_STATE.intensity * 0.35; // 提高抖动幅度
                const freq = time * 25.0; // 提高采样频率
                fishGroup.position.x += Math.sin(freq) * shake;
                fishGroup.position.z += Math.cos(freq * 1.1) * shake;

                // 核心光芒闪烁失稳
                if (archetypeBuilder.organismState.coreMeshRef) {
                    const baseEmi = Math.max(0.1, (window.currentGenomeData?.energy_reserve ?? 100) / 100.0);
                    archetypeBuilder.organismState.coreMeshRef.material.emissiveIntensity = baseEmi * (1.0 - Math.random() * 0.7 * window.CALAMITY_STATE.intensity);
                }
            }
        }

        scene.fog.color.copy(targetFogColor);
        scene.fog.density = targetDensity;
        renderer.setClearColor(scene.fog.color);


        // Audio 低通滤波截止频率绑定
        if (filterNode && audioCtx && audioCtx.state === 'running') {
            // window.updateSensory 已在该循环前端统一处理频率计算逻辑
            // 此处不再重复计算 depthT，由控制器直接驱动
        }

        // 仪式感动效更新
        if (mutationCeremony.active) {
            const elapsed = time - mutationCeremony.startTime;
            if (mutationCeremony.type === 'REJECTED') {
                if (elapsed < 1.0) {
                    // 剧烈震动
                    camera.position.x += (Math.random() - 0.5) * mutationCeremony.shakeIntensity;
                    camera.position.y += (Math.random() - 0.5) * mutationCeremony.shakeIntensity;
                    mutationCeremony.shakeIntensity *= 0.9;
                } else {
                    mutationCeremony.active = false;
                    // 恢复材质
                    archetypeBuilder.build(archetypeBuilder.currentArchetype);
                }
            } else if (mutationCeremony.type === 'SUCCESS') {
                if (elapsed < 2.0) {
                    // 极光汇聚
                    archetypeBuilder.organismState.coreMeshRef.scale.multiplyScalar(1.0 + Math.sin(elapsed * Math.PI) * 0.05);
                    archetypeBuilder.bioLight.intensity = Math.sin(elapsed * Math.PI) * 5.0 + 1.0;
                } else {
                    mutationCeremony.active = false;
                    // 演化完成闪烁结束，重置基础光效
                    archetypeBuilder.build(archetypeBuilder.currentArchetype);
                }
            }
        }

        // ── MVP闭环：捕食距离检测 ──
        if (window.APP_MODE !== 'DEATH_PROCESSING' && archetypeBuilder.organismState.coreMeshRef) {
            const fishWorldPos = new THREE.Vector3();
            archetypeBuilder.organismState.coreMeshRef.getWorldPosition(fishWorldPos);

            for (let i = window.algaeFoodList.length - 1; i >= 0; i--) {
                const algae = window.algaeFoodList[i];
                // 绿藻随波逐流 + 脉冲发光
                algae.position.y += Math.sin(time + i) * 0.005;
                algae.position.x += Math.cos(time + i) * 0.005;
                // 萤光呼吸脉冲
                const phase = algae.userData.phaseOffset || 0;
                algae.material.emissiveIntensity = 0.5 + Math.sin(time * 3.0 + phase) * 0.4;

                // 碰撞检测
                if (fishWorldPos.distanceTo(algae.position) < 2.0) {
                    // 触发捕食
                    scene.remove(algae);
                    window.algaeFoodList.splice(i, 1);

                    // 本地增加能量
                    if (window.currentGenomeData) {
                        window.currentGenomeData.energy_reserve = Math.min((window.currentGenomeData.energy_reserve || 0) + 15, 100);
                    }

                    // 视觉光爆反馈 (Stage 5)
                    const targetMesh = archetypeBuilder.organismState.coreMeshRef;
                    if (targetMesh) {
                        gsap.to(targetMesh.material, {
                            emissiveIntensity: 5.0,
                            duration: 0.1,
                            onComplete: () => {
                                gsap.to(targetMesh.material, { emissiveIntensity: 1.0, duration: 1.0 });
                            }
                        });
                        gsap.to(targetMesh.scale, {
                            x: "*=1.2", y: "*=1.2", z: "*=1.2",
                            duration: 0.1,
                            yoyo: true,
                            repeat: 1
                        });
                    }

                    window.updateSensoryLog("[ 捕食成功。核心 ATP 储备已提升至 " + Math.round(window.currentGenomeData.energy_reserve) + "% ]", "#00ff88");
                    // 给后端 DO 异步发送 EAT 事件（如果连着）
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'EAT', amount: 15 }));
                    }

                    // 延迟再刷一个新的绿藻
                    setTimeout(() => window.spawnAlgae(1), 5000);
                }
            }
        }

        if (tree) tree.updateAnimation();
        renderer.render(scene, camera);
    }
    animate();

    // 暴露截图功能 (企鹅岛风格的摄影交互)
    window.takePhotograph = () => {
        renderer.render(scene, camera);
        const webglCanvas = renderer.domElement;

        // 创建一个海报画板 (1200 x 800)
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 800;
        const ctx = canvas.getContext('2d');

        // 右侧背景：设计系统深色
        ctx.fillStyle = '#0d0d15';
        ctx.fillRect(0, 0, 1200, 800);

        // 左侧：绘制 WebGL 三维截图 (1:1 裁剪式绘制)
        let sWidth = webglCanvas.height;
        let sx = (webglCanvas.width - sWidth) / 2;
        ctx.drawImage(webglCanvas, sx, 0, sWidth, webglCanvas.height, 0, 0, 800, 800);

        // 添加左侧暗角渐变过渡
        const gradient = ctx.createLinearGradient(600, 0, 800, 0);
        gradient.addColorStop(0, 'rgba(13,13,21,0)');
        gradient.addColorStop(1, 'rgba(13,13,21,1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(600, 0, 200, 800);

        // 右侧排版：语义与数据
        ctx.fillStyle = '#00f2ff';
        ctx.font = 'bold 36px monospace';
        ctx.fillText('Project Morpho', 850, 100);

        ctx.fillStyle = '#ffffff';
        ctx.font = '24px monospace';
        ctx.fillText('Semantic Archive', 850, 140);

        ctx.fillStyle = '#888888';
        ctx.font = '16px monospace';
        ctx.fillText('NODE: Tokyo-Edge-01', 850, 180);

        // 基因组数据展示 (兼容 P0.5 属性)
        const genome = window.currentGenomeData || { complexity: 1, energy_reserve: 100, turgor_pressure: 1, radius: 5 };
        const curRadius = genome.morphology?.hox_segments?.[0]?.scaling?.radius || genome.radius || 5.0;
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '14px monospace';
        const jsonStr = JSON.stringify({
            radius: curRadius.toFixed(2),
            complexity: (genome.complexity || 1.0).toFixed(2),
            turgor: (genome.turgor_pressure || 1.0).toFixed(2),
            energy: (genome.energy_reserve || 100).toFixed(0)
        }, null, 2);

        const lines = jsonStr.split('\n');
        lines.forEach((line, i) => {
            ctx.fillText(line, 850, 240 + i * 20);
        });

        // 伪 AI 墓志铭 / 物种叙事
        ctx.fillStyle = '#ffffff';
        ctx.font = 'italic 16px sans-serif';
        ctx.fillText('“它在极端的压力下改变了折射率，', 850, 500);
        ctx.fillText('成为了深渊中唯一的光源。”', 850, 530);

        // 导出文件
        const dataURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `morpho-semantic-postcard-${Date.now()}.png`;
        link.href = dataURL;
        link.click();

        const logEl = document.getElementById('ai-log');
        if (logEl) logEl.innerText = '📷 语义明信片已成功生成并保存。';
    };

    // P3: 将照片解析器挂载到窗口，与 HTML 事件联动
    window.handlePhotoUpload = (input) => {
        const logEl = document.getElementById('ai-log');
        if (logEl) logEl.innerText = '\u{1f441}\ufe0f \u521b\u9020\u8005\u4e4b\u773c\u6fc0\u6d3b\u4e2d\uff0c\u6b63\u5728\u89e3\u6790\u73b0\u5b9e\u53c2\u6570...';

        handlePhotoUpload(input, {
            onAnalyzing: () => {
                if (logEl) logEl.innerText = '\u{1f52c} AI \u6b63\u5728\u89e3\u6790\u5149\u5f71\u548c\u73af\u5883\u538b\u529b...';
            },
            onResult: (result) => {
                console.log('\u{1f441}\ufe0f \u573a\u666f\u8bfb\u53d6\u7ed3\u679c:', result);

                // \u5c06 AI \u89e3\u6790\u7684\u73af\u5883\u6807\u7b7e\u5e94\u7528\u5230\u5168\u5c40\u5149\u7167
                const envTag = result.environmentTag || result.description || '';
                applyEnvironmentLighting(envTag);

                // \u5c06\u89e3\u6790\u7684\u73af\u5883\u538b\u529b\u81ea\u52a8\u53d1\u9001\u5230\u540e\u7aef\u89e6\u53d1\u53d8\u5f02
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'ENVIRONMENT_TRIGGER',
                        environment: envTag,
                        meta: result
                    }));
                }

                if (logEl) {
                    logEl.innerHTML = `<span class="status-dot"></span> \u573a\u666f\u8bfb\u53d6\u5b8c\u6210<br><span style="font-size:12px;color:#aaa">${result.description || envTag}</span>`;
                }
            },
            onError: (err) => {
                if (logEl) logEl.innerText = `\u{26a0}\ufe0f \u89e3\u6790\u5931\u8d25: ${err.message}`;
            }
        });
    };

    window.submitMutation = async () => {
        // 防逆行锁：沙盒模式不允许提交
        if (window.APP_MODE !== 'GENESIS') {
            const logEl = document.getElementById('ai-log');
            if (logEl) logEl.innerHTML = `<span style="color:#ffca28">⚠ 当前处于预设沙盒模式，请切换回【胚胎】再进行演化。</span>`;
            return;
        }

        const partSelect = document.getElementById('mutation-part');
        const intentInput = document.getElementById('mutation-intent');
        const btn = document.getElementById('btn-submit-mutation');
        const logEl = document.getElementById('ai-log');

        const targetPart = partSelect ? partSelect.value : 'morphology';
        const intentStr = intentInput ? intentInput.value.trim() : '';

        if (!intentStr) {
            if (logEl) logEl.innerHTML = `<span style="color:#ff5252">⚠ 请输入变异意图</span>`;
            return;
        }

        // ── 意识代价 (The Cost of Chat) ──
        const currentEnergy = window.currentGenomeData?.energy_reserve ?? 100;
        if (currentEnergy < 20) {
            if (logEl) {
                logEl.innerHTML = `<span style="color:#ff5555; font-style:italic;">[神经衰弱] “能量不足...意识模糊...我听不懂你的指令，我们需要进食（绿藻）...”</span>`;
            }
            // 抖动提示
            if (archetypeBuilder.organismState.coreMeshRef) {
                archetypeBuilder.organismState.coreMeshRef.position.x += (Math.random() - 0.5) * 0.5;
            }
            return;
        }

        // 确定意图后立即扣除 10 点能量
        if (window.currentGenomeData) {
            window.currentGenomeData.energy_reserve -= 10;
            window.updateMorphology(window.currentGenomeData);
        }

        if (btn) {
            btn.disabled = true;
            btn.innerText = '⏳ 边缘智能计算中...';
        }
        if (logEl) logEl.innerText = '正在呼叫 AI 逻辑裁判评估变异可能性...';

        // 如果启用了 GM 免裁判模式，则直接请求后端
        const headers = { 'Content-Type': 'application/json' };
        if (window.isGMBypass) {
            headers['x-gm-secret'] = 'MorphoGod';
        }

        // 变异预检 (Preview)：UI 展示线框虚影
        if (archetypeBuilder.organismState.coreMeshRef) {
            archetypeBuilder.organismState.coreMeshRef.material.wireframe = true;
            gsap.to(archetypeBuilder.organismState.coreMeshRef.material, {
                opacity: 0.5,
                duration: 0.5,
                yoyo: true,
                repeat: -1,
                overwrite: "auto"
            });
        }

        try {
            const response = await fetch('/api/mutate', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    intent: intentStr,
                    targetPart: targetPart,
                    bioId: 'GLOBAL_BIOME',
                    currentGenome: window.currentGenomeData,
                    environmentContext: window.APP_MODE
                })
            });

            // ── 处理能耗与每日限制反馈 ──
            const remaining = response.headers.get('X-Chats-Remaining');
            if (remaining !== null) {
                console.log(`[Neural] Today's remaining chats: ${remaining}`);
                // 这里可以在 UI 侧显示（可选）
            }

            if (!response.ok) {
                const err = await response.json();
                if (err.error === 'NEURAL_EXHAUSTED') {
                    if (logEl) logEl.innerHTML = `<span style="color:#ff5252">🚫 ${err.message}</span>`;
                    return;
                }
                throw new Error(err.details || 'Mutation failed');
            }

            const result = await response.json();

            if (result.status === 'REJECTED') {
                triggerMutationCeremony('REJECTED');
                if (logEl) {
                    // 溃烂提示与原因排版
                    logEl.innerHTML = `<span style="color:#ff5252">❌ 逻辑序列排异：钢铁无法与原生质共生。</span><br><span style="font-size:12px;color:#aaa">理由: ${result.reasoning || '防沉迷/机制限制'}</span><br><span style="color:#00f2ff;font-size:12px;">💡 建议: ${result.suggestion || '请维持生命体演化的有机感'}</span>`;
                }
            } else if (result.status === 'SUCCESS' || result.patches) {
                triggerMutationCeremony('SUCCESS');
                if (logEl) logEl.innerText = '✅ 变异已通过 AI与物理验证，成功写入基因组！';
                // 真实形态更新由 WebSocket 异步推送完成
            }
        } catch (e) {
            console.error('Mutation Error:', e);
            if (logEl) logEl.innerText = '网络错误，请检查边缘节点连接。';
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = '🧬 提交变异申请';
            }
        }
    };

    function triggerMutationCeremony(type) {
        if (archetypeBuilder.organismState.coreMeshRef) {
            gsap.killTweensOf(archetypeBuilder.organismState.coreMeshRef.material);
            archetypeBuilder.organismState.coreMeshRef.material.opacity = Math.max(0.2, 1.0 - archetypeBuilder.organismState.coreMeshRef.material.transmission * 0.6);
            archetypeBuilder.organismState.coreMeshRef.material.wireframe = false;
        }

        mutationCeremony.active = true;
        mutationCeremony.type = type;
        mutationCeremony.startTime = clock.getElapsedTime();
        if (type === 'REJECTED') {
            mutationCeremony.shakeIntensity = 0.5;
            // 排异反应：局部溃烂红光与残缺感
            if (archetypeBuilder.organismState.coreMeshRef) {
                archetypeBuilder.organismState.coreMeshRef.material.emissive.setHex(0xff0000);
                archetypeBuilder.organismState.coreMeshRef.material.wireframe = true;
            }
            if (window.crushGain && audioCtx && audioCtx.state === 'running') {
                const now = audioCtx.currentTime;
                window.crushOsc.frequency.setValueAtTime(100, now);
                window.crushOsc.frequency.exponentialRampToValueAtTime(800, now + 1.0);
                window.crushGain.gain.setValueAtTime(0.3, now);
                window.crushGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
            }
        } else if (type === 'SUCCESS') {
            // 白光脉冲确认
            if (archetypeBuilder.organismState.coreMeshRef) {
                archetypeBuilder.organismState.coreMeshRef.material.emissive.setHex(0xffffff);
            }
            if (window.crushGain && audioCtx && audioCtx.state === 'running') {
                const now = audioCtx.currentTime;
                window.crushOsc.frequency.setValueAtTime(3000, now);
                window.crushOsc.frequency.exponentialRampToValueAtTime(8000, now + 0.5);
                window.crushGain.gain.setValueAtTime(0.1, now);
                window.crushGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            }
        }
    }

    // 根据环境输入改变全局光照体验 (Light as Feedback)
    function applyEnvironmentLighting(envStr) {
        if (envStr.includes('寒') || envStr.includes('冰') || envStr.includes('冻')) {
            ambientLight.color.setHex(0x001133);
            sunLight.color.setHex(0xaaeeff);
            pointLight.color.setHex(0x0055ff);
        } else if (envStr.includes('热') || envStr.includes('火') || envStr.includes('辐射')) {
            ambientLight.color.setHex(0x330000);
            sunLight.color.setHex(0xffaa55);
            pointLight.color.setHex(0xff2200);
        } else if (envStr.includes('酸') || envStr.includes('毒') || envStr.includes('沼')) {
            ambientLight.color.setHex(0x113300);
            sunLight.color.setHex(0xaaffaa);
            pointLight.color.setHex(0x55ff00);
        } else {
            // 恢复默认的极光紫/深蓝光照
            ambientLight.color.setHex(0x4040a0);
            sunLight.color.setHex(0xffffff);
            pointLight.color.setHex(0x00f2ff);
        }
    }

    // ────────────────────────────────────────────────────────
    // UI 控制扩展：本地遗产陈列室与进化序列谱系图 (Phylogeny Tree)
    // ────────────────────────────────────────────────────────
    window.toggleLegacyGallery = () => {
        const gallery = document.getElementById('legacy-gallery');
        if (!gallery) return;

        // Toggle visibility
        if (gallery.style.display === 'none' || !gallery.style.display) {
            gallery.style.display = 'flex';
            // 当打开画面时，使用 Canvas 绘制贝塞尔谱系图
            setTimeout(() => {
                drawPhylogenyTree();
                populateFossilGrid();
            }, 50);
        } else {
            gallery.style.display = 'none';
        }
    };

    function drawPhylogenyTree() {
        const canvas = document.getElementById('phylogeny-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        // 清除画布
        ctx.clearRect(0, 0, w, h);

        // 虚拟家谱数据：模拟演化树
        const nodes = [
            { id: 'GEN-0', x: 60, y: h / 2, color: '#44aa88', label: 'Origin Embryo (Gen 0)' },
            { id: 'GEN-1a', x: 280, y: h / 2 - 45, color: '#ffaa00', label: 'Spike Mut' },
            { id: 'GEN-1b', x: 280, y: h / 2 + 45, color: '#ff3333', label: 'Extinct (Acid)' },
            { id: 'GEN-2', x: 540, y: h / 2 - 45, color: '#00f2ff', label: 'Biaxial Propeller' },
            { id: 'GEN-3', x: 800, y: h / 2 - 45, color: '#ffcc00', label: 'Kintsugi Survivor' }
        ];

        const edges = [
            [0, 1], [0, 2], [1, 3], [3, 4]
        ];

        // 绘制代际连线
        ctx.lineWidth = 2;
        edges.forEach(([startIdx, endIdx]) => {
            const start = nodes[startIdx];
            const end = nodes[endIdx];
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.bezierCurveTo(start.x + 100, start.y, end.x - 100, end.y, end.x, end.y);

            // 渐变连线以暗示基因流动
            const grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            grad.addColorStop(0, start.color);
            grad.addColorStop(1, end.color);
            ctx.strokeStyle = grad;

            ctx.stroke();
        });

        // 绘制节点
        nodes.forEach(n => {
            ctx.beginPath();
            ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#000';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = n.color;
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '11px Space Mono, monospace';
            ctx.fillText(n.label, n.x - 30, n.y + 24);
        });
    }

    function populateFossilGrid() {
        const grid = document.getElementById('fossil-grid');
        if (!grid) return;

        const mockFossils = [
            { hash: 'HASH-A1B2C3', cause: 'Extinct by Acidification', text: '"未能抵御剧烈的 pH 骤变..."', color: '#ff3333' },
            { hash: 'HASH-F9E8D7', cause: 'Fatal Starvation', text: '"线粒体逐渐熄灭了光芒..."', color: '#ffaa00' },
            { hash: 'HASH-00F2FF', cause: 'Kintsugi 10% Survivor', text: '"在毁灭中寻找到了均衡。"', color: '#ffcc00' }
        ];

        grid.innerHTML = '';
        mockFossils.forEach(f => {
            const card = document.createElement('div');
            card.style.cssText = 'background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.3s;';
            card.onmouseover = () => { card.style.borderColor = f.color; card.style.background = 'rgba(255,255,255,0.06)'; };
            card.onmouseout = () => { card.style.borderColor = 'rgba(255,255,255,0.1)'; card.style.background = 'rgba(255, 255, 255, 0.03)'; };

            card.innerHTML = `
            <div style="height: 120px; background: rgba(0,0,0,0.5); border-radius: 4px; margin-bottom: 12px; display:flex; align-items:center; justify-content:center; color:${f.color}; font-size:40px; opacity:0.3; text-shadow: 0 0 20px ${f.color};">⚰️</div>
            <div style="color: ${f.color}; font-size: 14px; margin-bottom: 4px; font-family: monospace;">${f.hash}</div>
            <div style="color: #fff; font-size: 12px; margin-bottom: 4px;">[ ${f.cause} ]</div>
            <div style="color: #aaa; font-size: 11px; font-style: italic;">${f.text}</div>
        `;
            grid.appendChild(card);
        });
    }

    // --- 桌面挂机模式 (Desktop Companion / Tauri Mode) ---
    document.addEventListener("DOMContentLoaded", () => {
        if (window.__TAURI_INTERNALS__ || window.__TAURI__) {
            console.log("[Tauri Mode] 初始化桌面悬浮形态");

            // 卸载沉浸式世界的展台与全景环境光干扰
            scene.remove(isleGroup);

            // 隐藏 UI 和无关元素
            const uiRoot = document.getElementById("ui-root");
            const sensoryLog = document.getElementById("sensory-log");
            if (uiRoot) uiRoot.style.display = "none";
            if (sensoryLog) sensoryLog.style.display = "none";

            // Ghost Mode 热键穿透 (Alt + G)
            let isGhostMode = false;
            window.addEventListener('keydown', (e) => {
                if (e.altKey && e.key.toLowerCase() === 'g') {
                    isGhostMode = !isGhostMode;
                    const invoke = window.__TAURI_INTERNALS__ ? window.__TAURI_INTERNALS__.invoke : window.__TAURI__.core.invoke;

                    invoke('set_ignore_cursor_events', { ignore: isGhostMode })
                        .then(() => {
                            console.log('Ghost Mode:', isGhostMode);
                            // 视觉反馈
                            document.body.style.border = isGhostMode ? "1px solid rgba(0,255,255,0.3)" : "none";
                        })
                        .catch(err => console.error('Tauri Invoke Error:', err));
                }
            });
        }
    });

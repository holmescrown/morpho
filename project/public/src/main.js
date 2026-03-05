import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { TreeRenderer } from './TreeRenderer.js';
import { handlePhotoUpload } from './photoAnalyzer.js';

// 1. 基础场景设置
const scene = new THREE.Scene();
// 调整为长焦镜头，减小透视，模拟等轴测感
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 添加高级照明系统
const ambientLight = new THREE.AmbientLight(0x4040a0, 0.5); // 带有色调的环境光
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0x00f2ff, 2, 50); // 核心发光点
pointLight.position.set(0, 0, 5);
scene.add(pointLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
mainLight.position.set(10, 10, 10);
scene.add(mainLight);

// 2. 搭建极简悬浮展台 (Isolated Isle)
const isleGeometry = new THREE.CylinderGeometry(8, 7, 2, 64);
const isleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1a2b3c,
    metalness: 0.1,
    roughness: 0.8,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2
});
const isle = new THREE.Mesh(isleGeometry, isleMaterial);
isle.position.y = -4;
scene.add(isle);

// 添加展台底部的装饰性发光环
const ringGeo = new THREE.TorusGeometry(8.5, 0.1, 16, 100);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.5 });
const ring = new THREE.Mesh(ringGeo, ringMat);
ring.position.y = -4;
ring.rotation.x = Math.PI / 2;
scene.add(ring);

// 3. 初始化生物体 (基于 Material Storytelling)
let geometry = new THREE.IcosahedronGeometry(3, 5);
let material = new THREE.MeshPhysicalMaterial({
    color: 0x00f2ff,
    wireframe: true,
    transparent: true,
    opacity: 0.8,
    emissive: 0x004455,
    metalness: 0.5,
    roughness: 0.2,
    transmission: 0.9,
    thickness: 1.0
});
let spore = new THREE.Mesh(geometry, material);
spore.position.y = 1.5;
scene.add(spore);

// 初始相机位置，为开场动画做准备
camera.position.set(30, 30, 60);
camera.lookAt(0, 0, 0);

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
            console.log("🧬 Genome Updated:", data.genome || data.data);
            applyGenomeToMorphology(data.genome || data.data);

            // 确保 DOM 元素存在再更新文本
            const logEl = document.getElementById('ai-log');
            if (logEl && (data.rationale || data.status)) {
                logEl.innerText = data.rationale || `Status: ${data.status}`;
            }
        }
    } catch (error) {
        console.error('WebSocket message error:', error);
        // 确保 DOM 元素存在再更新文本
        const logEl = document.getElementById('ai-log');
        if (logEl) {
            logEl.innerText = `Error: ${error.message}`;
        }
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

function applyGenomeToMorphology(genome) {
    if (!genome) return;
    window.currentGenomeData = genome;

    // 动态缩放 (兼容 P0.5 深层结构)
    const radius = genome.morphology?.hox_segments?.[0]?.scaling?.radius || genome.radius;
    if (radius) {
        const scale = radius / 5.0;
        spore.scale.set(scale, scale, scale);
    }

    // 改变颜色
    if (genome.color) {
        spore.material.color.setHex(typeof genome.color === 'string' ? parseInt(genome.color.replace('#', '0x')) : genome.color);
    }

    // Material Storytelling: 质感即数据
    const turgor = genome.turgor_pressure !== undefined ? genome.turgor_pressure : 1.0;
    spore.material.transmission = Math.min(0.9, turgor * 0.3);
    spore.material.roughness = Math.max(0.1, 1.0 - (turgor * 0.2));

    const complexity = genome.complexity !== undefined ? genome.complexity : 1.0;
    spore.material.metalness = Math.min(0.8, complexity * 0.1);
}

// 5. 动画循环 (加入轻微蠕动效果)
function animate() {
    requestAnimationFrame(animate);

    // 平滑相机入场动画 (Lerp)
    if (camera.position.z > 25) {
        camera.position.z -= 0.2;
        camera.position.x -= 0.15;
        camera.position.y -= 0.15;
        camera.lookAt(0, 0, 0);
    }

    spore.rotation.x += 0.002;
    spore.rotation.y += 0.005;

    // 缓慢旋转展台，增加仪式感
    isle.rotation.y -= 0.001;
    ring.rotation.z -= 0.005;

    // 蠕动动效 (基于正弦波)
    const time = Date.now() * 0.001;
    const s = 1 + Math.sin(time * 2) * 0.05;
    spore.scale.set(s, s, s);
    // 带有呼吸感的上下浮动
    spore.position.y = 1.5 + Math.sin(time) * 0.5;

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
window.triggerEnvironment = async (intentStr) => {
    applyEnvironmentLighting(intentStr);
    const logEl = document.getElementById('ai-log');
    if (logEl) logEl.innerText = '正在呼叫边缘智能推算变异...';

    // 如果启用了 GM 免裁判模式，则直接请求后端
    const headers = { 'Content-Type': 'application/json' };
    if (window.isGMBypass) {
        headers['x-gm-secret'] = 'MorphoGod';
    }

    try {
        const response = await fetch('/api/mutate', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                intent: intentStr,
                targetPart: 'morphology',
                bioId: 'GLOBAL_BIOME',
                currentGenome: window.currentGenomeData,
                environmentContext: intentStr
            })
        });

        const result = await response.json();

        if (result.status === 'REJECTED') {
            if (logEl) logEl.innerHTML = `<span style="color:#ff5252">⚠ 变异被逻辑裁判驳回:</span> ${result.reasoning}`;
        } else if (result.status === 'SUCCESS' || result.patches) {
            // 注意：成功后的状态更新通常通过 WebSocket 广播回传
            if (logEl) logEl.innerText = '变异已通过验证并写入基因组。';
        }
    } catch (e) {
        console.error('Mutation Error:', e);
        if (logEl) logEl.innerText = '网络错误，请检查后端服务。';
    }
};

// 根据环境输入改变全局光照体验 (Light as Feedback)
function applyEnvironmentLighting(envStr) {
    if (envStr.includes('寒') || envStr.includes('冰') || envStr.includes('冻')) {
        ambientLight.color.setHex(0x001133);
        mainLight.color.setHex(0xaaeeff);
        pointLight.color.setHex(0x0055ff);
    } else if (envStr.includes('热') || envStr.includes('火') || envStr.includes('辐射')) {
        ambientLight.color.setHex(0x330000);
        mainLight.color.setHex(0xffaa55);
        pointLight.color.setHex(0xff2200);
    } else if (envStr.includes('酸') || envStr.includes('毒') || envStr.includes('沼')) {
        ambientLight.color.setHex(0x113300);
        mainLight.color.setHex(0xaaffaa);
        pointLight.color.setHex(0x55ff00);
    } else {
        // 恢复默认的极光紫/深蓝光照
        ambientLight.color.setHex(0x4040a0);
        mainLight.color.setHex(0xffffff);
        pointLight.color.setHex(0x00f2ff);
    }
}

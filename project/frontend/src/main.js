import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

// 1. 基础场景设置
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 添加光照
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// 2. 初始化原始孢子 (MVP 用简单的 Icosahedron 模拟细胞体)
let geometry = new THREE.IcosahedronGeometry(5, 4);
let material = new THREE.MeshPhongMaterial({ color: 0x44aa88, wireframe: true });
let spore = new THREE.Mesh(geometry, material);
scene.add(spore);
camera.position.z = 20;

// 3. 连接 Cloudflare Durable Object WebSocket
// 注意：本地调试时地址可能是 ws://localhost:8787/ws
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'INIT' || data.type === 'MUTATION_UPDATE') {
        console.log("🧬 Genome Updated:", data.genome);
        applyGenomeToMorphology(data.genome);
        
        if (data.rationale) {
            const aiLog = document.getElementById('ai-log');
            if (aiLog) {
                aiLog.innerText = data.rationale;
            }
        }
    }
};

// 4. 将 JSON 基因转化为视觉表现
function applyGenomeToMorphology(genome) {
    // 动态缩放
    const scale = genome.radius / 5.0;
    spore.scale.set(scale, scale, scale);
    
    // 改变颜色
    if (genome.color) {
        spore.material.color.setHex(typeof genome.color === 'string' ? parseInt(genome.color.replace('#', '0x')) : genome.color);
    }
    
    // Turgor Pressure (膨胀压) 改变线框显示模拟内部压力
    spore.material.wireframe = genome.turgor_pressure < 1.0;
}

// 5. 动画循环 (加入轻微蠕动效果)
function animate() {
    requestAnimationFrame(animate);
    spore.rotation.x += 0.005;
    spore.rotation.y += 0.01;
    renderer.render(scene, camera);
}
animate();

// 暴露一个给控制台/UI 调用的干预方法
window.triggerEnvironment = (weatherStr) => {
    ws.send(JSON.stringify({ type: 'ENVIRONMENT_TRIGGER', environment: weatherStr }));
};

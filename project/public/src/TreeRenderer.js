// public/src/TreeRenderer.js - 进化树可视化渲染器
import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

export class TreeRenderer {
    constructor(scene) {
        this.scene = scene;
        this.nodes = [];
        this.group = new THREE.Group();
        this.scene.add(this.group);
    }

    /**
     * 从后端获取向量数据并渲染为 3D 节点
     */
    async refreshTree() {
        try {
            const response = await fetch('/api/evolution-tree');
            const data = await response.json();

            if (!data.matches) return;

            // 清理旧节点
            this.clear();

            data.matches.forEach(match => {
                const vector = match.values;
                const metadata = match.metadata;

                // 使用前三个维度作为 3D 坐标并增加缩放
                const x = vector[0] * 120;
                const y = vector[1] * 120;
                const z = vector[2] * 120;

                const geometry = new THREE.IcosahedronGeometry(1.2, 1);
                const color = metadata.type === 'thorax' ? 0x00f2ff : 0xff00cc;
                const material = new THREE.MeshPhongMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.8,
                    transparent: true,
                    opacity: 0.4,
                    shininess: 100
                });
                const node = new THREE.Mesh(geometry, material);

                node.position.set(x, y, z);

                // 增加外围发光光晕 (简单的点精灵)
                const spriteMaterial = new THREE.SpriteMaterial({
                    map: this.createGlowTexture(color),
                    color: color,
                    transparent: true,
                    opacity: 0.3,
                    blending: THREE.AdditiveBlending
                });
                const sprite = new THREE.Sprite(spriteMaterial);
                sprite.scale.set(6, 6, 1);
                node.add(sprite);

                this.group.add(node);
                this.nodes.push(node);
            });

            console.log(`已渲染 ${this.nodes.length} 个进化分支节点`);
        } catch (e) {
            console.error("加载进化树失败:", e);
        }
    }

    createGlowTexture(color) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.1)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    clear() {
        this.nodes.forEach(node => this.group.remove(node));
        this.nodes = [];
    }

    updateAnimation() {
        this.group.rotation.y += 0.002;
    }
}

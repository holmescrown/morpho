import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

export class ArchetypeBuilder {
    constructor(fishGroup, inputState) {
        this.fishGroup = fishGroup;
        this.inputState = inputState || { thrust: 0, yaw: 0, pitch: 0 };
        this.currentArchetype = 'embryo';
        this.organismState = {
            transmission: 0.8,
            metalness: 0.0,
            baseScale: 1.0,
            energyStorage: 100.0,
            coreMeshRef: null
        };
        this.tentacles = [];
        this.appendages = [];

        // Biolight
        this.bioLight = new THREE.PointLight(0x00f2ff, 1.0, 10);
        this.fishGroup.add(this.bioLight);
    }

    build(type) {
        this.currentArchetype = type;

        // Clear existing morphology (keep bioLight)
        while (this.fishGroup.children.length > 1) {
            this.fishGroup.remove(this.fishGroup.children[1]);
        }
        this.tentacles.length = 0;
        this.appendages.length = 0;

        // Base Material
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0x00f2ff, metalness: 0.1, roughness: 0.5,
            transmission: 0.1, thickness: 0.5,
            emissive: 0x00f2ff, emissiveIntensity: 1.0, flatShading: true
        });

        if (type === 'embryo') {
            this.organismState.transmission = 0.8;
            this.organismState.metalness = 0.0;
            mat.transmission = 0.8;
            mat.metalness = 0.0;
            mat.color.setHex(0xaaffff);

            const geo = new THREE.SphereGeometry(0.3, 16, 16);
            this.organismState.coreMeshRef = new THREE.Mesh(geo, mat);
            this.fishGroup.add(this.organismState.coreMeshRef);
        }
        else if (type === 'medusa') {
            this.organismState.transmission = 0.9;
            this.organismState.metalness = 0.0;
            mat.transmission = 0.9;
            mat.roughness = 0.1;

            const capGeo = new THREE.SphereGeometry(0.6, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
            this.organismState.coreMeshRef = new THREE.Mesh(capGeo, mat);
            this.organismState.coreMeshRef.rotation.x = Math.PI / 2;
            this.fishGroup.add(this.organismState.coreMeshRef);

            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const tGroup = new THREE.Group();
                tGroup.position.set(Math.cos(angle) * 0.4, Math.sin(angle) * 0.4, 0.2);

                let parent = tGroup;
                for (let j = 0; j < 5; j++) {
                    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.04 - j * 0.005, 0.04 - (j + 1) * 0.005, 0.3, 8), mat);
                    seg.position.z = 0.15;
                    seg.rotation.x = Math.PI / 2;

                    const pivot = new THREE.Group();
                    pivot.position.z = (j === 0) ? 0 : 0.3;
                    pivot.add(seg);
                    parent.add(pivot);
                    this.tentacles.push({ mesh: pivot, offset: i + j * 0.5, phase: j });
                    parent = pivot;
                }
                this.fishGroup.add(tGroup);
            }
        }
        else if (type === 'arthropod') {
            this.organismState.transmission = 0.0;
            this.organismState.metalness = 0.7;
            mat.transmission = 0.0;
            mat.metalness = 0.7;
            mat.roughness = 0.2;
            mat.color.setHex(0xffaa44);
            mat.emissive.setHex(0xffaa44);

            const headGeo = new THREE.BoxGeometry(0.6, 0.3, 0.8);
            this.organismState.coreMeshRef = new THREE.Mesh(headGeo, mat);
            this.fishGroup.add(this.organismState.coreMeshRef);

            for (let i = 0; i < 4; i++) {
                const abd = new THREE.Mesh(new THREE.BoxGeometry(0.5 - i * 0.1, 0.25, 0.3), mat);
                abd.position.set(0, 0, 0.5 + i * 0.35);
                this.fishGroup.add(abd);
            }

            for (let i = -1; i <= 1; i += 2) {
                const armPiv = new THREE.Group();
                armPiv.position.set(i * 0.4, 0, -0.3);
                const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.8), mat);
                armMesh.position.set(0, 0, -0.4);
                armPiv.add(armMesh);
                armPiv.rotation.y = i * 0.3;
                this.appendages.push({ pivot: armPiv, side: i });
                this.fishGroup.add(armPiv);
            }
        }
        else if (type === 'octopus') {
            this.organismState.transmission = 0.2;
            this.organismState.metalness = 0.0;
            mat.transmission = 0.2;
            mat.roughness = 0.8;
            mat.color.setHex(0xff3366);
            mat.emissive.setHex(0xff3366);

            const headGeo = new THREE.SphereGeometry(0.5, 16, 16);
            this.organismState.coreMeshRef = new THREE.Mesh(headGeo, mat);
            this.organismState.coreMeshRef.scale.set(1.0, 1.0, 1.3);
            this.organismState.coreMeshRef.position.z = -0.1;
            this.fishGroup.add(this.organismState.coreMeshRef);

            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const tGroup = new THREE.Group();
                tGroup.position.set(Math.cos(angle) * 0.4, -0.4, Math.sin(angle) * 0.2);

                let parent = tGroup;
                for (let j = 0; j < 6; j++) {
                    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.06 - j * 0.008, 0.05 - j * 0.008, 0.4, 8), mat);
                    seg.position.y = -0.2;

                    const pivot = new THREE.Group();
                    pivot.position.y = (j === 0) ? 0 : -0.4;
                    pivot.add(seg);
                    parent.add(pivot);
                    this.tentacles.push({ mesh: pivot, offset: i, phase: j });
                    parent = pivot;
                }
                this.fishGroup.add(tGroup);
            }
        }
        else if (type === 'kintsugi_remnant') {
            this.organismState.transmission = 0.0;
            this.organismState.metalness = 0.3;

            // 金缮着色器 (Kintsugi Shader)
            const kintsugiMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0 },
                    baseColor: { value: new THREE.Color(0x3a1015) }, // 暗血色肉块
                    goldColor: { value: new THREE.Color(0xffca28) }  // 亮金色裂纹
                },
                vertexShader: `
                    varying vec3 vPosition;
                    varying vec3 vNormal;
                    void main() {
                        vPosition = position;
                        vNormal = normal;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform float time;
                    uniform vec3 baseColor;
                    uniform vec3 goldColor;
                    varying vec3 vPosition;
                    varying vec3 vNormal;
                    
                    // // MODIFIED: 增强型噪声函数，生成更自然的金缮裂纹
                    float hash(vec3 p) {
                        return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
                    }
                    float noise(vec3 p) {
                        vec3 i = floor(p);
                        vec3 f = fract(p);
                        f = f * f * (3.0 - 2.0 * f);
                        return mix(
                            mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
                        );
                    }
                    
                    void main() {
                        // 基于多层噪声的裂纹生成
                        float n1 = noise(vPosition * 6.0 + time * 0.05);
                        float n2 = noise(vPosition * 12.0 - time * 0.1);
                        
                        // 创造锐利的断裂感
                        float crackLine = abs(n1 - 0.5) * 2.0; 
                        crackLine = smoothstep(0.03, 0.07, crackLine); 
                        
                        // 叠加第二层细碎裂纹
                        float fineCracks = abs(n2 - 0.5) * 2.0;
                        fineCracks = smoothstep(0.01, 0.04, fineCracks);
                        crackLine = min(crackLine, fineCracks + 0.3);

                        // 内部流动的能量感 (Pulse & Flow)
                        float flow = noise(vPosition * 3.0 + time * 0.5);
                        float pulse = sin(time * 3.0 + n1 * 5.0) * 0.5 + 0.5;
                        
                        // 金色能量混合，带有边缘发光效果
                        vec3 goldGlow = goldColor * (2.0 + pulse * 1.5 + flow * 0.5);
                        vec3 finalColor = mix(goldGlow, baseColor, crackLine);
                        
                        // 增加受光感，让肉块更有体积感
                        float diff = max(dot(vNormal, vec3(1.0, 1.0, 1.0)), 0.0);
                        finalColor += baseColor * diff * 0.2;

                        gl_FragColor = vec4(finalColor, 1.0);
                    }
                `,
                wireframe: false,
                transparent: true,
                opacity: 0.95
            });

            // 不规则的创伤肉块
            const remnantGeo = new THREE.IcosahedronGeometry(0.4, 1);

            // 顶点轻微扰动表现畸变
            const positions = remnantGeo.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                positions.setX(i, positions.getX(i) + (Math.random() - 0.5) * 0.1);
                positions.setY(i, positions.getY(i) + (Math.random() - 0.5) * 0.1);
                positions.setZ(i, positions.getZ(i) + (Math.random() - 0.5) * 0.1);
            }
            remnantGeo.computeVertexNormals();

            this.organismState.coreMeshRef = new THREE.Mesh(remnantGeo, kintsugiMaterial);
            this.fishGroup.add(this.organismState.coreMeshRef);
        }
    }

    updateAnimations(time, energyFactor) {
        if (!this.organismState.coreMeshRef) return;

        const input = this.inputState;
        const type = this.currentArchetype;

        // Emissive Bioluminescence logic
        const flicker = this.organismState.energyStorage < 20 ? (Math.sin(time * 20) * 0.5 + 0.5) : 1.0;
        this.organismState.coreMeshRef.material.emissiveIntensity = energyFactor * 2.0 * flicker;
        this.bioLight.intensity = energyFactor * 1.5 * flicker;

        if (type === 'medusa') {
            const contractForce = Math.sin(time * 5.0 * energyFactor) * Math.max(0.2, Math.abs(input.thrust));
            this.organismState.coreMeshRef.scale.x = 1.0 + contractForce * 0.2;
            this.organismState.coreMeshRef.scale.z = 1.0 + contractForce * 0.2;
            this.organismState.coreMeshRef.scale.y = 1.0 - contractForce * 0.1;

            this.tentacles.forEach(t => {
                t.mesh.rotation.x = Math.sin(time * 4 * energyFactor - t.offset - t.phase * 0.5) * (0.2 + 0.3 * input.thrust);
            });
        } else if (type === 'arthropod') {
            this.appendages.forEach(a => {
                a.pivot.rotation.y = a.side * (0.3 + Math.sin(time * 10 * Math.abs(input.thrust)) * 0.2);
            });
        } else if (type === 'octopus') {
            const drag = input.thrust * 1.2;
            this.organismState.coreMeshRef.scale.y = 1.0 + drag * 0.1;
            this.tentacles.forEach(t => {
                t.mesh.rotation.x = drag + Math.sin(time * 3 * energyFactor - t.offset - t.phase * 0.5) * 0.15;
                t.mesh.rotation.z = Math.cos(time * 2 * energyFactor - t.offset) * 0.1;
            });
        } else if (type === 'kintsugi_remnant') {
            // 金缮肉块在水中的沉重呼吸感
            const throb = Math.sin(time * 3.0 * energyFactor) * 0.05;
            this.organismState.coreMeshRef.scale.set(1.0 + throb, 1.0 + throb, 1.0 - throb);

            // 更新 Shader 时间变量驱动裂纹流动与泛光
            if (this.organismState.coreMeshRef.material.uniforms) {
                this.organismState.coreMeshRef.material.uniforms.time.value = time;
            }
        }
    }
}

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface BioRendererProps {
  genome: any;
  environment: any;
}

export const BioRenderer: React.FC<BioRendererProps> = ({ genome, environment }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const metaballsRef = useRef<THREE.Mesh[]>([]);
  const animationIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // 初始化场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // 初始化相机
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    cameraRef.current = camera;

    // 初始化渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    canvasRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 添加灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // 生成元球
    const generateMetaballs = () => {
      // 清除旧的元球
      metaballsRef.current.forEach(ball => scene.remove(ball));
      metaballsRef.current = [];

      const geometry = new THREE.SphereGeometry(0.5, 32, 32);
      const material = new THREE.MeshPhongMaterial({ 
        color: 0x4cc9f0, 
        transparent: true, 
        opacity: 0.8,
        shininess: 100
      });

      // 根据 Hox 区段生成不同的元球
      genome.hoxSegments.forEach((segment: any, index: number) => {
        const ballCount = Math.floor(segment.scalingFactor * 3);
        const segmentOffset = (index - genome.hoxSegments.length / 2) * 2;

        for (let i = 0; i < ballCount; i++) {
          const sphere = new THREE.Mesh(geometry, material);
          const angle = (i / ballCount) * Math.PI * 2;
          const radius = segment.scalingFactor * 0.5;
          
          sphere.position.x = segmentOffset + Math.cos(angle) * radius;
          sphere.position.y = Math.sin(angle) * radius;
          sphere.position.z = 0;
          sphere.scale.set(
            segment.scalingFactor * 0.8,
            segment.scalingFactor * 0.8,
            segment.scalingFactor * 0.8
          );

          scene.add(sphere);
          metaballsRef.current.push(sphere);
        }
      });
    };

    generateMetaballs();

    // 动画循环
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      // 让元球轻微移动，模拟有机生命
      metaballsRef.current.forEach((ball, index) => {
        const time = Date.now() * 0.001;
        ball.position.x += Math.sin(time + index) * 0.005;
        ball.position.y += Math.cos(time + index) * 0.005;
        ball.rotation.x += 0.005;
        ball.rotation.y += 0.005;
      });

      renderer.render(scene, camera);
    };

    animate();

    // 窗口大小调整
    const handleResize = () => {
      if (!camera || !renderer) return;
      
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // 清理函数
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      window.removeEventListener('resize', handleResize);
      if (canvasRef.current && renderer) {
        canvasRef.current.removeChild(renderer.domElement);
      }
      // 清理 Three.js 资源
      metaballsRef.current.forEach(ball => scene.remove(ball));
      scene.clear();
    };
  }, []);

  // 当基因组变化时重新生成元球
  useEffect(() => {
    if (sceneRef.current) {
      const scene = sceneRef.current;
      // 清除旧的元球
      metaballsRef.current.forEach(ball => scene.remove(ball));
      metaballsRef.current = [];

      const geometry = new THREE.SphereGeometry(0.5, 32, 32);
      const material = new THREE.MeshPhongMaterial({ 
        color: 0x4cc9f0, 
        transparent: true, 
        opacity: 0.8,
        shininess: 100
      });

      // 根据 Hox 区段生成不同的元球
      genome.hoxSegments.forEach((segment: any, index: number) => {
        const ballCount = Math.floor(segment.scalingFactor * 3);
        const segmentOffset = (index - genome.hoxSegments.length / 2) * 2;

        for (let i = 0; i < ballCount; i++) {
          const sphere = new THREE.Mesh(geometry, material);
          const angle = (i / ballCount) * Math.PI * 2;
          const radius = segment.scalingFactor * 0.5;
          
          sphere.position.x = segmentOffset + Math.cos(angle) * radius;
          sphere.position.y = Math.sin(angle) * radius;
          sphere.position.z = 0;
          sphere.scale.set(
            segment.scalingFactor * 0.8,
            segment.scalingFactor * 0.8,
            segment.scalingFactor * 0.8
          );

          scene.add(sphere);
          metaballsRef.current.push(sphere);
        }
      });
    }
  }, [genome]);

  return <div ref={canvasRef} className="canvas-container" />;
};
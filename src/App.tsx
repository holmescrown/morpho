import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { BioRenderer } from './components/BioRenderer';
import { GenomeEditor } from './components/GenomeEditor';
import { EnvironmentControls } from './components/EnvironmentControls';

function App() {
  const [genome, setGenome] = useState<any>({
    hoxSegments: [
      { id: 'head', scalingFactor: 1.0, symmetry: 'bilateral', functions: ['sensory'] },
      { id: 'thorax', scalingFactor: 1.5, symmetry: 'bilateral', functions: ['locomotion'] },
      { id: 'abdomen', scalingFactor: 1.2, symmetry: 'bilateral', functions: ['digestion'] }
    ],
    metabolicRate: 1.0,
    morphology: {
      scalingFactor: 1.0,
      symmetry: 'bilateral',
      turgorPressure: 0.8
    },
    generation: 0
  });

  const [environment, setEnvironment] = useState<any>({
    temperature: 25,
    pressure: 1.0,
    radiation: 0.5,
    resourceDensity: 0.8,
    gravity: 1.0
  });

  const [bioInfo, setBioInfo] = useState<string>('原始生物 - 等待进化');
  const [isEvolving, setIsEvolving] = useState<boolean>(false);

  const evolveBio = () => {
    setIsEvolving(true);
    // 模拟 AI 突变过程
    setTimeout(() => {
      const newGenome = {
        ...genome,
        hoxSegments: genome.hoxSegments.map((segment: any) => ({
          ...segment,
          scalingFactor: segment.scalingFactor * (0.9 + Math.random() * 0.2)
        })),
        metabolicRate: genome.metabolicRate * (0.95 + Math.random() * 0.1),
        morphology: {
          ...genome.morphology,
          scalingFactor: genome.morphology.scalingFactor * (0.95 + Math.random() * 0.1),
          turgorPressure: genome.morphology.turgorPressure * (0.95 + Math.random() * 0.1)
        },
        generation: genome.generation + 1
      };
      setGenome(newGenome);
      setBioInfo(`第 ${newGenome.generation} 代生物 - 形态发生变化`);
      setIsEvolving(false);
    }, 1500);
  };

  const handleEnvironmentChange = (newEnv: any) => {
    setEnvironment(newEnv);
  };

  const handleGenomeChange = (newGenome: any) => {
    setGenome(newGenome);
  };

  return (
    <div className="app-container">
      <div className="ui-overlay">
        <h1>Project Morpho - 边缘进化</h1>
        <div className="controls">
          <button onClick={evolveBio} disabled={isEvolving}>
            {isEvolving ? '进化中...' : '触发突变'}
          </button>
          <button>
            保存生物
          </button>
          <button>
            加载生物
          </button>
        </div>
      </div>

      <div className="canvas-container">
        <BioRenderer genome={genome} environment={environment} />
      </div>

      <div className="bio-info">
        <h3>生物信息</h3>
        <p>{bioInfo}</p>
        <p>代数: {genome.generation}</p>
        <p>代谢速率: {genome.metabolicRate.toFixed(2)}</p>
      </div>

      <div className="sidebar">
        <EnvironmentControls environment={environment} onChange={handleEnvironmentChange} />
        <GenomeEditor genome={genome} onChange={handleGenomeChange} />
      </div>
    </div>
  );
}

export default App;
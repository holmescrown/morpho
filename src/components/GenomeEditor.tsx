import React from 'react';

interface GenomeEditorProps {
  genome: any;
  onChange: (genome: any) => void;
}

export const GenomeEditor: React.FC<GenomeEditorProps> = ({ genome, onChange }) => {
  const handleSegmentChange = (segmentIndex: number, key: string, value: any) => {
    const newSegments = [...genome.hoxSegments];
    newSegments[segmentIndex] = {
      ...newSegments[segmentIndex],
      [key]: value
    };
    onChange({
      ...genome,
      hoxSegments: newSegments
    });
  };

  const handleMorphologyChange = (key: string, value: any) => {
    onChange({
      ...genome,
      morphology: {
        ...genome.morphology,
        [key]: value
      }
    });
  };

  const handleMetabolicChange = (value: number) => {
    onChange({
      ...genome,
      metabolicRate: value
    });
  };

  return (
    <div className="control-group">
      <h3>基因组编辑</h3>

      <div className="control-group">
        <label>
          代谢速率: {genome.metabolicRate.toFixed(2)}
        </label>
        <input
          type="range"
          min="0.1"
          max="3"
          step="0.1"
          value={genome.metabolicRate}
          onChange={(e) => handleMetabolicChange(parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>形态参数</label>
        <div className="control-group">
          <label>
            缩放因子: {genome.morphology.scalingFactor.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={genome.morphology.scalingFactor}
            onChange={(e) => handleMorphologyChange('scalingFactor', parseFloat(e.target.value))}
          />
        </div>
        <div className="control-group">
          <label>
            膨胀压: {genome.morphology.turgorPressure.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.1"
            value={genome.morphology.turgorPressure}
            onChange={(e) => handleMorphologyChange('turgorPressure', parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="control-group">
        <label>Hox 区段</label>
        {genome.hoxSegments.map((segment: any, index: number) => (
          <div key={segment.id} className="segment-item">
            <h4>{segment.id.toUpperCase()}</h4>
            <div className="control-group">
              <label>
                缩放因子: {segment.scalingFactor.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={segment.scalingFactor}
                onChange={(e) => handleSegmentChange(index, 'scalingFactor', parseFloat(e.target.value))}
              />
            </div>
            <div className="control-group">
              <label>功能: {segment.functions.join(', ')}</label>
            </div>
          </div>
        ))}
      </div>

      <div className="control-group">
        <p>代数: {genome.generation}</p>
      </div>
    </div>
  );
};
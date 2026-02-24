import React from 'react';

interface EnvironmentControlsProps {
  environment: any;
  onChange: (environment: any) => void;
}

export const EnvironmentControls: React.FC<EnvironmentControlsProps> = ({ environment, onChange }) => {
  const handleChange = (key: string, value: number) => {
    onChange({
      ...environment,
      [key]: value
    });
  };

  return (
    <div className="control-group">
      <h3>环境控制</h3>
      
      <div className="control-group">
        <label>
          温度: {environment.temperature}°C
        </label>
        <input
          type="range"
          min="-20"
          max="50"
          step="1"
          value={environment.temperature}
          onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          压力: {environment.pressure.toFixed(2)} atm
        </label>
        <input
          type="range"
          min="0.1"
          max="5"
          step="0.1"
          value={environment.pressure}
          onChange={(e) => handleChange('pressure', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          辐射: {environment.radiation.toFixed(2)}
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={environment.radiation}
          onChange={(e) => handleChange('radiation', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          资源密度: {environment.resourceDensity.toFixed(2)}
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={environment.resourceDensity}
          onChange={(e) => handleChange('resourceDensity', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          重力: {environment.gravity.toFixed(2)}G
        </label>
        <input
          type="range"
          min="0.1"
          max="3"
          step="0.1"
          value={environment.gravity}
          onChange={(e) => handleChange('gravity', parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
};
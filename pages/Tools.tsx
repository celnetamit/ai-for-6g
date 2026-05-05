
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Card from '../components/ui/Card';
import ThreeScene from '../components/ThreeScene';
import SemanticCommunicationSimulator from '../components/SemanticCommunicationSimulator';
import AutoencoderVisualizer from '../components/AutoencoderVisualizer';
import JSCCSimulator from '../components/JSCCSimulator';

const IrsSimulator: React.FC = () => {
  const [numElements, setNumElements] = React.useState(64);
  const [distance, setDistance] = React.useState(50);
  const [power, setPower] = React.useState(20);

  const data = React.useMemo(() => {
    const baselineSNR = 10 * Math.log10(power / (distance * distance)) - 90;
    const points = [];
    for (let i = 1; i <= 256; i*=2) {
      const gain = 10 * Math.log10(i);
      const snrWithIrs = baselineSNR + gain;
      points.push({ elements: i, snr: snrWithIrs.toFixed(2), baselineSnr: baselineSNR.toFixed(2) });
    }
    return points;
  }, [distance, power]);

  const currentSnr = 10 * Math.log10(power / (distance * distance)) - 90 + 10 * Math.log10(numElements);

  return (
    <Card>
      <h3 className="text-xl font-semibold mb-4">IRS SNR Simulator</h3>
      <p className="mb-6 text-secondary dark:text-gray-400">
        See how the Signal-to-Noise Ratio (SNR) at the receiver improves with an increasing number of IRS elements.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label htmlFor="elements" className="block mb-2">Number of IRS Elements: {numElements}</label>
            <input id="elements" type="range" min="4" max="256" step="4" value={numElements} onChange={(e) => setNumElements(Number(e.target.value))} className="w-full" aria-label={`Number of IRS Elements: ${numElements}`}/>
          </div>
          <div>
            <label htmlFor="distance" className="block mb-2">Distance (meters): {distance}</label>
            <input id="distance" type="range" min="10" max="200" value={distance} onChange={(e) => setDistance(Number(e.target.value))} className="w-full" aria-label={`Distance in meters: ${distance}`} />
          </div>
          <div>
            <label htmlFor="power" className="block mb-2">Transmit Power (dBm): {power}</label>
            <input id="power" type="range" min="0" max="30" value={power} onChange={(e) => setPower(Number(e.target.value))} className="w-full" aria-label={`Transmit Power in dBm: ${power}`} />
          </div>
          <div className="p-4 bg-background-light dark:bg-background-dark rounded-lg">
            <h4 className="font-semibold">Calculated SNR:</h4>
            <p className="text-2xl font-bold text-primary">{currentSnr.toFixed(2)} dB</p>
          </div>
        </div>
        <div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="elements" label={{ value: 'Number of Elements', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'SNR (dB)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="snr" name="With IRS" stroke="#0D6EFD" activeDot={{ r: 8 }} />
              <Line type="monotone" dataKey="baselineSnr" name="Without IRS" stroke="#6C757D" strokeDasharray="5 5"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
};

const Tools: React.FC = () => {
  return (
    <div className="space-y-12">
      <h1 className="text-3xl font-bold">Interactive Tools & Visualizations</h1>
      
      <section>
        <h2 className="text-2xl font-bold mb-4 border-b pb-2 border-primary">Module 2: Semantic Communication Systems</h2>
        <div className="space-y-8 mt-4">
            <SemanticCommunicationSimulator />
            <AutoencoderVisualizer />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4 border-b pb-2 border-primary">Module 3: Joint Source-Channel Coding</h2>
         <div className="space-y-8 mt-4">
            <JSCCSimulator />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4 border-b pb-2 border-primary">Module 1: Intelligent Reflecting Surfaces (IRS)</h2>
        <div className="space-y-8 mt-4">
            <IrsSimulator />
            <Card>
                <h3 className="text-xl font-semibold mb-4">3D Visualization: IRS in Action</h3>
                <p className="mb-4 text-secondary dark:text-gray-400">
                    This is a 3D representation of an IRS-assisted communication link. Click on elements to see their phase shifts. You can rotate, pan, and zoom the scene.
                </p>
                <ThreeScene />
            </Card>
        </div>
      </section>
    </div>
  );
};

export default Tools;
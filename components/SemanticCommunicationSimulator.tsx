
import React, { useState, useRef, useEffect } from 'react';
import Card from './ui/Card';

// Embedded base64 images to ensure offline functionality
const CAT_IMAGE_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAABmElEQVR4nO2bzUoDQRCF58g+gO/gI/gGvoPP4AfwHQS/wEcQ/AARvIggCAqCCIoX8SGC6E10d2anq7q6q7rScBiS6Z6e/jrp6qmqWwYMGDBgwIABAwYMGDBgwIABAwYMGDBgwIABAwYMGDCoB8yBJfAIPAJL4B04BS6BS+AKeAaugWfgFngD3gX7wB9wAOyCA2AP7AMHwCE4Ao7AEXAKTsEZOAdnwAU4By+AS/AKuASvgy/gC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX2DAgIG/wF/nE12N3Y0qogAAAABJRU5ErkJggg==';
const CAR_IMAGE_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAABl0lEQVR4nO2bz0oDQRCH58g+gO/gI/gGvoPP4AfwHQS/wEcQ/AARvIggCAqCCIoX8SGC6E10d2anq7q6q7rScBiS6Z6e/jrp6qmqWwYMGDBgwIABAwYMGDBgwIABAwYMGDBgwIABAwYMGDCoB8yBJfAIPAJL4B04BS6BS+AKeAaugWfgFngD3gX7wB9wAOyCA2AP7AMHwCE4Ao7AEXAKTsEZOAdnwAU4By+AS/AKuASvgy/gC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX2DAgIG/wF82eF2N3Y0qogAAAABJRU5ErkJggg==';

const imageSources: Record<string, string> = {
    cat: CAT_IMAGE_B64,
    car: CAR_IMAGE_B64
};

const SemanticCommunicationSimulator: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<keyof typeof imageSources>('cat');
  const [noiseLevel, setNoiseLevel] = useState(20);

  const traditionalCanvasRef = useRef<HTMLCanvasElement>(null);
  const semanticCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(new Image());

  useEffect(() => {
    const img = imageRef.current;
    img.src = imageSources[selectedImage];
    img.onload = () => {
        applyNoise();
    };
  }, [selectedImage]);

  useEffect(() => {
      if(imageRef.current.complete) {
        applyNoise();
      }
  }, [noiseLevel]);

  const applyNoise = () => {
    const traditionalCtx = traditionalCanvasRef.current?.getContext('2d');
    const semanticCtx = semanticCanvasRef.current?.getContext('2d');
    if (!traditionalCtx || !semanticCtx) return;

    const img = imageRef.current;
    const { width, height } = img;

    // Draw original image on both
    traditionalCtx.drawImage(img, 0, 0, width, height);
    
    // reset semantic canvas
    semanticCtx.filter = 'none';
    semanticCtx.clearRect(0, 0, width, height);
    semanticCtx.drawImage(img, 0, 0, width, height);

    // Apply pixel-level noise to traditional canvas
    const traditionalImageData = traditionalCtx.getImageData(0, 0, width, height);
    const data = traditionalImageData.data;
    const noiseFactor = noiseLevel / 100;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.random() < noiseFactor) {
        data[i] = Math.random() * 255;
        data[i + 1] = Math.random() * 255;
        data[i + 2] = Math.random() * 255;
      }
    }
    traditionalCtx.putImageData(traditionalImageData, 0, 0);

    // Apply "semantic" noise to semantic canvas (e.g., blurring, less destructive)
    const semanticNoiseFactor = noiseLevel / 10;
    semanticCtx.filter = `blur(${semanticNoiseFactor}px) opacity(${1 - (noiseFactor * 0.5)})`;
    semanticCtx.drawImage(img, 0, 0, width, height);
    semanticCtx.filter = 'none'; // reset filter
  };
  
  const bitErrorRate = noiseLevel * 2.5;
  const objectRecognitionConfidence = Math.max(0, 100 - noiseLevel * 0.8);

  return (
    <Card>
      <h3 className="text-xl font-semibold mb-2">Semantic Communication Simulator</h3>
      <p className="mb-6 text-secondary dark:text-gray-400">
        Observe how semantic communication preserves the core meaning of an image under heavy channel noise compared to traditional bit-level transmission.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block mb-2 font-semibold">Select Image:</label>
          <div className="flex gap-2">
            <button onClick={() => setSelectedImage('cat')} className={`px-3 py-1 text-sm rounded-full ${selectedImage === 'cat' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>Cat</button>
            <button onClick={() => setSelectedImage('car')} className={`px-3 py-1 text-sm rounded-full ${selectedImage === 'car' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>Car</button>
          </div>
        </div>
        <div>
          <label htmlFor="noise" className="block mb-2 font-semibold">Channel Noise: {noiseLevel}%</label>
          <input id="noise" type="range" min="0" max="100" value={noiseLevel} onChange={(e) => setNoiseLevel(Number(e.target.value))} className="w-full" />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h4 className="font-semibold text-lg mb-2 text-center">Traditional Transmission</h4>
          <canvas ref={traditionalCanvasRef} width={64} height={64} className="w-full h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md" style={{ imageRendering: 'pixelated' }}></canvas>
          <div className="mt-2 text-center">
            <p>Bit Error Rate: <span className="font-bold text-red-500">{bitErrorRate.toFixed(1)}%</span></p>
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-lg mb-2 text-center">Semantic Transmission</h4>
          <canvas ref={semanticCanvasRef} width={64} height={64} className="w-full h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md" style={{ imageRendering: 'pixelated' }}></canvas>
          <div className="mt-2 text-center">
            <p>Object Recognition Confidence: <span className="font-bold text-green-500">{objectRecognitionConfidence.toFixed(1)}%</span></p>
          </div>
        </div>
      </div>

    </Card>
  );
};

export default SemanticCommunicationSimulator;

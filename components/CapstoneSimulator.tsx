
import React, { useState, useRef, useEffect } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import { useProgress } from '../context/ProgressContext';

// Hardcoded sample image data (base64) and object detection boxes
const CAT_IMAGE_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAABmElEQVR4nO2bzUoDQRCF58g+gO/gI/gGvoPP4AfwHQS/wEcQ/AARvIggCAqCCIoX8SGC6E10d2anq7q6q7rScBiS6Z6e/jrp6qmqWwYMGDBgwIABAwYMGDBgwIABAwYMGDBgwIABAwYMGDCoB8yBJfAIPAJL4B04BS6BS+AKeAaugWfgFngD3gX7wB9wAOyCA2AP7AMHwCE4Ao7AEXAKTsEZOAdnwAU4By+AS/AKuASvgy/gC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX2DAgIG/wF/nE12N3Y0qogAAAABJRU5ErkJggg==';
const CAR_IMAGE_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAABl0lEQVR4nO2bz0oDQRCH58g+gO/gI/gGvoPP4AfwHQS/wEcQ/AARvIggCAqCCIoX8SGC6E10d2anq7q6q7rScBiS6Z6e/jrp6qmqWwYMGDBgwIABAwYMGDBgwIABAwYMGDBgwIABAwYMGDCoB8yBJfAIPAJL4B04BS6BS+AKeAaugWfgFngD3gX7wB9wAOyCA2AP7AMHwCE4Ao7AEXAKTsEZOAdnwAU4By+AS/AKuASvgy/gC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX4AvwBfgC/AF+AJ8Ab4AX2DAgIG/wF82eF2N3Y0qogAAAABJRU5ErkJggg==';

const images: Record<string, { src: string; box: { x: number; y: number; w: number; h: number } }> = {
    car: {
        src: CAR_IMAGE_B64,
        box: { x: 10, y: 10, w: 44, h: 32 } // x, y, width, height as % of canvas size
    },
    cat: {
        src: CAT_IMAGE_B64,
        box: { x: 20, y: 15, w: 28, h: 40 }
    }
};

type ImageSelection = keyof typeof images;

const CapstoneSimulator: React.FC = () => {
    const { progress, saveCapstoneResult } = useProgress();
    const [selectedImage, setSelectedImage] = useState<ImageSelection>('car');
    const [noiseLevel, setNoiseLevel] = useState(progress.capstoneResult?.noiseLevel || 40);
    const [results, setResults] = useState(progress.capstoneResult || null);
    const [isRunning, setIsRunning] = useState(false);
    
    const traditionalCanvasRef = useRef<HTMLCanvasElement>(null);
    const semanticCanvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(new Image());

    const drawOnCanvas = (ctx: CanvasRenderingContext2D, noise: number) => {
        if (!ctx) return;
        const img = imageRef.current;
        const { width, height } = img;
        ctx.clearRect(0, 0, width, height);

        // Draw original image first
        ctx.drawImage(img, 0, 0, width, height);
        
        // Apply noise
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const noiseFactor = noise / 100;
        for (let i = 0; i < data.length; i += 4) {
            if (Math.random() < noiseFactor) {
                data[i] = Math.random() * 255;
                data[i + 1] = Math.random() * 255;
                data[i + 2] = Math.random() * 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    };

    const drawSemanticOnCanvas = (ctx: CanvasRenderingContext2D, noise: number) => {
        if (!ctx) return;
        const img = imageRef.current;
        const { width, height } = img;
        ctx.clearRect(0, 0, width, height);
        
        const noiseFactor = noise / 100;
        ctx.globalAlpha = Math.max(0.1, 1 - noiseFactor * 0.5);
        ctx.filter = `blur(${noiseFactor * 5}px)`;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.filter = 'none';
        ctx.globalAlpha = 1.0;
    };
    
    const drawBoundingBox = (ctx: CanvasRenderingContext2D, box: {x:number, y:number, w:number, h:number}, accuracy: number) => {
        if (!ctx) return;
        const { width, height } = ctx.canvas;
        const x = box.x / 100 * width;
        const y = box.y / 100 * height;
        const w = box.w / 100 * width;
        const h = box.h / 100 * height;
        
        const color = accuracy > 50 ? '#10B981' : '#EF4444'; // green or red
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        
        ctx.fillStyle = color;
        ctx.font = 'bold 10px sans-serif';
        const label = selectedImage.charAt(0).toUpperCase() + selectedImage.slice(1);
        ctx.fillText(`${label}: ${accuracy.toFixed(1)}%`, x + 2, y + 10);
    };

    const runSimulation = () => {
        if (isRunning) return;
        setIsRunning(true);
        setResults(null);

        setTimeout(() => {
            try {
                const traditionalCtx = traditionalCanvasRef.current?.getContext('2d');
                const semanticCtx = semanticCanvasRef.current?.getContext('2d');
                
                if (traditionalCtx && semanticCtx) {
                    // Simulate transmissions
                    drawOnCanvas(traditionalCtx, noiseLevel);
                    drawSemanticOnCanvas(semanticCtx, noiseLevel);

                    // Calculate task accuracy
                    const baseAccuracy = 98.0;
                    const traditionalAccuracy = Math.max(0, baseAccuracy - (noiseLevel * 2.2));
                    const semanticAccuracy = Math.max(0, baseAccuracy - (noiseLevel * 0.9));

                    // Draw bounding boxes based on accuracy
                    const box = images[selectedImage].box;
                    drawBoundingBox(traditionalCtx, box, traditionalAccuracy);
                    drawBoundingBox(semanticCtx, box, semanticAccuracy);
                    
                    const finalResult = {
                        noiseLevel,
                        traditionalAccuracy,
                        semanticAccuracy,
                        completedOn: new Date().toISOString()
                    };

                    setResults(finalResult);
                    saveCapstoneResult(finalResult);
                }
            } catch (err) {
                console.error("Simulation failed:", err);
            } finally {
                setIsRunning(false);
            }
        }, 800); // Simulate processing time
    };

    useEffect(() => {
        const img = imageRef.current;
        img.src = images[selectedImage].src;
        img.onload = () => {
             // If there are previous results, render them.
            if(progress.capstoneResult && noiseLevel === progress.capstoneResult.noiseLevel) {
                runSimulation();
            } else {
                 const traditionalCtx = traditionalCanvasRef.current?.getContext('2d');
                 const semanticCtx = semanticCanvasRef.current?.getContext('2d');
                 if(traditionalCtx) {
                    traditionalCtx.clearRect(0,0,64,64);
                    traditionalCtx.drawImage(img, 0, 0, 64, 64);
                 }
                 if(semanticCtx) {
                    semanticCtx.clearRect(0,0,64,64);
                    semanticCtx.drawImage(img, 0, 0, 64, 64);
                 }
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedImage]);

    // Re-run simulation if noise changes and there are previous results to update
    useEffect(() => {
        if(progress.capstoneResult) {
            runSimulation();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noiseLevel]);


    return (
        <Card>
            <h2 className="text-2xl font-semibold mb-4">Capstone Simulator</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                 <div>
                  <label className="block mb-2 font-semibold">Select Image:</label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedImage('car')} className={`px-3 py-1 text-sm rounded-full ${selectedImage === 'car' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>Car</button>
                    <button onClick={() => setSelectedImage('cat')} className={`px-3 py-1 text-sm rounded-full ${selectedImage === 'cat' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>Cat</button>
                  </div>
                </div>
                <div>
                    <label htmlFor="capstone-noise" className="block mb-2 font-semibold">Channel Noise: {noiseLevel}%</label>
                    <input id="capstone-noise" type="range" min="0" max="100" value={noiseLevel} onChange={(e) => setNoiseLevel(Number(e.target.value))} className="w-full" disabled={isRunning} />
                </div>
            </div>
            
            <div className="text-center mb-6">
                <Button onClick={runSimulation} disabled={isRunning}>
                    {isRunning ? 'Running Simulation...' : 'Run Simulation & Evaluate'}
                </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h4 className="font-semibold text-lg mb-2 text-center">Traditional System Output</h4>
                    <canvas ref={traditionalCanvasRef} width={64} height={64} className="w-full h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md" style={{ imageRendering: 'pixelated' }}></canvas>
                    <div className="mt-2 text-center p-2 rounded-md bg-background-light dark:bg-background-dark">
                        <h5 className="font-semibold">Object Detection Accuracy</h5>
                        <p className={`text-3xl font-bold ${results && results.traditionalAccuracy < 50 ? 'text-red-500' : 'text-green-500'}`}>
                            {results ? `${results.traditionalAccuracy.toFixed(1)}%` : 'N/A'}
                        </p>
                    </div>
                </div>
                <div>
                    <h4 className="font-semibold text-lg mb-2 text-center">Semantic System Output</h4>
                    <canvas ref={semanticCanvasRef} width={64} height={64} className="w-full h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md" style={{ imageRendering: 'pixelated' }}></canvas>
                    <div className="mt-2 text-center p-2 rounded-md bg-background-light dark:bg-background-dark">
                        <h5 className="font-semibold">Object Detection Accuracy</h5>
                        <p className={`text-3xl font-bold ${results && results.semanticAccuracy < 50 ? 'text-red-500' : 'text-green-500'}`}>
                            {results ? `${results.semanticAccuracy.toFixed(1)}%` : 'N/A'}
                        </p>
                    </div>
                </div>
            </div>

        </Card>
    );
};

export default CapstoneSimulator;

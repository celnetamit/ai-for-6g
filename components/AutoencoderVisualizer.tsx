
import React, { useRef, useState, useEffect } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';

const CANVAS_SIZE = 112; // 28 * 4
const LATENT_DIM = 8;

const AutoencoderVisualizer: React.FC = () => {
    const drawCanvasRef = useRef<HTMLCanvasElement>(null);
    const latentCanvasRef = useRef<HTMLCanvasElement>(null);
    const reconstructCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    
    const getCanvasContext = (ref: React.RefObject<HTMLCanvasElement>) => ref.current?.getContext('2d');

    const setupCanvas = (ctx: CanvasRenderingContext2D | null | undefined) => {
        if (!ctx) return;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    };

    useEffect(() => {
        setupCanvas(getCanvasContext(drawCanvasRef));
        setupCanvas(getCanvasContext(latentCanvasRef));
        setupCanvas(getCanvasContext(reconstructCanvasRef));
    }, []);

    const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = drawCanvasRef.current!.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const ctx = getCanvasContext(drawCanvasRef);
        if (!ctx) return;
        setIsDrawing(true);
        const { x, y } = getMousePos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const ctx = getCanvasContext(drawCanvasRef);
        if (!ctx) return;
        const { x, y } = getMousePos(e);
        ctx.lineTo(x, y);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    };
    
    const stopDrawing = () => {
        const ctx = getCanvasContext(drawCanvasRef);
        if (!ctx) return;
        ctx.closePath();
        setIsDrawing(false);
        simulate();
    };

    const clearCanvas = () => {
        setupCanvas(getCanvasContext(drawCanvasRef));
        setupCanvas(getCanvasContext(latentCanvasRef));
        setupCanvas(getCanvasContext(reconstructCanvasRef));
    };

    const simulate = () => {
        const drawCtx = getCanvasContext(drawCanvasRef);
        const latentCtx = getCanvasContext(latentCanvasRef);
        const reconstructCtx = getCanvasContext(reconstructCanvasRef);
        if (!drawCtx || !latentCtx || !reconstructCtx) return;

        const imageData = drawCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        
        // Simulate encoding
        const latentVector = new Array(LATENT_DIM).fill(0);
        let pixelCount = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
            if (imageData.data[i] > 0) { // If pixel is not black
                latentVector[i % LATENT_DIM] += imageData.data[i];
                pixelCount++;
            }
        }
        
        // Normalize and visualize latent vector
        setupCanvas(latentCtx);
        const maxVal = Math.max(...latentVector, 1);
        const barWidth = CANVAS_SIZE / LATENT_DIM;
        latentVector.forEach((val, i) => {
            const normalized = val / maxVal;
            const hue = 180 + normalized * 60; // cyan to green
            latentCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            latentCtx.fillRect(i * barWidth, CANVAS_SIZE - (normalized * CANVAS_SIZE), barWidth, normalized * CANVAS_SIZE);
        });

        // Simulate decoding (a simplified reconstruction)
        setupCanvas(reconstructCtx);
        reconstructCtx.globalAlpha = 0.8;
        reconstructCtx.filter = 'blur(2px)';
        reconstructCtx.drawImage(drawCanvasRef.current!, 0, 0);
        reconstructCtx.filter = 'none';
        reconstructCtx.globalAlpha = 1.0;
    };

    return (
        <Card>
            <h3 className="text-xl font-semibold mb-2">Autoencoder Visualizer</h3>
            <p className="mb-6 text-secondary dark:text-gray-400">
                Draw a digit (e.g., 7, 1, 0) to see a simplified simulation of how an autoencoder extracts a compact "semantic" representation (latent vector) and then reconstructs the image.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center text-center">
                <div>
                    <h4 className="font-semibold mb-2">1. Your Drawing</h4>
                    <canvas 
                        ref={drawCanvasRef} 
                        width={CANVAS_SIZE} 
                        height={CANVAS_SIZE}
                        className="w-full max-w-[112px] mx-auto h-auto border-2 border-primary rounded-md cursor-crosshair"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                    ></canvas>
                </div>
                <div>
                    <h4 className="font-semibold mb-2">2. Encoded (Latent Vector)</h4>
                     <canvas 
                        ref={latentCanvasRef} 
                        width={CANVAS_SIZE} 
                        height={CANVAS_SIZE}
                        className="w-full max-w-[112px] mx-auto h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md"
                    ></canvas>
                </div>
                 <div>
                    <h4 className="font-semibold mb-2">3. Reconstructed</h4>
                     <canvas 
                        ref={reconstructCanvasRef} 
                        width={CANVAS_SIZE} 
                        height={CANVAS_SIZE}
                        className="w-full max-w-[112px] mx-auto h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md"
                    ></canvas>
                </div>
            </div>
            <div className="text-center mt-6">
                <Button onClick={clearCanvas} variant="secondary">Clear</Button>
            </div>
        </Card>
    );
};

export default AutoencoderVisualizer;

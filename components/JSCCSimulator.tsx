
import React, { useState, useMemo } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';

const JSCCSimulator: React.FC = () => {
    const [noiseLevel, setNoiseLevel] = useState(10);
    const [inputText, setInputText] = useState("AI can enhance 6G networks.");
    const [outputs, setOutputs] = useState({ bpsk: '', jscc: '' });

    // Simple text-to-binary conversion
    const textToBinary = (text: string) => {
        return text.split('').map(char => {
            return char.charCodeAt(0).toString(2).padStart(8, '0');
        }).join('');
    };

    // Simple binary-to-text
    const binaryToText = (binary: string) => {
        let text = '';
        for (let i = 0; i < binary.length; i += 8) {
            const byte = binary.substr(i, 8);
            if(byte.length === 8) {
                text += String.fromCharCode(parseInt(byte, 2));
            }
        }
        return text;
    };
    
    // Simulate BPSK transmission with bit flips based on noise
    const simulateBPSK = (binaryInput: string) => {
        const errorProbability = noiseLevel / 100;
        return binaryInput.split('').map(bit => {
            return (Math.random() < errorProbability) ? (bit === '0' ? '1' : '0') : bit;
        }).join('');
    };

    // Simulate a JSCC model's output
    const simulateJSCC = (textInput: string) => {
        const errorProbability = noiseLevel / 100;
        const words = textInput.split(' ');
        
        // Higher noise means more words get slightly corrupted or replaced
        const outputWords = words.map(word => {
            if (Math.random() < errorProbability * 2 && word.length > 3) {
                // Simulate semantic error, e.g., 'networks' -> 'systems'
                const replacements: Record<string, string> = {
                    'networks': 'systems',
                    'enhance': 'improve',
                    'can': 'will',
                    '6G': 'future'
                };
                return replacements[word.toLowerCase()] || '...'
            }
            if (Math.random() < errorProbability && word.length > 2) {
                // Simulate minor corruption
                return word.substring(0, word.length - 1) + '?';
            }
            return word;
        });
        return outputWords.join(' ');
    };

    const runSimulation = () => {
        const binaryInput = textToBinary(inputText);
        const bpskBinaryOutput = simulateBPSK(binaryInput);
        const bpskTextOutput = binaryToText(bpskBinaryOutput);
        const jsccTextOutput = simulateJSCC(inputText);

        setOutputs({ bpsk: bpskTextOutput, jscc: jsccTextOutput });
    };
    
    // Run simulation on mount
    React.useEffect(() => {
        runSimulation();
    }, [inputText, noiseLevel]);


    return (
        <Card>
            <h3 className="text-xl font-semibold mb-2">Joint Source-Channel Coding (JSCC) Simulator</h3>
            <p className="mb-6 text-secondary dark:text-gray-400">
                Compare how a traditional system (BPSK) and an AI-powered JSCC model transmit text over a noisy channel. Notice how JSCC preserves meaning even when the exact text is corrupted.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <label htmlFor="inputText" className="block mb-2 font-semibold">Input Text:</label>
                    <input 
                        id="inputText"
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        className="w-full p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600"
                    />
                </div>
                <div>
                    <label htmlFor="jscc-noise" className="block mb-2 font-semibold">Channel Noise: {noiseLevel}%</label>
                    <input id="jscc-noise" type="range" min="0" max="100" value={noiseLevel} onChange={(e) => setNoiseLevel(Number(e.target.value))} className="w-full" />
                </div>
            </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="p-4 rounded-lg bg-background-light dark:bg-background-dark">
                    <h4 className="font-semibold text-lg mb-2">Traditional (BPSK) Output</h4>
                    <p className="font-mono text-red-500 min-h-[6em] p-2 bg-white dark:bg-black rounded break-words">{outputs.bpsk}</p>
                    <p className="text-xs mt-2 text-secondary dark:text-gray-500">Result of random bit flips. Often becomes completely unreadable.</p>
                </div>
                 <div className="p-4 rounded-lg bg-background-light dark:bg-background-dark">
                    <h4 className="font-semibold text-lg mb-2">AI-Powered JSCC Output</h4>
                    <p className="font-mono text-green-500 min-h-[6em] p-2 bg-white dark:bg-black rounded break-words">{outputs.jscc}</p>
                    <p className="text-xs mt-2 text-secondary dark:text-gray-500">Result of a meaning-aware model. Gracefully degrades while preserving context.</p>
                </div>
            </div>
        </Card>
    );
};

export default JSCCSimulator;

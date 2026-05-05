
import React from 'react';
import Card from '../components/ui/Card';
import CapstoneSimulator from '../components/CapstoneSimulator';
import { useProgress } from '../context/ProgressContext';
import { Link } from 'react-router-dom';

const CapstoneProject: React.FC = () => {
    const { progress } = useProgress();

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold">Capstone Project: Semantic Communication for Image Transmission</h1>
            
            <Card>
                <h2 className="text-2xl font-semibold mb-4">Project Objective</h2>
                <p className="mb-4 text-on-surface-light dark:text-on-surface-dark">
                    Your final task is to implement and evaluate a simulated semantic communication system for robust image transmission. The goal is to demonstrate that a semantic system, optimized for a specific task, can significantly outperform a traditional bit-based system under heavy channel noise.
                </p>
                <p className="text-on-surface-light dark:text-on-surface-dark">
                    Performance will not be measured by pixel-perfect reconstruction (like PSNR or BER), but by a task-based metric: **object detection accuracy**. This aligns with the core principle of semantic communication—transmitting what's necessary for the task at hand.
                </p>
            </Card>

            {progress.capstoneResult && (
                <Card className="border-2 border-green-500">
                    <h3 className="text-xl font-semibold text-green-500 mb-2">Project Already Completed</h3>
                    <p className="mb-4 text-secondary dark:text-gray-400">You can review your previous results below or run the simulation again.</p>
                    <Link to="/dashboard" className="text-primary hover:underline">View summary on dashboard &rarr;</Link>
                </Card>
            )}

            <CapstoneSimulator />
        </div>
    );
};

export default CapstoneProject;

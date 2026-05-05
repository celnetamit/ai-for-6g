
import React from 'react';
import { content } from '../data/content';
import Card from '../components/ui/Card';

const About: React.FC = () => {
  const { aboutPageContent } = content;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold text-primary mb-2">About This Application</h1>
        <p className="text-lg text-secondary dark:text-gray-400">{content.workshopTitle}</p>
      </div>
      
      <Card>
        <h2 className="text-2xl font-bold mb-3">Analysis Summary</h2>
        <p className="text-on-surface-light dark:text-on-surface-dark leading-relaxed">{aboutPageContent.analysisSummary}</p>
      </Card>

      <Card>
        <h2 className="text-2xl font-bold mb-3">Our Mission</h2>
        <p className="text-on-surface-light dark:text-on-surface-dark leading-relaxed">{aboutPageContent.mission}</p>
      </Card>

      <section>
        <h2 className="text-3xl font-bold text-center mb-6">Key Features & Differentiators</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {aboutPageContent.keyFeatures.map((feature, index) => (
            <Card key={index} className="transform hover:scale-105 transition-transform duration-300">
              <h3 className="text-xl font-semibold text-primary mb-2">{feature.title}</h3>
              <p className="text-secondary dark:text-gray-400">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};

export default About;

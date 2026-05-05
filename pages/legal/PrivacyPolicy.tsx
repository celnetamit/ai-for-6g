
import React from 'react';
import { content } from '../../data/content';
import Card from '../../components/ui/Card';

const PrivacyPolicy: React.FC = () => {
  const { privacyPolicy } = content.legal;

  return (
    <Card>
      <div className="prose dark:prose-invert max-w-none">
        <h1 className="text-3xl font-bold">{privacyPolicy.title}</h1>
        <p className="text-sm text-secondary dark:text-gray-400">Last updated: {privacyPolicy.lastUpdated}</p>
        
        {privacyPolicy.sections.map((section, index) => (
          <div key={index} className="mt-6">
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <p>{section.content}</p>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default PrivacyPolicy;

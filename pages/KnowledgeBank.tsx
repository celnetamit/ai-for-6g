
import React, { useState, useMemo } from 'react';
import { content } from '../data/content';
import Card from '../components/ui/Card';
import KnowledgeCheck from '../components/KnowledgeCheck';

const KnowledgeBank: React.FC = () => {
  const { glossary, faqs } = content.knowledgeBank;
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const categories = useMemo(() => 
      ['All', ...new Set(glossary.map(item => item.category).filter(Boolean) as string[])]
  , [glossary]);

  const filteredGlossary = useMemo(() => {
    let items = glossary;

    if (activeCategory !== 'All') {
        items = items.filter(item => item.category === activeCategory);
    }

    if (searchTerm) {
        items = items.filter(item =>
            item.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.definition.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    return items;
  }, [searchTerm, glossary, activeCategory]);

  return (
    <div className="space-y-12">
      <h1 className="text-3xl font-bold">Knowledge Bank</h1>
      
      <section>
        <h2 className="text-2xl font-semibold mb-4">Knowledge Check</h2>
        <KnowledgeCheck />
      </section>

      <section>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
            <h2 className="text-2xl font-semibold mb-4 md:mb-0">Glossary</h2>
            <input
              type="text"
              placeholder="Search glossary..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:ring-primary focus:border-primary"
            />
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
            {categories.map(category => (
                <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors ${
                        activeCategory === category 
                        ? 'bg-primary text-white' 
                        : 'bg-gray-200 dark:bg-gray-700 text-on-surface-light dark:text-on-surface-dark hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                >
                    {category}
                </button>
            ))}
        </div>

        <div className="space-y-4">
          {filteredGlossary.map((item, index) => (
            <Card key={index}>
              <h3 className="text-lg font-semibold text-primary">{item.term}</h3>
              <p className="text-on-surface-light dark:text-on-surface-dark">{item.definition}</p>
            </Card>
          ))}
          {filteredGlossary.length === 0 && <p>No terms found for the current filter.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Frequently Asked Questions (FAQ)</h2>
        <div className="space-y-4">
            {faqs.map((faq, index) => (
                 <details key={index} className="p-4 rounded-lg bg-surface-light dark:bg-surface-dark shadow-sm">
                    <summary className="font-semibold cursor-pointer">{faq.question}</summary>
                    <p className="mt-2 text-on-surface-light dark:text-on-surface-dark">{faq.answer}</p>
                </details>
            ))}
        </div>
      </section>
    </div>
  );
};

export default KnowledgeBank;
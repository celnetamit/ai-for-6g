
export interface Lesson {
  id: string;
  title: string;
  content: string;
}

export interface Module {
  id:string;
  title: string;
  description: string;
  lessons: Lesson[];
}

export interface AssessmentQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}

export interface KnowledgeBankItem {
  term: string;
  definition: string;
  category?: string;
}

export interface FAQ {
    question: string;
    answer: string;
}

export interface AboutPageContent {
    analysisSummary: string;
    mission: string;
    keyFeatures: { title: string; description: string; }[];
}

export interface LegalPageContent {
    title: string;
    lastUpdated: string;
    sections: {
        title: string;
        content: string;
    }[];
}

export interface CapstoneResult {
    noiseLevel: number;
    traditionalAccuracy: number;
    semanticAccuracy: number;
    completedOn: string;
}

export interface Progress {
  completedLessons: string[];
  assessmentScores: Record<string, number>;
  toolResults: Record<string, any>;
  capstoneResult?: CapstoneResult;
}

export interface AppContent {
  workshopTitle: string;
  lastReviewed: string;
  learningMaterials: Module[];
  assessments: Record<string, AssessmentQuestion[]>;
  knowledgeBank: {
    glossary: KnowledgeBankItem[];
    faqs: FAQ[];
  };
  aboutPageContent: AboutPageContent;
  legal: {
      privacyPolicy: LegalPageContent;
      termsOfService: LegalPageContent;
  }
}
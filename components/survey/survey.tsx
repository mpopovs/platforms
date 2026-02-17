'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { EmojiScale } from './emoji-scale';
import { StarRating } from './star-rating';
import { LikertScale } from './likert-scale';
import { Loader2 } from 'lucide-react';

interface SurveyQuestion {
  id: string;
  question_text: string;
  question_type: 'emoji' | 'star' | 'likert';
  age_group: number;
}

interface SurveyProps {
  viewerId: string;
  textureId?: string; // Optional for test/preview mode
  onComplete: () => void;
  isTestMode?: boolean;
}

const ageGroups = [
  { value: 1, label: '0-12 years', description: 'Children' },
  { value: 2, label: '13-18 years', description: 'Teenagers' },
  { value: 3, label: '19+ years', description: 'Adults' },
];

type SurveyStep = 'age-selection' | 'intro' | 'questions' | 'submitting' | 'complete';

export function Survey({ viewerId, textureId, onComplete, isTestMode = false }: SurveyProps) {
  const [step, setStep] = useState<SurveyStep>('age-selection');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<number | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch questions when age group is selected
  useEffect(() => {
    if (selectedAgeGroup && step === 'questions') {
      fetchQuestions();
    }
  }, [selectedAgeGroup, step]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/survey/questions?viewerId=${viewerId}&ageGroup=${selectedAgeGroup}`
      );
      if (!response.ok) throw new Error('Failed to fetch questions');
      const data = await response.json();
      setQuestions(data.questions || []);
      
      if (data.questions.length === 0) {
        // No questions configured, skip survey
        await updateTextureAgeGroup();
        setStep('complete');
      }
    } catch (err) {
      setError('Failed to load survey questions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateTextureAgeGroup = async () => {
    if (isTestMode) return;
    
    try {
      if (!textureId) return;

      await fetch('/api/survey/update-texture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textureId,
          ageGroup: selectedAgeGroup,
          surveyCompleted: true,
        }),
      });
    } catch (err) {
      console.error('Failed to update texture:', err);
    }
  };

  const handleAgeSelection = (ageGroup: number) => {
    setSelectedAgeGroup(ageGroup);
    setStep('questions');
  };

  const handleStartSurvey = () => {
    setStep('questions');
  };

  const handleResponseChange = (value: number) => {
    const currentQuestion = questions[currentQuestionIndex];
    setResponses((prev) => ({
      ...prev,
      [currentQuestion.id]: value,
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      submitSurvey();
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const submitSurvey = async () => {
    setStep('submitting');
    
    // Simulate submission for test mode
    if (isTestMode) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setStep('complete');
      setTimeout(onComplete, 2000);
      return;
    }

    try {
      if (!textureId) return;

      await fetch('/api/survey/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textureId,
          ageGroup: selectedAgeGroup,
          responses: Object.entries(responses).map(([questionId, value]) => ({
            questionId,
            value,
          })),
        }),
      });
      
      await updateTextureAgeGroup();
      setStep('complete');
      setTimeout(onComplete, 2000);
    } catch (err) {
      setError('Failed to submit survey');
      console.error(err);
      setStep('questions');
    }
  };

  const currentQuestion = questions[currentQuestionIndex];
  const currentResponse = currentQuestion ? responses[currentQuestion.id] : null;
  const canProceed = currentResponse !== null && currentResponse !== undefined;

  const containerClass = isTestMode 
    ? "absolute inset-0 bg-white z-10 flex items-center justify-center p-4" 
    : "fixed inset-0 bg-white z-50 flex items-center justify-center p-4";

  // Age Selection Step
  if (step === 'age-selection') {
    return (
      <div className={containerClass}>
        <div className="max-w-2xl w-full text-center">
          <h2 className="text-4xl font-bold mb-6 text-gray-900">Select Your Age Group</h2>
          <p className="text-xl text-gray-600 mb-8">
            This helps us understand different perspectives
          </p>
          <div className="flex flex-col gap-4">
            {ageGroups.map((group) => (
              <Button
                key={group.value}
                onClick={() => handleAgeSelection(group.value)}
                className="w-full py-8 text-2xl bg-blue-500 hover:bg-blue-600"
                size="lg"
              >
                {group.label}
              </Button>
            ))}
          </div>

          <div className="mt-12 space-y-4">
            <p className="text-sm text-gray-500 max-w-lg mx-auto leading-relaxed">
              We collect this data anonymously for research purposes to improve our services 
              in compliance with EU data protection regulations (GDPR). 
              Your personal information is not stored.
            </p>
            
            <Button 
              variant="ghost" 
              onClick={onComplete}
              className="text-gray-400 hover:text-gray-600"
            >
              Skip Survey
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Introduction Step
  if (step === 'intro') {
    return (
      <div className={containerClass}>
        <div className="max-w-2xl w-full text-center">
          <div className="text-6xl mb-6">📝</div>
          <h2 className="text-4xl font-bold mb-6 text-gray-900">Help Us with Research</h2>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            Thank you for uploading your texture! We'd like to ask you a few quick questions
            to help us improve this experience. Your answers will help us understand what works
            best for people like you.
          </p>
          <p className="text-lg text-gray-500 mb-8">
            This will take about 1-2 minutes.
          </p>
          <Button
            onClick={handleStartSurvey}
            className="w-full py-8 text-2xl bg-green-500 hover:bg-green-600"
            size="lg"
          >
            Start Survey
          </Button>
        </div>
      </div>
    );
  }

  // Questions Step
  if (step === 'questions' && !loading) {
    return (
      <div className={containerClass}>
        <div className="max-w-4xl w-full">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
              <span>{Math.round(((currentQuestionIndex + 1) / questions.length) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Question */}
          <div className="text-center mb-8">
            <h3 className="text-3xl font-bold text-gray-900 mb-8">
              {currentQuestion?.question_text}
            </h3>

            {/* Rating Component */}
            {currentQuestion?.question_type === 'emoji' && (
              <EmojiScale 
                value={currentResponse} 
                onChange={handleResponseChange} 
                variant={selectedAgeGroup === 1 ? '3-point' : '5-point'}
              />
            )}
            {currentQuestion?.question_type === 'star' && (
              <StarRating value={currentResponse} onChange={handleResponseChange} />
            )}
            {currentQuestion?.question_type === 'likert' && (
              <LikertScale value={currentResponse} onChange={handleResponseChange} />
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-4 justify-between">
            <Button
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0}
              className="px-8 py-6 text-xl"
              variant="outline"
            >
              Previous
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed}
              className="px-8 py-6 text-xl bg-blue-500 hover:bg-blue-600"
            >
              {currentQuestionIndex === questions.length - 1 ? 'Submit' : 'Next'}
            </Button>
          </div>

          {error && (
            <p className="text-red-500 text-center mt-4">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // Submitting Step
  if (step === 'submitting') {
    return (
      <div className={containerClass}>
        <div className="text-center">
          <Loader2 className="h-20 w-20 mx-auto text-blue-500 animate-spin mb-4" />
          <p className="text-2xl text-gray-600">Submitting your responses...</p>
        </div>
      </div>
    );
  }

  // Complete Step
  if (step === 'complete') {
    return (
      <div className={containerClass}>
        <div className="text-center">
          <div className="text-8xl mb-6">✅</div>
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Thank You!</h2>
          <p className="text-xl text-gray-600">
            Your responses have been recorded.
          </p>
        </div>
      </div>
    );
  }

  // Loading State
  return (
    <div className={containerClass}>
      <Loader2 className="h-20 w-20 text-blue-500 animate-spin" />
    </div>
  );
}

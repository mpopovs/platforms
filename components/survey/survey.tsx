'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { EmojiScale } from './emoji-scale';
import { StarRating } from './star-rating';
import { LikertScale } from './likert-scale';
import { YesNo } from './yes-no';
import { Loader2, Info, X } from 'lucide-react';
import { getTranslations, SupportedLanguage } from './locales';

interface SurveyQuestion {
  id: string;
  question_text: string;
  question_type: 'emoji' | 'star' | 'likert' | 'yes-no';
  age_group: number;
}

interface SurveyProps {
  viewerId: string;
  textureId?: string; // Optional for test/preview mode
  onComplete: () => void;
  isTestMode?: boolean;
  language?: SupportedLanguage;
}

const ageGroups = [
  { value: 1, label: '0-12 years', description: 'Children' },
  { value: 2, label: '13-18 years', description: 'Teenagers' },
  { value: 3, label: '19+ years', description: 'Adults' },
];

type SurveyStep = 'age-selection' | 'intro' | 'questions' | 'submitting' | 'complete';

export function Survey({ viewerId, textureId, onComplete, isTestMode = false, language }: SurveyProps) {
  const [activeLanguage, setActiveLanguage] = useState<SupportedLanguage>(language || 'en');
  const t = getTranslations(activeLanguage);
  const [step, setStep] = useState<SurveyStep>('age-selection');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<number | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [researchPurpose, setResearchPurpose] = useState<string>('');
  const [showResearchInfo, setShowResearchInfo] = useState(false);

  // Fetch viewer-level research purpose whenever language changes (or on mount)
  useEffect(() => {
    fetch(`/api/survey/research-purpose?viewerId=${viewerId}&language=${activeLanguage}`)
      .then((r) => r.json())
      .then((d) => setResearchPurpose(d.research_purpose || ''))
      .catch(() => {});
  }, [viewerId, activeLanguage]);

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
        `/api/survey/questions?viewerId=${viewerId}&ageGroup=${selectedAgeGroup}&language=${activeLanguage}`
      );
      if (!response.ok) throw new Error('Failed to fetch questions');
      const data = await response.json();
      setQuestions(data.questions || []);
      setResearchPurpose(data.research_purpose || '');
      
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
    const ageLabels = [t.ageGroup1, t.ageGroup2, t.ageGroup3];
    const LANG_OPTIONS: { code: SupportedLanguage; flag: string; label: string }[] = [
      { code: 'en', flag: '🇬🇧', label: 'English' },
      { code: 'lv', flag: '🇱🇻', label: 'Latviešu' },
      { code: 'lt', flag: '🇱🇹', label: 'Lietuvių' },
    ];
    const ageContainerClass = isTestMode
      ? 'absolute inset-0 bg-white z-10 overflow-y-auto'
      : 'fixed inset-0 bg-white z-50 overflow-y-auto';
    return (
      <div className={ageContainerClass}>
        {/* Research info modal */}
        {showResearchInfo && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-8 relative">
              <button
                onClick={() => setShowResearchInfo(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3 mb-4">
                <Info className="h-6 w-6 text-blue-500 flex-shrink-0" />
                <h3 className="text-xl font-bold text-gray-900">Research Information</h3>
              </div>
              <p className="text-gray-600 leading-relaxed">{researchPurpose}</p>
              <Button className="mt-6 w-full" onClick={() => setShowResearchInfo(false)}>Close</Button>
            </div>
          </div>
        )}

        <div className="min-h-full flex flex-col max-w-lg mx-auto px-4">
          {/* Language flag buttons — full width, 3 columns */}
          <div className="grid grid-cols-3 gap-3 pt-6 pb-4">
            {LANG_OPTIONS.map((l) => (
              <button
                key={l.code}
                onClick={() => setActiveLanguage(l.code)}
                className={[
                  'flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border-2 transition-all active:scale-95',
                  activeLanguage === l.code
                    ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300',
                ].join(' ')}
              >
                <span className="text-4xl sm:text-5xl leading-none">{l.flag}</span>
                
              </button>
            ))}
          </div>

          {/* Age group selection */}
          <div className="flex-1 flex flex-col justify-center py-4">
            <h2 className="text-3xl sm:text-4xl font-bold mb-2 text-gray-900 text-center">
              {t.selectAgeGroup}
            </h2>
            <p className="text-base sm:text-lg text-gray-500 mb-8 text-center">
            
            </p>
            <div className="flex flex-col gap-4">
              {ageGroups.map((group, i) => (
                <button
                  key={group.value}
                  onClick={() => handleAgeSelection(group.value)}
                  className="w-full py-6 sm:py-8 text-2xl sm:text-3xl font-bold rounded-2xl bg-blue-500 hover:bg-blue-600 active:scale-[0.98] text-white transition-all shadow-sm"
                >
                  {ageLabels[i]}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom — GDPR + info + skip */}
          <div className="pb-8 pt-4 flex flex-col items-center gap-4 text-center">
            {researchPurpose && (
              <button
                onClick={() => setShowResearchInfo(true)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-blue-500 transition-colors"
              >
                <Info className="h-4 w-4" />
                <span>Research Information</span>
              </button>
            )}
            <p className="text-xs sm:text-sm text-gray-400 max-w-sm leading-relaxed">
              {t.gdprNotice}
            </p>
            <button
              onClick={onComplete}
              className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
            >
              {t.skipSurvey}
            </button>
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
          {/* Progress + info button */}
          <div className="mb-8 relative">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>{t.questionOf(currentQuestionIndex + 1, questions.length)}</span>
              <span className="flex items-center gap-2">
                <span>{Math.round(((currentQuestionIndex + 1) / questions.length) * 100)}%</span>
                {researchPurpose && (
                  <button
                    onClick={() => setShowResearchInfo(true)}
                    className="ml-1 text-gray-400 hover:text-blue-500 transition-colors"
                    aria-label="Research information"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                )}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Research purpose modal */}
          {showResearchInfo && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 relative">
                <button
                  onClick={() => setShowResearchInfo(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-3 mb-4">
                  <Info className="h-6 w-6 text-blue-500 flex-shrink-0" />
                  <h3 className="text-xl font-bold text-gray-900">Research Information</h3>
                </div>
                <p className="text-gray-600 leading-relaxed">{researchPurpose}</p>
                <Button
                  className="mt-6 w-full"
                  onClick={() => setShowResearchInfo(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}

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
              <LikertScale value={currentResponse} onChange={handleResponseChange} translations={t} />
            )}
            {currentQuestion?.question_type === 'yes-no' && (
              <YesNo value={currentResponse} onChange={handleResponseChange} yesLabel={t.yes} noLabel={t.no} />
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
              {t.previous}
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed}
              className="px-8 py-6 text-xl bg-blue-500 hover:bg-blue-600"
            >
              {currentQuestionIndex === questions.length - 1 ? t.submit : t.next}
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
          <p className="text-2xl text-gray-600">{t.submitting}</p>
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
          <h2 className="text-4xl font-bold text-gray-900 mb-4">{t.thankYou}</h2>
          <p className="text-xl text-gray-600">
            {t.responsesRecorded}
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

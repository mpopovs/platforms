'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Save, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Survey } from '@/components/survey/survey';
import type { SupportedLanguage } from '@/components/survey/locales';

interface Viewer {
  id: string;
  name: string;
}

interface Question {
  id?: string;
  question_text: string;
  question_translations: Partial<Record<SupportedLanguage, string>>;
  age_group: number;
  question_type: string;
  order_index: number;
  is_active: boolean;
  _expanded?: boolean;
}

const LANGUAGES: { code: SupportedLanguage; flag: string; label: string }[] = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'lv', flag: '🇱🇻', label: 'Latvian' },
  { code: 'de', flag: '🇩🇪', label: 'German' },
  { code: 'ru', flag: '🇷🇺', label: 'Russian' },
  { code: 'lt', flag: '🇱🇹', label: 'Lithuanian' },
  { code: 'et', flag: '🇪🇪', label: 'Estonian' },
];

const ageGroups = [
  { value: 1, label: 'Age 0-12 (Emoji Scale)', type: 'emoji' },
  { value: 2, label: 'Age 13-18 (Star Rating)', type: 'star' },
  { value: 3, label: 'Age 19+ (Likert Scale)', type: 'likert' },
];

export function SurveyQuestionsManager({ viewers, userId }: { viewers: Viewer[]; userId: string }) {
  const searchParams = useSearchParams();
  const initialViewerId = searchParams.get('viewerId');

  const [selectedViewer, setSelectedViewer] = useState<string>(initialViewerId || '');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<number>(1);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeLangTab, setActiveLangTab] = useState<SupportedLanguage>('en');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [researchPurposeTranslations, setResearchPurposeTranslations] = useState<Partial<Record<SupportedLanguage, string>>>({});
  const [savingPurpose, setSavingPurpose] = useState(false);

  useEffect(() => {
    if (selectedViewer && selectedAgeGroup) {
      fetchQuestions();
    }
  }, [selectedViewer, selectedAgeGroup]);

  // Load research purpose from the database when viewer changes
  useEffect(() => {
    if (!selectedViewer) { setResearchPurposeTranslations({}); return; }
    fetch(`/api/admin/survey/research-purpose?viewerId=${selectedViewer}`)
      .then((r) => r.json())
      .then((data) => setResearchPurposeTranslations(data.research_purpose_translations ?? {}))
      .catch(() => setResearchPurposeTranslations({}));
  }, [selectedViewer]);

  const saveResearchPurpose = async () => {
    if (!selectedViewer) return;
    setSavingPurpose(true);
    try {
      const res = await fetch('/api/admin/survey/research-purpose', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewerId: selectedViewer,
          research_purpose: researchPurposeTranslations.en || '',
          research_purpose_translations: researchPurposeTranslations,
        }),
      });
      if (!res.ok) throw new Error();
      setMessage({ type: 'success', text: 'Research purpose saved.' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save research purpose.' });
    } finally {
      setSavingPurpose(false);
    }
  };

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/survey/questions?viewerId=${selectedViewer}&ageGroup=${selectedAgeGroup}`
      );
      const data = await response.json();
      setQuestions(
        (data.questions || []).map((q: any) => ({
          ...q,
          question_translations: q.question_translations || {},
          _expanded: false,
        }))
      );
    } catch (error) {
      console.error('Error fetching questions:', error);
      setMessage({ type: 'error', text: 'Failed to load questions' });
    } finally {
      setLoading(false);
    }
  };

  const addQuestion = () => {
    const questionType = ageGroups.find((g) => g.value === selectedAgeGroup)?.type || 'emoji';
    setQuestions([
      ...questions,
      {
        question_text: '',
        question_translations: {},
        age_group: selectedAgeGroup,
        question_type: questionType,
        order_index: questions.length,
        is_active: true,
        _expanded: true,
      },
    ]);
  };

  const QUESTION_TYPES = [
    { value: 'emoji',   label: 'Emoji Scale (😢–😄)' },
    { value: 'star',    label: 'Star Rating (1–5 ★)' },
    { value: 'likert',  label: 'Likert Scale (Disagree–Agree)' },
    { value: 'yes-no',  label: 'Yes / No' },
  ];

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const updateTranslation = (index: number, lang: SupportedLanguage, value: string) => {
    const updated = [...questions];
    updated[index] = {
      ...updated[index],
      question_translations: { ...updated[index].question_translations, [lang]: value },
      // Keep question_text in sync with English as the base
      ...(lang === 'en' ? { question_text: value } : {}),
    };
    setQuestions(updated);
  };

  const toggleExpanded = (index: number) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], _expanded: !updated[index]._expanded };
    setQuestions(updated);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const saveQuestions = async () => {
    if (!selectedViewer) {
      setMessage({ type: 'error', text: 'Please select a viewer' });
      return;
    }
    const emptyQuestions = questions.filter(
      (q) => !q.question_text.trim() && !q.question_translations.en?.trim()
    );
    if (emptyQuestions.length > 0) {
      setMessage({ type: 'error', text: 'Please fill in at least the English question text' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/survey/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewerId: selectedViewer,
          ageGroup: selectedAgeGroup,
          questions: questions.map((q, index) => ({
            ...q,
            order_index: index,
            question_text: q.question_translations.en || q.question_text,
          })),
        }),
      });
      if (!response.ok) throw new Error('Failed to save questions');
      setMessage({ type: 'success', text: 'Questions saved successfully!' });
      await fetchQuestions();
    } catch (error) {
      console.error('Error saving questions:', error);
      setMessage({ type: 'error', text: 'Failed to save questions' });
    } finally {
      setSaving(false);
    }
  };

  const questionType = ageGroups.find((g) => g.value === selectedAgeGroup)?.type || 'emoji';
  const questionTypeLabel = { emoji: 'Emoji Scale', star: 'Star Rating', likert: 'Likert Scale', 'yes-no': 'Yes / No' }[questionType as string] ?? questionType;

  // Summary of translated langs for a question (those that have text)
  const translatedLangs = (q: Question) =>
    LANGUAGES.filter((l) => !!q.question_translations[l.code]?.trim());

  return (
    <div className="space-y-6">
      {/* Viewer and Age Group Selection */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="viewer">Select Viewer</Label>
            <select
              id="viewer"
              value={selectedViewer}
              onChange={(e) => setSelectedViewer(e.target.value)}
              className="w-full mt-2 p-2 border rounded"
            >
              <option value="">-- Select a Viewer --</option>
              {viewers.map((viewer) => (
                <option key={viewer.id} value={viewer.id}>
                  {viewer.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="ageGroup">Select Age Group</Label>
            <select
              id="ageGroup"
              value={selectedAgeGroup}
              onChange={(e) => setSelectedAgeGroup(parseInt(e.target.value))}
              className="w-full mt-2 p-2 border rounded"
            >
              {ageGroups.map((group) => (
                <option key={group.value} value={group.value}>
                  {group.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedViewer && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Response Type:</strong> {questionTypeLabel}
            </p>
            <p className="text-sm text-blue-600 mt-1">
              {questionType === 'emoji' && 'Users will rate using 5 emoji faces (sad to happy)'}
              {questionType === 'star' && 'Users will rate using 1-5 stars'}
              {questionType === 'likert' && 'Users will rate from Strongly Disagree to Strongly Agree (1-5)'}
              {questionType === 'yes-no' && 'Users will choose Yes or No (individual questions can override this)'}
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="outline" disabled={!selectedViewer} onClick={() => setShowPreview(true)}>
            <Play className="h-4 w-4 mr-2" />
            Test Survey
          </Button>
        </div>
      </Card>

      {/* Research Purpose */}
      {selectedViewer && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-1">Research Purpose</h2>
          <p className="text-sm text-gray-500 mb-4">
            Describe how survey data will be used in research. Participants can read this by tapping
            the info icon during the survey. Saved to the database.
          </p>
          <div className="space-y-2">
            {LANGUAGES.map((lang) => (
              <div key={lang.code} className="flex items-start gap-3">
                <span className="text-base w-6 flex-shrink-0 pt-2" title={lang.label}>{lang.flag}</span>
                <span className="text-xs font-semibold text-gray-500 w-8 flex-shrink-0 pt-2.5">{lang.code.toUpperCase()}</span>
                <textarea
                  value={researchPurposeTranslations[lang.code] || ''}
                  onChange={(e) => setResearchPurposeTranslations((prev) => ({ ...prev, [lang.code]: e.target.value }))}
                  rows={2}
                  placeholder={`${lang.label} — research purpose text…`}
                  className="flex-1 p-2 border rounded text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" onClick={saveResearchPurpose} disabled={savingPurpose} size="sm">
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {savingPurpose ? 'Saving…' : 'Save Note'}
            </Button>
          </div>
        </Card>
      )}

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-full">
          <DialogHeader>
            <DialogTitle>Survey Preview</DialogTitle>
            <DialogDescription>Test mode: Responses will not be saved.</DialogDescription>
          </DialogHeader>
          <div className="relative h-[600px] border rounded-lg bg-gray-50 overflow-hidden">
            {selectedViewer && (
              <Survey viewerId={selectedViewer} onComplete={() => setShowPreview(false)} isTestMode={true} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Questions List */}
      {selectedViewer && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Questions</h2>
            <Button onClick={addQuestion} disabled={loading}>
              <Plus className="h-4 w-4 mr-2" />
              Add Question
            </Button>
          </div>

          {/* Global language tab selector */}
          {questions.length > 0 && (
            <div className="flex gap-1 mb-6 flex-wrap">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setActiveLangTab(lang.code)}
                  className={[
                    'px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
                    activeLangTab === lang.code
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300',
                  ].join(' ')}
                >
                  {lang.flag} {lang.label}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-center text-gray-500">Loading questions...</p>
          ) : questions.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No questions yet. Click &quot;Add Question&quot; to create one.
            </p>
          ) : (
            <div className="space-y-3">
              {questions.map((question, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  {/* Question header */}
                  <div
                    className="flex gap-3 items-center p-4 cursor-pointer hover:bg-gray-50 select-none"
                    onClick={() => toggleExpanded(index)}
                  >
                    <div className="flex-shrink-0 w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-gray-800">
                        {question.question_translations.en || question.question_text || (
                          <span className="text-gray-400 italic">No English text yet</span>
                        )}
                      </p>
                      {/* Translation pills */}
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {LANGUAGES.map((lang) => (
                          <span
                            key={lang.code}
                            className={[
                              'text-[10px] px-1.5 py-0.5 rounded font-medium',
                              question.question_translations[lang.code]?.trim()
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-400',
                            ].join(' ')}
                          >
                            {lang.flag} {lang.code.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Inline type selector — always visible */}
                      <select
                        value={question.question_type}
                        onChange={(e) => { e.stopPropagation(); updateQuestion(index, 'question_type', e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 border rounded text-xs bg-white text-gray-700 h-7"
                        title="Question type"
                      >
                        {QUESTION_TYPES.map((qt) => (
                          <option key={qt.value} value={qt.value}>{qt.label}</option>
                        ))}
                      </select>
                      <label
                        className="flex items-center gap-1 text-xs text-gray-500"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={question.is_active}
                          onChange={(e) => updateQuestion(index, 'is_active', e.target.checked)}
                          className="rounded"
                        />
                        Active
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); removeQuestion(index); }}
                        className="text-red-500 hover:text-red-700 h-7 w-7 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {question._expanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded: all language inputs */}
                  {question._expanded && (
                    <div className="border-t bg-gray-50 p-4 space-y-2">
                      {LANGUAGES.map((lang) => (
                        <div key={lang.code} className="flex items-center gap-3">
                          <span className="text-base w-6 flex-shrink-0" title={lang.label}>{lang.flag}</span>
                          <span className="text-xs font-semibold text-gray-500 w-8 flex-shrink-0">{lang.code.toUpperCase()}</span>
                          <Input
                            value={question.question_translations[lang.code] || ''}
                            onChange={(e) => updateTranslation(index, lang.code, e.target.value)}
                            placeholder={`${lang.label} question text…`}
                            className="flex-1 h-8 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Collapsed: show only the active language */}
                  {!question._expanded && (
                    <div
                      className="border-t px-4 py-2 bg-gray-50 cursor-pointer"
                      onClick={() => toggleExpanded(index)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base">{LANGUAGES.find(l => l.code === activeLangTab)?.flag}</span>
                        <Input
                          value={question.question_translations[activeLangTab] || ''}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateTranslation(index, activeLangTab, e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          placeholder={`${LANGUAGES.find(l => l.code === activeLangTab)?.label} question text…`}
                          className="flex-1 h-8 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {questions.length > 0 && (
            <div className="mt-6 flex justify-end">
              <Button onClick={saveQuestions} disabled={saving} size="lg">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save All Questions'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Save, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Survey } from '@/components/survey/survey';

interface Viewer {
  id: string;
  name: string;
}

interface Question {
  id?: string;
  question_text: string;
  age_group: number;
  question_type: string;
  order_index: number;
  is_active: boolean;
}

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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (selectedViewer && selectedAgeGroup) {
      fetchQuestions();
    }
  }, [selectedViewer, selectedAgeGroup]);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/survey/questions?viewerId=${selectedViewer}&ageGroup=${selectedAgeGroup}`
      );
      const data = await response.json();
      setQuestions(data.questions || []);
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
        age_group: selectedAgeGroup,
        question_type: questionType,
        order_index: questions.length,
        is_active: true,
      },
    ]);
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
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

    // Validate questions
    const emptyQuestions = questions.filter((q) => !q.question_text.trim());
    if (emptyQuestions.length > 0) {
      setMessage({ type: 'error', text: 'Please fill in all question texts' });
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
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save questions');
      }

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
  const questionTypeLabel = {
    emoji: 'Emoji Scale',
    star: 'Star Rating',
    likert: 'Likert Scale',
  }[questionType];

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
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button 
            variant="outline" 
            disabled={!selectedViewer}
            onClick={() => setShowPreview(true)}
          >
            <Play className="h-4 w-4 mr-2" />
            Test Survey
          </Button>
        </div>
      </Card>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-full">
          <DialogHeader>
            <DialogTitle>Survey Preview</DialogTitle>
            <DialogDescription>
              Test mode: Responses will not be saved.
            </DialogDescription>
          </DialogHeader>
          <div className="relative h-[600px] border rounded-lg bg-gray-50 overflow-hidden">
            {selectedViewer && (
              <Survey 
                viewerId={selectedViewer} 
                onComplete={() => setShowPreview(false)}
                isTestMode={true}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Questions List */}
      {selectedViewer && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Questions</h2>
            <Button onClick={addQuestion} disabled={loading}>
              <Plus className="h-4 w-4 mr-2" />
              Add Question
            </Button>
          </div>

          {loading ? (
            <p className="text-center text-gray-500">Loading questions...</p>
          ) : questions.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No questions yet. Click "Add Question" to create one.
            </p>
          ) : (
            <div className="space-y-4">
              {questions.map((question, index) => (
                <div key={index} className="flex gap-4 items-start p-4 border rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <Input
                      value={question.question_text}
                      onChange={(e) => updateQuestion(index, 'question_text', e.target.value)}
                      placeholder="Enter your question..."
                      className="text-lg"
                    />
                    <div className="mt-2 flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={question.is_active}
                          onChange={(e) => updateQuestion(index, 'is_active', e.target.checked)}
                          className="rounded"
                        />
                        <span>Active</span>
                      </label>
                      <span className="text-sm text-gray-500">Type: {questionTypeLabel}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeQuestion(index)}
                    className="flex-shrink-0 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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

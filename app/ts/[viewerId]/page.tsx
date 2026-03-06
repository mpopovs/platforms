'use client';
import { useState, useEffect, use } from 'react';
import type { TeacherSurveyQuestion, TeacherSurvey } from '@/lib/types/viewer';
import { LikertScale } from '@/components/survey/likert-scale';

interface SurveyData {
  survey: TeacherSurvey;
  viewerId: string;
}

export default function TeacherSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ viewerId: string }>;
  searchParams: Promise<{ pin?: string; lang?: string }>;
}) {
  const { viewerId } = use(params);
  const { pin, lang: urlLang } = use(searchParams);
  const lang = urlLang || 'en';

  const [data, setData] = useState<SurveyData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'questions' | 'submitting' | 'done' | 'error'>('questions');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch(`/api/teacher-survey/${viewerId}`)
      .then(r => {
        if (!r.ok) throw new Error('Survey not found');
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setErrorMsg(e.message); setStep('error'); setLoading(false); });
  }, [viewerId]);

  function getText(map: Record<string, string> | undefined, fallback = '') {
    if (!map) return fallback;
    return map[lang] ?? map[Object.keys(map)[0]] ?? fallback;
  }

  function setAnswer(qId: string, value: string | string[]) {
    setAnswers(prev => ({ ...prev, [qId]: value }));
  }

  function toggleCheckbox(qId: string, option: string) {
    setAnswers(prev => {
      const cur = (prev[qId] as string[] | undefined) ?? [];
      return {
        ...prev,
        [qId]: cur.includes(option) ? cur.filter(o => o !== option) : [...cur, option],
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;

    // Validate required questions
    for (const q of data.survey.questions) {
      if (q.required) {
        const ans = answers[q.id];
        if (!ans || (Array.isArray(ans) ? ans.length === 0 : ans.trim() === '')) {
          alert(`Please answer: "${getText(q.text)}"`);
          return;
        }
      }
    }

    setStep('submitting');
    const payload = data.survey.questions.map(q => ({
      question_id: q.id,
      question_text: getText(q.text),
      value: answers[q.id] ?? (q.type === 'checkbox' ? [] : ''),
    }));

    try {
      const res = await fetch(`/api/teacher-survey/${viewerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: payload, pin: pin || null, lang }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setStep('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Submission failed');
      setStep('error');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="text-green-700 animate-pulse text-lg">Loading survey…</div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
        <div className="text-center text-red-700">
          <p className="text-xl font-semibold mb-2">Survey unavailable</p>
          <p className="text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 p-6">
        <div className="text-center">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-2xl font-bold text-green-800 mb-2">Thank you!</p>
          <p className="text-green-600">Your responses have been recorded.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { survey } = data;
  const title = getText(survey.title, 'Teacher Survey');

  return (
    <div className="min-h-screen bg-green-50 pb-16">
      {/* Header */}
      <div className="bg-green-700 text-white px-6 py-5 shadow">
        <h1 className="text-xl font-bold">{title}</h1>
        {pin && <p className="text-green-200 text-sm mt-0.5">PIN: {pin}</p>}
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl mx-auto px-4 pt-6 space-y-6">
        {survey.questions.map((q, idx) => (
          <QuestionBlock
            key={q.id}
            index={idx + 1}
            question={q}
            lang={lang}
            value={answers[q.id]}
            onChange={(val) => setAnswer(q.id, val)}
            onToggle={(opt) => toggleCheckbox(q.id, opt)}
            getText={getText}
          />
        ))}

        <button
          type="submit"
          disabled={step === 'submitting'}
          className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-800 text-white font-semibold text-lg transition-colors disabled:opacity-60"
        >
          {step === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
      </form>
    </div>
  );
}

function QuestionBlock({
  index,
  question,
  lang,
  value,
  onChange,
  onToggle,
  getText,
}: {
  index: number;
  question: TeacherSurveyQuestion;
  lang: string;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  onToggle: (option: string) => void;
  getText: (m: Record<string, string> | undefined, fallback?: string) => string;
}) {
  const text = getText(question.text, `Question ${index}`);
  const checked = (value as string[] | undefined) ?? [];

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 border border-green-100">
      <p className="font-semibold text-gray-800 mb-3 leading-snug">
        <span className="text-green-600 mr-1">{index}.</span>
        {text}
        {question.required && <span className="text-red-500 ml-1">*</span>}
      </p>

      {question.type === 'open' && (
        <input
          type="text"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          placeholder="Your answer…"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      )}

      {question.type === 'textarea' && (
        <textarea
          className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
          rows={6}
          placeholder="Your answer…"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      )}

      {question.type === 'checkbox' && (
        <div className="space-y-2">
          {(question.options ?? []).map((opt, i) => {
            const label = getText(opt, `Option ${i + 1}`);
            const isChecked = checked.includes(label);
            return (
              <label key={i} className="flex items-center gap-3 cursor-pointer group">
                <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors
                  ${isChecked ? 'bg-green-600 border-green-600' : 'border-gray-300 group-hover:border-green-400'}`}
                  onClick={() => onToggle(label)}>
                  {isChecked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            );
          })}
        </div>
      )}

      {question.type === 'likert' && (
        <LikertScale
          value={value !== undefined && value !== '' ? Number(value) : null}
          onChange={(v) => onChange(String(v))}
        />
      )}
    </div>
  );
}

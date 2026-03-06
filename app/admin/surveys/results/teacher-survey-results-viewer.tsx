'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Viewer { id: string; name: string; }

interface TextAnswer {
  responseId: string;
  value: string | string[];
  school: string;
  lang: string;
  date: string;
}

interface QuestionStat {
  id: string;
  type: 'open' | 'checkbox' | 'textarea' | 'likert';
  text: Record<string, string>;
  options?: Array<Record<string, string>>;
  totalAnswered: number;
  optionCounts: Record<string, number>;
  textAnswers: TextAnswer[];
}

interface ResultsData {
  questions: QuestionStat[];
  totalResponses: number;
  classrooms: Array<{ viewerId: string; schoolName: string; teacherName: string; createdAt: string }>;
}

export function TeacherSurveyResultsViewer({ viewers }: { viewers: Viewer[] }) {
  const [selectedViewer, setSelectedViewer] = useState('');
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedViewer) return;
    setLoading(true);
    fetch(`/api/admin/teacher-survey/results?viewerId=${selectedViewer}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedViewer]);

  function getText(map: Record<string, string> | undefined) {
    if (!map) return '';
    return map['lv'] ?? map['en'] ?? map[Object.keys(map)[0]] ?? '';
  }

  function exportCSV() {
    if (!data) return;
    const rows: string[][] = [];
    rows.push(['Question', 'Type', 'Total Answered', 'Answer / Option', 'Count / Text', 'School', 'Date']);
    for (const q of data.questions) {
      const qText = getText(q.text);
      if (q.type === 'checkbox' || q.type === 'likert') {
        for (const [opt, count] of Object.entries(q.optionCounts)) {
          rows.push([qText, q.type, String(q.totalAnswered), opt, String(count), '', '']);
        }
      } else {
        for (const a of q.textAnswers) {
          const val = Array.isArray(a.value) ? a.value.join('; ') : a.value;
          rows.push([qText, q.type, String(q.totalAnswered), '', val, a.school, new Date(a.date).toLocaleDateString()]);
        }
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teacher-survey-${selectedViewer}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <Label htmlFor="ts-viewer">Select Parent Viewer</Label>
            <select
              id="ts-viewer"
              value={selectedViewer}
              onChange={e => setSelectedViewer(e.target.value)}
              className="w-full mt-2 p-2 border rounded"
            >
              <option value="">-- Select a Viewer --</option>
              {viewers.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          {data && (
            <div className="flex items-center gap-4">
              <span className="text-lg font-semibold">
                Total responses: <span className="text-green-600">{data.totalResponses}</span>
                <span className="text-sm text-gray-500 ml-2">from {data.classrooms.length} classrooms</span>
              </span>
              <Button onClick={exportCSV} disabled={!data.questions.length} size="sm">
                <Download className="h-4 w-4 mr-2" />Export CSV
              </Button>
            </div>
          )}
        </div>
      </Card>

      {selectedViewer && (
        loading ? (
          <p className="text-center text-gray-500 py-12">Loading results…</p>
        ) : !data || data.questions.length === 0 ? (
          <Card className="p-12 text-center text-gray-500">
            No teacher survey configured or no responses yet.
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Classrooms list */}
            {data.classrooms.length > 0 && (
              <Card className="p-4">
                <h3 className="font-semibold text-sm text-gray-600 mb-3 uppercase tracking-wide">
                  Registered Classrooms ({data.classrooms.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {data.classrooms.map(c => (
                    <div key={c.viewerId} className="bg-gray-50 rounded px-3 py-2 text-sm">
                      <div className="font-medium">{c.schoolName}</div>
                      {c.teacherName && <div className="text-gray-500">{c.teacherName}</div>}
                      <div className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Per-question results */}
            {data.questions.map((q, qi) => (
              <Card key={q.id} className="p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-bold">{qi + 1}. {getText(q.text)}</h3>
                  <span className="text-xs text-gray-500 uppercase tracking-wide">
                    {q.type} · {q.totalAnswered} answer{q.totalAnswered !== 1 ? 's' : ''}
                  </span>
                </div>

                {q.type === 'checkbox' ? (
                  /* Option distribution */
                  <div className="space-y-2">
                    {(q.options ?? []).map((optMap, oi) => {
                      const optText = getText(optMap);
                      const count = q.optionCounts[optText] ?? 0;
                      const pct = q.totalAnswered > 0 ? (count / q.totalAnswered) * 100 : 0;
                      return (
                        <div key={oi} className="flex items-center gap-3">
                          <div className="w-40 text-sm flex-shrink-0 truncate">{optText}</div>
                          <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                            <div
                              className="bg-green-500 h-full flex items-center px-2 text-white text-xs font-medium transition-all"
                              style={{ width: `${Math.max(pct, 0)}%`, minWidth: count > 0 ? '2rem' : 0 }}
                            >
                              {pct > 12 && `${count} (${pct.toFixed(0)}%)`}
                            </div>
                          </div>
                          <div className="w-20 text-sm text-gray-500 text-right">
                            {pct <= 12 && `${count} (${pct.toFixed(0)}%)`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : q.type === 'likert' ? (
                  /* Likert 1-5 distribution + average */
                  <div className="space-y-3">
                    {(() => {
                      const total = q.totalAnswered;
                      const sum = [1,2,3,4,5].reduce((acc, v) => acc + v * (q.optionCounts[String(v)] ?? 0), 0);
                      const avg = total > 0 ? (sum / total).toFixed(2) : '—';
                      const COLORS = ['bg-red-500','bg-orange-400','bg-yellow-400','bg-lime-500','bg-green-500'];
                      const LABELS = ['Strongly disagree','Disagree','Neutral','Agree','Strongly agree'];
                      return (
                        <>
                          <div className="text-sm font-semibold text-teal-700 mb-1">Average: {avg} / 5</div>
                          {[1,2,3,4,5].map((v, i) => {
                            const count = q.optionCounts[String(v)] ?? 0;
                            const pct = total > 0 ? (count / total) * 100 : 0;
                            return (
                              <div key={v} className="flex items-center gap-3">
                                <div className="w-40 text-sm flex-shrink-0">{v} — {LABELS[i]}</div>
                                <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                                  <div
                                    className={`${COLORS[i]} h-full flex items-center px-2 text-white text-xs font-medium transition-all`}
                                    style={{ width: `${Math.max(pct, 0)}%`, minWidth: count > 0 ? '2rem' : 0 }}
                                  >
                                    {pct > 12 && `${count} (${pct.toFixed(0)}%)`}
                                  </div>
                                </div>
                                <div className="w-20 text-sm text-gray-500 text-right">
                                  {pct <= 12 && `${count} (${pct.toFixed(0)}%)`}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  /* Text answers */
                  q.textAnswers.length === 0 ? (
                    <p className="text-gray-400 text-sm italic">No answers yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {q.textAnswers.map(a => (
                        <div key={a.responseId} className="bg-gray-50 rounded px-3 py-2 text-sm">
                          <div className="text-gray-800">{Array.isArray(a.value) ? a.value.join(', ') : a.value}</div>
                          <div className="text-xs text-gray-400 mt-1">{a.school} · {new Date(a.date).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

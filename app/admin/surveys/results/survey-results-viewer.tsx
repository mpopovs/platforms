'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Download } from 'lucide-react';

interface Viewer {
  id: string;
  name: string;
}

interface QuestionStats {
  question_id: string;
question_text: string;
  question_type: string;
  responses: number;
  average: number;
  distribution: Record<string, number>;
}

const ageGroups = [
  { value: 0, label: 'All Age Groups' },
  { value: 1, label: 'Age 0-12 (Emoji Scale)' },
  { value: 2, label: 'Age 13-18 (Star Rating)' },
  { value: 3, label: 'Age 19+ (Likert Scale)' },
];

const responseLabels = {
  emoji: ['😢 Very Sad', '😟 Sad', '😐 Okay', '😊 Happy', '😄 Very Happy'],
  star: ['★ 1 Star', '★★ 2 Stars', '★★★ 3 Stars', '★★★★ 4 Stars', '★★★★★ 5 Stars'],
  likert: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'],
};

export function SurveyResultsViewer({ viewers, userId }: { viewers: Viewer[]; userId: string }) {
  const searchParams = useSearchParams();
  const initialViewerId = searchParams.get('viewerId');

  const [selectedViewer, setSelectedViewer] = useState<string>(initialViewerId || '');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<number>(0);
  const [stats, setStats] = useState<QuestionStats[]>([]);
  const [totalResponses, setTotalResponses] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedViewer) {
      fetchResults();
    }
  }, [selectedViewer, selectedAgeGroup]);

  const fetchResults = async () => {
    setLoading(true);
    try {
      const url = selectedAgeGroup > 0
        ? `/api/admin/survey/results?viewerId=${selectedViewer}&ageGroup=${selectedAgeGroup}`
        : `/api/admin/survey/results?viewerId=${selectedViewer}`;
      
      const response = await fetch(url);
      const data = await response.json();
      setStats(data.stats || []);
      setTotalResponses(data.totalResponses || 0);
    } catch (error) {
      console.error('Error fetching results:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (stats.length === 0) return;

    const headers = ['Question', 'Type', 'Total Responses', 'Average', '1', '2', '3', '4', '5'];
    const rows = stats.map((stat) => [
      stat.question_text,
      stat.question_type,
      stat.responses,
      stat.average.toFixed(2),
      stat.distribution['1'] || 0,
      stat.distribution['2'] || 0,
      stat.distribution['3'] || 0,
      stat.distribution['4'] || 0,
      stat.distribution['5'] || 0,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survey-results-${selectedViewer}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
            <Label htmlFor="ageGroup">Filter by Age Group</Label>
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
          <div className="mt-4 flex justify-between items-center">
            <div className="text-lg font-semibold">
              Total Responses: <span className="text-blue-600">{totalResponses}</span>
            </div>
            <Button onClick={exportToCSV} disabled={stats.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        )}
      </Card>

      {/* Results */}
      {selectedViewer && (
        <div className="space-y-6">
          {loading ? (
            <p className="text-center text-gray-500">Loading results...</p>
          ) : stats.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-gray-500 text-lg">No survey responses yet.</p>
            </Card>
          ) : (
            stats.map((stat) => (
              <Card key={stat.question_id} className="p-6">
                <div className="mb-4">
                  <h3 className="text-xl font-bold mb-2">{stat.question_text}</h3>
                  <div className="flex gap-4 text-sm text-gray-600">
                    <span>Type: {stat.question_type}</span>
                    <span>•</span>
                    <span>Responses: {stat.responses}</span>
                    <span>•</span>
                    <span>Average: {stat.average.toFixed(2)} / 5.00</span>
                  </div>
                </div>

                {/* Distribution Bar Chart */}
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const count = stat.distribution[value.toString()] || 0;
                    const percentage = stat.responses > 0 ? (count / stat.responses) * 100 : 0;
                    const labels = responseLabels[stat.question_type as keyof typeof responseLabels] || [];
                    
                    return (
                      <div key={value} className="flex items-center gap-4">
                        <div className="w-32 text-sm font-medium flex-shrink-0">
                          {labels[value - 1] || `Option ${value}`}
                        </div>
                        <div className="flex-1 bg-gray-200 rounded-full h-8 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full flex items-center justify-end pr-2 text-white text-sm font-medium transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          >
                            {percentage > 10 && `${count} (${percentage.toFixed(0)}%)`}
                          </div>
                        </div>
                        <div className="w-20 text-sm text-gray-600 text-right">
                          {percentage <= 10 && `${count} (${percentage.toFixed(0)}%)`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

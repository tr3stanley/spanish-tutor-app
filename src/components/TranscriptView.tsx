'use client';

import { useState } from 'react';

interface Transcript {
  id: number;
  text: string;
  start_time: number;
  end_time: number;
}

interface Explanation {
  id: number;
  start_time: number;
  end_time: number;
  explanation: string;
}

interface TranscriptViewProps {
  transcript: Transcript[];
  currentTime: number;
  onSeekTo: (time: number) => void;
  onExplanationRequest: (startTime: number, endTime: number) => Promise<string>;
  explanations: Explanation[];
}

export default function TranscriptView({
  transcript,
  currentTime,
  onSeekTo,
  onExplanationRequest,
  explanations
}: TranscriptViewProps) {
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState<number | null>(null);
  const [expandedExplanations, setExpandedExplanations] = useState<Set<number>>(new Set());

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSegmentClick = (segment: Transcript) => {
    onSeekTo(segment.start_time);
    setSelectedSegment(segment.id);
  };

  const handleExplainSegment = async (segment: Transcript) => {
    setLoadingExplanation(segment.id);

    try {
      await onExplanationRequest(segment.start_time, segment.end_time);
      // The parent will refetch data and update explanations
    } catch (error) {
      console.error('Error getting explanation:', error);
    } finally {
      setLoadingExplanation(null);
    }
  };

  const getExplanationForSegment = (segment: Transcript) => {
    return explanations.find(
      exp => exp.start_time <= segment.start_time && exp.end_time >= segment.end_time
    );
  };

  const isCurrentSegment = (segment: Transcript) => {
    return currentTime >= segment.start_time && currentTime <= segment.end_time;
  };

  const toggleExplanation = (segmentId: number) => {
    const newExpanded = new Set(expandedExplanations);
    if (newExpanded.has(segmentId)) {
      newExpanded.delete(segmentId);
    } else {
      newExpanded.add(segmentId);
    }
    setExpandedExplanations(newExpanded);
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-300 mb-4">
        Click on any segment to jump to that time in the audio. Use the &quot;Explain&quot; button for AI analysis of difficult segments.
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {transcript.map((segment) => {
          const explanation = getExplanationForSegment(segment);
          const isCurrent = isCurrentSegment(segment);
          const isSelected = selectedSegment === segment.id;
          const isLoading = loadingExplanation === segment.id;
          const isExpanded = expandedExplanations.has(segment.id);

          return (
            <div
              key={segment.id}
              className={`border rounded-lg p-4 transition-all duration-200 ${
                isCurrent
                  ? 'border-purple-400 bg-purple-400/20 shadow-md'
                  : isSelected
                  ? 'border-white/40 bg-white/10'
                  : 'border-white/20 hover:border-white/30 hover:bg-white/5'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center mb-2">
                    <button
                      onClick={() => handleSegmentClick(segment)}
                      className="text-sm font-medium text-purple-300 hover:text-purple-100"
                    >
                      {formatTime(segment.start_time)} - {formatTime(segment.end_time)}
                    </button>
                    {isCurrent && (
                      <span className="ml-2 px-2 py-1 text-xs font-medium bg-purple-400/20 text-purple-300 rounded-full">
                        Playing
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-white cursor-pointer transition-colors ${
                      isCurrent ? 'font-medium' : ''
                    }`}
                    onClick={() => handleSegmentClick(segment)}
                  >
                    {segment.text}
                  </p>
                </div>

                <div className="ml-4 flex items-center space-x-2">
                  {explanation && (
                    <button
                      onClick={() => toggleExplanation(segment.id)}
                      className="p-1 rounded-full bg-green-400/20 text-green-300 hover:bg-green-400/30"
                      title="View explanation"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  )}

                  <button
                    onClick={() => handleExplainSegment(segment)}
                    disabled={isLoading}
                    className="px-3 py-1 text-xs font-medium text-purple-300 bg-purple-400/20 rounded-md hover:bg-purple-400/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Explain
                      </>
                    )}
                  </button>
                </div>
              </div>

              {explanation && isExpanded && (
                <div className="mt-3 p-3 bg-green-400/10 rounded-md border-l-4 border-green-400">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-sm font-medium text-green-300">AI Explanation</h4>
                    <button
                      onClick={() => toggleExplanation(segment.id)}
                      className="text-green-300 hover:text-green-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-sm text-green-200 whitespace-pre-wrap">
                    {explanation.explanation}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {transcript.length === 0 && (
        <div className="text-center py-8">
          <div className="mx-auto h-12 w-12 text-gray-300 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-gray-300">No transcript available</p>
          <p className="text-sm text-gray-400 mt-1">The podcast is still being processed.</p>
        </div>
      )}
    </div>
  );
}
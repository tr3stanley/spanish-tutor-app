'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import AudioPlayer from '@/components/AudioPlayer';
import LessonPlan from '@/components/LessonPlan';
import TranscriptView from '@/components/TranscriptView';
import PodcastTutor from '@/components/PodcastTutor';
import Navigation from '@/components/Navigation';
import UploadModal from '@/components/UploadModal';

interface PodcastData {
  podcast: {
    id: number;
    title: string;
    filename: string;
    language: string;
    file_path: string;
    created_at: string;
  };
  transcript: Array<{
    id: number;
    text: string;
    start_time: number;
    end_time: number;
  }>;
  lesson?: {
    summary: string;
    grammar_rules: string;
    vocabulary: string;
  };
  explanations: Array<{
    id: number;
    start_time: number;
    end_time: number;
    explanation: string;
  }>;
}

export default function PodcastPage() {
  const params = useParams();
  const [data, setData] = useState<PodcastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedTab, setSelectedTab] = useState<'lesson' | 'transcript' | 'tutor'>('lesson');
  const [showUploadModal, setShowUploadModal] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchPodcastData(params.id as string);
    }
  }, [params.id]);

  const fetchPodcastData = async (id: string) => {
    try {
      const response = await fetch(`/api/podcasts/${id}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching podcast data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  const handleSeekTo = (time: number) => {
    setCurrentTime(time);
  };

  const handleExplanationRequest = async (startTime: number, endTime: number) => {
    if (!data) return;

    try {
      const response = await fetch(`/api/podcasts/${data.podcast.id}/explain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startTime, endTime }),
      });

      const result = await response.json();

      if (response.ok) {
        // Refresh the data to include the new explanation
        fetchPodcastData(params.id as string);
        return result.explanation;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error getting explanation:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading podcast...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Podcast not found</h1>
          <p className="text-gray-600">The requested podcast could not be loaded.</p>
        </div>
      </div>
    );
  }

  const languageFlag = data.podcast.language === 'spanish' ? '🇪🇸' : '🇷🇺';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation onUploadClick={() => setShowUploadModal(true)} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <span className="text-2xl">{languageFlag}</span>
            <h1 className="text-3xl font-bold text-gray-900">{data.podcast.title}</h1>
          </div>

          {/* Audio Player */}
          <AudioPlayer
            podcastId={data.podcast.id}
            audioSrc={`/api/audio/${data.podcast.filename}`}
            transcript={data.transcript}
            onTimeUpdate={handleTimeUpdate}
            onSeekTo={handleSeekTo}
            onExplanationRequest={handleExplanationRequest}
          />
        </div>

        {/* Content Tabs */}
        <div className="bg-white rounded-xl shadow-lg">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setSelectedTab('lesson')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  selectedTab === 'lesson'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Lesson Plan
              </button>
              <button
                onClick={() => setSelectedTab('transcript')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  selectedTab === 'transcript'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Interactive Transcript
              </button>
              <button
                onClick={() => setSelectedTab('tutor')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  selectedTab === 'tutor'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span>AI Tutor</span>
                </div>
              </button>
            </nav>
          </div>

          <div className="p-6">
            {selectedTab === 'lesson' && data.lesson && (
              <LessonPlan lesson={data.lesson} language={data.podcast.language} />
            )}

            {selectedTab === 'transcript' && (
              <TranscriptView
                transcript={data.transcript}
                currentTime={currentTime}
                onSeekTo={handleSeekTo}
                onExplanationRequest={handleExplanationRequest}
                explanations={data.explanations}
              />
            )}

            {selectedTab === 'tutor' && (
              <PodcastTutor
                podcastId={data.podcast.id}
                podcastTitle={data.podcast.title}
                language={data.podcast.language}
              />
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadSuccess={() => {/* Could refresh or redirect */}}
      />
    </div>
  );
}
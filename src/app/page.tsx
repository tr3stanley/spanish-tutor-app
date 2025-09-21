'use client';

import { useState, useEffect } from 'react';
import PodcastUpload from '@/components/PodcastUpload';
import PodcastList from '@/components/PodcastList';

interface Podcast {
  id: number;
  title: string;
  filename: string;
  language: string;
  created_at: string;
  processed_at?: string;
  lesson_generated: boolean;
  has_lesson: boolean;
}

export default function Home() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPodcasts = async () => {
    try {
      const response = await fetch('/api/podcasts');
      const data = await response.json();
      setPodcasts(data.podcasts);
    } catch (error) {
      console.error('Error fetching podcasts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPodcasts();
  }, []);

  const handleUploadSuccess = () => {
    fetchPodcasts();
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Spanish & Russian Podcast Tutor
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your podcasts and get AI-generated lesson plans with grammar explanations,
            vocabulary lists, and real-time segment analysis.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              Upload New Podcast
            </h2>
            <PodcastUpload onUploadSuccess={handleUploadSuccess} />
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              Your Podcasts
            </h2>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading podcasts...</p>
              </div>
            ) : (
              <PodcastList podcasts={podcasts} onPodcastDeleted={fetchPodcasts} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

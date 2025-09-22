'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import FolderPodcastList from '@/components/FolderPodcastList';
import UploadModal from '@/components/UploadModal';
import DownloadManager from '@/components/DownloadManager';
import { offlineCleanup } from '@/lib/offline-cleanup';

interface Podcast {
  id: number;
  title: string;
  filename: string;
  language: string;
  created_at: string;
  processed_at?: string;
  lesson_generated: boolean;
  has_lesson: boolean;
  folder_id?: number;
  folder_name?: string;
  listened?: boolean;
}

export default function Home() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDownloadManager, setShowDownloadManager] = useState(false);

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
    // Initialize offline cleanup service
    offlineCleanup.init();
  }, []);

  const handleUploadSuccess = () => {
    fetchPodcasts();
  };

  // Statistics
  const totalPodcasts = podcasts.length;
  const readyPodcasts = podcasts.filter(p => p.lesson_generated && p.has_lesson).length;
  const spanishPodcasts = podcasts.filter(p => p.language === 'spanish').length;
  const russianPodcasts = podcasts.filter(p => p.language === 'russian').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation onUploadClick={() => setShowUploadModal(true)} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Your Language Learning Library
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            AI-powered Spanish and Russian podcast lessons with interactive transcripts,
            grammar explanations, and personalized tutoring.
          </p>
        </div>

        {/* Statistics Cards */}
        {totalPodcasts > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-gray-900">{totalPodcasts}</div>
              <div className="text-sm text-gray-600">Total Episodes</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="text-2xl font-bold text-green-600">{readyPodcasts}</div>
              <div className="text-sm text-gray-600">Ready to Study</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-gray-900">{spanishPodcasts}</span>
                <span className="text-lg">🇪🇸</span>
              </div>
              <div className="text-sm text-gray-600">Spanish</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-gray-900">{russianPodcasts}</span>
                <span className="text-lg">🇷🇺</span>
              </div>
              <div className="text-sm text-gray-600">Russian</div>
            </div>
          </div>
        )}

        {/* Download Manager Section */}
        {totalPodcasts > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Offline Downloads
              </h2>
              <button
                onClick={() => setShowDownloadManager(!showDownloadManager)}
                className="flex items-center px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                {showDownloadManager ? 'Hide Downloads' : 'Manage Downloads'}
              </button>
            </div>
            {showDownloadManager && <DownloadManager />}
          </div>
        )}

        {/* Main Content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Podcast Library
              </h2>
              {totalPodcasts > 0 && (
                <div className="text-sm text-gray-500">
                  Organized in folders • Click to expand
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-500">Loading your podcasts...</p>
              </div>
            ) : (
              <FolderPodcastList
                podcasts={podcasts}
                onPodcastDeleted={fetchPodcasts}
              />
            )}
          </div>
        </div>

        {/* Quick Tips */}
        {totalPodcasts === 0 && !loading && (
          <div className="mt-8 bg-blue-50 rounded-lg p-6">
            <h3 className="text-lg font-medium text-blue-900 mb-3">Getting Started</h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
                <div>
                  <div className="font-medium text-blue-900">Upload Audio</div>
                  <div className="text-blue-700">Click &quot;Upload Podcast&quot; to add Spanish or Russian audio files</div>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
                <div>
                  <div className="font-medium text-blue-900">AI Processing</div>
                  <div className="text-blue-700">Local Whisper transcribes and AI generates lesson plans</div>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</div>
                <div>
                  <div className="font-medium text-blue-900">Learn & Practice</div>
                  <div className="text-blue-700">Study with interactive transcripts and AI tutor</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadSuccess={handleUploadSuccess}
      />
    </div>
  );
}
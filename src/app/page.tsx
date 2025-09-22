'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import FolderPodcastList from '@/components/FolderPodcastList';
import UploadModal from '@/components/UploadModal';
import DownloadManager from '@/components/DownloadManager';
import GlassCard from '@/components/GlassCard';
import CosmicBackground from '@/components/CosmicBackground';
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
    <div className="min-h-screen cosmic-container">
      <CosmicBackground />
      <div className="relative z-10">
        <Navigation onUploadClick={() => setShowUploadModal(true)} />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Podcast Tutor
          </h1>
        </div>

        {/* Statistics Cards */}
        {totalPodcasts > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <GlassCard className="p-4">
              <div className="text-2xl font-bold text-white">{totalPodcasts}</div>
              <div className="text-sm text-gray-300">Total Episodes</div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="text-2xl font-bold text-green-400">{readyPodcasts}</div>
              <div className="text-sm text-gray-300">Ready to Study</div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-white">{spanishPodcasts}</span>
                <span className="text-lg">🇪🇸</span>
              </div>
              <div className="text-sm text-gray-300">Spanish</div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-white">{russianPodcasts}</span>
                <span className="text-lg">🇷🇺</span>
              </div>
              <div className="text-sm text-gray-300">Russian</div>
            </GlassCard>
          </div>
        )}

        {/* Download Manager Section */}
        {totalPodcasts > 0 && (
          <div className="mb-8">
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Offline Downloads
                </h2>
                <button
                  onClick={() => setShowDownloadManager(!showDownloadManager)}
                  className="cosmic-button flex items-center px-4 py-2 text-sm rounded-lg transition-all"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  {showDownloadManager ? 'Hide Downloads' : 'Manage Downloads'}
                </button>
              </div>
              {showDownloadManager && <DownloadManager />}
            </GlassCard>
          </div>
        )}

        {/* Main Content */}
        <GlassCard className="mb-8">
          <div className="p-6 border-b border-white/20">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                Podcast Library
              </h2>
              {totalPodcasts > 0 && (
                <div className="text-sm text-gray-300">
                  Organized in folders • Click to expand
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto mb-4"></div>
                <p className="text-gray-300">Loading your podcasts...</p>
              </div>
            ) : (
              <FolderPodcastList
                podcasts={podcasts}
                onPodcastDeleted={fetchPodcasts}
              />
            )}
          </div>
        </GlassCard>

        {/* Quick Tips */}
        {totalPodcasts === 0 && !loading && (
          <GlassCard className="p-6">
            <h3 className="text-lg font-medium text-white mb-3">Getting Started</h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-gradient-to-r from-purple-400 to-blue-400 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
                <div>
                  <div className="font-medium text-white">Upload Audio</div>
                  <div className="text-gray-300">Click &quot;Upload Podcast&quot; to add Spanish or Russian audio files</div>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-gradient-to-r from-purple-400 to-blue-400 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
                <div>
                  <div className="font-medium text-white">AI Processing</div>
                  <div className="text-gray-300">Local Whisper transcribes and AI generates lesson plans</div>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-gradient-to-r from-purple-400 to-blue-400 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</div>
                <div>
                  <div className="font-medium text-white">Learn & Practice</div>
                  <div className="text-gray-300">Study with interactive transcripts and AI tutor</div>
                </div>
              </div>
            </div>
          </GlassCard>
        )}
        </main>
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadSuccess={handleUploadSuccess}
      />
    </div>
  );
}
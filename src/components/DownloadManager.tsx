'use client';

import { useState, useEffect } from 'react';
import { offlineStorage, formatFileSize } from '@/lib/offline-storage';
import ScrollingTitle from './ScrollingTitle';

interface DownloadedEpisode {
  id: number;
  title: string;
  downloadedAt: number;
  fileSize: number;
}

interface StorageInfo {
  used: number;
  total: number;
  available: number;
}

export default function DownloadManager() {
  const [downloads, setDownloads] = useState<DownloadedEpisode[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadDownloads();
  }, []);

  const loadDownloads = async () => {
    try {
      setIsLoading(true);
      const [episodes, quota] = await Promise.all([
        offlineStorage.getDownloadedEpisodes(),
        offlineStorage.getStorageQuota()
      ]);

      setDownloads(episodes.sort((a, b) => b.downloadedAt - a.downloadedAt));
      setStorageInfo(quota);
    } catch (error) {
      console.error('Failed to load downloads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const removeDownload = async (episodeId: number) => {
    try {
      await offlineStorage.removeEpisode(episodeId);
      await loadDownloads();
    } catch (error) {
      console.error('Failed to remove download:', error);
    }
  };

  const clearAllDownloads = async () => {
    if (confirm('Remove all downloaded episodes? This cannot be undone.')) {
      try {
        await offlineStorage.clearAllDownloads();
        await loadDownloads();
      } catch (error) {
        console.error('Failed to clear downloads:', error);
      }
    }
  };

  const cleanupOld = async () => {
    try {
      await offlineStorage.cleanupOldEpisodes();
      await loadDownloads();
    } catch (error) {
      console.error('Failed to cleanup downloads:', error);
    }
  };

  const totalDownloadSize = downloads.reduce((sum, ep) => sum + ep.fileSize, 0);

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 glass-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Downloaded Episodes</h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-purple-300 hover:text-purple-100 text-sm transition-colors"
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      {/* Storage Summary */}
      <div className="mb-4 p-3 bg-white/5 rounded border border-white/10">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-300">
            {downloads.length} episodes • {formatFileSize(totalDownloadSize)}
          </span>
          {storageInfo && (
            <span className="text-xs text-gray-400">
              {formatFileSize(storageInfo.available)} available
            </span>
          )}
        </div>

        {storageInfo && storageInfo.total > 0 && (
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-purple-400 to-blue-400 h-2 rounded-full"
              style={{ width: `${(storageInfo.used / storageInfo.total) * 100}%` }}
            ></div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {downloads.length > 0 && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={cleanupOld}
            className="px-3 py-1 bg-yellow-400/20 text-yellow-300 rounded text-sm hover:bg-yellow-400/30 transition-all"
          >
            Cleanup Old
          </button>
          <button
            onClick={clearAllDownloads}
            className="px-3 py-1 bg-red-400/20 text-red-300 rounded text-sm hover:bg-red-400/30 transition-all"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Downloaded Episodes List */}
      {downloads.length === 0 ? (
        <p className="text-gray-400 text-center py-8">
          No episodes downloaded yet.<br />
          <span className="text-sm">Download episodes for offline listening when you have good internet.</span>
        </p>
      ) : (
        <div className="space-y-2">
          {downloads.map((episode) => (
            <div
              key={episode.id}
              className="flex items-center justify-between p-3 border border-white/10 rounded hover:bg-white/5 transition-all"
            >
              <div className="flex-1 min-w-0">
                <ScrollingTitle
                  text={episode.title}
                  className="font-medium text-sm text-white"
                  speed={25}
                  pauseDuration={800}
                />
                {showDetails && (
                  <div className="text-xs text-gray-400 mt-1">
                    Downloaded: {new Date(episode.downloadedAt).toLocaleDateString()}
                    {' • '}
                    Size: {formatFileSize(episode.fileSize)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 ml-2">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-400/20 text-green-300">
                  Offline
                </span>
                <button
                  onClick={() => removeDownload(episode.id)}
                  className="text-red-400 hover:text-red-300 text-sm p-1 transition-colors"
                  title="Remove download"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Storage Tips */}
      {showDetails && (
        <div className="mt-4 p-3 bg-blue-400/10 rounded text-sm text-blue-300 border border-blue-400/20">
          <strong>Storage Tips:</strong>
          <ul className="mt-1 space-y-1 text-xs">
            <li>• Episodes auto-delete after 30 days</li>
            <li>• Listened episodes auto-delete after 24 hours</li>
            <li>• Download episodes when you have good WiFi</li>
            <li>• Each episode is typically 20-50MB</li>
          </ul>
        </div>
      )}
    </div>
  );
}
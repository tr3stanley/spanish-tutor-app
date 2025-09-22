'use client';

import { useState, useEffect } from 'react';
import { offlineStorage, formatFileSize } from '@/lib/offline-storage';

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
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Downloaded Episodes</h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      {/* Storage Summary */}
      <div className="mb-4 p-3 bg-gray-50 rounded">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">
            {downloads.length} episodes • {formatFileSize(totalDownloadSize)}
          </span>
          {storageInfo && (
            <span className="text-xs text-gray-500">
              {formatFileSize(storageInfo.available)} available
            </span>
          )}
        </div>

        {storageInfo && storageInfo.total > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full"
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
            className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm hover:bg-yellow-200"
          >
            Cleanup Old
          </button>
          <button
            onClick={clearAllDownloads}
            className="px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Downloaded Episodes List */}
      {downloads.length === 0 ? (
        <p className="text-gray-500 text-center py-8">
          No episodes downloaded yet.<br />
          <span className="text-sm">Download episodes for offline listening when you have good internet.</span>
        </p>
      ) : (
        <div className="space-y-2">
          {downloads.map((episode) => (
            <div
              key={episode.id}
              className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
            >
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm truncate">{episode.title}</h4>
                {showDetails && (
                  <div className="text-xs text-gray-500 mt-1">
                    Downloaded: {new Date(episode.downloadedAt).toLocaleDateString()}
                    {' • '}
                    Size: {formatFileSize(episode.fileSize)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 ml-2">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                  Offline
                </span>
                <button
                  onClick={() => removeDownload(episode.id)}
                  className="text-red-600 hover:text-red-800 text-sm p-1"
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
        <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-800">
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
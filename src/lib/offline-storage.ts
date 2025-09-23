interface OfflineEpisode {
  id: number;
  title: string;
  audioData: ArrayBuffer;
  downloadedAt: number;
  lastAccessed: number;
  fileSize: number;
}

interface StorageQuota {
  used: number;
  total: number;
  available: number;
}

const DB_NAME = 'spanish-tutor-offline';
const DB_VERSION = 1;
const STORE_NAME = 'episodes';
const MAX_STORAGE_MB = 500;
const AUTO_CLEANUP_DAYS = 30;
const LISTENED_CLEANUP_HOURS = 24;

class OfflineStorageManager {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('downloadedAt', 'downloadedAt');
          store.createIndex('lastAccessed', 'lastAccessed');
        }
      };
    });
  }

  async downloadEpisode(
    podcastId: number,
    title: string,
    audioUrl: string,
    onProgress?: (progress: number) => void
  ): Promise<boolean> {
    try {
      if (!this.db) await this.init();

      // Check if already downloaded
      if (await this.isEpisodeDownloaded(podcastId)) {
        return true;
      }

      // Check storage space
      const quota = await this.getStorageQuota();
      if (quota.available < 50 * 1024 * 1024) { // Require 50MB free
        await this.cleanupOldEpisodes();
      }

      // Download audio data using proxy for GitHub URLs to avoid CORS issues
      const shouldUseProxy = audioUrl.includes('github.com') || audioUrl.includes('githubusercontent.com');
      const fetchUrl = shouldUseProxy
        ? `/api/audio-proxy-edge?url=${encodeURIComponent(audioUrl)}&t=${Date.now()}`
        : audioUrl;

      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      const reader = response.body?.getReader();

      if (!reader) throw new Error('Cannot read response body');

      const chunks: Uint8Array[] = [];
      let receivedLength = 0;
      let progressReported = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        if (onProgress) {
          if (contentLength > 0) {
            // Normal progress tracking with known content length
            onProgress((receivedLength / contentLength) * 100);
            progressReported = true;
          } else {
            // For requests without content-length, show estimated progress
            // Update progress based on received data (estimate for typical podcast files)
            const estimatedProgress = Math.min(95, (receivedLength / (8 * 1024 * 1024)) * 100); // Assume ~8MB files
            onProgress(Math.max(5, estimatedProgress)); // Always show at least 5% progress
          }
        }
      }

      // Ensure we show 100% when download is complete
      if (onProgress && !progressReported) {
        onProgress(100);
      }

      // Combine chunks into ArrayBuffer
      const audioData = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        audioData.set(chunk, position);
        position += chunk.length;
      }

      // Store in IndexedDB
      const episode: OfflineEpisode = {
        id: podcastId,
        title,
        audioData: audioData.buffer,
        downloadedAt: Date.now(),
        lastAccessed: Date.now(),
        fileSize: receivedLength
      };

      await this.storeEpisode(episode);
      return true;

    } catch (error) {
      console.error('Failed to download episode:', error);
      return false;
    }
  }

  async getOfflineAudioUrl(podcastId: number): Promise<string | null> {
    try {
      if (!this.db) await this.init();

      const episode = await this.getEpisode(podcastId);
      if (!episode) return null;

      // Update last accessed time
      episode.lastAccessed = Date.now();
      await this.storeEpisode(episode);

      // Create blob URL from stored data
      const blob = new Blob([episode.audioData], { type: 'audio/mpeg' });
      return URL.createObjectURL(blob);

    } catch (error) {
      console.error('Failed to get offline audio:', error);
      return null;
    }
  }

  async isEpisodeDownloaded(podcastId: number): Promise<boolean> {
    if (!this.db) await this.init();
    const episode = await this.getEpisode(podcastId);
    return episode !== null;
  }

  async removeEpisode(podcastId: number): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(podcastId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getDownloadedEpisodes(): Promise<Array<{id: number, title: string, downloadedAt: number, fileSize: number}>> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const episodes = request.result.map((ep: OfflineEpisode) => ({
          id: ep.id,
          title: ep.title,
          downloadedAt: ep.downloadedAt,
          fileSize: ep.fileSize
        }));
        resolve(episodes);
      };
    });
  }

  async getStorageQuota(): Promise<StorageQuota> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const total = estimate.quota || 0;
        return {
          used,
          total,
          available: total - used
        };
      }
    } catch (error) {
      console.warn('Cannot estimate storage:', error);
    }

    return { used: 0, total: 0, available: Infinity };
  }

  async cleanupOldEpisodes(): Promise<void> {
    if (!this.db) return;

    const episodes = await this.getDownloadedEpisodes();
    const now = Date.now();
    const cleanupThreshold = now - (AUTO_CLEANUP_DAYS * 24 * 60 * 60 * 1000);

    for (const episode of episodes) {
      if (episode.downloadedAt < cleanupThreshold) {
        await this.removeEpisode(episode.id);
      }
    }
  }

  async cleanupListenedEpisodes(listenedPodcastIds: number[]): Promise<void> {
    const now = Date.now();
    const cleanupThreshold = now - (LISTENED_CLEANUP_HOURS * 60 * 60 * 1000);

    for (const podcastId of listenedPodcastIds) {
      const episode = await this.getEpisode(podcastId);
      if (episode && episode.downloadedAt < cleanupThreshold) {
        await this.removeEpisode(podcastId);
      }
    }
  }

  async clearAllDownloads(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async getEpisode(podcastId: number): Promise<OfflineEpisode | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(podcastId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  private async storeEpisode(episode: OfflineEpisode): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(episode);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export const offlineStorage = new OfflineStorageManager();

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
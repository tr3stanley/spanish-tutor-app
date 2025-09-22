import { offlineStorage } from './offline-storage';

class OfflineCleanupService {
  private static instance: OfflineCleanupService;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  static getInstance(): OfflineCleanupService {
    if (!OfflineCleanupService.instance) {
      OfflineCleanupService.instance = new OfflineCleanupService();
    }
    return OfflineCleanupService.instance;
  }

  init() {
    if (this.isInitialized || typeof window === 'undefined') return;

    this.isInitialized = true;
    this.startPeriodicCleanup();
    this.setupPageVisibilityCleanup();
  }

  private startPeriodicCleanup() {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, 60 * 60 * 1000);

    // Run initial cleanup after 10 seconds
    setTimeout(() => {
      this.runCleanup();
    }, 10000);
  }

  private setupPageVisibilityCleanup() {
    // Run cleanup when page becomes visible (user returns to tab)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.runCleanup();
      }
    });

    // Run cleanup on page load
    window.addEventListener('load', () => {
      setTimeout(() => this.runCleanup(), 5000);
    });
  }

  async runCleanup(): Promise<void> {
    try {
      console.log('🧹 Running offline storage cleanup...');

      // Get all podcasts to find listened ones
      const podcastsResponse = await fetch('/api/podcasts');
      if (!podcastsResponse.ok) return;

      const data = await podcastsResponse.json();
      const listenedPodcastIds = data.podcasts
        .filter((p: any) => p.listened)
        .map((p: any) => p.id);

      if (listenedPodcastIds.length > 0) {
        console.log(`🧹 Found ${listenedPodcastIds.length} listened episodes, checking for cleanup...`);
        await offlineStorage.cleanupListenedEpisodes(listenedPodcastIds);
      }

      // Also run general cleanup for old episodes
      await offlineStorage.cleanupOldEpisodes();

      console.log('✅ Offline storage cleanup completed');
    } catch (error) {
      console.error('❌ Offline storage cleanup failed:', error);
    }
  }

  async markEpisodeAsListened(podcastId: number): Promise<void> {
    try {
      // Mark in database first
      const response = await fetch(`/api/podcasts/${podcastId}/mark-listened`, {
        method: 'POST'
      });

      if (response.ok) {
        console.log(`📝 Marked episode ${podcastId} as listened`);

        // Schedule cleanup for this specific episode (delayed)
        setTimeout(async () => {
          console.log(`🧹 Auto-removing downloaded episode ${podcastId} after listening...`);
          try {
            await offlineStorage.removeEpisode(podcastId);
            console.log(`✅ Successfully removed episode ${podcastId} from offline storage`);
          } catch (error) {
            console.error(`❌ Failed to remove episode ${podcastId}:`, error);
          }
        }, 24 * 60 * 60 * 1000); // 24 hours delay

      }
    } catch (error) {
      console.error('Failed to mark episode as listened:', error);
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isInitialized = false;
  }
}

export const offlineCleanup = OfflineCleanupService.getInstance();
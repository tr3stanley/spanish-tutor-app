import { NextRequest, NextResponse } from 'next/server';

interface ArchiveFile {
  name: string;
  title?: string;
  format: string;
  size: string;
  source?: string;
}

interface ArchiveMetadata {
  identifier: string;
  title: string;
  description: string;
  files: ArchiveFile[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
    }

    // Extract identifier from various Archive.org URL formats
    let identifier: string | null = null;

    if (url.includes('archive.org/details/')) {
      identifier = url.split('/details/')[1]?.split('/')[0];
    } else if (url.includes('archive.org/download/')) {
      identifier = url.split('/download/')[1]?.split('/')[0];
    }

    if (!identifier) {
      return NextResponse.json({ error: 'Invalid Archive.org URL format' }, { status: 400 });
    }

    // Fetch metadata from Archive.org
    const metadataUrl = `https://archive.org/metadata/${identifier}`;
    const metadataResponse = await fetch(metadataUrl);

    if (!metadataResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch metadata from Archive.org' }, { status: 500 });
    }

    const metadata = await metadataResponse.json();

    // Extract audio files
    const audioFiles = metadata.files.filter((file: any) =>
      file.format === 'VBR MP3' ||
      file.format === 'MP3' ||
      file.format === '128Kbps MP3' ||
      file.format === 'Flac' ||
      file.name?.toLowerCase().endsWith('.mp3') ||
      file.name?.toLowerCase().endsWith('.wav') ||
      file.name?.toLowerCase().endsWith('.m4a') ||
      file.name?.toLowerCase().endsWith('.flac')
    );

    const result: ArchiveMetadata = {
      identifier,
      title: metadata.metadata?.title || identifier,
      description: metadata.metadata?.description || '',
      files: audioFiles.map((file: any) => ({
        name: file.name,
        title: file.title || file.name.replace(/\.[^/.]+$/, ''),
        format: file.format,
        size: file.size,
        source: file.source
      }))
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('Archive metadata error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch archive metadata' },
      { status: 500 }
    );
  }
}
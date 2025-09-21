import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const audioUrl = searchParams.get('url');

    if (!audioUrl) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    // Only allow GitHub release URLs for security
    if (!audioUrl.includes('github.com') && !audioUrl.includes('githubusercontent.com')) {
      return NextResponse.json({ error: 'Only GitHub release URLs are allowed' }, { status: 403 });
    }

    console.log('Audio proxy: Fetching', audioUrl);

    // Handle range requests for large audio files
    const range = request.headers.get('range');
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Spanish Tutor App Audio Proxy',
    };

    if (range) {
      fetchHeaders['Range'] = range;
    }

    // Fetch the audio file from GitHub releases
    const response = await fetch(audioUrl, {
      headers: fetchHeaders,
    });

    if (!response.ok) {
      console.error('Audio proxy: Failed to fetch', response.status, response.statusText);

      // Special handling for 404 - provide more helpful error message
      if (response.status === 404) {
        return NextResponse.json({
          error: `Audio file not found. URL may be outdated or incorrect: ${audioUrl}`
        }, { status: 404 });
      }

      return NextResponse.json({
        error: `Failed to fetch audio: ${response.status} ${response.statusText}`
      }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const contentLength = response.headers.get('content-length');
    const acceptRanges = response.headers.get('accept-ranges');
    const contentRange = response.headers.get('content-range');

    console.log('Audio proxy: Streaming response', {
      contentType,
      contentLength,
      hasRange: !!range,
      status: response.status
    });

    // Stream the response instead of loading everything into memory
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin',
      'Cache-Control': 'public, max-age=3600',
    };

    if (contentLength) headers['Content-Length'] = contentLength;
    if (acceptRanges) headers['Accept-Ranges'] = acceptRanges;
    if (contentRange) headers['Content-Range'] = contentRange;

    // Return streaming response
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });

  } catch (error) {
    console.error('Audio proxy error:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Range',
    },
  });
}
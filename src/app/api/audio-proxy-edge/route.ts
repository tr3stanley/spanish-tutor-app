export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const audioUrl = searchParams.get('url');

    if (!audioUrl) {
      return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Only allow GitHub release URLs for security
    if (!audioUrl.includes('github.com') && !audioUrl.includes('githubusercontent.com')) {
      return new Response(JSON.stringify({ error: 'Only GitHub release URLs are allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Edge proxy: Fetching', audioUrl);

    // Handle range requests for progressive loading
    const range = request.headers.get('range');
    const fetchHeaders: HeadersInit = {
      'User-Agent': 'Spanish Tutor App Edge Proxy',
    };

    if (range) {
      fetchHeaders['Range'] = range;
    }

    // Fetch the audio file from GitHub releases
    const response = await fetch(audioUrl, {
      headers: fetchHeaders,
    });

    if (!response.ok) {
      console.error('Edge proxy: Failed to fetch', response.status, response.statusText);
      return new Response(JSON.stringify({
        error: `Failed to fetch audio: ${response.status} ${response.statusText}`
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Safari-compatible headers
    const headers = new Headers({
      'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Range',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });

    // Forward relevant headers
    const forwardHeaders = ['content-length', 'accept-ranges', 'content-range'];
    forwardHeaders.forEach(header => {
      const value = response.headers.get(header);
      if (value) headers.set(header, value);
    });

    console.log('Edge proxy: Streaming response', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      hasRange: !!range
    });

    // Stream the response directly
    return new Response(response.body, {
      status: response.status,
      headers,
    });

  } catch (error) {
    console.error('Edge proxy error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Range',
    },
  });
}
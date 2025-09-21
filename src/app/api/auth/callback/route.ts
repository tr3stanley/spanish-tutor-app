import { NextRequest, NextResponse } from 'next/server';
import { setCredentials } from '@/lib/youtube';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');

    if (!code) {
      // Return HTML page with error
      return new NextResponse(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ error: 'Authorization code not provided' }, '*');
                window.close();
              }
            </script>
            <p>Authorization failed. Please close this window and try again.</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    const tokens = await setCredentials(code);

    // Return HTML page that posts message to parent window
    return new NextResponse(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                success: true,
                access_token: '${tokens.access_token}',
                refresh_token: '${tokens.refresh_token || ''}'
              }, '*');
              window.close();
            }
          </script>
          <p>Authorization successful! This window will close automatically.</p>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    console.error('Error handling OAuth callback:', error);

    return new NextResponse(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ error: 'Failed to complete authorization' }, '*');
              window.close();
            }
          </script>
          <p>Authorization failed. Please close this window and try again.</p>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}
#!/usr/bin/env python3
"""
Static-only local server for KĀRA (offline play vs computer).
For online play, accounts and ratings use:  npm run dev
Usage: python server.py [port]
"""

import sys
import http.server
import socketserver
import os
import functools

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# Windows consoles/pipes may not be UTF-8; don't crash on the emoji banner.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except AttributeError:
    pass

class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows can map .js to text/plain via the registry, which breaks ES
    # modules and Web Workers. Pin the types the app relies on.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.woff2': 'font/woff2',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

def main():
    handler = functools.partial(Handler, directory=PUBLIC_DIR)
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"=======================================================")
        print(f"  🌅 KĀRA: Towers of Dawn & Eclipse")
        print(f"  Local server running at: {url}")
        print(f"  Press Ctrl+C to stop the server")
        print(f"=======================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server. Goodbye!")

if __name__ == "__main__":
    main()

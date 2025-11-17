#!/usr/bin/env python3
"""
HEAT.NET Simple Static File Server
Serves the HEAT.NET archive on http://localhost:8000
"""

import http.server
import socketserver
import os

PORT = 8000

class HEATHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler with proper MIME types and directory serving"""

    def end_headers(self):
        # Add headers for better compatibility
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        # Custom logging format
        print(f"[HEAT.NET] {args[0]} - {args[1]}")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with socketserver.TCPServer(("", PORT), HEATHandler) as httpd:
        print("=" * 60)
        print("🎮 HEAT.NET - The Home of Online Gaming")
        print("=" * 60)
        print(f"Server running at: http://localhost:{PORT}")
        print("\nAvailable pages:")
        print(f"  → Main Homepage:    http://localhost:{PORT}/index.html")
        print(f"  → HEAT.NET Portal:  http://localhost:{PORT}/HEAT.NET.html")
        print(f"  → HEAT2 Version:    http://localhost:{PORT}/HEAT2.html")
        print(f"  → 10Six Channel:    http://localhost:{PORT}/10Six.htm")
        print(f"  → Store:            http://localhost:{PORT}/HEAT.NET%20__%20STORE.html")
        print(f"  → Retired Trophies: http://localhost:{PORT}/HEAT%20__%20Retired%20HEAT%20Trophies.html")
        print("\nPress Ctrl+C to stop the server")
        print("=" * 60)

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nShutting down HEAT.NET server...")
            print("Thanks for visiting! 🎮")

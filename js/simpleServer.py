import http.server
import socketserver

PORT = 8000

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        '': 'application/octet-stream',
        '.manifest': 'text/cache-manifest',
        '.html': 'text/html',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.svg': 'image/svg+xml',
        '.css': 'text/css',
        '.js': 'application/x-javascript',
        '.wasm': 'application/wasm',
        '.json': 'application/json',
        '.xml': 'application/xml',
    }

    def end_headers(self):
        # Set CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')  # Replace '*' with your desired origin(s)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Origin, Accept, Content-Type, X-Requested-With, X-CSRF-Token')

        # Call the original end_headers() method
        super().end_headers()

httpd = socketserver.TCPServer(("localhost", PORT), CORSRequestHandler)

try:
    print(f"Server listening on http://localhost:{PORT}")
    httpd.serve_forever()
except KeyboardInterrupt:
    print("Server is shutting down...")
    httpd.server_close()

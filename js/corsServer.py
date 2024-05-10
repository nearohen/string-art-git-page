from http.server import SimpleHTTPRequestHandler
import socketserver

class CustomHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header("Cross-Origin-Resource-Policy","same-site")
        super().end_headers()

if __name__ == "__main__":
    PORT = 8000
    handler = CustomHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print("Server started at localhost:{}".format(PORT))
        httpd.serve_forever()

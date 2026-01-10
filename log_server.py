#!/usr/bin/env python3
"""
Remote Log Server for Quest AR Debugging

Run this on your dev machine:
    python log_server.py

Then configure your AR app to send logs to:
    http://YOUR_COMPUTER_IP:8765

View logs at:
    http://localhost:8765
"""

import http.server
import json
import html
import logging
from datetime import datetime
from urllib.parse import urlparse, parse_qs
import socket

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

PORT = 8765
logs = []
MAX_LOGS = 500


def get_local_ip():
    """Get local IP address for display."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


class LogHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default logging
    
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()
    
    def do_POST(self):
        if self.path == '/log':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            
            try:
                data = json.loads(body)
                entry = {
                    'timestamp': data.get('timestamp', datetime.now().isoformat()),
                    'level': data.get('level', 'info'),
                    'message': data.get('message', str(data)),
                    'received': datetime.now().strftime('%H:%M:%S.%f')[:-3]
                }
                logs.append(entry)
                
                # Print to terminal with color
                level = entry['level'].upper()
                colors = {'ERROR': '\033[91m', 'WARN': '\033[93m', 'SUCCESS': '\033[92m', 'INFO': '\033[94m', 'DEBUG': '\033[90m'}
                reset = '\033[0m'
                color = colors.get(level, '')
                logger.info(f"{color}[{entry['received']}] [{level}] {entry['message']}{reset}")
                
                # Trim old logs
                while len(logs) > MAX_LOGS:
                    logs.pop(0)
                
            except json.JSONDecodeError:
                entry = {
                    'timestamp': datetime.now().isoformat(),
                    'level': 'info',
                    'message': body,
                    'received': datetime.now().strftime('%H:%M:%S.%f')[:-3]
                }
                logs.append(entry)
                logger.info(f"[{entry['received']}] {body}")
            
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_GET(self):
        parsed = urlparse(self.path)
        
        if parsed.path == '/logs.json':
            # Return logs as JSON (for programmatic access)
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(logs).encode())
        
        elif parsed.path == '/clear':
            logs.clear()
            self.send_response(200)
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(b'Logs cleared')
        
        elif parsed.path == '/raw':
            # Plain text logs for easy copy/paste
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            text = '\n'.join(f"[{e['received']}] [{e['level'].upper()}] {e['message']}" for e in logs)
            self.wfile.write(text.encode())
        
        else:
            # Serve the log viewer HTML
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(self.get_viewer_html().encode())
    
    def get_viewer_html(self):
        return '''<!DOCTYPE html>
<html>
<head>
    <title>Quest AR Debug Logs</title>
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            background: #1a1a2e; 
            color: #eee; 
            margin: 0; 
            padding: 20px;
        }
        h1 { margin: 0 0 10px; font-size: 18px; }
        .controls { margin-bottom: 10px; display: flex; gap: 10px; align-items: center; }
        button { 
            padding: 8px 16px; 
            background: #4a9eff; 
            border: none; 
            border-radius: 4px; 
            color: white; 
            cursor: pointer;
            font-size: 14px;
        }
        button:hover { background: #3a8eef; }
        button.danger { background: #ef4444; }
        #status { color: #888; font-size: 12px; }
        #logs {
            background: #0d0d1a;
            border-radius: 8px;
            padding: 10px;
            height: calc(100vh - 120px);
            overflow-y: auto;
            font-size: 12px;
            line-height: 1.4;
        }
        .log-entry { 
            padding: 4px 8px; 
            border-bottom: 1px solid #2a2a3e;
            word-break: break-all;
        }
        .log-entry:hover { background: #2a2a3e; }
        .timestamp { color: #666; margin-right: 8px; }
        .level { 
            display: inline-block; 
            width: 50px; 
            font-weight: bold;
            margin-right: 8px;
        }
        .level-error { color: #ef4444; }
        .level-warn { color: #f59e0b; }
        .level-success { color: #22c55e; }
        .level-info { color: #4a9eff; }
        .level-debug { color: #888; }
        .message { color: #ddd; }
        .copy-hint { font-size: 11px; color: #666; margin-left: auto; }
    </style>
</head>
<body>
    <h1>🔍 Quest AR Debug Logs</h1>
    <div class="controls">
        <button onclick="copyLogs()">📋 Copy All Logs</button>
        <button onclick="clearLogs()" class="danger">🗑️ Clear</button>
        <button onclick="downloadLogs()">💾 Download</button>
        <span id="status">Polling...</span>
        <span class="copy-hint">Tip: /raw endpoint gives plain text</span>
    </div>
    <div id="logs"></div>
    
    <script>
        let lastCount = 0;
        const logsDiv = document.getElementById('logs');
        const statusEl = document.getElementById('status');
        
        function escapeHtml(s) {
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        
        async function fetchLogs() {
            try {
                const resp = await fetch('/logs.json');
                const logs = await resp.json();
                
                if (logs.length !== lastCount) {
                    logsDiv.innerHTML = logs.map(e => `
                        <div class="log-entry">
                            <span class="timestamp">${e.received}</span>
                            <span class="level level-${e.level}">[${e.level.toUpperCase()}]</span>
                            <span class="message">${escapeHtml(e.message)}</span>
                        </div>
                    `).join('');
                    
                    // Auto-scroll if near bottom
                    if (logsDiv.scrollHeight - logsDiv.scrollTop < logsDiv.clientHeight + 100) {
                        logsDiv.scrollTop = logsDiv.scrollHeight;
                    }
                    lastCount = logs.length;
                }
                statusEl.textContent = `${logs.length} logs | Last update: ${new Date().toLocaleTimeString()}`;
            } catch (e) {
                statusEl.textContent = 'Error fetching logs: ' + e.message;
            }
        }
        
        async function copyLogs() {
            const resp = await fetch('/raw');
            const text = await resp.text();
            await navigator.clipboard.writeText(text);
            alert('Logs copied to clipboard!');
        }
        
        async function clearLogs() {
            await fetch('/clear');
            logsDiv.innerHTML = '';
            lastCount = 0;
        }
        
        async function downloadLogs() {
            const resp = await fetch('/raw');
            const text = await resp.text();
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quest-logs-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        }
        
        // Poll every 500ms
        fetchLogs();
        setInterval(fetchLogs, 500);
    </script>
</body>
</html>'''


def main():
    local_ip = get_local_ip()
    
    print("\n" + "="*60)
    print("  Quest AR Debug Log Server")
    print("="*60)
    print(f"\n  📺 View logs at:     http://localhost:{PORT}")
    print(f"  📋 Raw text logs:    http://localhost:{PORT}/raw")
    print(f"\n  📱 Quest should POST to: http://{local_ip}:{PORT}/log")
    print("\n  Press Ctrl+C to stop\n")
    print("="*60 + "\n")
    
    server = http.server.HTTPServer(('0.0.0.0', PORT), LogHandler)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == '__main__':
    main()

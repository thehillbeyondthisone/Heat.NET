#!/usr/bin/env node
/**
 * HEAT.NET Simple Static File Server
 * Serves the HEAT.NET archive on http://localhost:8000
 * No dependencies required - uses only Node.js built-in modules
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;

// MIME types for common file extensions
const mimeTypes = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.swf': 'application/x-shockwave-flash',
    '.mhtml': 'message/rfc822'
};

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - Page Not Found</h1><p>The requested page does not exist on HEAT.NET</p>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content, 'utf-8');
        }
    });

    // Simple logging
    console.log(`[HEAT.NET] ${req.method} ${req.url}`);
});

server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🎮 HEAT.NET - The Home of Online Gaming');
    console.log('='.repeat(60));
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log('\nAvailable pages:');
    console.log(`  → Main Homepage:    http://localhost:${PORT}/index.html`);
    console.log(`  → HEAT.NET Portal:  http://localhost:${PORT}/HEAT.NET.html`);
    console.log(`  → HEAT2 Version:    http://localhost:${PORT}/HEAT2.html`);
    console.log(`  → 10Six Channel:    http://localhost:${PORT}/10Six.htm`);
    console.log(`  → Store:            http://localhost:${PORT}/HEAT.NET%20__%20STORE.html`);
    console.log(`  → Retired Trophies: http://localhost:${PORT}/HEAT%20__%20Retired%20HEAT%20Trophies.html`);
    console.log('\nPress Ctrl+C to stop the server');
    console.log('='.repeat(60));
});

#!/usr/bin/env node
/**
 * HEAT.NET Trophy System API
 *
 * Simple Node.js API for serving trophy data
 * No external dependencies - uses only Node.js built-ins
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3001;
const DATA_PATH = path.join(__dirname, '../data/trophies.json');

// Load trophy data
let trophyData = {};
try {
    const rawData = fs.readFileSync(DATA_PATH, 'utf8');
    trophyData = JSON.parse(rawData);
    console.log(`✓ Loaded ${trophyData.stats.totalTrophies} trophies`);
} catch (error) {
    console.error('Error loading trophy data:', error.message);
    process.exit(1);
}

/**
 * Filter trophies by category and status
 */
function filterTrophies(trophies, category, status) {
    let filtered = trophies;

    if (category && category !== 'all') {
        filtered = filtered.filter(t => t.category === category);
    }

    if (status && status !== 'all') {
        filtered = filtered.filter(t => t.status === status);
    }

    return filtered;
}

/**
 * Search trophies by name or description
 */
function searchTrophies(trophies, query) {
    if (!query) return trophies;

    const lowerQuery = query.toLowerCase();
    return trophies.filter(t =>
        t.name.toLowerCase().includes(lowerQuery) ||
        t.description.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Handle API requests
 */
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS for CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Routes
    if (pathname === '/api/trophies' || pathname === '/api/trophies/') {
        // GET /api/trophies - Get all trophies with optional filtering
        const status = query.status || 'all';
        const category = query.category;
        const searchQuery = query.search;

        let allTrophies = [...trophyData.retired, ...trophyData.active];

        // Apply filters
        if (status !== 'all') {
            allTrophies = filterTrophies(allTrophies, category, status);
        } else if (category) {
            allTrophies = filterTrophies(allTrophies, category, null);
        }

        // Apply search
        if (searchQuery) {
            allTrophies = searchTrophies(allTrophies, searchQuery);
        }

        res.writeHead(200);
        res.end(JSON.stringify({
            trophies: allTrophies,
            count: allTrophies.length,
            filters: {
                status,
                category: category || 'all',
                search: searchQuery || null
            }
        }, null, 2));
    }
    else if (pathname === '/api/trophies/retired') {
        // GET /api/trophies/retired - Get retired trophies
        const category = query.category;
        const searchQuery = query.search;

        let retired = [...trophyData.retired];

        if (category) {
            retired = filterTrophies(retired, category, null);
        }

        if (searchQuery) {
            retired = searchTrophies(retired, searchQuery);
        }

        res.writeHead(200);
        res.end(JSON.stringify({
            trophies: retired,
            count: retired.length
        }, null, 2));
    }
    else if (pathname === '/api/trophies/active') {
        // GET /api/trophies/active - Get active trophies
        const category = query.category;
        const searchQuery = query.search;

        let active = [...trophyData.active];

        if (category) {
            active = filterTrophies(active, category, null);
        }

        if (searchQuery) {
            active = searchTrophies(active, searchQuery);
        }

        res.writeHead(200);
        res.end(JSON.stringify({
            trophies: active,
            count: active.length
        }, null, 2));
    }
    else if (pathname.match(/^\/api\/trophies\/([a-z0-9-]+)$/)) {
        // GET /api/trophies/:id - Get single trophy by ID
        const id = pathname.split('/').pop();
        const trophy = [...trophyData.retired, ...trophyData.active].find(t => t.id === id);

        if (trophy) {
            res.writeHead(200);
            res.end(JSON.stringify(trophy, null, 2));
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Trophy not found' }));
        }
    }
    else if (pathname === '/api/categories') {
        // GET /api/categories - Get all categories
        res.writeHead(200);
        res.end(JSON.stringify({
            categories: trophyData.categories,
            count: trophyData.categories.length
        }, null, 2));
    }
    else if (pathname === '/api/stats') {
        // GET /api/stats - Get trophy statistics
        res.writeHead(200);
        res.end(JSON.stringify(trophyData.stats, null, 2));
    }
    else {
        // 404 - Not Found
        res.writeHead(404);
        res.end(JSON.stringify({
            error: 'Not found',
            availableEndpoints: [
                'GET /api/trophies',
                'GET /api/trophies/retired',
                'GET /api/trophies/active',
                'GET /api/trophies/:id',
                'GET /api/categories',
                'GET /api/stats'
            ]
        }, null, 2));
    }
});

server.listen(PORT, () => {
    console.log('');
    console.log('🏆 HEAT.NET Trophy System API');
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log('');
    console.log('Available endpoints:');
    console.log(`  GET http://localhost:${PORT}/api/trophies`);
    console.log(`  GET http://localhost:${PORT}/api/trophies/retired`);
    console.log(`  GET http://localhost:${PORT}/api/trophies/active`);
    console.log(`  GET http://localhost:${PORT}/api/trophies/:id`);
    console.log(`  GET http://localhost:${PORT}/api/categories`);
    console.log(`  GET http://localhost:${PORT}/api/stats`);
    console.log('');
});

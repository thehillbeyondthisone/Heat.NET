# HEAT.NET

[![HEAT HOME — open the live website](site/images/10six/nav_frontpage.gif)](https://thehillbeyondthisone.github.io/Heat.NET/ "Open the live HEAT.NET website")

## Public restoration — October 8, 2026

Visit [the restored HEAT.NET website](https://thehillbeyondthisone.github.io/Heat.NET/). Fourteen portal pages share restored navigation and a responsive HEAT-era layout, alongside the preserved source archive.

This public release contains the website only. The native 10Six game, local Visitor service, accounts and saves remain in a separate private project. Historical 10SIX channel artwork is retained as website material.

Run `npm run build` to validate and assemble the public website. A push to `main` deploys through GitHub Pages. See [deployment scope and verification](docs/PUBLIC-DEPLOYMENT.md). The older roadmap below describes the original restoration baseline.

**The Home of Online Gaming - Restored**

A restoration project to bring the classic gaming portal HEAT.NET back to life, preserving the authentic late-90s/early-2000s aesthetic while adding modern functionality.

---

## 🎮 Project Overview

HEAT.NET was a pioneering online gaming portal from the late 1990s and early 2000s that hosted multiplayer games, tournaments, and a vibrant gaming community. This project aims to:

1. **Preserve** the original HEAT.NET archive from Internet Archive/Wayback Machine
2. **Restore** the site to a working, browsable state with authentic retro aesthetics
3. **Modernize** core features like the trophy system, user registration, and game channels
4. **Maintain** the nostalgic feel while ensuring compatibility with modern browsers

---

## 📊 Project Status

### Phase 1: Foundation & Stabilization ✅ **COMPLETED**

- [x] Organized directory structure created (`/site`, `/docs`)
- [x] Complete inventory and documentation of all assets
- [x] CSS files consolidated and cleaned (removed Wayback Machine artifacts)
- [x] JavaScript files extracted and cleaned
- [x] Key image assets organized and cataloged
- [x] Static file servers created (Python & Node.js)
- [x] Comprehensive project documentation

### Phase 2: Visual Authenticity 🔄 **IN PROGRESS**
- [x] Organized original files into archive directory
- [x] Created clean project structure
- [x] Created landing page for cleaned site
- [ ] Build complete clean HTML pages
- [ ] Convert Flash content to HTML5
- [ ] Test cross-browser compatibility

### Phase 3: Core Functional Features 📋 **PLANNED**
- [ ] **Trophy System** (database + display)
- [ ] User registration & profiles
- [ ] Game channel system
- [ ] Admin dashboard

---

## 🚀 Quick Start

### Option 1: Python Server (No Dependencies)

```bash
# From the project root directory
python3 server.py

# Or with direct execution
./server.py
```

### Option 2: Node.js Server (No Dependencies)

```bash
# From the project root directory
node server.js

# Or using npm
npm start

# Or with direct execution
./server.js
```

Both servers will start on **http://localhost:8000**

---

## 📁 Project Structure

```
Heat.NET/
├── index.html                   # Auto-redirects to /site
├── README.md                    # This file
├── server.py                    # Python static file server
├── server.js                    # Node.js static file server
├── package.json                 # npm configuration
│
├── site/                        # 🎨 Clean, active version
│   ├── index.html               # Main landing page
│   ├── css/
│   │   └── heat-style.css       # Consolidated HEAT.NET stylesheet
│   ├── js/
│   │   └── heat-nav.js          # Navigation and menu system
│   ├── images/
│   │   ├── logos/               # HEAT.NET logos (2 files)
│   │   ├── navigation/          # Nav buttons (16 files)
│   │   ├── ui/                  # UI elements (6 files)
│   │   ├── games/               # Game screenshots (6 files)
│   │   └── misc/                # Misc graphics (14 files)
│   ├── pages/                   # Additional pages (to be created)
│   └── assets/                  # Additional resources
│
├── docs/                        # 📚 Complete Documentation
│   ├── INVENTORY.md             # Full file inventory (384 files)
│   ├── CSS-ANALYSIS.md          # CSS breakdown and analysis
│   ├── JAVASCRIPT-ANALYSIS.md   # JavaScript documentation
│   ├── IMAGE-ASSETS.md          # Image catalog (573+ files)
│   └── PHASE-1-COMPLETE.md      # Phase 1 completion report
│
└── original_archive/            # 💾 Original Wayback Files (Preserved)
    ├── README.md                # Archive documentation
    ├── html_pages/              # Original HTML pages (10 files)
    │   ├── index.html, HEAT.NET.html, HEAT2.html
    │   ├── 10Six.htm, Footsoldiers.html
    │   ├── HEAT.NET __ STORE.html
    │   ├── HEAT __ Retired HEAT Trophies.html
    │   └── more/                # 1997 original archive
    ├── asset_directories/       # Original *_files directories (7 dirs, ~13 MB)
    │   ├── 10Six_files/, HEAT2_files/, HEAT.NET_files/
    │   ├── HEAT.NET __ STORE_files/, Footsoldiers_files/
    │   ├── HEAT __ Honor Trophies_files/
    │   └── HEAT __ Retired HEAT Trophies_files/
    └── root_images/             # Original root images (25 files + Flash)
```

---

## 🎯 Available Pages

Once the server is running, you can visit:

### Clean Version (Active Development)
| Page | URL | Description |
|------|-----|-------------|
| **Main Landing** | http://localhost:8000/ or /site/index.html | Clean landing page with project info |

### Original Archive (Reference)
| Page | URL | Description |
|------|-----|-------------|
| **Original Homepage** | http://localhost:8000/original_archive/html_pages/index.html | Original HEAT homepage |
| **HEAT.NET Portal** | http://localhost:8000/original_archive/html_pages/HEAT.NET.html | Full portal |
| **HEAT2 Version** | http://localhost:8000/original_archive/html_pages/HEAT2.html | Alternative homepage |
| **10Six Channel** | http://localhost:8000/original_archive/html_pages/10Six.htm | 10Six game channel |
| **Store** | http://localhost:8000/original_archive/html_pages/HEAT.NET%20__%20STORE.html | Store page |
| **Trophy Archive** | http://localhost:8000/original_archive/html_pages/HEAT%20__%20Retired%20HEAT%20Trophies.html | Trophies |

---

## 📖 Documentation

Comprehensive documentation is available in the `/docs` directory:

- **INVENTORY.md** - Complete inventory of all files, assets, and content
- **CSS-ANALYSIS.md** - Analysis of CSS files and styling organization
- **JAVASCRIPT-ANALYSIS.md** - JavaScript file breakdown and cleaning notes
- **IMAGE-ASSETS.md** - Image asset catalog and organization guide

---

## 🎨 Design & Technical Details

### Era
Late 1990s / Early 2000s web design (1997-2003 archived snapshots)

### Color Scheme
- Background: `#000000` (black)
- Links: `#FF0000` (red) / `#003399` (HEAT blue)
- Hover: `#990033` (HEAT red)

### Technologies
- **Current:** Static HTML, CSS, JavaScript
- **Future:** Node.js/Python backend, PostgreSQL database

---

## 📊 Content Inventory

### Game Channels (233+ games total)
- 10Six (1) | Action (82) | Role Playing (16) | Simulation (21) | Sports (41) | Strategy (66) | HEAT Arcade (6)

### Featured Games
10Six, Duke Nukem Forever, Quake II, Warcraft II, Baldur's Gate, Unreal, Kingpin, C&C Red Alert

---

## 🛠️ Development Roadmap

### ✅ Phase 1: Foundation & Stabilization (COMPLETED)
- Organized project structure
- Cleaned CSS/JS files
- Asset inventory
- Working servers
- Documentation

### 🔄 Phase 2: Visual Authenticity (IN PROGRESS)
- ✅ Organized archive (moved originals to `/original_archive`)
- ✅ Created clean structure (`/site` directory)
- ✅ Built landing page
- ⏳ Build complete page set
- ⏳ Convert Flash to HTML5
- ⏳ Cross-browser testing

### 📋 Phase 3: Core Features (3-4 weeks)
- **Trophy System** (priority!)
- User registration
- Dynamic game channels

### 🚀 Phase 4+: Enhanced Features
- News/Events CMS
- Tournaments
- Community features

---

## 🏆 Trophy System (Phase 3 Priority)

The trophy system will be fully functional with:
- Trophy database
- Display pages
- Admin management
- Search/filter functionality

---

## 📦 File Statistics

- **Total Files:** 384
- **Total Size:** ~13 MB
- **Images:** 573+ (400 GIF, 170 JPG)
- **HTML Pages:** 10

---

## 🎮 Nostalgia

> "HEAT - The Home of Online Gaming"
>
> Relive the golden age of online gaming. Welcome back to HEAT.NET. 🔥

---

## 🧹 Clean Structure (Phase 2)

The project has been reorganized for clarity:

**Active Development:**
- `/site` - Clean, modern version (actively developed)
- `/docs` - All documentation
- Root files - Servers, README, config

**Archive (Preserved):**
- `/original_archive` - All original Wayback Machine files
  - `html_pages/` - Original HTML (10 files)
  - `asset_directories/` - Original assets (7 dirs, ~13 MB)
  - `root_images/` - Original images (25 files + Flash)

The cleaned structure makes it easy to:
1. Work on the modern version (`/site`)
2. Reference original files (`/original_archive`)
3. Access documentation (`/docs`)

---

**Last Updated:** 2025-11-17 | **Version:** 1.1.0 (Phase 2 Cleanup Complete)

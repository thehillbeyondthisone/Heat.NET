# HEAT.NET

**The Home of Online Gaming - Restored**

A restoration project to bring the classic gaming portal HEAT.NET back to life, preserving the authentic late-90s/early-2000s aesthetic while adding modern functionality.

---

## Project Overview

HEAT.NET was a pioneering online gaming portal from the late 1990s and early 2000s that hosted multiplayer games, tournaments, and a vibrant gaming community. This project aims to:

1. **Preserve** the original HEAT.NET archive from Internet Archive/Wayback Machine
2. **Restore** the site to a working, browsable state with authentic retro aesthetics
3. **Modernize** core features like the trophy system, user registration, and game channels
4. **Maintain** the nostalgic feel while ensuring compatibility with modern browsers

---

## Project Status

### Phase 1: Foundation & Stabilization - COMPLETED
- [x] Organized directory structure created (`/site`, `/docs`)
- [x] Complete inventory and documentation of all assets
- [x] CSS files consolidated and cleaned
- [x] JavaScript files extracted and cleaned
- [x] Key image assets organized and cataloged
- [x] Static file servers created (Python & Node.js)
- [x] Comprehensive project documentation

### Phase 2: Visual Authenticity - COMPLETED (90%)
- [x] Organized original files into archive directory
- [x] Created clean project structure
- [x] Main landing page (index.html)
- [x] Games channel browser (games.html)
- [x] HEAT Store page (store.html) - Authentic 740px layout
- [x] 10Six game channel (10six.html) - Full game page with sidebars
- [x] About page (about.html)

### Phase 3: Core Features - COMPLETED
- [x] **Trophy System** - Full implementation with REST API
  - Trophy database (JSON)
  - Display pages (active/retired)
  - Search and filter functionality
  - Trophy admin interface
- [x] **User Dashboard** - My Homebase page
- [x] **HEAT Pager** - Messaging system UI
- [x] **Degrees System** - Currency/rewards system
- [x] **Get Paid to Play** - Earnings program page

### Phase 4: User System - PLANNED
- [ ] User registration & authentication
- [ ] User profiles with trophy collections
- [ ] Leaderboards
- [ ] Trophy earning mechanics

### Phase 5: Admin Tools - PLANNED
- [ ] Full admin dashboard
- [ ] User management
- [ ] Statistics dashboard

---

## Quick Start

### Option 1: Windows Quick Launch (LAN Hosting)
```batch
# Double-click quicklaunch.bat
# Automatically hosts on your local network
```

### Option 2: Python Server
```bash
python3 server.py
# Visit http://localhost:8000
```

### Option 3: Node.js Server
```bash
node server.js
# Or: npm start
# Visit http://localhost:8000
```

### Option 4: Trophy API Server
```bash
cd site/api
node trophies.js
# API available at http://localhost:3001
```

---

## Available Pages

### Main Site (`/site/`)
| Page | URL | Description |
|------|-----|-------------|
| **Homepage** | `/site/index.html` | Main portal with game channels |
| **Games** | `/site/games.html` | 233+ games across 7 categories |
| **Store** | `/site/store.html` | Commerce page with product listings |
| **About** | `/site/about.html` | Project information |

### Feature Pages (`/site/pages/`)
| Page | URL | Description |
|------|-----|-------------|
| **My Homebase** | `/site/pages/myhomebase.html` | User dashboard |
| **HEAT Pager** | `/site/pages/pager.html` | Messaging system |
| **Degrees** | `/site/pages/degrees.html` | Currency account |
| **Get Paid** | `/site/pages/getpaid.html` | Earnings program |
| **Trophies** | `/site/pages/trophies.html` | Trophy system overview |
| **Active Trophies** | `/site/pages/active-trophies.html` | Honor trophies |
| **Retired Trophies** | `/site/pages/retired-trophies.html` | Historical trophies |
| **Trophy Admin** | `/site/pages/trophy-admin.html` | Trophy management |

### Game Channels (`/site/pages/`)
| Page | URL | Description |
|------|-----|-------------|
| **10Six** | `/site/pages/10six.html` | MMOFPS game channel |
| **Footsoldiers** | `/site/pages/footsoldiers.html` | Game mini-page |

---

## Project Structure

```
Heat.NET/
├── index.html                   # Auto-redirects to /site
├── README.md                    # This file
├── quicklaunch.bat              # Windows LAN hosting script
├── server.py                    # Python static file server
├── server.js                    # Node.js static file server
├── package.json                 # npm configuration
│
├── site/                        # Active Development
│   ├── index.html               # Main portal
│   ├── games.html               # Game channels (233+ games)
│   ├── store.html               # HEAT Store
│   ├── about.html               # About page
│   ├── api/
│   │   └── trophies.js          # REST API for trophies
│   ├── data/
│   │   └── trophies.json        # Trophy database
│   ├── css/
│   │   └── heat-style.css       # Consolidated stylesheet
│   ├── js/
│   │   └── heat-nav.js          # Navigation system
│   ├── images/
│   │   ├── logos/               # HEAT.NET branding
│   │   ├── navigation/          # Nav buttons
│   │   ├── ui/                  # UI elements
│   │   ├── games/               # Game screenshots
│   │   ├── trophies/            # Trophy images (9 files)
│   │   ├── store/               # Store graphics
│   │   ├── 10six/               # 10Six channel assets
│   │   ├── footsoldiers/        # Footsoldiers assets
│   │   └── getpaid/             # Get Paid assets
│   └── pages/                   # Feature pages (11 files)
│
├── docs/                        # Documentation
│   ├── INVENTORY.md             # File inventory
│   ├── CSS-ANALYSIS.md          # Stylesheet analysis
│   ├── JAVASCRIPT-ANALYSIS.md   # JS documentation
│   ├── IMAGE-ASSETS.md          # Asset catalog
│   ├── TROPHY-SYSTEM.md         # Trophy system docs
│   ├── PHASE-1-COMPLETE.md      # Phase 1 report
│   └── STABILIZATION-ROADMAP.md # Development roadmap
│
└── original_archive/            # Original Wayback Files
    ├── html_pages/              # Original HTML (11 files)
    ├── asset_directories/       # Original assets (~13 MB)
    └── root_images/             # Original images + Flash
```

---

## Design Specifications

### Era
Late 1990s / Early 2000s web design (1997-2003 archived snapshots)

### Layout
- **Width:** 740px (standard HEAT.NET layout)
- **Structure:** Table-based with sidebar navigation
- **Sidebar:** 171px left navigation column
- **Content:** 569px main content area

### Color Palette
| Color | Hex | Usage |
|-------|-----|-------|
| Black | `#000000` | Main background |
| Steel Gray | `#b6ad96` | Header/menu backgrounds |
| Light Gray | `#dddddd` | Sidebar backgrounds |
| Medium Gray | `#aaaaaa` | Borders |
| HEAT Blue | `#003399` | Links, headers |
| HEAT Red | `#990033` | Hover states, accents |
| White | `#FFFFFF` | Content backgrounds |

### Typography
- Primary: Arial, Helvetica, sans-serif
- Navigation: Bold, 0.7em
- Body: 12px standard

---

## Trophy System

### Database
- **Location:** `/site/data/trophies.json`
- **Total Trophies:** 9 (3 active, 6 retired)

### Categories
1. Membership - Account status trophies
2. Special Events - Event participation
3. Community - Contribution recognition
4. Awards - Player achievement
5. Competition - Tournament victories

### API Endpoints
```
GET /api/trophies         - All trophies
GET /api/trophies/active  - Active trophies only
GET /api/trophies/retired - Retired trophies only
GET /api/trophies/:id     - Single trophy
GET /api/categories       - Category list
GET /api/stats            - System statistics
```

---

## Game Channels

| Channel | Games | Description |
|---------|-------|-------------|
| 10SIX | 1 | SEGA's MMOFPS |
| Action | 82 | FPS and action games |
| Role Playing | 16 | RPGs and adventure |
| Simulation | 21 | Sim and racing |
| Sports | 41 | Sports games |
| Strategy | 66 | RTS and turn-based |
| HEAT Arcade | 6 | Classic arcade |
| **Total** | **233+** | |

---

## Technology Stack

### Frontend
- HTML 4.0 Transitional (period-authentic)
- CSS (consolidated stylesheet)
- Vanilla JavaScript

### Backend
- Python 3 HTTP server (no dependencies)
- Node.js HTTP server (no dependencies)
- Optional: Trophy REST API (Node.js)

### Data
- JSON-based storage
- No external database required

---

## Contributing

This is a restoration project. When contributing:
1. Maintain period-authentic design (late 90s/early 2000s)
2. Use table-based layouts for main structure
3. Follow existing color schemes and typography
4. Test in the original 740px width

---

## Acknowledgments

- Original HEAT.NET team (1996-2003)
- SEGA/SegaSoft for 10Six
- Internet Archive for preservation

---

> "HEAT - The Home of Online Gaming"
>
> Relive the golden age of online gaming. Welcome back to HEAT.NET.

---

**Last Updated:** 2025-12-20 | **Version:** 2.0.0 (Phase 3 Complete)

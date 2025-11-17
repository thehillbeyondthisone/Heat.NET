# CSS Files Analysis

**Date:** 2025-11-17
**Purpose:** Document which CSS files are original HEAT.NET vs Wayback Machine artifacts

---

## Original HEAT.NET CSS Files (KEEP)

### ht_style.css
**Location:** Multiple directories (HEAT.NET_files, HEAT.NET __ STORE_files, HEAT __ Honor Trophies_files, HEAT __ Retired HEAT Trophies_files)

**Content:** Original HEAT.NET styling
- Navigation styles (.subnav, .smsubnav)
- Button styles (.button)
- Menu styles (.menus)
- Link hover effects (HEAT red: #990033)
- Typography (Arial/Helvetica)

**Status:** ✅ Cleaned and consolidated into `/site/css/heat-style.css`

**Classes defined:**
- `.subnav` - Sub-navigation (0.7em, bold, #003399)
- `.button` - Buttons (12px, bold, white)
- `.menus` - Menus (0.6em, #003399)
- `.smsubnav` - Small sub-nav (10px, bold, #003399)
- `a:hover` - Hover state (#990033)
- `b` - Bold text (#555555)

---

## Wayback Machine CSS Files (EXCLUDE)

### banner-styles.css
**Location:** All asset directories
**Content:** Wayback Machine toolbar styling
**Action:** ❌ Do not copy - Archive.org toolbar only

### iconochive.css
**Location:** All asset directories
**Content:** Archive.org icon fonts
**Action:** ❌ Do not copy - Archive.org UI only

### archive.min.css
**Location:** Trophy and store directories
**Content:** Archive.org page styling
**Action:** ❌ Do not copy - Archive.org UI only

### styles.css
**Location:** Trophy directories
**Content:** Wayback Machine error pages, home page, SPN UI
**Action:** ❌ Do not copy - Archive.org infrastructure only

### web.css
**Location:** Trophy directories
**Content:** Archive.org web interface
**Action:** ❌ Do not copy - Archive.org UI only

---

## Clean CSS Structure

### /site/css/ directory contents:
1. **heat-style.css** - Primary HEAT.NET stylesheet (cleaned)
2. **reset.css** - (To be created) Modern CSS reset for browser compatibility
3. **layout.css** - (To be created) Page layout structure
4. **components.css** - (To be created) Reusable components

---

## Next Steps

- [x] Consolidate ht_style.css into clean heat-style.css
- [ ] Create modern CSS reset while preserving retro aesthetic
- [ ] Extract layout patterns from HTML pages
- [ ] Create component library (buttons, navigation, game cards, etc.)

---

## Color Palette (from ht_style.css)

```css
Primary Colors:
- HEAT Blue: #003399 (links, navigation)
- HEAT Red: #990033 (hover states)
- White: #ffffff (button text)
- Gray: #555555 (bold text)

Background Colors:
- Black: #000000 (main background - from HTML)
- Dark Gray: #202020 (dividers - from HTML)
```

## Typography

```css
Font Stack: Arial, Helvetica, sans-serif

Sizes:
- Body: 12px
- Headings: 1-2em
- Menus: 0.6em
- Sub-nav: 0.7em
- Small sub-nav: 10px
```

---

**Analysis Complete:** 2025-11-17

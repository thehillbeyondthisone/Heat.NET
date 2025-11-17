# JavaScript Files Analysis

**Date:** 2025-11-17
**Purpose:** Document which JavaScript files are original HEAT.NET vs third-party/archive artifacts

---

## Original HEAT.NET JavaScript Files (KEEP)

### ht_headjs.js.download
**Location:** Multiple directories (HEAT.NET_files, HEAT.NET __ STORE_files, HEAT __ Honor Trophies_files, HEAT __ Retired HEAT Trophies_files)

**Content:** Original HEAT.NET navigation and menu system
- Menu layer management
- Dropdown menu functionality
- Image rollover effects (navigation button highlighting)
- Cross-browser support (Netscape 4.x and IE 4+)

**Status:** ✅ Cleaned and saved as `/site/js/heat-nav.js`

**Functions:**
- `addLayer2Index(layerName)` - Add layer to menu index
- `switchToMenuLayer(visibleLayer)` - Show specific menu, hide others
- `showHideMenuCatcher(showHide)` - Toggle menu catcher layers
- `showHideLayers(layerName, showHide)` - Cross-browser layer visibility
- `imageLight(imgName)` - Toggle image rollover effect

---

## Third-Party Libraries (OPTIONAL)

### jquery-1.11.1.min.js.download
**Location:** Footsoldiers_files
**Content:** jQuery 1.11.1 library
**Action:** ⚠️ Optional - May be useful for modern functionality, but not part of original site

### jquery.min.js.download
**Location:** HEAT2_files
**Content:** jQuery library (version unknown)
**Action:** ⚠️ Optional - Legacy version

### jquery.pngFix.js.download
**Location:** HEAT2_files
**Content:** jQuery plugin for PNG transparency in IE 5.5/6.0
**Action:** ❌ Do not copy - No longer needed (modern browsers support PNG)
**Note:** This was a hack for ancient IE versions that didn't support PNG transparency

---

## Wayback Machine JavaScript Files (EXCLUDE)

### athena.js.download
**Location:** All asset directories
**Content:** Archive.org analytics
**Action:** ❌ Do not copy - Archive.org infrastructure

### bundle-playback.js.download
**Location:** All asset directories
**Content:** Wayback Machine playback functionality
**Action:** ❌ Do not copy - Archive.org infrastructure

### wombat.js.download
**Location:** All asset directories
**Content:** Wayback Machine core rewriting engine
**Action:** ❌ Do not copy - Archive.org infrastructure
**Size:** ~127 KB

### ruffle.js.download
**Location:** All asset directories
**Content:** Flash player emulation for Wayback Machine
**Action:** ❌ Do not copy - Archive.org Flash emulator
**Size:** ~381 KB
**Note:** Used to display archived Flash content (SWF files)

### apollo.js.download
**Location:** Trophy and store directories
**Content:** Archive.org analytics/tracking
**Action:** ❌ Do not copy

### archive.min.js.download
**Location:** Trophy and store directories
**Content:** Archive.org UI functionality
**Action:** ❌ Do not copy

### ia-topnav.min.js.download
**Location:** Trophy and store directories
**Content:** Archive.org top navigation bar
**Action:** ❌ Do not copy

### container_kzRD6OIl.js.download
**Location:** Trophy and store directories
**Content:** Archive.org container script
**Action:** ❌ Do not copy

### ui.js.download
**Location:** Trophy and store directories
**Content:** Archive.org UI components
**Action:** ❌ Do not copy

### webcomponents-bundle.js.download
**Location:** Trophy directories
**Content:** Web components polyfill for Archive.org
**Action:** ❌ Do not copy

### polyfill-support.js.download
**Location:** Trophy and store directories
**Content:** Browser polyfills for Archive.org
**Action:** ❌ Do not copy

---

## Clean JavaScript Structure

### /site/js/ directory contents:
1. **heat-nav.js** - Navigation and menu system (cleaned)
2. **heat-utils.js** - (To be created) Utility functions
3. **heat-modern.js** - (To be created) Modern enhancements while preserving retro feel

---

## Historical Browser Support Notes

The original `ht_headjs.js` was designed for:
- **Netscape Navigator 4.x** (released 1997-1998)
  - Used `document.layers` API
  - Different visibility model
- **Internet Explorer 4.0+** (released 1997)
  - Used `document.all` API
  - CSS visibility property

These browsers are obsolete. For the restored site, we can either:
1. Keep the original code as-is for authenticity
2. Modernize to use `document.getElementById()` and standard DOM
3. Use modern JavaScript (ES6+) with transpilation for older browser support

---

## Recommendations

### Phase 1 (Current)
- [x] Extract and clean `ht_headjs.js` → `heat-nav.js`
- [ ] Test navigation functions in modern browsers
- [ ] Document any compatibility issues

### Phase 2 (Future Enhancement)
- [ ] Optional: Add jQuery for convenience (modern version or keep 1.11.1 for compatibility)
- [ ] Create utility functions for common tasks
- [ ] Add modern JavaScript for interactive features

### Phase 3 (Trophy System)
- [ ] Create API client JavaScript for trophy system
- [ ] Add AJAX functionality for dynamic content loading
- [ ] User authentication UI

---

## File Cleanup Summary

**Original Files Found:** 56+ JavaScript files
**Original HEAT.NET Files:** 1 (ht_headjs.js)
**Wayback Machine Files:** 50+
**Third-Party Libraries:** 2 (jQuery, jQuery.pngFix)

**Action Taken:**
- ✅ Extracted and cleaned `ht_headjs.js` → `/site/js/heat-nav.js`
- ❌ Excluded all Wayback Machine scripts
- ❌ Excluded obsolete IE PNG fix plugin
- ⚠️ jQuery preserved for potential future use

---

**Analysis Complete:** 2025-11-17

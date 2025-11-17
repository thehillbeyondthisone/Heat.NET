/* HEAT.NET Navigation and Menu System
 * Cleaned from original archive (ht_headjs.js)
 * Date: 2025-11-17
 *
 * Original functionality for Netscape 4 and IE 4/5 era browsers
 * Handles dropdown menus and image rollovers
 */

// Menu layer management
menuLayers = new Array();

// Preload navigation box images for rollover effect
document.image2Swap = new Image();
document.image2Swap.src = '/images/navbar/nav_box.gif';
document.image2SwapOn = new Image();
document.image2SwapOn.src = '/images/navbar/nav_box_on.gif';

/**
 * Add a layer to the menu index
 * @param {string} layerName - Name of the layer to add
 */
function addLayer2Index(layerName) {
    if (document.menuLayers == null) {
        document.menuLayers = new Object();
    }
    menuLayers[menuLayers.length] = layerName;
}

/**
 * Switch to a specific menu layer, hiding all others
 * @param {string} visibleLayer - The layer to make visible
 */
function switchToMenuLayer(visibleLayer) {
    showHideCatcher = 'hide';
    for (i in menuLayers) {
        showHide = 'hide';
        if (menuLayers[i] == visibleLayer) {
            showHide = 'show';
            showHideCatcher = 'show';
        }
        showHideLayers(menuLayers[i], showHide);
    }
    showHideMenuCatcher(showHideCatcher);
}

/**
 * Show or hide menu catcher layers (for click outside detection)
 * @param {string} showHide - 'show' or 'hide'
 */
function showHideMenuCatcher(showHide) {
    showHideLayers('menucatcher1', showHide);
    showHideLayers('menucatcher2', showHide);
    showHideLayers('menucatcher3', showHide);
}

/**
 * Show or hide layers (cross-browser: Netscape 4 and IE 4+)
 * @param {string} layerName - Name of the layer
 * @param {string} showHide - 'show' or 'hide'
 */
function showHideLayers(layerName, showHide) {
    // Netscape Navigator 4.x
    if (navigator.appName == 'Netscape' && document.layers != null) {
        theObj = eval('document.layers[\'' + layerName + '\']');
        if (theObj) {
            theObj.visibility = showHide;
        }
    }
    // Internet Explorer 4+
    else if (document.all != null) {
        // Convert 'show'/'hide' to 'visible'/'hidden' for IE
        if (showHide == 'show') showHide = 'visible';
        if (showHide == 'hide') showHide = 'hidden';
        theObj = eval('document.all[\'' + layerName + '\']');
        if (theObj) {
            theObj.style.visibility = showHide;
        }
    }
}

/**
 * Toggle image rollover effect (add/remove "_on" from filename)
 * @param {string} imgName - Name of the image to toggle
 */
function imageLight(imgName) {
    if (document.images) {
        // If image has "_on" in filename, remove it
        if (document.images[imgName].src.indexOf("_on") != -1) {
            newSrc = document.images[imgName].src.substring(0, document.images[imgName].src.indexOf("_on")) +
                     document.images[imgName].src.substring(document.images[imgName].src.indexOf("_on") + 3, document.images[imgName].src.length);
        }
        // Otherwise, add "_on" before .gif extension
        else {
            newSrc = document.images[imgName].src.substring(0, document.images[imgName].src.indexOf(".gif")) + "_on.gif";
        }
        document.images[imgName].src = newSrc;
    }
}

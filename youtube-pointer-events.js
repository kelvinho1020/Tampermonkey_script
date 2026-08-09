// ==UserScript==
// @name         YouTube pointer-events fixer
// @namespace    http://tampermonkey.net/
// @version      2025-01-21
// @description  Apply pointer-events:none every time the page changes
// @author       You
// @match        https://www.youtube.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  function applyPointerNone() {
      const el = document.querySelector(".ytp-chapter-container");
      if (el) {
          el.style.pointerEvents = "none";
          console.log("[TM] pointer-events applied");
      }
  }

  // Run once on load
  applyPointerNone();

  // Detect YouTube navigation changes (pushState + replaceState)
  const origPushState = history.pushState;
  history.pushState = function() {
      origPushState.apply(this, arguments);
      setTimeout(applyPointerNone, 500);
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function() {
      origReplaceState.apply(this, arguments);
      setTimeout(applyPointerNone, 500);
  };

  // Back/forward navigation
  window.addEventListener("popstate", () => {
      setTimeout(applyPointerNone, 500);
  });

  // Sometimes player renders later → use MutationObserver
  const observer = new MutationObserver(() => {
      applyPointerNone();
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();

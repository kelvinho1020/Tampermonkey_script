// ==UserScript==
// @name         Disable Ctrl+Enter
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Disable Ctrl + Enter and optionally mimic VS Code behavior
// @author       You
// @match        https://leetcode.com/**/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/kelvinho1020/Tampermonkey_script/main/disable-leetcode-ctrl-enter.user.js
// @downloadURL  https://raw.githubusercontent.com/kelvinho1020/Tampermonkey_script/main/disable-leetcode-ctrl-enter.user.js
// ==/UserScript==

(function () {
  'use strict';

  window.addEventListener('keydown', function (e) {
      // Check for Ctrl + Enter
      if (e.ctrlKey && e.key === 'Enter') {
          // Prevent default behavior (e.g. submitting form, sending message)
          e.preventDefault();
          e.stopPropagation();

          // Optional: mimic VS Code behavior
          // VS Code inserts new line below (you can define your own logic here)
          const active = document.activeElement;

          // Only apply if focus is on editable element
          if (active && (active.tagName === 'TEXTAREA' || active.isContentEditable)) {
              insertNewLineBelow(active);
          }
      }
  }, true);

  function insertNewLineBelow(el) {
      if (el.tagName === 'TEXTAREA') {
          const start = el.selectionStart;
          const end = el.selectionEnd;
          const before = el.value.substring(0, end);
          const after = el.value.substring(end);

          // insert \n at the next line
          const lines = before.split('\n');
          const lastLineIndex = lines.length - 1;
          lines.splice(lastLineIndex + 1, 0, '');
          const newText = lines.join('\n') + after;

          el.value = newText;
          el.selectionStart = el.selectionEnd = end + 1;
      } else if (el.isContentEditable) {
          document.execCommand('insertLineBreak');
      }
  }
})();
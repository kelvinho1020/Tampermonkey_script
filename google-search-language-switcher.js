// ==UserScript==
// @name         Google Search Language Switcher
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Quick switch Google search language between Japanese and Traditional Chinese
// @author       kelvin
// @match        https://www.google.com/*
// @match        https://www.google.com.tw/*
// @match        https://www.google.co.jp/*
// @grant        none
// ==/UserScript==

(function () {
	"use strict";

	const LANGUAGES = [
		{ code: "zh-TW", label: "繁中", hl: "zh-TW", lr: "lang_zh-TW" },
		{ code: "ja", label: "日文", hl: "ja", lr: "lang_ja" },
	];

	function getCurrentLang () {
		const params = new URLSearchParams(window.location.search);
		const hl = params.get("hl");
		if (hl === "ja") return "ja";
		if (hl === "zh-TW") return "zh-TW";
		return null;
	}

	function switchLang () {
		const current = getCurrentLang();
		const next = current === "ja"
			? LANGUAGES.find(l => l.code === "zh-TW")
			: LANGUAGES.find(l => l.code === "ja");

		const params = new URLSearchParams(window.location.search);
		params.set("hl", next.hl);
		params.set("lr", next.lr);

		window.location.search = params.toString();
	}

	function getButtonLabel () {
		const current = getCurrentLang();
		if (current === "ja") return "切換 繁中";
		if (current === "zh-TW") return "切換 日文";
		return "語言切換";
	}

	function createBtn () {
		const btn = document.createElement("button");
		btn.id = "lang-switcher-btn";
		btn.textContent = getButtonLabel();

		Object.assign(btn.style, {
			position: "fixed",
			bottom: "20px",
			right: "20px",
			zIndex: "9999",
			padding: "8px 14px",
			backgroundColor: "#4285f4",
			color: "#fff",
			border: "none",
			borderRadius: "20px",
			fontSize: "13px",
			fontFamily: "sans-serif",
			cursor: "pointer",
			boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
			transition: "background-color 0.2s ease",
		});

		btn.addEventListener("mouseenter", () => {
			btn.style.backgroundColor = "#2b6de0";
		});

		btn.addEventListener("mouseleave", () => {
			btn.style.backgroundColor = "#4285f4";
		});

		btn.addEventListener("click", switchLang);

		document.body.appendChild(btn);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", createBtn);
	} else {
		createBtn();
	}
})();

// ==UserScript==
// @name         AI 對話批次刪除器 (ChatGPT + Google AI Mode)
// @namespace    https://github.com/kelvin/ai-chat-batch-deleter
// @version      0.1.0
// @description  批次勾選並刪除 AI 對話紀錄，支援 ChatGPT 與 Google AI Mode（模擬 DOM 點擊）
// @author       kelvin
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://www.google.com/search*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
	"use strict";

	/* ------------------------------------------------------------------ *
	 * 通用工具
	 * ------------------------------------------------------------------ */

	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	function pressEscape() {
		const opts = {
			key: "Escape",
			code: "Escape",
			keyCode: 27,
			which: 27,
			bubbles: true,
		};
		document.body.dispatchEvent(new KeyboardEvent("keydown", opts));
		document.body.dispatchEvent(new KeyboardEvent("keyup", opts));
	}

	function isVisible(el) {
		if (!el) {
			return false;
		}
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			return false;
		}
		const style = getComputedStyle(el);
		return style.visibility !== "hidden" && style.display !== "none";
	}

	function text(el) {
		return (el && el.textContent ? el.textContent : "").trim();
	}

	// 輪詢等待節點出現（SPA / 非同步 render 必要）
	async function waitFor(getEl, { timeout = 5000, interval = 100 } = {}) {
		const start = Date.now();
		for (;;) {
			let el = null;
			try {
				el = getEl();
			} catch (err) {
				el = null;
			}
			if (el) {
				return el;
			}
			if (Date.now() - start >= timeout) {
				return null;
			}
			await sleep(interval);
		}
	}

	// 以文字關鍵字找可點擊元素（涵蓋中英，避免綁死亂數 class）
	function findClickableByText(keywords, { exclude } = {}) {
		const selector = [
			"button",
			'[role="menuitem"]',
			'[role="button"]',
			'[role="listitem"]',
			"a",
		].join(",");
		let best = null;
		for (const el of document.querySelectorAll(selector)) {
			if (exclude && exclude.contains(el)) {
				continue;
			}
			if (!isVisible(el)) {
				continue;
			}
			const tx = text(el);
			if (!tx) {
				continue;
			}
			if (keywords.some((k) => tx.includes(k))) {
				if (!best || tx.length < best.tx.length) {
					best = { el, tx };
				}
			}
		}
		return best ? best.el : null;
	}

	const DELETE_WORDS = ["刪除", "删除", "Delete"];
	const CONFIRM_WORDS = ["刪除", "删除", "Delete", "確定", "确定", "Confirm"];

	// 每筆刪除之間的節流；調小較快，但太快可能觸發速率限制
	const THROTTLE_MS = 400;

	// 共用刪除收尾：點刪除項 →（可能）確認框 → 等待該筆消失
	async function clickDeleteAndConfirm(panel, isGone) {
		const deleteItem = await waitFor(
			() => findClickableByText(DELETE_WORDS, { exclude: panel }),
			{ timeout: 4000, interval: 50 },
		);
		if (!deleteItem) {
			throw new Error("找不到刪除選項");
		}
		deleteItem.click();

		// 確認框可能存在，也可能直接刪除
		const dialog = await waitFor(
			() =>
				document.querySelector('[role="dialog"], [role="alertdialog"]'),
			{ timeout: 1500 },
		);
		if (dialog) {
			const confirmBtn = await waitFor(
				() => {
					const btns = [...dialog.querySelectorAll("button")].filter(
						isVisible,
					);
					return (
						btns.find((b) =>
							CONFIRM_WORDS.some((k) => text(b).includes(k)),
						) || null
					);
				},
				{ timeout: 2000 },
			);
			if (confirmBtn) {
				confirmBtn.click();
			}
		}

		const removed = await waitFor(() => (isGone() ? true : null), {
			timeout: 6000,
			interval: 50,
		});
		if (!removed) {
			throw new Error("刪除後該筆仍存在");
		}
	}

	/* ------------------------------------------------------------------ *
	 * Site adapters
	 * ------------------------------------------------------------------ */

	const googleAdapter = {
		id: "google",
		label: "Google AI Mode",

		isActive() {
			return Boolean(
				document.querySelector('ul[data-xid="threads-list-root"]'),
			);
		},

		getListContainer() {
			return document.querySelector('ul[data-xid="threads-list-root"]');
		},

		getThreads() {
			const rows = document.querySelectorAll(
				'ul[data-xid="threads-list-root"] > li',
			);
			const out = [];
			for (const li of rows) {
				const btn = li.querySelector("button[data-thread-id]");
				if (!btn) {
					continue;
				}
				const id = btn.getAttribute("data-thread-id");
				if (!id) {
					continue;
				}
				out.push({
					id,
					title: text(li.querySelector(".uQv1Ce")) || id,
					el: li,
				});
			}
			return out;
		},

		findThreadById(id) {
			return this.getThreads().find((t) => t.id === id) || null;
		},

		threadFromNode(node) {
			const li = node.closest && node.closest("li");
			if (!li) {
				return null;
			}
			const btn = li.querySelector("button[data-thread-id]");
			if (!btn) {
				return null;
			}
			const id = btn.getAttribute("data-thread-id");
			if (!id) {
				return null;
			}
			return { id, title: text(li.querySelector(".uQv1Ce")) || id, el: li };
		},

		async deleteFlow(thread, panel) {
			const optionsBtn =
				document.querySelector(
					`#actions-button-${CSS.escape(thread.id)} button`,
				) || thread.el.querySelector(".fMed7");
			if (!optionsBtn) {
				throw new Error("找不到選項按鈕");
			}
			optionsBtn.click();
			await clickDeleteAndConfirm(panel, () => !this.findThreadById(thread.id));
		},
	};

	const chatgptAdapter = {
		id: "chatgpt",
		label: "ChatGPT",

		isActive() {
			return Boolean(document.querySelector('nav a[href^="/c/"]'));
		},

		getListContainer() {
			const a = document.querySelector('nav a[href^="/c/"]');
			return a ? a.closest("nav") : null;
		},

		_idFromHref(href) {
			const m = (href || "").match(/\/c\/([^/?#]+)/);
			return m ? m[1] : null;
		},

		getThreads() {
			const out = [];
			for (const a of document.querySelectorAll('nav a[href^="/c/"]')) {
				const id = this._idFromHref(a.getAttribute("href"));
				if (!id) {
					continue;
				}
				out.push({
					id,
					title: text(a) || id,
					el: a.closest("li") || a,
				});
			}
			return out;
		},

		findThreadById(id) {
			return this.getThreads().find((t) => t.id === id) || null;
		},

		threadFromNode(node) {
			const a = node.closest && node.closest('a[href^="/c/"]');
			if (!a) {
				return null;
			}
			const id = this._idFromHref(a.getAttribute("href"));
			if (!id) {
				return null;
			}
			return { id, title: text(a) || id, el: a.closest("li") || a };
		},

		async deleteFlow(thread, panel) {
			// 觸發 hover 讓選項按鈕出現
			thread.el.dispatchEvent(
				new MouseEvent("mouseover", { bubbles: true }),
			);
			const optionsBtn = await waitFor(
				() => {
					const byTestId = thread.el.querySelector(
						'button[data-testid$="options"]',
					);
					if (byTestId) {
						return byTestId;
					}
					const labelled = [
						...thread.el.querySelectorAll("button"),
					].find((b) => {
						const l = (
							b.getAttribute("aria-label") || ""
						).toLowerCase();
						return l.includes("option") || b.getAttribute("aria-label")?.includes("選項");
					});
					return labelled || null;
				},
				{ timeout: 3000 },
			);
			if (!optionsBtn) {
				throw new Error("找不到選項按鈕（ChatGPT 選擇器可能需調整）");
			}
			optionsBtn.click();
			await clickDeleteAndConfirm(panel, () => !this.findThreadById(thread.id));
		},
	};

	function pickAdapter() {
		const host = location.hostname;
		if (host.includes("chatgpt.com") || host.includes("openai.com")) {
			return chatgptAdapter;
		}
		if (host.includes("google.")) {
			return googleAdapter;
		}
		return null;
	}

	/* ------------------------------------------------------------------ *
	 * UI + 批次控制器
	 * ------------------------------------------------------------------ */

	const STYLE = `
	#abd-panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;
		width:220px;font:13px/1.4 system-ui,sans-serif;color:#111;
		background:#fff;border:1px solid #d0d0d0;border-radius:12px;
		box-shadow:0 6px 24px rgba(0,0,0,.18);padding:12px;user-select:none;}
	#abd-panel *{box-sizing:border-box;}
	#abd-panel h3{margin:0 0 8px;font-size:13px;font-weight:600;display:flex;
		align-items:center;justify-content:space-between;}
	#abd-panel button{width:100%;margin-top:6px;padding:7px 10px;border-radius:8px;
		border:1px solid #d0d0d0;background:#f6f6f6;cursor:pointer;font-size:13px;}
	#abd-panel button:hover{background:#eee;}
	#abd-panel button.abd-primary{background:#ef4444;border-color:#ef4444;color:#fff;}
	#abd-panel button.abd-primary:hover{background:#dc2626;}
	#abd-panel button:disabled{opacity:.5;cursor:not-allowed;}
	#abd-status{margin-top:8px;font-size:12px;color:#555;min-height:16px;}
	.abd-check{position:absolute !important;right:8px;left:auto;top:50%;
		transform:translateY(-50%);z-index:2147483646;
		width:18px;height:18px;margin:0;cursor:pointer;accent-color:#ef4444;}
	.abd-selected{outline:2px solid #ef4444 !important;outline-offset:-2px;
		border-radius:8px;background:rgba(239,68,68,.10) !important;}
	@media (prefers-color-scheme: dark){
		#abd-panel{background:#1f1f1f;color:#eee;border-color:#3a3a3a;}
		#abd-panel button{background:#2a2a2a;border-color:#3a3a3a;color:#eee;}
		#abd-panel button:hover{background:#333;}
		#abd-status{color:#aaa;}
	}`;

	const state = {
		adapter: null,
		selectMode: false,
		selected: new Set(),
		running: false,
		aborted: false,
	};

	let panel;
	let els = {};

	function injectStyle() {
		if (document.getElementById("abd-style")) {
			return;
		}
		const s = document.createElement("style");
		s.id = "abd-style";
		s.textContent = STYLE;
		document.head.appendChild(s);
	}

	function setStatus(msg) {
		if (els.status) {
			els.status.textContent = msg || "";
		}
	}

	function updateUI() {
		els.toggle.textContent = state.selectMode
			? "退出選取模式"
			: "進入選取模式";
		els.del.textContent = `刪除選取 (${state.selected.size})`;
		els.del.disabled = state.running || state.selected.size === 0;
		els.toggle.disabled = state.running;
		els.abort.style.display = state.running ? "block" : "none";
	}

	function setSel(thread, val) {
		if (val) {
			state.selected.add(thread.id);
		} else {
			state.selected.delete(thread.id);
		}
		thread.el.classList.toggle("abd-selected", val);
		const cb = thread.el.querySelector(":scope > .abd-check");
		if (cb) {
			cb.checked = val;
		}
		updateUI();
	}

	// 進入選取模式時，於每筆對話列注入實體 checkbox
	function renderChecks() {
		const threads = state.adapter.getThreads();
		const alive = new Set(threads.map((t) => t.id));
		for (const id of [...state.selected]) {
			if (!alive.has(id)) {
				state.selected.delete(id);
			}
		}
		for (const thread of threads) {
			const el = thread.el;
			if (getComputedStyle(el).position === "static") {
				el.style.position = "relative";
			}
			let cb = el.querySelector(":scope > .abd-check");
			if (!cb) {
				cb = document.createElement("input");
				cb.type = "checkbox";
				cb.className = "abd-check";
				// 避免點 checkbox 冒泡到對話列而觸發導覽
				cb.addEventListener("click", (e) => e.stopPropagation());
				cb.addEventListener("change", () => setSel(thread, cb.checked));
				el.insertBefore(cb, el.firstChild);
			}
			cb.checked = state.selected.has(thread.id);
			el.classList.toggle("abd-selected", state.selected.has(thread.id));
		}
		updateUI();
	}

	function clearSelectionUI() {
		for (const cb of document.querySelectorAll(".abd-check")) {
			cb.remove();
		}
		for (const el of document.querySelectorAll(".abd-selected")) {
			el.classList.remove("abd-selected");
		}
	}

	// 點對話列本體（非 checkbox）也可切換，並阻止導覽
	function onDocClick(e) {
		if (!state.selectMode || state.running) {
			return;
		}
		if (panel && panel.contains(e.target)) {
			return;
		}
		if (e.target.closest(".abd-check")) {
			return;
		}
		const thread = state.adapter.threadFromNode(e.target);
		if (!thread) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		setSel(thread, !state.selected.has(thread.id));
	}

	async function runDelete() {
		const ids = [...state.selected];
		if (ids.length === 0) {
			return;
		}
		if (
			!window.confirm(
				`確定要刪除 ${ids.length} 筆對話嗎？此動作無法復原。`,
			)
		) {
			return;
		}
		state.running = true;
		state.aborted = false;
		updateUI();

		let done = 0;
		const failed = [];
		for (const id of ids) {
			if (state.aborted) {
				break;
			}
			setStatus(`刪除中 ${done + 1}/${ids.length}…`);
			let ok = false;
			let title = id;
			let lastErr = null;
			// 單筆最多試兩次，處理 hover / 動畫時序造成的偶發失敗
			for (let attempt = 0; attempt < 2 && !ok && !state.aborted; attempt++) {
				const thread = state.adapter.findThreadById(id);
				if (!thread) {
					ok = true; // 已不在清單，視為已刪
					break;
				}
				title = thread.title;
				try {
					await state.adapter.deleteFlow(thread, panel);
					ok = true;
				} catch (err) {
					lastErr = err;
					pressEscape(); // 清掉可能卡住的選單 / 對話框
					await sleep(300);
				}
			}
			if (ok) {
				state.selected.delete(id);
			} else {
				failed.push({ id, title, msg: lastErr ? lastErr.message : "未知" });
			}
			done += 1;
			updateUI();
			await sleep(THROTTLE_MS); // 節流，降低觸發防濫用機制
		}

		state.running = false;
		updateUI();
		if (state.aborted) {
			setStatus(`已中止，剩 ${state.selected.size} 筆未刪`);
		} else if (failed.length) {
			setStatus(`完成，${failed.length} 筆失敗（見 console）`);
			console.warn("[AI批次刪除] 失敗清單：", failed);
		} else {
			setStatus(`完成，已刪 ${done} 筆`);
		}
	}

	function buildPanel() {
		if (document.getElementById("abd-panel")) {
			return;
		}
		panel = document.createElement("div");
		panel.id = "abd-panel";
		panel.innerHTML = `
			<h3><span>AI 批次刪除</span><span>${state.adapter.label}</span></h3>
			<button id="abd-toggle"></button>
			<button id="abd-del" class="abd-primary"></button>
			<button id="abd-abort" style="display:none">中止</button>
			<div id="abd-status"></div>`;
		document.body.appendChild(panel);

		els = {
			toggle: panel.querySelector("#abd-toggle"),
			del: panel.querySelector("#abd-del"),
			abort: panel.querySelector("#abd-abort"),
			status: panel.querySelector("#abd-status"),
		};

		els.toggle.addEventListener("click", () => {
			state.selectMode = !state.selectMode;
			if (!state.selectMode) {
				clearSelectionUI();
				setStatus("");
			} else {
				const n = state.adapter.getThreads().length;
				renderChecks();
				setStatus(`找到 ${n} 筆，勾選要刪的`);
			}
			updateUI();
		});
		els.del.addEventListener("click", runDelete);
		els.abort.addEventListener("click", () => {
			state.aborted = true;
			setStatus("中止中…");
		});

		updateUI();
	}

	/* ------------------------------------------------------------------ *
	 * 啟動 + SPA 監聽
	 * ------------------------------------------------------------------ */

	function tick() {
		const adapter = pickAdapter();
		if (!adapter || !adapter.isActive()) {
			return;
		}
		state.adapter = adapter;
		injectStyle();
		buildPanel();
		if (state.selectMode && !state.running) {
			renderChecks(); // 清單重繪後補回 checkbox 與勾選狀態
		}
	}

	document.addEventListener("click", onDocClick, true);

	const observer = new MutationObserver(() => {
		clearTimeout(observer._t);
		observer._t = setTimeout(tick, 300);
	});
	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
	});

	tick();
})();

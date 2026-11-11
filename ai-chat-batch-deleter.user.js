// ==UserScript==
// @name         AI 對話批次刪除器 (ChatGPT + Google AI Mode)
// @namespace    https://github.com/kelvin/ai-chat-batch-deleter
// @version      0.4.0
// @description  批次勾選並刪除 AI 對話紀錄，支援 ChatGPT、Gemini 與 Google AI Mode
// @author       kelvin
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @include      /^https:\/\/www\.google\.[a-z.]+\/(search|ai)/
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
	const THROTTLE_MS = 100;

	function findConfirmButton() {
		const dialogs = document.querySelectorAll(
			'[role="dialog"], [role="alertdialog"]',
		);
		const dialog = dialogs[dialogs.length - 1];
		if (!dialog || !isVisible(dialog)) {
			return null;
		}
		const btns = [...dialog.querySelectorAll("button")].filter(
			(b) => isVisible(b) && !b.hasAttribute("data-thread-id"),
		);
		return (
			btns.find((b) => CONFIRM_WORDS.some((k) => text(b).includes(k))) ||
			null
		);
	}

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

		// 只等確認框按完、關掉就換下一筆；是否真的刪掉，最後再一起檢查
		let confirmed = false;
		const start = Date.now();
		const settled = await waitFor(
			() => {
				if (isGone()) {
					return true;
				}
				if (confirmed) {
					return findConfirmButton() ? null : true;
				}
				const confirmBtn = findConfirmButton();
				if (confirmBtn) {
					confirmBtn.click();
					confirmed = true;
					return null;
				}
				return Date.now() - start > 800 ? true : null;
			},
			{ timeout: 4000, interval: 30 },
		);
		if (!settled) {
			throw new Error("確認框沒有關閉");
		}
	}

	/* ------------------------------------------------------------------ *
	 * Site adapters
	 * ------------------------------------------------------------------ */

	const googleAdapter = {
		id: "google",
		label: "Google AI Mode",

		// 只要在 AI 模式就顯示面板，記錄清單可以之後再打開
		isActive() {
			return Boolean(
				new URLSearchParams(location.search).get("udm") === "50" ||
					document.querySelector(
						'[data-xid="aim-threads-view"], [data-thread-id]',
					),
			);
		},

		getListContainer() {
			const node = document.querySelector("[data-thread-id]");
			return node ? node.closest("ul") || node.parentElement : null;
		},

		// 不綁亂數 class，只認 data-thread-id；一列可能有多個節點帶同一個 id
		getThreads() {
			const out = [];
			const seen = new Set();
			for (const node of document.querySelectorAll("[data-thread-id]")) {
				const id = node.getAttribute("data-thread-id");
				if (!id || seen.has(id)) {
					continue;
				}
				const el = node.closest("li") || node;
				if (!isVisible(el)) {
					continue;
				}
				seen.add(id);
				out.push({ id, title: text(el) || id, el });
			}
			return out;
		},

		findThreadById(id) {
			return this.getThreads().find((t) => t.id === id) || null;
		},

		threadFromNode(node) {
			return this.getThreads().find((t) => t.el.contains(node)) || null;
		},

		findOptionsButton(thread) {
			const byId = document.querySelector(
				`#actions-button-${CSS.escape(thread.id)} button`,
			);
			if (byId) {
				return byId;
			}
			const words = ["選項", "更多", "動作", "option", "more", "action"];
			const labelled = [
				...thread.el.querySelectorAll('button, [role="button"]'),
			].find((b) => {
				if (b.hasAttribute("data-thread-id")) {
					return false;
				}
				const label = (b.getAttribute("aria-label") || "").toLowerCase();
				return words.some((w) => label.includes(w));
			});
			return labelled || thread.el.querySelector(".fMed7");
		},

		async deleteFlow(thread, panel) {
			// 選項按鈕可能要 hover 才出現
			for (const type of ["mouseover", "mouseenter"]) {
				thread.el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
			}
			const optionsBtn = await waitFor(
				() => this.findOptionsButton(thread),
				{ timeout: 2000, interval: 50 },
			);
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
				if (!id || a.closest("[data-abd-deleted]")) {
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

		_token: null,

		async _getToken() {
			if (!this._token) {
				const res = await fetch("/api/auth/session");
				const { accessToken } = await res.json();
				if (!accessToken) {
					throw new Error("拿不到登入資訊");
				}
				this._token = accessToken;
			}
			return this._token;
		},

		// 直接呼叫 ChatGPT 自己的刪除 API（和選單刪除一樣是隱藏對話），不用點選單
		async _deleteByApi(thread) {
			const res = await fetch(
				`/backend-api/conversation/${encodeURIComponent(thread.id)}`,
				{
					method: "PATCH",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${await this._getToken()}`,
					},
					body: JSON.stringify({ is_visible: false }),
				},
			);
			if (res.status === 401) {
				this._token = null;
			}
			if (!res.ok) {
				throw new Error(`API ${res.status}`);
			}
			// 側邊欄不會自己更新；用隱藏取代移除，避免弄壞 React
			thread.el.style.display = "none";
			thread.el.setAttribute("data-abd-deleted", "");
		},

		// 一次平行送 6 筆，回傳成功的和第一個錯誤
		async deleteBatch(ids) {
			const deleted = [];
			let error = null;
			const queue = ids
				.map((id) => this.findThreadById(id))
				.filter(Boolean);
			const worker = async () => {
				for (let thread = queue.shift(); thread; thread = queue.shift()) {
					if (state.aborted || error) {
						return;
					}
					try {
						await this._deleteByApi(thread);
						deleted.push({ id: thread.id, title: thread.title });
						setStatus(`用 API 刪除中 ${deleted.length}/${ids.length}…`);
					} catch (err) {
						error = error || err.message;
					}
				}
			};
			await Promise.all(Array.from({ length: 6 }, worker));
			return { deleted, error };
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

	const geminiAdapter = {
		id: "gemini",
		label: "Gemini",

		isActive() {
			return Boolean(this._items().length);
		},

		_items() {
			return document.querySelectorAll(
				'[data-test-id="conversation"], side-navigation a[href^="/app/"]',
			);
		},

		_idOf(node) {
			const href = node.getAttribute("href") || "";
			const fromHref = href.match(/\/app\/([^/?#]+)/);
			if (fromHref) {
				return fromHref[1];
			}
			const fromLog = (node.getAttribute("jslog") || "").match(
				/"c_([0-9a-z]+)"/i,
			);
			return fromLog ? fromLog[1] : null;
		},

		getListContainer() {
			const [first] = this._items();
			return first ? first.closest("infinite-scroller") : null;
		},

		// 選項按鈕和對話列是兄弟節點，所以用外層容器當整列
		getThreads() {
			const out = [];
			const seen = new Set();
			for (const node of this._items()) {
				const id = this._idOf(node);
				if (!id || seen.has(id)) {
					continue;
				}
				const el =
					node.closest(".conversation-items-container") ||
					node.parentElement ||
					node;
				if (!isVisible(el)) {
					continue;
				}
				seen.add(id);
				out.push({ id, title: text(node) || id, el });
			}
			return out;
		},

		findThreadById(id) {
			return this.getThreads().find((t) => t.id === id) || null;
		},

		threadFromNode(node) {
			return this.getThreads().find((t) => t.el.contains(node)) || null;
		},

		async deleteFlow(thread, panel) {
			for (const type of ["mouseover", "mouseenter"]) {
				thread.el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
			}
			const optionsBtn = await waitFor(
				() =>
					thread.el.querySelector(
						'button[data-test-id="actions-menu-button"]',
					) ||
					[...thread.el.querySelectorAll("button")].find((b) => {
						const label = (b.getAttribute("aria-label") || "").toLowerCase();
						return ["選項", "更多", "option", "more"].some((w) =>
							label.includes(w),
						);
					}) ||
					null,
				{ timeout: 2000, interval: 50 },
			);
			if (!optionsBtn) {
				throw new Error("找不到選項按鈕");
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
		if (host === "gemini.google.com") {
			return geminiAdapter;
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
	#abd-status{margin-top:8px;font-size:12px;color:#555;min-height:16px;
		white-space:pre-line;max-height:160px;overflow:auto;}
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
		els.all.style.display = state.selectMode ? "block" : "none";
		els.all.disabled = state.running;
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

	// 刪除最多跑幾輪；沒刪掉的會在下一輪重試
	const MAX_ROUNDS = 3;

	async function deleteRound(allIds, round) {
		let done = 0;
		const failed = [];
		const requested = [];
		let ids = allIds;
		// 有 API 的網站先一次平行刪，剩下的才逐筆點選單
		if (state.adapter.deleteBatch && !state.aborted) {
			setStatus(`用 API 刪除 ${ids.length} 筆…`);
			const { deleted, error } = await state.adapter.deleteBatch(ids);
			requested.push(...deleted);
			const deletedIds = new Set(deleted.map(({ id }) => id));
			ids = ids.filter((id) => !deletedIds.has(id));
			if (error && ids.length) {
				setStatus(`API 失敗（${error}），改點選單…`);
				await sleep(1500);
			}
		}
		for (const id of ids) {
			if (state.aborted) {
				break;
			}
			const label = round > 1 ? `第 ${round} 輪重試 ` : "刪除中 ";
			setStatus(`${label}${done + 1}/${ids.length}…`);
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
				requested.push({ id, title });
			} else {
				failed.push({ id, title, msg: lastErr ? lastErr.message : "未知" });
			}
			done += 1;
			updateUI();
			await sleep(THROTTLE_MS); // 節流，降低觸發防濫用機制
		}

		setStatus("確認是否都刪掉了…");
		const stillThere = () =>
			requested.filter(({ id }) => state.adapter.findThreadById(id));
		await waitFor(() => (stillThere().length ? null : true), {
			timeout: 15000,
			interval: 200,
		});
		const left = new Set(stillThere().map(({ id }) => id));
		for (const item of requested) {
			if (left.has(item.id)) {
				failed.push({ ...item, msg: "送出刪除後仍在清單" });
			} else {
				state.selected.delete(item.id);
			}
		}
		return failed;
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

		let failed = [];
		let pending = ids;
		for (let round = 1; round <= MAX_ROUNDS && pending.length; round++) {
			if (state.aborted) {
				break;
			}
			if (round > 1) {
				pressEscape();
				await sleep(500);
			}
			failed = await deleteRound(pending, round);
			pending = failed.map(({ id }) => id);
		}

		state.running = false;
		updateUI();
		if (state.aborted) {
			setStatus(`已中止，剩 ${state.selected.size} 筆未刪`);
		} else if (failed.length) {
			// Google 頁面會吃掉 console 輸出，失敗原因直接顯示在面板上
			const detail = failed
				.map(({ title, msg }) => `${title.slice(0, 20)}：${msg}`)
				.join("\n");
			setStatus(`重試 ${MAX_ROUNDS} 輪後仍有 ${failed.length} 筆失敗\n${detail}`);
		} else {
			setStatus(`完成，已刪 ${ids.length} 筆`);
		}
	}

	function buildPanel() {
		if (document.getElementById("abd-panel")) {
			return;
		}
		// Gemini 有 Trusted Types，不能用 innerHTML，只能逐個建立節點
		const make = (tag, props = {}, children = []) => {
			const node = Object.assign(document.createElement(tag), props);
			node.append(...children);
			return node;
		};
		els = {
			toggle: make("button"),
			all: make("button", { textContent: "全選目前顯示的" }),
			del: make("button", { className: "abd-primary" }),
			abort: make("button", { textContent: "中止" }),
			status: make("div", { id: "abd-status" }),
		};
		els.all.style.display = "none";
		els.abort.style.display = "none";
		panel = make("div", { id: "abd-panel" }, [
			make("h3", {}, [
				make("span", { textContent: "AI 批次刪除" }),
				make("span", { textContent: state.adapter.label }),
			]),
			els.toggle,
			els.all,
			els.del,
			els.abort,
			els.status,
		]);
		document.body.appendChild(panel);

		els.toggle.addEventListener("click", () => {
			state.selectMode = !state.selectMode;
			if (!state.selectMode) {
				clearSelectionUI();
				setStatus("");
			} else {
				const n = state.adapter.getThreads().length;
				renderChecks();
				setStatus(
					n ? `找到 ${n} 筆，勾選要刪的` : "找不到對話，請先打開記錄清單",
				);
			}
			updateUI();
		});
		els.all.addEventListener("click", () => {
			renderChecks();
			for (const thread of state.adapter.getThreads()) {
				setSel(thread, true);
			}
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

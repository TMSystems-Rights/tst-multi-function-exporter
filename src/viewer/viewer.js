/**
 * @file TST多機能エクスポーター - viewer.js (真の最終完成版: イベント駆動同期アーキテクチャ)
 * @description
 * background.jsからの進捗通知(update-progress)を受け取り、UIを更新する。
 * ポーリングは不要。
 */

/* global TmCommon */

const TmViewer = {

	// ===================================================
	// DOM要素の参照
	// ===================================================
	Elements: {
		treeContainer: null,
		loadingMask: null,
		controlButtons: null,
		fileInput: null,
		progressBar: null,
		progressText: null,
		spinner: null,
		progressContainer: null,
		loadingText: null,
		loadingContent: null,

		/**
		 * DOM要素の参照を初期化する
		 */
		init: function () {
			this.treeContainer     = document.getElementById('tree-container');
			this.loadingMask       = document.getElementById('loading-mask');
			this.controlButtons    = document.querySelectorAll('.controls button');
			this.fileInput         = document.getElementById('file-input');
			this.progressBar       = document.getElementById('progress-bar');
			this.progressText      = document.getElementById('progress-text');
			this.spinner           = document.getElementById('spinner');
			this.progressContainer = document.getElementById('progress-container');
			this.loadingText       = document.getElementById('loading-text');
			this.loadingContent    = document.querySelector('.loading-content');
		}
	},

	// ===================================================
	// イベントハンドラ
	// ===================================================
	Handlers: {
		/**
		 * ファイル選択時のイベントハンドラ。
		 * @param {Event} event - input要素のchangeイベント。
		 */
		handleFileSelect: async function (event) {
			const file = event.target.files[0];
			if (!file) return;

			// UIを「復元モード」に切り替え
			TmViewer.UI.setLoadingState(true, 'restoring', 'viewerRestoring');
			try {
				const fileContent   = await file.text();
				const tabsToRestore = JSON.parse(fileContent);
				// background.jsに復元開始を依頼するだけ。進捗管理はbackground.jsに任せる。
				await browser.runtime.sendMessage({ type: 'restore-tabs', data: tabsToRestore });
			} catch (error) {
				console.error('復元エラー:', error);
				alert(TmCommon.Funcs.GetMsg("errorGeneric", error.message));
				TmViewer.UI.setLoadingState(false);
			} finally {
				event.target.value = '';
			}
		},

		/**
		 * ツリーコンテナ内でのクリックイベントを処理します。
		 * @param {MouseEvent} event - クリックイベント。
		 */
		handleTreeClick: function (event) {
			if (event.target.tagName === 'A') {
				event.preventDefault();
				const tabId = event.target.dataset.tabId;
				if (tabId) {
					browser.runtime.sendMessage({ type: 'focus-tst-tab', tabId: parseInt(tabId, 10) });
				}
			} else {
				const targetLi = event.target.closest('li');
				if (targetLi && targetLi.classList.contains('parent')) {
					targetLi.classList.toggle('open');
				}
			}
		},

		/**
		 * ツリーコンテナ内での右クリックでカスタムコンテキストメニューを表示します。
		 * @param {MouseEvent} event - contextmenuイベント。
		 */
		handleTreeContextMenu: function (event) {
			if (event.target.tagName === 'A') {
				event.preventDefault();
				TmViewer.UI.ContextMenu.close();
				const tabId = event.target.dataset.tabId;
				if (!tabId) return;
				const menu     = TmViewer.UI.ContextMenu.create(event.clientX, event.clientY);
				const menuItem = TmViewer.UI.ContextMenu.createDeleteMenuItem(event.target.textContent, tabId);
				menu.appendChild(menuItem);
				document.body.appendChild(menu);
			}
		}
	},

	// ===================================================
	// UI描画・操作
	// ===================================================
	UI: {
		/**
		 * 画面のローディング状態を管理します。
		 * @param {boolean} isLoading - ローディング状態にするか否か。
		 * @param {'loading' | 'restoring'} [mode='loading'] - 'loading': 通常読み込み, 'restoring': タブ復元。
		 * @param {string} [messageKey='viewerLoading'] - 表示するメッセージのi18nキー。
		 */
		setLoadingState: function (isLoading, mode = 'loading', messageKey = "viewerLoading") {
			const E = TmViewer.Elements;
			if (isLoading) {
				E.controlButtons.forEach(btn => btn.disabled = true);
				E.loadingMask.classList.add('is-active');

				if (mode === 'restoring') {
					E.loadingContent.style.display    = 'none';
					E.progressContainer.style.display = 'block';
					E.progressBar.style.width         = '0%';
					E.progressText.textContent        = TmCommon.Funcs.GetMsg(messageKey);
				} else {
					E.loadingContent.style.display    = 'block';
					E.progressContainer.style.display = 'none';
					E.loadingText.textContent         = TmCommon.Funcs.GetMsg(messageKey);
					E.spinner.style.display           = 'block';
				}
			} else {
				E.loadingMask.classList.remove('is-active');
				E.controlButtons.forEach(btn => btn.disabled = false);
				E.spinner.style.display = 'none';
			}
		},

		/**
		 * ツリーを再描画するメイン関数。
		 * @param {boolean} [expandAfterRender=false] - 描画後にツリーを全展開するか。
		 * @param {{openIds: Set<string>, scrollY: number}|null} [stateToRestore=null] - 復元するUIの状態。
		 * @param {boolean} [isRetry=false] - この呼び出しが再試行か。
		 */
		renderTree: async function (expandAfterRender = false, stateToRestore = null, isRetry = false) {
			if (!isRetry) {
				this.setLoadingState(true, 'loading');
			}
			const openParentIds = stateToRestore ? stateToRestore.openIds : this.getOpenParentIds();
			const scrollY       = stateToRestore ? stateToRestore.scrollY : window.scrollY;
			const E             = TmViewer.Elements;
			try {
				const treeData            = await browser.runtime.sendMessage({ type: 'get-viewer-data' });
				const hasUnresolvedTitles = treeData.some(node => !node.title || node.title === node.url);
				if (hasUnresolvedTitles && !isRetry) {
					console.log('未解決のタイトルを検出しました。1.5秒後に再取得を試みます...');
					const currentState = { openIds: openParentIds, scrollY: scrollY };
					setTimeout(() => this.renderTree(expandAfterRender, currentState, true), 1500);
					return;
				}
				if (treeData && treeData.length > 0) {
					E.treeContainer.innerHTML = this.buildHtmlList(treeData);
					document.title            = `${TmCommon.Funcs.GetMsg("viewerTitle")} - ${new Date().toLocaleString()}`;
					if (expandAfterRender) {
						this.expandAll();
					} else {
						this.restoreOpenParents(openParentIds);
					}
					window.scrollTo(0, scrollY);
				} else {
					E.treeContainer.innerHTML = `<p>${TmCommon.Funcs.GetMsg("errorNoTabToDisp")}</p>`;
				}
				this.setLoadingState(false);
			} catch (error) {
				console.error('renderTreeでエラー:', error);
				const errorMessage        = TmCommon.Funcs.GetMsg("errorGeneric", error.message);
				E.treeContainer.innerHTML = `<p>${errorMessage}</p>`;
				this.setLoadingState(false);
			}
		},

		/**
		 * ツリー構造データからHTML文字列を再帰的に生成します。
		 * @param {Array<object>} nodes - ツリー構造データ。
		 * @returns {string} - 生成されたHTML文字列。
		 */
		buildHtmlList: function (nodes) {
			if (!nodes || nodes.length === 0) return '';
			let html = '<ul>';
			for (const node of nodes) {
				const hasChildren = node.children && node.children.length > 0;
				html             += `<li${hasChildren ? ' class="parent"' : ''} data-li-id="${node.id}">`;
				let iconImg       = '';
				if (node.favIconUrl) {
					iconImg = `<div class="favicon-wrapper"><img src="${this.escapeHtml(node.favIconUrl)}" class="favicon" alt=""></div>`;
				} else {
					iconImg = `<div class="favicon-wrapper"></div>`;
				}
				html += `<div class="li-content">${iconImg}<div class="link-wrapper"><a data-tab-id="${node.id}" href="${this.escapeHtml(node.url || '#')}">${this.escapeHtml(node.title)}</a></div></div>`;
				if (hasChildren) {
					html += this.buildHtmlList(node.children);
				}
				html += '</li>';
			}
			html += '</ul>';
			return html;
		},

		/**
		 * 現在開いているフォルダのIDをSetとして取得します。
		 * @returns {Set<string>} - 開いているフォルダの`data-li-id`の集合。
		 */
		getOpenParentIds: function () {
			const ids = new Set();
			document.querySelectorAll('#tree-container li.parent.open').forEach(li => {
				ids.add(li.dataset.liId);
			});
			return ids;
		},

		/**
		 * フォルダの開閉状態を復元します。
		 * @param {Set<string>} ids - 復元するフォルダIDの集合。
		 */
		restoreOpenParents: function (ids) {
			ids.forEach(id => {
				const li = document.querySelector(`li[data-li-id="${id}"]`);
				if (li) {
					li.classList.add('open');
				}
			});
		},

		/**
		 * ツリー内のすべてのフォルダを展開します。
		 */
		expandAll: function () {
			document.querySelectorAll('#tree-container li.parent').forEach(li => li.classList.add('open'));
		},

		/**
		 * ツリー内のすべてのフォルダを折りたたみます。
		 */
		collapseAll: function () {
			document.querySelectorAll('#tree-container li.parent').forEach(li => li.classList.remove('open'));
		},

		/**
		 * 文字列をHTMLエスケープします。
		 * @param {string|undefined|null} str - エスケープする文字列。
		 * @returns {string} - エスケープされた文字列。
		 */
		escapeHtml: function (str) {
			if (str === null || typeof str === 'undefined') return '';
			const p       = document.createElement("p");
			p.textContent = str;
			return p.innerHTML;
		},

		// コンテキストメニュー関連のヘルパーをまとめる
		ContextMenu: {
			/**
			 * カスタムコンテキストメニューの親要素を作成します。
			 * @param {number} x - 表示するx座標。
			 * @param {number} y - 表示するy座標。
			 * @returns {HTMLDivElement} - 生成されたメニューのDOM要素。
			 */
			create: function (x, y) {
				const menu      = document.createElement('div');
				menu.className  = 'custom-context-menu';
				menu.style.left = `${x}px`;
				menu.style.top  = `${y}px`;
				return menu;
			},

			/**
			 * 「このタブを削除」のメニュー項目を作成します。
			 * @param {string} title - 削除対象タブのタイトル。
			 * @param {string} tabId - 削除対象タブのID。
			 * @returns {HTMLDivElement} - 生成されたメニュー項目のDOM要素。
			 */
			createDeleteMenuItem: function (title, tabId) {
				const menuItem     = document.createElement('div');
				menuItem.className = 'custom-context-menu-item';
				menuItem.innerText = `${TmCommon.Funcs.GetMsg("contextMenuDelete") || 'このタブを削除'}\n${title}`;
				menuItem.addEventListener('click', async () => {
					try {
						const openParentIds = TmViewer.UI.getOpenParentIds();
						const scrollY       = window.scrollY;
						const response      = await browser.runtime.sendMessage({ type: 'delete-tab', tabId: parseInt(tabId, 10) });
						if (response && response.success) {
							await TmViewer.UI.renderTree(false, { openIds: openParentIds, scrollY: scrollY });
						}
					} catch (err) {
						alert(TmCommon.Funcs.GetMsg("errorGeneric", err.message));
						console.error('タブの削除に失敗しました:', err);
					}
					this.close();
				});
				return menuItem;
			},

			/**
			 * 表示されているカスタムコンテキストメニューを閉じます。
			 */
			close: function () {
				const existingMenu = document.querySelector('.custom-context-menu');
				if (existingMenu) {
					existingMenu.remove();
				}
			}
		}
	},


	// ===================================================
	// 初期化処理
	// ===================================================
	Init: {
		/**
		 * ページロード時に実行されるメインの初期化処理
		 */
		run: function () {
			TmViewer.Elements.init();
			TmCommon.Funcs.SetDocumentLocale();
			this.setupEventListeners();
			TmViewer.UI.renderTree(true);
		},

		/**
		 * ページ上のすべてのUI要素に対するイベントリスナーを初期化します。
		 */
		setupEventListeners: function () {
			const E        = TmViewer.Elements;
			const UI       = TmViewer.UI;
			const Handlers = TmViewer.Handlers;

			document.getElementById('refreshBtn').addEventListener('click', () => UI.renderTree(true));
			document.getElementById('expandAll').addEventListener('click', UI.expandAll);
			document.getElementById('collapseAll').addEventListener('click', UI.collapseAll);
			document.getElementById('restoreBtn').addEventListener('click', () => E.fileInput.click());
			E.fileInput.addEventListener('change', Handlers.handleFileSelect);

			document.addEventListener('click', UI.ContextMenu.close);
			E.treeContainer.addEventListener('click', Handlers.handleTreeClick);
			E.treeContainer.addEventListener('contextmenu', Handlers.handleTreeContextMenu);

			// backgrpound.jsからのプッシュ通知を受信するリスナー
			browser.runtime.onMessage.addListener((message) => {
				if (message.type === 'refresh-view') {
					// 完了時にUIを更新
					console.log('バックグラウンドから最終更新通知を受信。再描画します。');
					UI.setLoadingState(false);
					UI.renderTree(true);
				} else if (message.type === 'update-progress') {
					// 進捗情報のUIを更新
					const percent              = message.total > 0 ? (message.loaded / message.total) * 100 : 0;
					E.progressBar.style.width  = `${percent}%`;
					E.progressText.textContent = `復元中: ${message.loaded} / ${message.total}`;
				}
			});
		}
	}
};

// ===================================================
// ページ読み込み完了時の処理開始
// ===================================================
document.addEventListener('DOMContentLoaded', () => {
	TmViewer.Init.run();
});


// 意図しない変更を防ぐためにシールor凍結
Object.seal(TmViewer.Elements);
Object.freeze(TmViewer.Handlers);
Object.freeze(TmViewer.UI);
Object.freeze(TmViewer.UI.ContextMenu);
Object.freeze(TmViewer.Init);
Object.freeze(TmViewer);
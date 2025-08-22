/**
 * @file TST多機能エクスポーター - viewer.js (真の最終完成版: イベント駆動同期アーキテクチャ)
 * @description
 * background.jsからの進捗通知(update-progress)を受け取り、UIを更新する。
 * ポーリングは不要。
 */

/* global TmCommon */

const TmViewer = {

	// ===================================================
	// 定数
	// ===================================================
	Const: {
		progressRatePrefix: null
	},

	// ★★★ [追加] ここから ★★★
	// ===================================================
	// グローバルな状態管理
	// ===================================================
	State: {
		currentMode: 'browse', // 'browse' or 'sort'
	},
	// ★★★ [追加] ここまで ★★★

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
		modeSelector: null, // ★★★ [追加] ★★★

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
			this.modeSelector      = document.getElementById('mode-selector'); // ★★★ [追加] ★★★

			// 進捗率の接頭辞設定
			TmViewer.Const.progressRatePrefix = TmCommon.Funcs.GetMsg('restoreProgressRatePrefix');
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
		 * ★★★ [修正版] ルート階層のソートに対応 ★★★
		 * ツリーコンテナ内での右クリックでカスタムコンテキストメニューを表示します。
		 * @param {MouseEvent} event - contextmenuイベント。
		 */
		handleTreeContextMenu: function (event) {
			event.preventDefault();
			TmViewer.UI.ContextMenu.close();

			const mode = TmViewer.State.currentMode;

			// 1. クリックされた場所から、最も近い`<li>`要素を探す
			const clickedLi = event.target.closest('li');
			if (!clickedLi) return; // li要素の上でなければ何もしない

			// 2. `<li>`要素から`<a>`タグの情報を取得する
			const clickedA = clickedLi.querySelector(':scope > .li-content a');
			if (!clickedA) return;
			const tabId   = clickedA.dataset.tabId;
			const tabText = clickedA.textContent;

			const menu = TmViewer.UI.ContextMenu.create(event.clientX, event.clientY);

			if (mode === 'browse') {
				if (tabId !== 'pinned') {
					menu.appendChild(TmViewer.UI.ContextMenu.createDeleteMenuItem(tabText, tabId));
				}
			} else if (mode === 'sort') {
				// 3. ソート対象となる親`<li>` (またはルート) を判定する
				let sortTargetParentLi = null;
				let sortMenuItemId     = null;

				if (clickedLi.classList.contains('parent')) {
					// 親タブ自身がクリックされた
					sortTargetParentLi = clickedLi;
					sortMenuItemId     = sortTargetParentLi.dataset.liId;
				} else if (clickedLi.parentElement?.parentElement.id === 'tree-container') {
					// ルート階層のタブがクリックされた
					sortMenuItemId = 'root';
				} else if (clickedLi.parentElement?.parentElement.classList.contains('parent')) {
					// 通常階層の子タブがクリックされた
					sortTargetParentLi = clickedLi.parentElement.parentElement;
					sortMenuItemId     = sortTargetParentLi.dataset.liId;
				}

				// 4. メニューを作成する
				if (sortMenuItemId) {
					menu.appendChild(TmViewer.UI.ContextMenu.createSortMenuItem(sortMenuItemId));
				}

				if (tabId !== 'pinned') {
					// 削除メニューは、クリックされたタブ自身を対象に追加
					const deleteTargetTitle = sortTargetParentLi ? sortTargetParentLi.querySelector('a')?.textContent : tabText;
					const deleteTargetId    = sortTargetParentLi ? sortTargetParentLi.dataset.liId : tabId;
					if (deleteTargetTitle && deleteTargetId) {
						menu.appendChild(TmViewer.UI.ContextMenu.createDeleteMenuItem(deleteTargetTitle, deleteTargetId));
					}
				}

				// 5. ハイライト処理 (ソート対象を視覚的に示す)
				if (sortMenuItemId === 'root') {
					const rootUl = document.querySelector('#tree-container > ul');
					if (rootUl) {
						for (const childLi of rootUl.children) {
							// ピン留めタブはハイライトしない
							if (childLi.querySelector('a')?.dataset.tabId !== 'pinned') {
								childLi.querySelector('.li-content')?.classList.add('sort-target');
							}
						}
					}
				} else if (sortTargetParentLi) {
					// 親タブ(sortTargetParentLi)の直下の子タブのみをハイライトする
					const childUl = sortTargetParentLi.querySelector(':scope > ul');
					if (childUl) {
						for (const childLi of childUl.children) {
							childLi.querySelector(':scope > .li-content')?.classList.add('sort-target');
						}
					}
				}
			}

			if (menu.hasChildNodes()) {
				document.body.appendChild(menu);
			}
		},
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
				const classes     = [];
				if (hasChildren) {
					classes.push('parent');
				}
				if (node.pinned) { // ★★★ [修正] node.pinnedプロパティをチェック ★★★
					classes.push('pinned-tab');
				}
				const classAttr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
				html           += `<li${classAttr} data-li-id="${node.id}">`;

				let iconImg = '';
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
			 * ★★★ [修正版] ルート階層のソートに対応 ★★★
			 * 「この階層をソート」のメニュー項目を作成します。
			 * @param {string} targetId - ソート対象の親タブのID、または 'root'。
			 * @returns {HTMLDivElement} - 生成されたメニュー項目のDOM要素。
			 */
			createSortMenuItem: function (targetId) {
				const menuItem     = document.createElement('div');
				menuItem.className = 'custom-context-menu-item';
				menuItem.innerText = TmCommon.Funcs.GetMsg("contextMenuSort") || 'この階層をタイトル昇順でソート';

				menuItem.addEventListener('click', async () => {
					let childListElement = null;
					let parentTabIdForBg = null;

					if (targetId === 'root') {
						// ルート階層のソート
						childListElement = document.querySelector('#tree-container > ul');
						parentTabIdForBg = null; // background.js へは null を渡す
					} else {
						// 通常階層のソート
						const parentLi = document.querySelector(`li[data-li-id="${targetId}"]`);
						if (!parentLi) {
							this.close();
							return;
						}
						childListElement = parentLi.querySelector(':scope > ul');
						parentTabIdForBg = parseInt(targetId, 10);
					}

					if (!childListElement) {
						this.close();
						return;
					}

					// 子要素のタブ情報を収集
					const childrenInfo = [];
					for (const childLi of childListElement.children) {
						if (childLi.tagName !== 'LI') continue;
						const link = childLi.querySelector(':scope > .li-content a');
						// ★★★ [修正] プレースホルダーと、実際のピン留めタブ(.pinned-tabクラス)の両方を除外 ★★★
						if (link && link.dataset.tabId && link.dataset.tabId !== 'pinned' && !childLi.classList.contains('pinned-tab')) {
							childrenInfo.push({
								id: parseInt(link.dataset.tabId, 10),
								title: (link.textContent || '').trim().toLowerCase()
							});
						}
					}

					// ソート対象が1つ以下なら何もしない
					if (childrenInfo.length <= 1) {
						this.close();
						return;
					}

					console.log('ソート前の配列:', JSON.parse(JSON.stringify(childrenInfo)));

					// タイトルでソート(数値も考慮した自然順ソート)
					childrenInfo.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));

					const sortedTabIds = childrenInfo.map(info => info.id);
					console.log('ソート後のID配列:', sortedTabIds);

					// background.jsにソートを依頼
					try {
						TmViewer.UI.setLoadingState(true, 'loading', 'viewerSorting');
						const response = await browser.runtime.sendMessage({
							type: 'sort-tabs',
							parentTabId: parentTabIdForBg, // ルートの場合は null
							sortedTabIds: sortedTabIds
						});
						if (response && response.success) {
							// ソート成功後、TST側での処理反映を待ってから再描画
							setTimeout(() => {
								const openParentIds = TmViewer.UI.getOpenParentIds();
								const scrollY       = window.scrollY;
								TmViewer.UI.renderTree(false, { openIds: openParentIds, scrollY: scrollY });
							}, 800);
						} else {
							throw new Error(response.error || 'ソート処理に失敗しました。');
						}
					} catch (err) {
						alert(TmCommon.Funcs.GetMsg("errorGeneric", err.message));
						console.error('タブのソートに失敗しました:', err);
						TmViewer.UI.setLoadingState(false);
					} finally {
						this.close();
					}
				});
				return menuItem;
			},

			/**
			 * ★★★ [変更] ハイライト解除処理を追加 ★★★
			 * 表示されているカスタムコンテキストメニューを閉じます。
			 */
			close: function () {
				// ハイライトを解除
				document.querySelectorAll('.li-content.sort-target').forEach(el => {
					el.classList.remove('sort-target');
				});
				// 既存のメニューを削除
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

			const State = TmViewer.State; // ★★★ [追加] ★★★

			document.getElementById('refreshBtn').addEventListener('click', () => UI.renderTree(true));
			document.getElementById('expandAll').addEventListener('click', UI.expandAll);
			document.getElementById('collapseAll').addEventListener('click', UI.collapseAll);
			document.getElementById('restoreBtn').addEventListener('click', () => E.fileInput.click());
			E.fileInput.addEventListener('change', Handlers.handleFileSelect);

			// ★★★ [新設] モード切替ラジオボタンのイベントリスナー ★★★
			E.modeSelector.addEventListener('change', (event) => {
				State.currentMode = event.target.value;
				console.log(`モードが "${State.currentMode}" に変更されました。`);
				// モードが切り替わったらメニューとハイライトを閉じる
				UI.ContextMenu.close();
			});

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
					// 詳細な進捗情報に基づいてUIを更新する
					const { stage, stageText, loaded, total } = message;

					// --- テキストを更新 ---
					if (stage === 1) {
						// 第1段階は、詳細情報（件数、パーセント）も表示
						const percentage           = (total > 0) ? ((loaded / total) * 100).toFixed(1) : '0.0';
						E.progressText.textContent = `${stageText} ${loaded} / ${total} (${TmViewer.Const.progressRatePrefix}${percentage}%)`;
					} else {
						// 第2段階以降は、ステージ名のみ表示
						E.progressText.textContent = stageText;
					}

					// --- プログレスバーを更新 ---
					// 各ステージの完了度合いに応じて、バーの進捗をマッピングします
					let barPercentage = 0;
					if (stage === 1) {
						// 第1段階は最も時間がかかるため、バーの0% -> 80% を割り当てる
						barPercentage = (total > 0) ? (loaded / total) * 80 : 0;
					} else if (stage === 2) {
						barPercentage = 85;
					} else if (stage === 3) {
						barPercentage = 90;
					} else if (stage === 4) {
						barPercentage = 95;
					} else if (stage === 5) {
						barPercentage = 100;
					}

					E.progressBar.style.width = `${barPercentage}%`;
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
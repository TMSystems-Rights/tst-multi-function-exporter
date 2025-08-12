/**
 * @file TST多機能エクスポーター - viewer.js (最終完成版: ポーリング・アーキテクチャ)
 * @description
 * background.jsに定期的に進捗を問い合わせる（ポーリング）ことで、
 * 高負荷な状況でも安定したUI更新を実現します。
 */

/* global TmCommon */

// ===================================================
// グローバル要素の参照
// ===================================================
const treeContainer     = document.getElementById('tree-container');
const loadingMask       = document.getElementById('loading-mask');
const controlButtons    = document.querySelectorAll('.controls button');
const fileInput         = document.getElementById('file-input');
const progressBar       = document.getElementById('progress-bar');
const progressText      = document.getElementById('progress-text');
const spinner           = document.getElementById('spinner');
const progressContainer = document.getElementById('progress-container');
const loadingText       = document.getElementById('loading-text');
const loadingContent    = document.querySelector('.loading-content');

/**
 * background.jsの進捗をポーリングするためのインターバルID。
 * @type {number|null}
 */
let progressInterval = null;

// ===================================================
// 初期化処理
// ===================================================
document.addEventListener('DOMContentLoaded', () => {
	TmCommon.Funcs.SetDocumentLocale();
	setupEventListeners();
	renderTree(true);
});

/**
 * ページ上のすべてのUI要素に対するイベントリスナーを初期化します。
 */
function setupEventListeners() {
	document.getElementById('refreshBtn').addEventListener('click', () => renderTree(true));
	document.getElementById('expandAll').addEventListener('click', expandAll);
	document.getElementById('collapseAll').addEventListener('click', collapseAll);
	document.getElementById('restoreBtn').addEventListener('click', () => fileInput.click());
	fileInput.addEventListener('change', handleFileSelect);

	document.addEventListener('click', closeContextMenu);
	treeContainer.addEventListener('click', handleTreeClick);
	treeContainer.addEventListener('contextmenu', handleTreeContextMenu);

	browser.runtime.onMessage.addListener((message) => {
		if (message.type === 'refresh-view') {
			console.log('バックグラウンドから最終更新通知を受信。ポーリングを停止し、再描画します。');
			if (progressInterval) {
				clearInterval(progressInterval);
				progressInterval = null;
			}
			setLoadingState(false);
			renderTree(true);
		}
	});
}

// ===================================================
// UI状態管理
// ===================================================
/**
 * 画面のローディング状態を管理します。
 * @param {boolean} isLoading - ローディング状態にするか否か。
 * @param {'loading' | 'restoring'} [mode='loading'] - 'loading': 通常読み込み, 'restoring': タブ復元。
 * @param {string} [messageKey='viewerLoading'] - 表示するメッセージのi18nキー。
 */
function setLoadingState(isLoading, mode = 'loading', messageKey = "viewerLoading") {
	if (isLoading) {
		controlButtons.forEach(btn => btn.disabled = true);
		loadingMask.classList.add('is-active');

		if (mode === 'restoring') {
			loadingContent.style.display    = 'none';
			progressContainer.style.display = 'block';
			progressBar.style.width         = '0%';
			progressText.textContent        = TmCommon.Funcs.GetMsg(messageKey);
		} else {
			loadingContent.style.display    = 'block';
			progressContainer.style.display = 'none';
			loadingText.textContent         = TmCommon.Funcs.GetMsg(messageKey);
			spinner.style.display           = 'block';
		}
	} else {
		loadingMask.classList.remove('is-active');
		controlButtons.forEach(btn => btn.disabled = false);
		spinner.style.display = 'none';
	}
}

/**
 * ツリーを再描画するメイン関数。
 * @param {boolean} [expandAfterRender=false] - 描画後にツリーを全展開するか。
 * @param {{openIds: Set<string>, scrollY: number}|null} [stateToRestore=null] - 復元するUIの状態。
 * @param {boolean} [isRetry=false] - この呼び出しが再試行か。
 */
async function renderTree(expandAfterRender = false, stateToRestore = null, isRetry = false) {
	if (!isRetry) {
		setLoadingState(true, 'loading');
	}
	const openParentIds = stateToRestore ? stateToRestore.openIds : getOpenParentIds();
	const scrollY       = stateToRestore ? stateToRestore.scrollY : window.scrollY;
	try {
		const treeData            = await browser.runtime.sendMessage({ type: 'get-viewer-data' });
		const hasUnresolvedTitles = treeData.some(node => !node.title || node.title === node.url);
		if (hasUnresolvedTitles && !isRetry) {
			console.log('未解決のタイトルを検出しました。1.5秒後に再取得を試みます...');
			const currentState = { openIds: openParentIds, scrollY: scrollY };
			setTimeout(() => renderTree(expandAfterRender, currentState, true), 1500);
			return;
		}
		if (treeData && treeData.length > 0) {
			treeContainer.innerHTML = buildHtmlList(treeData);
			document.title          = `${TmCommon.Funcs.GetMsg("viewerTitle")} - ${new Date().toLocaleString()}`;
			if (expandAfterRender) {
				expandAll();
			} else {
				restoreOpenParents(openParentIds);
			}
			window.scrollTo(0, scrollY);
		} else {
			treeContainer.innerHTML = `<p>${TmCommon.Funcs.GetMsg("errorNoTabToDisp")}</p>`;
		}
		setLoadingState(false);
	} catch (error) {
		console.error('renderTreeでエラー:', error);
		const errorMessage      = TmCommon.Funcs.GetMsg("errorGeneric", error.message);
		treeContainer.innerHTML = `<p>${errorMessage}</p>`;
		setLoadingState(false);
	}
}

// ===================================================
// イベントハンドラ
// ===================================================
/**
 * ファイル選択時のイベントハンドラ。
 * @param {Event} event - input要素のchangeイベント。
 */
async function handleFileSelect(event) {
	const file = event.target.files[0];
	if (!file) return;
	setLoadingState(true, 'restoring', 'viewerRestoring');
	try {
		const fileContent   = await file.text();
		const tabsToRestore = JSON.parse(fileContent);
		const response      = await browser.runtime.sendMessage({ type: 'restore-tabs', data: tabsToRestore });
		if (response && response.success) {
			if (progressInterval) clearInterval(progressInterval);
			progressInterval = setInterval(updateProgressUI, 250);
		} else {
			throw new Error(response.error || '復元の開始に失敗しました。');
		}
	} catch (error) {
		console.error('復元エラー:', error);
		alert(TmCommon.Funcs.GetMsg("errorGeneric", error.message));
		if (progressInterval) clearInterval(progressInterval);
		progressInterval = null;
		setLoadingState(false);
	} finally {
		event.target.value = '';
	}
}

/**
 * 進捗をポーリングしてUIを更新します。
 */
async function updateProgressUI() {
	try {
		const state = await browser.runtime.sendMessage({ type: 'get-restore-progress' });
		if (state && state.inProgress) {
			const percent            = state.total > 0 ? (state.loaded / state.total) * 100 : 0;
			progressBar.style.width  = `${percent}%`;
			progressText.textContent = `復元中: ${state.loaded} / ${state.total}`;
		} else {
			if (progressInterval) {
				clearInterval(progressInterval);
				progressInterval         = null;
				progressBar.style.width  = '100%';
				progressText.textContent = `復元完了: ${state.total} / ${state.total}`;
			}
		}
	} catch (e) {
		console.error("進捗の取得に失敗:", e);
		if (progressInterval) clearInterval(progressInterval);
		progressInterval = null;
	}
}

/**
 * ツリーコンテナ内でのクリックイベントを処理します。
 * @param {MouseEvent} event - クリックイベント。
 */
function handleTreeClick(event) {
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
}

/**
 * ツリーコンテナ内での右クリックでカスタムコンテキストメニューを表示します。
 * @param {MouseEvent} event - contextmenuイベント。
 */
function handleTreeContextMenu(event) {
	if (event.target.tagName === 'A') {
		event.preventDefault();
		closeContextMenu();
		const tabId = event.target.dataset.tabId;
		if (!tabId) return;
		const menu     = createContextMenu(event.clientX, event.clientY);
		const menuItem = createDeleteMenuItem(event.target.textContent, tabId);
		menu.appendChild(menuItem);
		document.body.appendChild(menu);
	}
}

/**
 * 「このタブを削除」のメニュー項目を作成します。
 * @param {string} title - 削除対象タブのタイトル。
 * @param {string} tabId - 削除対象タブのID。
 * @returns {HTMLDivElement} - 生成されたメニュー項目のDOM要素。
 */
function createDeleteMenuItem(title, tabId) {
	const menuItem     = document.createElement('div');
	menuItem.className = 'custom-context-menu-item';
	menuItem.innerText = `${TmCommon.Funcs.GetMsg("contextMenuDelete") || 'このタブを削除'}\n${title}`;
	menuItem.addEventListener('click', async () => {
		try {
			const openParentIds = getOpenParentIds();
			const scrollY       = window.scrollY;
			const response      = await browser.runtime.sendMessage({ type: 'delete-tab', tabId: parseInt(tabId, 10) });
			if (response && response.success) {
				await renderTree(false, { openIds: openParentIds, scrollY: scrollY });
			}
		} catch (err) {
			alert(TmCommon.Funcs.GetMsg("errorGeneric", err.message));
			console.error('タブの削除に失敗しました:', err);
		}
		closeContextMenu();
	});
	return menuItem;
}

// ===================================================
// UIヘルパー関数
// ===================================================
/**
 * 現在開いているフォルダのIDをSetとして取得します。
 * @returns {Set<string>} - 開いているフォルダの`data-li-id`の集合。
 */
function getOpenParentIds() {
	const ids = new Set();
	document.querySelectorAll('#tree-container li.parent.open').forEach(li => {
		ids.add(li.dataset.liId);
	});
	return ids;
}

/**
 * フォルダの開閉状態を復元します。
 * @param {Set<string>} ids - 復元するフォルダIDの集合。
 */
function restoreOpenParents(ids) {
	ids.forEach(id => {
		const li = document.querySelector(`li[data-li-id="${id}"]`);
		if (li) {
			li.classList.add('open');
		}
	});
}

/**
 * ツリー内のすべてのフォルダを展開します。
 */
function expandAll() {
	document.querySelectorAll('#tree-container li.parent').forEach(li => li.classList.add('open'));
}

/**
 * ツリー内のすべてのフォルダを折りたたみます。
 */
function collapseAll() {
	document.querySelectorAll('#tree-container li.parent').forEach(li => li.classList.remove('open'));
}

/**
 * ツリー構造データからHTML文字列を再帰的に生成します。
 * @param {Array<object>} nodes - ツリー構造データ。
 * @returns {string} - 生成されたHTML文字列。
 */
function buildHtmlList(nodes) {
	if (!nodes || nodes.length === 0) return '';
	let html = '<ul>';
	for (const node of nodes) {
		const hasChildren = node.children && node.children.length > 0;
		html             += `<li${hasChildren ? ' class="parent"' : ''} data-li-id="${node.id}">`;
		let iconImg       = '';
		if (node.favIconUrl) {
			iconImg = `<div class="favicon-wrapper"><img src="${escapeHtml(node.favIconUrl)}" class="favicon" alt=""></div>`;
		} else {
			iconImg = `<div class="favicon-wrapper"></div>`;
		}
		html += `<div class="li-content">${iconImg}<div class="link-wrapper"><a data-tab-id="${node.id}" href="${escapeHtml(node.url || '#')}">${escapeHtml(node.title)}</a></div></div>`;
		if (hasChildren) {
			html += buildHtmlList(node.children);
		}
		html += '</li>';
	}
	html += '</ul>';
	return html;
}

/**
 * 文字列をHTMLエスケープします。
 * @param {string} str - エスケープする文字列。
 * @returns {string} - エスケープされた文字列。
 */
function escapeHtml(str) {
	const p       = document.createElement("p");
	p.textContent = str;
	return p.innerHTML;
}

/**
 * 表示されているカスタムコンテキストメニューを閉じます。
 */
function closeContextMenu() {
	const existingMenu = document.querySelector('.custom-context-menu');
	if (existingMenu) {
		existingMenu.remove();
	}
}

/**
 * カスタムコンテキストメニューの親要素を作成します。
 * @param {number} x - 表示するx座標。
 * @param {number} y - 表示するy座標。
 * @returns {HTMLDivElement} - 生成されたメニューのDOM要素。
 */
function createContextMenu(x, y) {
	const menu      = document.createElement('div');
	menu.className  = 'custom-context-menu';
	menu.style.left = `${x}px`;
	menu.style.top  = `${y}px`;
	return menu;
}
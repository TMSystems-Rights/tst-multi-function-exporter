/* global TmCommon */

// ===================================================
// グローバル要素の参照
// ===================================================
const treeContainer  = document.getElementById('tree-container');
const loadingMask    = document.getElementById('loading-mask');
const controlButtons = document.querySelectorAll('.controls button');
const fileInput      = document.getElementById('file-input');
const progressBar    = document.getElementById('progress-bar');
const progressText   = document.getElementById('progress-text');
let progressInterval = null;


// ===================================================
// イベントリスナー
// ===================================================
document.addEventListener('DOMContentLoaded', () => {
	TmCommon.Funcs.SetDocumentLocale();
	setupEventListeners();
	renderTree(true);
});

/**
 *
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
			renderTree(true);
			setLoadingState(false);
		} else if (message.type === 'update-progress') {
			const percent            = message.total > 0 ? (message.loaded / message.total) * 100 : 0;
			progressBar.style.width  = `${percent}%`;
			progressText.textContent = `復元中: ${message.loaded} / ${message.total}`;
		}
	});
}


// ===================================================
// UI状態管理
// ===================================================
/**
 *
 */
function setLoadingState(isLoading, messageKey = "viewerLoading") {
	if (isLoading) {
		progressBar.style.width  = '0%';
		progressText.textContent = '';
		treeContainer.innerHTML  = `<p>${TmCommon.Funcs.GetMsg(messageKey)}</p>`;
		loadingMask.classList.add('is-active');
		controlButtons.forEach(btn => btn.disabled = true);
	} else {
		loadingMask.classList.remove('is-active');
		controlButtons.forEach(btn => btn.disabled = false);
	}
}


/**
 * ツリーを再描画するメイン関数
 * @param {boolean} [expandAfterRender=false] - 描画後にツリーを全展開するか
 * @param {object} [stateToRestore=null] - 復元する状態
 * @param {boolean} [isRetry=false] - これが再試行であるかを示すフラグ
 */
async function renderTree(expandAfterRender = false, stateToRestore = null, isRetry = false) {

	let hasUnresolvedTitles = false;

	// 初回の呼び出し（再試行ではない）で、かつ、状態の復元中でもない場合のみ、ローディングUIを表示する
	if (!isRetry && !stateToRestore) {
		setLoadingState(true);
	}

	// 状態を保存するのは、再試行ではなく、かつ状態復元でもない場合のみ
	// （再試行時や削除後の復元時は、オリジナルの状態を維持する）
	const openParentIds = isRetry || stateToRestore ? stateToRestore.openIds : getOpenParentIds();
	const scrollY       = isRetry || stateToRestore ? stateToRestore.scrollY : window.scrollY;

	try {
		const treeData = await browser.runtime.sendMessage({ type: 'get-viewer-data' });

		// 未解決のタイトルがあり、かつ、まだ再試行していなければ、1.5秒後に再試行する
		hasUnresolvedTitles = treeData.some(node => !node.title || node.title === node.url);
		if (hasUnresolvedTitles && !isRetry) {
			console.log('未解決のタイトルを検出しました。1.5秒後に再取得を試みます...');
			// 状態を維持したまま、再試行フラグを立てて、もう一度だけrenderTreeを呼び出す
			const currentState = { openIds: openParentIds, scrollY: scrollY };
			setTimeout(() => renderTree(expandAfterRender, currentState, true), 1500);
			return; // 今回の描画は中断
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
	} catch (error) {
		console.error('renderTreeでエラー:', error);
		const errorMessage      = TmCommon.Funcs.GetMsg("errorGeneric", error.message);
		treeContainer.innerHTML = `<p>${errorMessage}</p>`;
	} finally {
		// どのような場合でも、最終的にローディングUIを非表示にする
		// ただし、再試行の途中では非表示にしない
		if (!hasUnresolvedTitles || isRetry) {
			setLoadingState(false);
		}
	}
}


// ===================================================
// イベントハンドラ
// ===================================================
/**
 *
 */
async function handleFileSelect(event) {
	const file = event.target.files[0];
	if (!file) return;
	setLoadingState(true, "viewerRestoring");
	if (progressInterval) clearInterval(progressInterval);
	progressInterval = setInterval(updateProgressUI, 300);
	try {
		const fileContent   = await file.text();
		const tabsToRestore = JSON.parse(fileContent);
		browser.runtime.sendMessage({ type: 'restore-tabs', data: tabsToRestore });
	} catch (error) {
		console.error('復元エラー:', error);
		alert(TmCommon.Funcs.GetMsg("errorGeneric", error.message));
		if (progressInterval) clearInterval(progressInterval);
		progressInterval = null;
		setLoadingState(false);
		renderTree();
	} finally {
		event.target.value = '';
	}
}

/**
 *
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
				progressInterval = null;
			}
		}
	} catch (e) {
		console.error("進捗の取得に失敗:", e);
		if (progressInterval) clearInterval(progressInterval);
		progressInterval = null;
	}
}


// ===================================================
// イベントハンドラ
// ===================================================
/** */
function handleTreeClick(event) {
	if (event.target.tagName === 'A') {
		// リンクがクリックされた場合、タブをフォーカスする
		event.preventDefault();
		const tabId = event.target.dataset.tabId;
		if (tabId) {
			browser.runtime.sendMessage({ type: 'focus-tst-tab', tabId: parseInt(tabId, 10) });
		}
	} else {
		// 親要素を遡り直近のli要素を取得
		const targetLi = event.target.closest('li');
		if (targetLi && targetLi.classList.contains('parent')) {
			// clickイベント対象行がツリー開閉トグルボタンがある場合にオープン状態を切り替える（ただの行は開閉操作をしない）
			targetLi.classList.toggle('open');
		}
	}
}

/** */
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

/** */
function createDeleteMenuItem(title, tabId) {
	const menuItem     = document.createElement('div');
	menuItem.className = 'custom-context-menu-item';
	// 多言語対応のためにキーを使う（messages.jsonに "contextMenuDelete": { "message": "このタブを削除" } を追加）
	menuItem.innerText = `${TmCommon.Funcs.GetMsg("contextMenuDelete") || 'このタブを削除'}\n${title}`;

	menuItem.addEventListener('click', async () => {
		try {
			// ★★★ 削除実行直前に、現在の状態を保存 ★★★
			const openParentIds = getOpenParentIds();
			const scrollY       = window.scrollY;

			const response = await browser.runtime.sendMessage({ type: 'delete-tab', tabId: parseInt(tabId, 10) });

			if (response && response.success) {
				// ★★★ 保存した状態を渡して、再描画を依頼 ★★★
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
/** */
function getOpenParentIds() {
	const ids = new Set();
	document.querySelectorAll('#tree-container li.parent.open').forEach(li => {
		ids.add(li.dataset.liId);
	});
	return ids;
}

/** */
function restoreOpenParents(ids) {
	ids.forEach(id => {
		const li = document.querySelector(`li[data-li-id="${id}"]`);
		if (li) {
			li.classList.add('open');
		}
	});
}


/** */
function expandAll() {
	document.querySelectorAll('#tree-container li.parent').forEach(li => li.classList.add('open'));
}

/** */
function collapseAll() {
	document.querySelectorAll('#tree-container li.parent').forEach(li => li.classList.remove('open'));
}

/** */
function buildHtmlList(nodes) {
	if (!nodes || nodes.length === 0) return '';
	let html = '<ul>';
	for (const node of nodes) {
		const hasChildren = node.children && node.children.length > 0;
		html             += `<li${hasChildren ? ' class="parent"' : ''} data-li-id="${node.id}">`;

		let iconImg = '';
		// background.jsが決定した、絶対的に正しいアイコンURLを<img>で表示するだけ
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

/** */
function escapeHtml(str) {
	const p       = document.createElement("p");
	p.textContent = str;
	return p.innerHTML;
}

/** */
function closeContextMenu() {
	const existingMenu = document.querySelector('.custom-context-menu');
	if (existingMenu) {
		existingMenu.remove();
	}
}

/** */
function createContextMenu(x, y) {
	const menu      = document.createElement('div');
	menu.className  = 'custom-context-menu';
	menu.style.left = `${x}px`;
	menu.style.top  = `${y}px`;
	return menu;
}
/**
 * @file TST多機能エクスポーター - viewer.js
 * @description
 * TSTライブビューアページのUI挙動を制御するスクリプトです。
 * background.jsからタブのツリー構造を取得して描画するほか、
 * 「すべて展開/折りたたみ」「JSONから復元」といったユーザー操作のハンドリング、
 * そして復元処理中のプログレス表示などを担当します。
 */

/* global TmCommon */

// ===================================================
// グローバル要素の参照
// ===================================================
// DOMContentLoadedより前に実行されるため、スクリプトは<body>の閉じタグ直前に配置する必要があります。
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
// イベントリスナー
// ===================================================
document.addEventListener('DOMContentLoaded', () => {
	// ページ全体の言語設定をmessages.jsonに基づいて適用
	TmCommon.Funcs.SetDocumentLocale();
	// すべてのイベントリスナーをセットアップ
	setupEventListeners();
	// 初回のツリー描画を実行
	renderTree(true);
});

/**
 * イベントリスナーをセットアップします
 */
function setupEventListeners() {
	// --- 操作ボタン ---
	document.getElementById('refreshBtn').addEventListener('click', () => renderTree(true));
	document.getElementById('expandAll').addEventListener('click', expandAll);
	document.getElementById('collapseAll').addEventListener('click', collapseAll);
	document.getElementById('restoreBtn').addEventListener('click', () => fileInput.click());
	fileInput.addEventListener('change', handleFileSelect);

	// --- ツリーコンテナ内の動的な要素 ---
	// コンテキストメニュー外をクリックしたときにメニューを閉じる
	document.addEventListener('click', closeContextMenu);
	// イベント移譲を使い、ツリー内のクリックイベントを処理
	treeContainer.addEventListener('click', handleTreeClick);
	// ツリー内の右クリックでコンテキストメニューを表示
	treeContainer.addEventListener('contextmenu', handleTreeContextMenu);

	// --- background.jsからのメッセージ受信 ---
	browser.runtime.onMessage.addListener((message) => {
		if (message.type === 'refresh-view') {
			// タブ復元処理がすべて完了した通知
			console.log('バックグラウンドから最終更新通知を受信。ポーリングを停止し、再描画します。');
			if (progressInterval) {
				clearInterval(progressInterval);
				progressInterval = null;
			}
			// 最後の再描画を行い、最新の状態を反映する
			renderTree(true);
			setLoadingState(false);
		} else if (message.type === 'update-progress') {
			// タブ復元中の進捗更新通知
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
/**
 * 画面のローディング状態を管理する
 * @param {boolean} isLoading - ローディング状態にするか否か
 * @param {'loading' | 'restoring'} [mode='loading'] - 'loading': 通常の読み込み, 'restoring': タブ復元
 * @param {string} [messageKey='viewerLoading'] - 表示するメッセージのキー
 */
function setLoadingState(isLoading, mode = 'loading', messageKey = "viewerLoading") {
	if (isLoading) {
		// --- 表示時の処理 ---
		controlButtons.forEach(btn => btn.disabled = true);
		loadingMask.classList.add('is-active');

		if (mode === 'restoring') {
			// [タブ復元モード] プログレスバーを表示
			loadingContent.style.display    = 'none';
			progressContainer.style.display = 'block';
			progressBar.style.width         = '0%';
			progressText.textContent        = TmCommon.Funcs.GetMsg(messageKey);
		} else {
			// [通常読み込みモード] スピナーとメッセージを表示
			loadingContent.style.display    = 'block';
			progressContainer.style.display = 'none';
			loadingText.textContent         = TmCommon.Funcs.GetMsg(messageKey);
			spinner.style.display           = 'block'; // スピナーを確実に表示
		}
	} else {
		// --- 非表示時の処理 ---
		loadingMask.classList.remove('is-active');
		controlButtons.forEach(btn => btn.disabled = false);
		spinner.style.display = 'none'; // 念のためスピナーも非表示に戻す
	}
}


/**
 * background.jsからタブ情報を取得し、ツリーを再描画するメイン関数。
 * タイトル未解決のタブがある場合は、少し待ってから再取得を試みる賢いリトライ機能付き。
 * @param {boolean} [expandAfterRender=false] - 描画後にツリーを全展開するか。
 * @param {{openIds: Set<string>, scrollY: number}|null} [stateToRestore=null] - 復元するUIの状態（開いているフォルダやスクロール位置）。
 * @param {boolean} [isRetry=false] - この関数呼び出しが再試行によるものか。
 */
async function renderTree(expandAfterRender = false, stateToRestore = null, isRetry = false) {

	// 再試行ではない、最初の呼び出し時にのみローディングUIを起動する
	if (!isRetry) {
		setLoadingState(true, 'loading');
	}

	// 削除操作などで再描画する際に、UIの状態（どのフォルダが開いていたか、どこまでスクロールしていたか）を維持する
	const openParentIds = stateToRestore ? stateToRestore.openIds : getOpenParentIds();
	const scrollY       = stateToRestore ? stateToRestore.scrollY : window.scrollY;

	try {
		const treeData = await browser.runtime.sendMessage({ type: 'get-viewer-data' });

		// TSTがタブのタイトルをまだ取得できていない場合（URLがそのままタイトルになっている場合）があるため、
		// その場合は少し待ってから再描画を試みる
		const hasUnresolvedTitles = treeData.some(node => !node.title || node.title === node.url);
		if (hasUnresolvedTitles && !isRetry) {
			console.log('未解決のタイトルを検出しました。1.5秒後に再取得を試みます...');
			const currentState = { openIds: openParentIds, scrollY: scrollY };
			setTimeout(() => renderTree(expandAfterRender, currentState, true), 1500);
			return; // 今回の描画は中断し、再試行に任せる
		}

		// ここからが本番の描画処理
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

		// 描画が正常に完了した時点で、ローディングUIを非表示にする
		setLoadingState(false);

	} catch (error) {
		console.error('renderTreeでエラー:', error);
		const errorMessage      = TmCommon.Funcs.GetMsg("errorGeneric", error.message);
		treeContainer.innerHTML = `<p>${errorMessage}</p>`;
		// エラーが発生した場合も、ローディングUIを非表示にする
		setLoadingState(false);
	}
}


// ===================================================
// イベントハンドラ
// ===================================================
/**
 * 「JSONから復元」ボタンでファイルが選択された際のイベントハンドラ。
 * @param {Event} event - input要素のchangeイベント。
 */
async function handleFileSelect(event) {
	const file = event.target.files[0];
	if (!file) return;

	// UIを「復元モード」に切り替え、プログレスバーを表示
	setLoadingState(true, 'restoring', 'viewerRestoring');

	// 以前のポーリングが残っていればクリア
	if (progressInterval) clearInterval(progressInterval);
	// background.jsに進捗を問い合わせるポーリングを開始
	progressInterval = setInterval(updateProgressUI, 300);
	try {
		const fileContent   = await file.text();
		const tabsToRestore = JSON.parse(fileContent);
		// background.jsにタブ復元処理を依頼
		browser.runtime.sendMessage({ type: 'restore-tabs', data: tabsToRestore });
	} catch (error) {
		console.error('復元エラー:', error);
		alert(TmCommon.Funcs.GetMsg("errorGeneric", error.message));
		if (progressInterval) clearInterval(progressInterval);
		progressInterval = null;
		setLoadingState(false);
		renderTree();
	} finally {
		// 同じファイルを連続で選択できるように、inputの値をリセットする
		event.target.value = '';
	}
}

/**
 * `setInterval`によって定期的に呼び出され、background.jsに復元の進捗を問い合わせ、
 * プログレスバーのUIを更新する関数。
 */
async function updateProgressUI() {
	try {
		const state = await browser.runtime.sendMessage({ type: 'get-restore-progress' });
		if (state && state.inProgress) {
			// background.jsから進捗情報が取得でき、かつ処理が進行中の場合

			// 取得した進捗情報でUI（バーとテキスト）を更新する
			const percent            = state.total > 0 ? (state.loaded / state.total) * 100 : 0;
			progressBar.style.width  = `${percent}%`;
			progressText.textContent = `復元中: ${state.loaded} / ${state.total}`;
		} else {
			// background.js側で処理が完了（または失敗）していたら、ポーリングを停止する

			// (refresh-viewが届かない場合のフェイルセーフとしても機能)
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
/**
 * ツリーコンテナ内でのクリックイベントを処理します（イベント移譲）。
 * リンクのクリックはタブへのフォーカス、フォルダ行のクリックは開閉を行います。
 * @param {MouseEvent} event - クリックイベント。
 */
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

/**
 * ツリーコンテナ内での右クリックイベントを処理し、カスタムコンテキストメニューを表示します。
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
 * 「このタブを削除」のカスタムコンテキストメニュー項目を作成します。
 * @param {string} title - 削除対象タブのタイトル。
 * @param {string} tabId - 削除対象タブのID。
 * @returns {HTMLDivElement} - 生成されたメニュー項目のDOM要素。
 */
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
/**
 * 現在開いているフォルダ（親ノード）のIDをSetとして取得します。
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
 * `getOpenParentIds`で取得したIDの集合に基づき、フォルダの開閉状態を復元します。
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
 * ツリー構造データから、ネストされた`<ul><li>`構造のHTML文字列を再帰的に生成します。
 * @param {Array<object>} nodes - background.jsから受け取ったツリー構造データ。
 * @returns {string} - 生成されたHTML文字列。
 */
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
 * 指定された座標にカスタムコンテキストメニューの親要素を作成します。
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
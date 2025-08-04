/* global TmCommon */

// ===================================================
// イベントリスナー
// ===================================================
// ページ読み込み時にUIのテキストを設定し、ツリーを初回描画
document.addEventListener('DOMContentLoaded', () => {
	TmCommon.Funcs.SetDocumentLocale(); // UIの静的テキストを国際化

	const treeContainer = document.getElementById('tree-container');

	// tree-containerの変更を監視するオブザーバーを作成
	const observer = new MutationObserver((mutationsList, observer) => {
		// 変更されたノードの中にUL（ツリー本体）があるかチェック
		for (const mutation of mutationsList) {
			if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
				if (Array.from(mutation.addedNodes).some(node => node.tagName === 'UL')) {
					// ULが追加された瞬間にタイトルを設定
					document.title = `${TmCommon.Funcs.GetMsg("viewerTitle")} - ${new Date().toLocaleString()}`;
					// 目的は達成したので、監視を停止する（不要な処理を防ぐ）
					observer.disconnect();
					return;
				}
			}
		}
	});

	// 監視を開始
	observer.observe(treeContainer, { childList: true });

	// 監視を開始してから、最初の描画をキックする
	renderTree(true);
});


// UIコントロールのイベントリスナー
document.getElementById('refreshBtn').addEventListener('click', () => renderTree(true));
document.getElementById('expandAll').addEventListener('click', expandAll);
document.getElementById('collapseAll').addEventListener('click', collapseAll);
document.addEventListener('click', closeContextMenu);
document.getElementById('tree-container').addEventListener('click', handleTreeClick);
document.getElementById('tree-container').addEventListener('contextmenu', handleTreeContextMenu);


// ===================================================
// メイン処理と状態管理
// ===================================================
/**
 * ツリーを再描画するメイン関数
 * @param {boolean} [expandAfterRender=false] - 描画後にツリーを全展開するか
 * @param {object} [stateToRestore=null] - 復元する状態（開閉IDとスクロール位置）
 */
async function renderTree(expandAfterRender = false, stateToRestore = null) {
	const treeContainer     = document.getElementById('tree-container');
	treeContainer.innerHTML = `<p>${TmCommon.Funcs.GetMsg("viewerLoading")}</p>`;

	// 復元する状態が指定されていなければ、現在の状態を保存する
	const openParentIds = stateToRestore ? stateToRestore.openIds : getOpenParentIds();
	const scrollY       = stateToRestore ? stateToRestore.scrollY : window.scrollY;

	try {
		const treeData = await browser.runtime.sendMessage({ type: 'get-viewer-data' });
		if (treeData && treeData.length > 0) {
			treeContainer.innerHTML = buildHtmlList(treeData);

			// ★★★ ここでタイトルを設定することで、初回表示の問題を解決 ★★★
			document.title = `${TmCommon.Funcs.GetMsg("viewerTitle")} - ${new Date().toLocaleString()}`;

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
		const errorMessage      = TmCommon.Funcs.GetMsg("errorGeneric", error.message);
		treeContainer.innerHTML = `<p>${errorMessage}</p>`;
		console.error(error);
	}
}

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
		// const targetLi = event.target.closest('li.parent');
		// if (targetLi) {
		// 	targetLi.classList.toggle('open');
		// }
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
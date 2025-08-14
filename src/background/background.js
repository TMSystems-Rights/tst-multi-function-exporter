/**
 * @file TST多機能エクスポーター - background.js (最終確定版: TSMアーキテクチャ)
 * @description
 * Tab Session Managerのアーキテクチャを完全に模倣。
 * setTimeoutを使い、タブ作成を独立したタスクとしてブラウザのイベントキューに委ねることで、
 * メモリ負荷を最小限に抑え、究極の安定性を実現する。
 */

/* global TmCommon */

const TST_ID = TmCommon.Const.TST_ID;

// ===================================================
// グローバルな状態管理
// ===================================================
/**
 * タブ復元処理の進捗を管理する、極めてシンプルなグローバルオブジェクト。
 * viewer.jsからのポーリングに対して、このオブジェクトを返します。
 * @property {boolean} inProgress - 復元処理が進行中かどうか。
 * @property {number} loaded - 読み込みが完了したタブの数。
 * @property {number} total - 復元対象の総タブ数。
 */
let restoreState = {
	inProgress: false,
	loaded: 0,
	total: 0
};

// ======================================================
// アイコンURL定義 ※TSTのfavicon表示仕様にあわせています。
// 基本はFirefox標準のfaviconから取得し、TST独自のはTST公式（下記URLの中）から取得。
// 「/viewer/svg/020_TST/」フォルダ内のSVGアイコンは、TSTの公式アイコンを使用しています。
// https://github.com/piroor/treestyletab/tree/trunk/webextensions/resources/icons
// ======================================================
const FALLBACK_ICON_URL         = '/viewer/svg/020_TST/defaultFavicon.svg';
const ADDON_ICON_URL            = '/viewer/svg/020_TST/extensions.svg';
const LOCK_ICON_URL             = '/viewer/svg/020_TST/lockwise.svg';
const FIREFOX_ICON_URL          = 'chrome://branding/content/icon32.png';
const ROBOTS_ICON_URL           = 'chrome://browser/content/robot.ico';
const PRIVATE_BROWSING_ICON_URL = 'chrome://browser/skin/privatebrowsing/favicon.svg';
const BLOCKED_ICON_URL          = 'chrome://global/skin/icons/blocked.svg';
const DEVELOPER_ICON_URL        = 'chrome://global/skin/icons/developer.svg';
const INFO_ICON_URL             = 'chrome://global/skin/icons/info.svg';
const PERFORMANCE_ICON_URL      = 'chrome://global/skin/icons/performance.svg';
const SETTINGS_ICON_URL         = 'chrome://global/skin/icons/settings.svg';

// ======================================================
// TSTの内部アイコン表示ルール ※TSTのfavicon表示仕様にあわせています。
// ======================================================
const internalIcons = {
	'about:about'               : FIREFOX_ICON_URL,
	'about:addons'              : ADDON_ICON_URL,
	'about:blank'               : FALLBACK_ICON_URL,
	'about:blocked'             : BLOCKED_ICON_URL,
	'about:buildconfig'         : FALLBACK_ICON_URL,
	'about:cache'               : FALLBACK_ICON_URL,
	'about:cache?device=disk'   : FALLBACK_ICON_URL,
	'about:cache?device=memory' : FALLBACK_ICON_URL,
	'about:cache?device=offline': FALLBACK_ICON_URL,
	'about:certerror'           : FALLBACK_ICON_URL,
	'about:config'              : SETTINGS_ICON_URL,
	'about:crashes'             : FALLBACK_ICON_URL,
	'about:debugging'           : DEVELOPER_ICON_URL,
	'about:home'                : FIREFOX_ICON_URL,
	'about:jetpack'             : INFO_ICON_URL,
	'about:license'             : FALLBACK_ICON_URL,
	'about:logins'              : LOCK_ICON_URL,
	'about:logo'                : FALLBACK_ICON_URL,
	'about:memory'              : FALLBACK_ICON_URL,
	'about:mozilla'             : FALLBACK_ICON_URL,
	'about:neterror'            : FALLBACK_ICON_URL,
	'about:newtab'              : FIREFOX_ICON_URL,
	'about:performance'         : PERFORMANCE_ICON_URL,
	'about:permissions'         : INFO_ICON_URL,
	'about:plugins'             : INFO_ICON_URL,
	'about:preferences'         : SETTINGS_ICON_URL,
	'about:privatebrowsing'     : PRIVATE_BROWSING_ICON_URL,
	'about:robots'              : ROBOTS_ICON_URL,
	'about:sessionrestore'      : INFO_ICON_URL,
	'about:support'             : FIREFOX_ICON_URL,
	'about:sync-tabs'           : INFO_ICON_URL,
	'chrome://'                 : FALLBACK_ICON_URL
};


// ===================================================
// メインのメッセージリスナー
// ===================================================
// eslint-disable-next-line no-unused-vars
browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
	// Manifest V3の非永続的な環境で非同期処理を正しく扱うため、
	// メッセージの種類に応じて、対応する非同期関数を呼び出し、その返り値(Promise)をreturnする。
	switch (message.type) {
		case 'export-json':
		case 'export-tsv':
		case 'open-viewer':
		case 'get-viewer-data':
			return handleDataRequest(message);
		case 'focus-tst-tab':
		case 'delete-tab':
			return handleActionRequest(message);

		case 'restore-tabs': {
			const restoreData = message.data;
			if (!restoreData || !Array.isArray(restoreData) || restoreData.length === 0) {
				return Promise.resolve({ success: false, error: '復元データが空か、不正な形式です。' });
			}

			let windowsData;

			// 新旧フォーマットの判定: statesプロパティの有無で行うのが最も確実
			if (Object.prototype.hasOwnProperty.call(restoreData[0], 'states')) {
				// バージョン2.1.0以降フォーマット（statesプロパティを持つタブ配列）
				console.log("バージョン2.1.0以降形式（statesプロパティ有り）のタブ配列を検出。単一ウィンドウとして復元します。");
				windowsData = [{ tabs: restoreData, focused: true }];

			} else if (Object.prototype.hasOwnProperty.call(restoreData[0], 'url')) {
				// バージョン2.0.1以前フォーマット（urlプロパティのみを持つタブ配列）
				console.log("バージョン2.0.1以前形式（statesプロパティ無し）のタブ配列を検出。単一ウィンドウとして復元します。");
				windowsData = [{ tabs: restoreData, focused: true }];

			} else {
				// 将来的なウィンドウ単位のフォーマット（例: { tabs: [...] }）を想定
				console.log("ウィンドウ情報を含むデータを検出しました。");
				windowsData = restoreData;
			}

			// handleRestoreRequestに渡すのは必ずウィンドウ配列形式に統一
			return handleRestoreRequest(windowsData);
		}

		// ★★★ [変更] ポーリングは不要になったのでget-restore-progressは削除しても良いが、念のため残す ★★★
		case 'get-restore-progress':
			return Promise.resolve(restoreState);
		default:
			console.error('不明なメッセージタイプを受信:', message.type);
			return Promise.resolve({ success: false, error: 'Unknown message type' });
	}
});



// ===================================================
// リクエストハンドラ
// ===================================================
/**
 * データ取得を伴うリクエスト（エクスポート、ビューア表示）を処理します。
 * @param {object} message - popup.jsまたはviewer.jsからのメッセージオブジェクト。
 * @returns {Promise<object>} 処理結果。
 */
async function handleDataRequest(message) {
	try {
		const tree = await browser.runtime.sendMessage(TST_ID, { type: 'get-tree', tabs: '*' });
		if (!tree) throw new Error('TSTからツリー構造を取得できませんでした。');
		const viewerUrl       = browser.runtime.getURL('viewer/viewer.html');
		const filteredTree    = filterTree(tree, (tab) => tab.url !== viewerUrl);
		const outputData      = convertTreeForJSON(filteredTree);
		const currentDatetime = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/[:/]/g, '').replace(/\s/g, '_');
		const fileBaseName    = `forefox_tab_list_${currentDatetime}`;
		switch (message.type) {
			case 'export-json': {
				const jsonString = JSON.stringify(outputData, null, 2);
				await downloadData(jsonString, `${fileBaseName}.json`);
				break;
			}
			case 'export-tsv': {
				const tsvData = convertTreeToTSV(outputData);
				await downloadData(tsvData, `${fileBaseName}.tsv`);
				break;
			}
			case 'open-viewer': {
				const absoluteViewerUrl = browser.runtime.getURL('/viewer/viewer.html');
				const tabs              = await browser.tabs.query({ url: absoluteViewerUrl });
				if (tabs.length > 0) {
					await browser.tabs.update(tabs[0].id, { active: true });
				} else {
					await browser.tabs.create({ url: '/viewer/viewer.html' });
				}
				break;
			}
			case 'get-viewer-data': {
				return outputData;
			}
		}
		return { success: true };
	} catch (err) {
		console.error('データリクエスト処理でエラー:', err);
		return { success: false, error: err.message };
	}
}

/**
 * データ取得を伴わないアクション（タブのフォーカス、削除）を処理します。
 * @param {object} message - viewer.jsからのメッセージオブジェクト。
 * @returns {Promise<object>} 処理結果。
 */
async function handleActionRequest(message) {
	try {
		if (message.type === 'focus-tst-tab') {
			await focusTab(message.tabId);
		} else if (message.type === 'delete-tab') {
			await browser.tabs.remove(message.tabId);
		}
		return { success: true };
	} catch (err) {
		console.error('アクションリクエスト処理でエラー:', err);
		return { success: false, error: err.message };
	}
}


/**
 * 復元するタブのツリー構造を、処理しやすいフラットなリストに変換します。
 * 各ノードの階層の深さ(depth)と、属するルートノードのID(rootId)も計算します。
 * @param {Array<object>} nodes - 元のツリー構造データ。
 * @param {number|null} parentId - 親タブのID。
 * @param {number} depth - 現在の階層の深さ。
 * @param {number|null} rootId - このツリーのルートノードのID。
 * @returns {Array<object>} - 親子、depth、rootId情報を保持したフラットなノードの配列。
 */
function flattenTreeWithDepth(nodes, parentId = null, depth = 0, rootId = null) {
	let list = [];
	for (const node of nodes) {
		// 自分がルートノードの場合、自分のIDをrootIdとする
		const currentRootId = (depth === 0) ? node.id : rootId;

		// 自分の情報をリストに追加
		list.push({ ...node, openerTabId: parentId, depth: depth, rootId: currentRootId });

		// 子がいれば、自分のIDを親として、現在のrootIdを引き継いで再帰的に処理
		if (node.children && node.children.length > 0) {
			list = list.concat(flattenTreeWithDepth(node.children, node.id, depth + 1, currentRootId));
		}
	}
	return list;
}


/**
 * JSONデータからタブのツリーを復元するリクエストのメインハンドラ (最終完成版: 明示的展開)
 * @param {Array<object>} windowsData - ウィンドウ情報の配列 [{ windowId, focused, tabs:[...] }, ...]
 */
async function handleRestoreRequest(windowsData) {
	// (前半のコードは変更なしなので省略)
	if (restoreState.inProgress) {
		return { success: false, error: '別の復元処理が実行中です。' };
	}
	const tabsSortedByHierarchy = windowsData.flatMap(w => flattenTreeWithDepth(w.tabs || [])).sort((a, b) => {
		if (a.depth < b.depth) return -1; if (a.depth > b.depth) return 1; if (a.index < b.index) return -1; if (a.index > b.index) return 1; return 0;
	});
	const tabsSortedByIndex     = [...tabsSortedByHierarchy].sort((a,b) => a.index - b.index);
	if (tabsSortedByHierarchy.length === 0) {
		return { success: true };
	}
	restoreState = { inProgress: true, loaded: 0, total: tabsSortedByHierarchy.length };
	console.log(`【最終完成版: 明示的展開】復元対象の総タブ数: ${restoreState.total}`);
	const viewerTabs     = await browser.tabs.query({ url: browser.runtime.getURL('/viewer/viewer.html') });
	const viewerTabId    = viewerTabs.length > 0 ? viewerTabs[0].id : null;
	const currentWindow  = await browser.windows.getCurrent({ populate: false });
	const targetWindowId = currentWindow.id;
	const idMap          = new Map();

	try {
		// (第1段階も変更なし)
		console.log(`第1段階: 親子関係の構築を開始します (index指定なし)。`);
		const createdTabsInfo = [];
		for (const node of tabsSortedByHierarchy) {
			const openerTabId = idMap.get(node.openerTabId);
			try {
				const createProperties = { windowId: targetWindowId, openerTabId: openerTabId, url: node.url, active: false, pinned: !!node.pinned, discarded: true, cookieStoreId: node.cookieStoreId, };
				if (createProperties.cookieStoreId === 'firefox-default') delete createProperties.cookieStoreId;
				if (!node.url || ['about:newtab', 'about:home', 'about:blank'].includes(node.url)) {
					createProperties.url = undefined;
				} else if (node.url.startsWith('about:')) {
					const originalUrl = encodeURIComponent(node.url), originalTitle = encodeURIComponent(node.title || 'タイトルなし'); createProperties.url = browser.runtime.getURL(`/viewer/placeholder.html?url=${originalUrl}&title=${originalTitle}`); createProperties.discarded = false;
				}
				const isAboutPage = typeof createProperties.url === 'string' && createProperties.url.startsWith('about:');
				if (isAboutPage || createProperties.url === undefined) {
					createProperties.discarded = false;
				}
				if (createProperties.discarded && node.title) {
					createProperties.title = node.title;
				}
				const newTab = await browser.tabs.create(createProperties);
				idMap.set(node.id, newTab.id);
				createdTabsInfo.push({ newId: newTab.id, node });
				restoreState.loaded++;
				if (viewerTabId) {
					browser.tabs.sendMessage(viewerTabId, { type: 'update-progress', loaded: restoreState.loaded, total: restoreState.total }).catch(() => {});
				}
				await sleep(25);
			} catch (err) {
				console.error(`タブ作成失敗: url=${node.url}`, err); restoreState.total--;
			}
		}

		// (第2段階前半も変更なし)
		console.log("第2段階: 並べ替え & 状態適用を開始します。");
		const TST_ID                  = 'treestyletab@piro.sakura.ne.jp';
		const newTabIdsInCorrectOrder = tabsSortedByIndex.map(node => idMap.get(node.id)).filter(id => id);
		try {
			console.log("Firefox標準APIによるタブの物理的な並べ替えを実行します。"); await browser.tabs.move(newTabIdsInCorrectOrder, { windowId: targetWindowId, index: 0 });
		} catch (e) {
			console.error("タブの一括移動に失敗しました。", e);
		}
		console.log("TSTの安定化のため、2秒間待機します...");
		await sleep(2000);

		// ★★★★★★★★★★★ [最終修正] 折りたたむか、明示的に展開するかの二択 ★★★★★★★★★★★
		console.log("待機完了。TST APIによる開閉状態の適用を開始します (深いノードから)。");
		for (let i = createdTabsInfo.length - 1; i >= 0; i--) {
			const { newId, node } = createdTabsInfo[i];

			// 親タブでなければ何もしない
			if (!node.children || node.children.length === 0) continue;

			try {
				// subtree-collapsed を持つタブは、折りたたむ
				if (node.states && node.states.includes('subtree-collapsed')) {
					await browser.runtime.sendMessage(TST_ID, {
						type: 'collapse-tree',
						tab: newId
					});
				} else {
					// そうでなければ、明示的に展開する
					await browser.runtime.sendMessage(TST_ID, {
						type: 'expand-tree',
						tab: newId
					});
				}
				await sleep(50);
			} catch (tstError) {
				console.warn(`TSTへのメッセージ送信に失敗。タブID: ${newId}`, tstError.message);
			}
		}

		// (第3段階も変更なし)
		console.log("第3段階: 最終処理を開始します。");
		const activeNode = tabsSortedByIndex.find(t => t.active);
		if (activeNode) {
			const newActiveTabId = idMap.get(activeNode.id); if (newActiveTabId) {
				await browser.tabs.update(newActiveTabId, { active: true });
			}
		}
		await browser.windows.update(targetWindowId, { focused: true });

	} catch (e) {
		console.error("タブ復元処理全体で致命的なエラーが発生しました:", e);
	} finally {
		restoreState.inProgress = false;
		console.log("復元処理がすべて完了しました。");
		if (viewerTabId) {
			browser.runtime.sendMessage({ type: 'refresh-view' }).catch(() => {});
		}
	}

	return { success: true, message: '復元処理を開始しました。' };
}

// ===================================================
// ヘルパー関数群
// ===================================================

/**
 * 指定されたミリ秒だけ処理を待機します。(UIスレッドはブロックしない)
 * @param {number} ms - 待機する時間（ミリ秒）。
 * @returns {Promise<void>}
 */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ツリー構造を再帰的にフィルタリングする
 * @param {Array} nodes - タブのノード配列
 * @param {Function} predicate - trueを返したノードを維持する関数
 * @returns {Array} - フィルタリングされた新しいノード配列
 */
function filterTree(nodes, predicate) {
	const result = [];
	for (const node of nodes) {
		if (predicate(node)) {
			// 子要素も再帰的にフィルタリング
			if (node.children) {
				node.children = filterTree(node.children, predicate);
			}
			result.push(node);
		}
	}
	return result;
}

/**
 * 指定されたデータをファイル（JSON or TSV）としてダウンロードさせます。
 * @param {string} data - ダウンロードするデータ本体。
 * @param {string} filename - 保存するファイル名。
 */
async function downloadData(data, filename) {
	const mimeType = filename.endsWith('.json') ? 'application/json;charset=utf-8' : 'text/tab-separated-values;charset=utf-8';
	const blob     = new Blob([data], { type: mimeType });
	const url      = URL.createObjectURL(blob);
	try {
		const downloadId = await browser.downloads.download({ url, filename, saveAs: true });
		browser.downloads.onChanged.addListener(function onDownloadChanged(delta) {
			if (delta.id === downloadId && delta.state && delta.state.current !== 'in_progress') {
				browser.downloads.onChanged.removeListener(onDownloadChanged);
				URL.revokeObjectURL(url);
			}
		});
	} catch (err) {
		URL.revokeObjectURL(url);
		throw err;
	}
}

/**
 * 指定されたタブIDのタブにフォーカスを移動します。
 * @param {number} tabId - フォーカスするタブのID。
 */
async function focusTab(tabId) {
	try {
		const tabToFocus = await browser.tabs.get(tabId);
		await browser.windows.update(tabToFocus.windowId, { focused: true });
		await browser.tabs.update(tabToFocus.id, { active: true });
		await browser.runtime.sendMessage(TST_ID, { type: 'focus-tab', tab: tabId });
	} catch (error) {
		console.error(`Tab focus failed for ${tabId}: `, error);
	}
}

/**
 * TSTから取得した生のタブ情報を、エクスポートに適したツリー構造（JSON形式）に変換します。
 * @param {Array<object>} tabs - browser.runtime.sendMessage(TST_ID, { type: 'get-tree' })で取得したタブ情報。
 * @returns {Array<object>} - 親子関係が整理されたツリー構造のデータ。
 */
function convertTreeForJSON(tabs) {
	const tabMap    = new Map(tabs.map(tab => [tab.id, tab]));
	const processed = new Set();
	const roots     = [];
	for (const tab of tabs) {
		const isRoot = !tab.ancestorTabIds || tab.ancestorTabIds.length === 0 || !tabMap.has(tab.ancestorTabIds[tab.ancestorTabIds.length - 1]);
		if (isRoot) {
			const node = buildSubtree(tab, processed, tabMap);
			if (node) roots.push(node);
		}
	}
	return roots;
}

/**
 * 単一のタブ情報を、エクスポート用のノードオブジェクトに変換します（buildSubtreeの内部処理）。
 * @param {object} tab - 変換元のタブオブジェクト。
 * @param {Set<number>} processed - 処理済みのタブIDを記録するSet。
 * @param {Map<number, object>} tabMap - タブIDをキーとするタブ情報のMap。
 * @returns {object|null} - 変換後のノードオブジェクト。
 */
function buildSubtree(tab, processed, tabMap) {
	if (processed.has(tab.id)) {
		return null;
	}
	processed.add(tab.id);

	let finalFavIconUrl = FALLBACK_ICON_URL;
	let bestMatchKey    = '';
	for (const key of Object.keys(internalIcons)) {
		if (tab.url.startsWith(key) && key.length >= bestMatchKey.length) {
			bestMatchKey = key;
		}
	}
	if (bestMatchKey) {
		finalFavIconUrl = internalIcons[bestMatchKey];
	} else if (tab.favIconUrl) {
		finalFavIconUrl = tab.favIconUrl;
	} else if (tab.effectiveFavIconUrl) {
		finalFavIconUrl = tab.effectiveFavIconUrl;
	}

	const node = {
		id: tab.id,
		index: tab.index,
		url: tab.url,
		title: tab.title,
		favIconUrl: finalFavIconUrl,
		pinned: tab.pinned || false,
		discarded: tab.discarded || tab.hidden,
		states: tab.states || [], // タブの折り畳み状態を表すプロパティ（展開されている場合:Array []、 畳まれている場合：Array [ "subtree-collapsed" ]）
		cookieStoreId: tab.cookieStoreId,
		active: tab.active,
	};

	if (tab.children && tab.children.length > 0) {
		node.children = tab.children
			.map(childTab => buildSubtree(childTab, processed, tabMap))
			.filter(childNode => childNode !== null);
		if (node.children.length === 0) {
			delete node.children;
		}
	}
	return node;
}


// ========================= デバッグのため一時的に、デバッグ用へ改造 End ============================

/**
 * エクスポート用のツリー構造データをTSV形式の文字列に変換します。
 * @param {Array<object>} jsonData - convertTreeForJSONで生成されたツリー構造データ。
 * @returns {string} - TSV形式の文字列。
 */
function convertTreeToTSV(jsonData) {
	const flatList = [];
	/**
	 *
	 */
	function traverseAndFlatten(node, path) {
		flatList.push({ tab: node, path: [...path] });
		if (node.children) {
			path.push(node);
			for (const child of node.children) {
				traverseAndFlatten(child, path);
			}
			path.pop();
		}
	}
	for (const node of jsonData) {
		traverseAndFlatten(node, []);
	}
	const urlMap = new Map();
	flatList.forEach((item, index) => {
		if (!item.tab.url) return;
		if (!urlMap.has(item.tab.url)) {
			urlMap.set(item.tab.url, []);
		}
		urlMap.get(item.tab.url).push(index + 1);
	});
	let maxDepth = 0;
	flatList.forEach(item => {
		const depth = item.path.length + 1;
		if (depth > maxDepth) maxDepth = depth;
	});

	// =========================================
	// 出力データ作成
	// =========================================

	const GetMsg = TmCommon.Funcs.GetMsg;


	// ----------------------------
	// 見出し行の定義
	// ----------------------------
	// 見出し行のラベルを取得
	const labelMostDepthNode = GetMsg("tsvHeader_MostDepthNode");
	const labelId            = GetMsg("tsvHeader_Id");
	const labelTitle         = GetMsg("tsvHeader_Title");
	const labelNode          = GetMsg("tsvHeader_Node");
	const labelUrl           = GetMsg("tsvHeader_Url");
	const labelRemarks       = GetMsg("tsvHeader_Remarks");

	// #列、最下層タブ列（ID、タイトル）
	const header1 = ['' , labelMostDepthNode, ''];
	const header2 = ['#', labelId, labelTitle];

	// 階層n列（ID、タイトル）
	for (let i = 1; i <= maxDepth; i++) {
		header1.push(`${labelNode}${i}`, '');
		header2.push(labelId, labelTitle);
	}

	// URL列、備考列
	header1.push('', '');
	header2.push(labelUrl, labelRemarks);


	// ----------------------------
	// データ行の定義
	// ----------------------------
	const INSERT_POS = 1; // spliceで最下層タブ列に挿入する位置
	const NO_DELETE  = 0; // spliceで削除しないフラグ用の値

	// メッセージを取得
	const titleUnsetStr     = GetMsg("tsvRow_TitleUnset");
	const duplicateFoundStr = GetMsg("tsvRow_DuplicateFound");

	const rows = flatList.map((item, index) => {
		const row          = [index + 1];
		const pathWithSelf = [...item.path, item.tab];

		let currentTabId    = '';
		let currentTabTitle = '';

		for (let i = 0; i < maxDepth; i++) {
			if (i < pathWithSelf.length) {
				const currentTab = pathWithSelf[i];

				currentTabId    = currentTab.id;
				currentTabTitle = (currentTab.title || '').trim() || titleUnsetStr;
				currentTabTitle = currentTabTitle.startsWith('http') ? "'" + currentTabTitle : currentTabTitle; // URLのようなタイトルはシングルクォートで囲む

				row.push(currentTabId, currentTabTitle);

				if (i === pathWithSelf.length - 1) {
					// 最下層タブの場合、IDとタイトルを「最下層タブ」列の位置に挿入
					row.splice(INSERT_POS + 0, NO_DELETE, currentTabId);
					row.splice(INSERT_POS + 1, NO_DELETE, currentTabTitle);
				}

			} else {
				row.push('-', '-');
			}
		}
		row.push("'" + (item.tab.url || ''));
		let remarks = ' ';
		if (item.tab.url) {
			const duplicates = urlMap.get(item.tab.url);
			if (duplicates.length > 1) {
				remarks = `${duplicateFoundStr} [${duplicates.length}件 No: ${duplicates.join(', ')}]`;
			}
		}
		row.push(remarks);
		return row.join('\t');
	});
	return [header1.join('\t'), header2.join('\t'), ...rows].join('\n');
}

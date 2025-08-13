/**
 * @file TST多機能エクスポーター - background.js (最終確定版: トップノード単位・逐次実行)
 * @description
 * 巨大な復元タスクをトップレベルのツリー単位に分割し、逐次実行することで、
 * 数千タブの復元においても、パフォーマンスと安定性を最高レベルで維持する究極の実装。
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
		case 'restore-tabs':
			return handleRestoreRequest(message.data);
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
 * 指定されたミリ秒だけ処理を待機します。
 * @param {number} ms - 待機する時間（ミリ秒）。
 * @returns {Promise<void>}
 */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * IDのマッピングを元に、新しいopenerTabIdを計算します。
 * @param {number|null} oldParentId - 元のJSONの親ID。
 * @param {Map<number, number>} idMap - 新旧IDの対応表。
 * @returns {number|undefined} - 新しく作成された親タブのID。
 */
function getNewOpenerId(oldParentId, idMap) {
	if (oldParentId === null || !idMap.has(oldParentId)) {
		return undefined;
	}
	return idMap.get(oldParentId);
}



/**
 * JSONデータからタブのツリーを復元するリクエストの司令塔 (真の最終確定版)
 * @param {Array<object>} data
 */
async function handleRestoreRequest(data) {
	if (restoreState.inProgress) {
		return { success: false, error: '別の復元処理が実行中です。' };
	}
	restoreState = { inProgress: true, loaded: 0, total: 0 };

	const flatNodeList = flattenTreeWithDepth(data);
	restoreState.total = flatNodeList.length;
	console.log(`【真の最終版】復元対象の総タブ数: ${restoreState.total}`);
	if (restoreState.total === 0) {
		restoreState.inProgress = false;
		return { success: true };
	}

	const executionQueue = [];
	for (const rootNode of data) {
		const rootNodeWithoutChildren = { ...rootNode, children: [] };
		executionQueue.push({ node: rootNodeWithoutChildren, openerTabId: null });
		if (rootNode.children && rootNode.children.length > 0) {
			for (const secondLevelNode of rootNode.children) {
				executionQueue.push({ node: secondLevelNode, openerTabId: rootNode.id });
			}
		}
	}

	const viewerTabs  = await browser.tabs.query({ url: browser.runtime.getURL('/viewer/viewer.html') });
	const viewerTabId = viewerTabs.length > 0 ? viewerTabs[0].id : null;

	(async () => {
		const idMap = new Map();
		try {
			for (const executionUnit of executionQueue) {
				const parentId = getNewOpenerId(executionUnit.openerTabId, idMap);
				// restoreSingleTreeに、黄金比ディレイの実行を完全に委ねる
				await restoreSingleTree([executionUnit.node], viewerTabId, idMap, parentId);
			}
		} finally {
			console.log(`すべての復元処理が完了しました。`);
			browser.runtime.sendMessage({ type: 'refresh-view' }).catch(() => {});
			restoreState.inProgress = false;
		}
	})();

	return { success: true };
}

/**
 * 単一のツリー（または枝）を、黄金比ディレイを使いながら復元する再帰関数 (about:エラー対応版)
 * @param {Array<object>} nodes
 *- @param {number|null} viewerTabId
 * @param {Map<number, number>} idMap
 * @param {number|undefined} parentId
 */
async function restoreSingleTree(nodes, viewerTabId, idMap, parentId) {
	for (const node of nodes) {
		let newTab = null;
		try {
			// ★★★ [最後の仕上げ] about:系ページのエラー回避ロジックをここに集約 ★★★
			const createProperties = {
				url: node.url,
				active: false,
				openerTabId: parentId,
				discarded: !!node.discarded,
			};

			// [対策1] 不正なabout:ページを代替ページに置き換える
			const isProblematicAbout = node.url && node.url.startsWith('about:') && !['about:blank', 'about:newtab', 'about:home'].includes(node.url);
			if (isProblematicAbout) {
				console.warn(`安全のため、${node.url} は代替ページとして復元します。`);
				const originalUrl          = encodeURIComponent(node.url);
				const originalTitle        = encodeURIComponent(node.title || 'タイトルなし');
				createProperties.url       = browser.runtime.getURL(`/viewer/placeholder.html?url=${originalUrl}&title=${originalTitle}`);
				createProperties.discarded = false; // 代替ページは通常状態で開く
			}

			// about:newtab, about:home は URL 指定なしで開く
			if (!createProperties.url || ['about:newtab', 'about:home'].includes(createProperties.url)) {
				createProperties.url = undefined;
			}

			const isAboutPage = createProperties.url === undefined || (typeof createProperties.url === 'string' && createProperties.url.startsWith('about:'));

			// aboutページは破棄状態で開けない
			if (isAboutPage) {
				createProperties.discarded = false;
			}

			// [対策2] discardedがtrueの場合にのみ、titleを設定する
			if (createProperties.discarded === true) {
				if (node.title) {
					createProperties.title = node.title;
				}
			} else {
				// 通常状態で開く場合、titleプロパティは指定できない
				delete createProperties.title;
			}
			// ★★★ エラー回避ロジックここまで ★★★

			newTab = await browser.tabs.create(createProperties);
			if (newTab) {
				idMap.set(node.id, newTab.id);
				restoreState.loaded++;
				if (viewerTabId) {
					browser.tabs.sendMessage(viewerTabId, {
						type: 'update-progress', loaded: restoreState.loaded, total: restoreState.total
					}).catch(() => {});
				}
			}
		} catch (err) {
			console.error(`タブ作成失敗: url=${node.url}`, err);
			restoreState.total--;
		}

		// 黄金比ディレイ
		if (restoreState.loaded % 5 === 0) {
			await sleep(500);
		} else {
			await sleep(200);
		}

		if (node.children && node.children.length > 0) {
			await restoreSingleTree(node.children, viewerTabId, idMap, newTab ? newTab.id : parentId);
		}
	}
}

// ===================================================
// ヘルパー関数群
// ===================================================

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

	// ===================================================
	// アイコン選択ロジック
	// ===================================================
	let finalFavIconUrl = FALLBACK_ICON_URL; // まず、フォールバックをデフォルトとする

	// 1. internalIconsから、最も長く一致するキーを探す
	let bestMatchKey = '';
	for (const key of Object.keys(internalIcons)) {
		if (tab.url.startsWith(key) && key.length >= bestMatchKey.length) {
			bestMatchKey = key;
		}
	}

	// 2. 最長一致キーが見つかれば、それを最優先で採用
	if (bestMatchKey) {
		finalFavIconUrl = internalIcons[bestMatchKey];
	} else if (tab.favIconUrl) {
		// ルールになく、安全なURL(http/https/dataなど)のfavIconがあればそれを採用
		finalFavIconUrl = tab.favIconUrl;
	} else if (tab.effectiveFavIconUrl) {
		// 上記以外で、TSTが安全なdataスキーマなどを生成している場合は、それを尊重する
		finalFavIconUrl = tab.effectiveFavIconUrl;
	}


	const node = {
		title: tab.title,
		url: tab.url,
		id: tab.id,
		favIconUrl: finalFavIconUrl,
		discarded: tab.discarded || false // ★★★ 破棄状態を記録 ★★★
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

// background.js (データ処理と全アクションを担当する「頭脳」)

/* global TmCommon */

const TST_ID = TmCommon.Const.TST_ID;

// ===================================================
// グローバルな状態管理
// ===================================================
// 復元の進捗を記録するための、グローバルな状態オブジェクト
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
 * データ取得を伴うリクエストを処理する
 * @param {object} message
 * @returns {Promise<object>}
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
 * データ取得を伴わないアクションリクエストを処理する
 * @param {object} message
 * @returns {Promise<object>}
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


// /**
//  *　JSONからのタブ復元用リクエストを処理する
//  * @param {object} data
//  * @returns {Promise<object>}
//  */
// async function handleRestoreRequest(data) {
// 	try {
// 		restoreState = { inProgress: true, loaded: 0, total: 0 };

// 		let totalTabsToRestore = 0;
// 		let simpleTabsCount    = 0; // ★★★ about:newtabなどを数えるカウンター ★★★

// 		/** 復元対象のタブ数を導出する */
// 		function countTabs(nodes) {
// 			for (const node of nodes) {
// 				if (!node.url || !node.url.startsWith('about:') || ['about:blank', 'about:newtab', 'about:home'].includes(node.url)) {
// 					totalTabsToRestore++;
// 					// ★★★ すぐに完了するタブを、事前に数えておく ★★★
// 					if (!node.url || ['about:blank', 'about:newtab', 'about:home'].includes(node.url)) {
// 						simpleTabsCount++;
// 					}
// 				}
// 				if (node.children) countTabs(node.children);
// 			}
// 		}
// 		countTabs(data);
// 		restoreState.total = totalTabsToRestore;

// 		console.log(`復元対象: ${totalTabsToRestore} (うち即時完了: ${simpleTabsCount})`);
// 		if (totalTabsToRestore === 0) {
// 			restoreState.inProgress = false;
// 			return { success: true };
// 		}

// 		const loadedTabs    = new Set();
// 		const createdTabIds = new Set();
// 		const viewerUrl     = browser.runtime.getURL('/viewer/viewer.html');
// 		const viewerTabs    = await browser.tabs.query({ url: viewerUrl });
// 		const viewerTabId   = viewerTabs.length > 0 ? viewerTabs[0].id : null;

// 		// ★★★ 読み込み完了数に、最初から即時完了タブの数を足しておく ★★★
// 		restoreState.loaded = simpleTabsCount;
// 		if (viewerTabId) {
// 			browser.tabs.sendMessage(viewerTabId, {
// 				type: 'update-progress',
// 				loaded: restoreState.loaded,
// 				total: restoreState.total
// 			}).catch(e => {
// 				console.errot('エラー発生', e);
// 			});
// 		}

// 		const allTabsLoadedPromise = new Promise(resolve => {
// 			const listener = (tabId, changeInfo, tab) => {
// 				if (createdTabIds.has(tabId) && !loadedTabs.has(tabId)) {

// 					let isLoaded = false;
// 					// #### ロジック修正 MOD START --
// 					// if (tab.status === 'complete' || (tab.title && tab.url && tab.title !== tab.url.replace(/^[^/]+:\/\//, '').substring(0, tab.title.length))) {
// 					// 	isLoaded = true;
// 					// }

// 					// デバッグログ出力
// 					if (tab.url.startsWith('about:')) writeDebugLog(tabId, changeInfo, tab, "0");

// 					if (changeInfo.status === 'complete') {
// 						isLoaded = true;

// 						// デバッグログ出力
// 						if (tab.url.startsWith('about:')) writeDebugLog(tabId, changeInfo, tab, "1");
// 					// #### ロジック修正 MOD END --
// 					} else if (changeInfo.title) {
// 						if (tab.url) {
// 							isLoaded = isLoadedCompareToTitleAndUtl(tab, changeInfo);
// 						} else {
// 							isLoaded = true;
// 						}
// 					}


// 					if (isLoaded) {
// 						loadedTabs.add(tabId);
// 						// ★★★ 読み込み完了数 ＋ 事前に数えた即時完了数 ★★★
// 						restoreState.loaded = loadedTabs.size + simpleTabsCount;

// 						const titleForLog = TmCommon.Funcs.CutStringByLength(tab.title, 70);
// 						const urlForLog   = TmCommon.Funcs.CutStringByLength(tab.url, 80);
// 						// console.log(`読み込み完了: ${restoreState.loaded} / ${restoreState.total}: url="${urlForLog}", title="${titleForLog}"`);
// 						console.log(`読み込み完了: ${restoreState.loaded} / ${restoreState.total}: tabId="${tabId}" url="${urlForLog}", title="${titleForLog}"`);

// 						if (viewerTabId) {
// 							browser.tabs.sendMessage(viewerTabId, {
// 								type: 'update-progress',
// 								loaded: restoreState.loaded, total: restoreState.total
// 							}).catch(e => {
// 								console.errot('エラー発生', e);
// 							});
// 						}
// 						if (restoreState.loaded >= totalTabsToRestore) {
// 							browser.tabs.onUpdated.removeListener(listener);
// 							clearTimeout(timeoutId);
// 							resolve();
// 						}
// 					}
// 				}
// 			};
// 			browser.tabs.onUpdated.addListener(listener, { properties: ["status", "title"] });
// 			const timeoutId = setTimeout(() => {
// 				console.warn(`復元処理がタイムアウトしました。`);
// 				browser.tabs.onUpdated.removeListener(listener);
// 				resolve();
// 			}, 60000);
// 		});

// 		const isLoadedCompareToTitleAndUtl = (tab, changeInfo) => {
// 			try {
// 				let isLoaded = false;

// 				if (!(tab.url && changeInfo.title)) return false;

// 				const urlWithoutProtocol = tab.url.replace(/^[^/]+:\/\//, '');
// 				let urlCut               = urlWithoutProtocol;
// 				let titleCut             = changeInfo.title;
// 				if (titleCut.length < urlWithoutProtocol.length) {
// 					urlCut = urlWithoutProtocol.substring(0, titleCut.length);
// 				} else {
// 					titleCut = changeInfo.title.substring(0, urlWithoutProtocol.length);
// 				}
// 				if (titleCut !== urlCut) {
// 					isLoaded = true;
// 				}
// 				return isLoaded;

// 			} catch (e) {
// 				console.error('URL解析エラー', e);
// 				return false;
// 			}
// 		};

// 		/** */
// 		const writeDebugLog = (tabId, changeInfo, tab, positionStr) => {
// 			console.log(`================================\n` +
// 						`★★★${positionStr} tabId="${tabId}" ` +
// 						`changeInfo.title ="${changeInfo.title}" ` +
// 						`changeInfo.status="${changeInfo.status}" ` +
// 						`tab.url="${tab.url}" ` +
// 						`tab.title="${tab.title}" ` +
// 						`tab.status="${tab.status}" `);
// 		};


// 		await restoreSubtree(data, null, createdTabIds);
// 		await allTabsLoadedPromise;

// 		if (viewerTabId) {
// 			await browser.tabs.sendMessage(viewerTabId, { type: 'refresh-view' });
// 		}
// 	} catch (err) {
// 		console.error('handleRestoreRequestでエラー:', err);
// 		return { success: false, error: err.message };
// 	} finally {
// 		restoreState.inProgress = false;
// 	}
// }

/**
 *　JSONからのタブ復元用リクエストを処理する
 * @param {object} data
 * @returns {Promise<object>}
 */
async function handleRestoreRequest(data) {
	try {
		restoreState = { inProgress: true, loaded: 0, total: 0 };

		let totalTabsToRestore = 0;
		let simpleTabsCount    = 0; // ★★★ about:newtabなどを数えるカウンター ★★★

		/** 復元対象のタブ数を導出する */
		function countTabs(nodes) {
			for (const node of nodes) {
				if (!node.url || !node.url.startsWith('about:') || ['about:blank', 'about:newtab', 'about:home'].includes(node.url)) {
					totalTabsToRestore++;
					// ★★★ すぐに完了するタブを、事前に数えておく ★★★
					if (!node.url || ['about:blank', 'about:newtab', 'about:home'].includes(node.url)) {
						simpleTabsCount++;
					}
				}
				if (node.children) countTabs(node.children);
			}
		}
		countTabs(data);
		restoreState.total = totalTabsToRestore;

		console.log(`復元対象: ${totalTabsToRestore} (うち即時完了: ${simpleTabsCount})`);
		if (totalTabsToRestore === 0) {
			restoreState.inProgress = false;
			return { success: true };
		}

		const loadedTabs    = new Set();
		const createdTabIds = new Set();
		const viewerUrl     = browser.runtime.getURL('/viewer/viewer.html');
		const viewerTabs    = await browser.tabs.query({ url: viewerUrl });
		const viewerTabId   = viewerTabs.length > 0 ? viewerTabs[0].id : null;

		// ★★★ 読み込み完了数に、最初から即時完了タブの数を足しておく ★★★
		restoreState.loaded = simpleTabsCount;
		if (viewerTabId) {
			browser.tabs.sendMessage(viewerTabId, {
				type: 'update-progress',
				loaded: restoreState.loaded,
				total: restoreState.total
			}).catch(e => {
				console.errot('エラー発生', e);
			});
		}


		let listener; // listener関数をPromiseの外でアクセスできるように
		let timeoutId;  // timeoutIdも同様

		const allTabsLoadedPromise = new Promise(resolve => {
			listener = (tabId, changeInfo, tab) => {
				if (createdTabIds.has(tabId) && !loadedTabs.has(tabId)) {
					let isLoaded = false;
					if (changeInfo.status === 'complete') {
						isLoaded = true;
					} else if (changeInfo.title) {
						if (tab.url) {
							const urlWithoutProtocol = tab.url.replace(/^[^/]+:\/\//, '');
							let urlCut               = urlWithoutProtocol;
							let titleCut             = changeInfo.title;
							if (titleCut.length < urlWithoutProtocol.length) {
								urlCut = urlWithoutProtocol.substring(0, titleCut.length);
							} else {
								titleCut = changeInfo.title.substring(0, urlWithoutProtocol.length);
							}
							if (titleCut !== urlCut) isLoaded = true;
						} else {
							isLoaded = true;
						}
					}
					if (isLoaded) {
						loadedTabs.add(tabId);
						// restoreState.loaded = loadedTabs.size + simpleTabsCount;
						restoreState.loaded = loadedTabs.size;
						const titleForLog   = TmCommon.Funcs.CutStringByLength(tab.title, 70);
						const urlForLog     = TmCommon.Funcs.CutStringByLength(tab.url, 80);
						console.log(`読み込み完了: ${restoreState.loaded} / ${restoreState.total}: tabId="${tabId}" url="${urlForLog}", title="${titleForLog}"`);
						if (viewerTabId) {
							browser.tabs.sendMessage(viewerTabId, {
								type: 'update-progress',
								loaded: restoreState.loaded,
								total: restoreState.total
							}).catch(e => {
								console.error('viewer.jsへの進捗情報送信に失敗しました。', e);
							});
						}
						if (restoreState.loaded >= totalTabsToRestore) {
							resolve(); // Promiseを解決
						}
					}
				}
			};

			timeoutId = setTimeout(() => {
				console.warn(`復元処理がタイムアウトしました。`);
				resolve(); // タイムアウトしても、Promiseは解決させる
			}, 60000);
		});


		// 1. まず、監視員を配置する
		browser.tabs.onUpdated.addListener(listener, { properties: ["status", "title"] });

		// 2. それから、事件を起こす
		await restoreSubtree(data, null, createdTabIds);

		// 3. 事件の完了を待つ
		await allTabsLoadedPromise;

		// 4. 後始末
		browser.tabs.onUpdated.removeListener(listener);
		clearTimeout(timeoutId);

		console.log('すべてのタブの読み込み監視が完了しました。');
		if (viewerTabId) {
			await browser.tabs.sendMessage(viewerTabId, { type: 'refresh-view' });
		}
	} catch (err) {
		console.error('handleRestoreRequestでエラー:', err);
		return { success: false, error: err.message };
	} finally {
		restoreState.inProgress = false;
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

/** ★★★ データファイル（JSON or TSV）をダウンロード ★★★ */
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

/** ★★★指定のタブへフォーカス ★★★　*/
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

/** ★★★ JSONへの変換ロジック ★★★ */
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

/** 階層ツリー作成 */
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

/** ★★★ TSVへの変換ロジック ★★★ */
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

/**
 *
 */
// async function restoreSubtree(nodes, parentId = null, createdTabsSet) {
// 	for (const node of nodes) {
// 		try {
// 			let urlToOpen = node.url;

// 			// about:newtab と about:home は、URLを指定せずに開くのが正しい作法
// 			if (!urlToOpen || urlToOpen === 'about:newtab' || urlToOpen === 'about:home') {
// 				urlToOpen = undefined;
// 			} else if (node.url === 'about:blank') {
// 				// about:blank は安全に開ける
// 				// 何もしない
// 			} else if (node.url && node.url.startsWith('about:')) {
// 				// その他の about: ページは開けないのでスキップ
// 				console.warn(`セキュリティ上の理由により、このタブは復元をスキップします: ${node.url}`);
// 				continue; // 次のノードへ
// 			}

// 			// ★★★ discarded の指定を、完全に削除 ★★★
// 			// すべてのタブを「起きたまま」復元する。これが最も安全で確実。
// 			const newTab = await browser.tabs.create({
// 				url: urlToOpen,
// 				active: false,
// 				openerTabId: parentId,
// 				discarded: node.discarded && !urlToOpen?.startsWith('about:')
// 			});

// 			if (newTab) {
// 				createdTabsSet.add(newTab.id);
// 				if (newTab.discarded && newTab.url) {
// 					browser.tabs.reload(newTab.id);
// 				}
// 			}
// 			if (node.children && node.children.length > 0 && newTab) {
// 				await restoreSubtree(node.children, newTab.id, createdTabsSet);
// 			}
// 		} catch (err) {
// 			console.error(`タブの復元プロセスでエラーが発生しました: url=${node.url}`, err);
// 		}
// 	}
// }

/**
 * 再帰的にタブを復元する、究極の最終確定版関数
 * @param {Array} nodes - 復元するタブのノード配列
 * @param {number|null} [parentId=null] - 親タブのID
 * @param {Set<number>} createdTabsSet - 作成されたタブIDを記録するためのSet
 */
async function restoreSubtree(nodes, parentId = null, createdTabsSet) {
	for (const node of nodes) {
		let newTab     = null;
		let shouldSkip = false;

		try {
			let urlToOpen = node.url;


			// #### ロジック修正 MOD START --
			// if (!urlToOpen || urlToOpen === 'about:newtab' || urlToOpen === 'about:home') {
			// 	urlToOpen = undefined;
			// } else if (node.url.startsWith('about:') && node.url !== 'about:blank') {
			// 	console.warn(`セキュリティ上の理由により、このタブは復元をスキップします: ${node.url}`);
			// 	shouldSkip = true; // ★★★ スキップのフラグを立てる ★★★
			// }

			if (!urlToOpen || urlToOpen === 'about:newtab' || urlToOpen === 'about:home' || urlToOpen === 'about:home') {
				urlToOpen = undefined;
			} else if (node.url.startsWith('about:')) {
				console.warn(`セキュリティ上の理由により、このタブは復元をスキップします: ${node.url}`);
				shouldSkip = true; // ★★★ スキップのフラグを立てる ★★★
			}
			// #### ロジック修正 MOD END --

			if (!shouldSkip) {
				newTab = await browser.tabs.create({
					url: urlToOpen,
					active: false,
					openerTabId: parentId
				});
				if (newTab) {
					createdTabsSet.add(newTab.id);
				}
			}

			if (node.children && node.children.length > 0) {
				// ★★★ 親がスキップされても、子は祖父(parentId)の元で生き続ける ★★★
				await restoreSubtree(node.children, newTab ? newTab.id : parentId, createdTabsSet);
			}
		} catch (err) {
			console.error(`タブの作成プロセスでエラーが発生しました: url=${node.url}`, err);
			// エラーが発生した場合も、子の復元を試みる
			if (node.children && node.children.length > 0) {
				await restoreSubtree(node.children, parentId, createdTabsSet);
			}
		}
	}
}
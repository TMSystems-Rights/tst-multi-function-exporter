/**
 * @file TST多機能エクスポーター - background.js
 * @description
 * この拡張機能の中核となるバックグラウンドスクリプトです。
 * Tree Style Tab (TST) との通信、データのエクスポート（JSON/TSV）、
 * そしてJSONファイルからのタブツリー復元といった、すべての主要なロジックを担います。
 * 特にタブ復元機能は、onUpdatedイベントとタイムアウト後の補完処理を組み合わせた
 * 堅牢なアーキテクチャを採用しています。
 */

/* global TmCommon */

const TST_ID = TmCommon.Const.TST_ID;

// ===================================================
// グローバルな状態管理
// ===================================================
/**
 * タブ復元処理全体（変更検知対象のみ）の進捗を管理するオブジェクト。
 * @property {boolean} inProgress - 復元処理が進行中かどうか。
 * @property {number} loaded - 読み込みが完了したタブの数。
 * @property {number} total - 復元対象の総タブ数。
 */
let restoreState = {
	inProgress: false,
	loaded: 0,
	total: 0
};

/**
 * 復元処理中に作成された、復元対象全ての各タブの状態を個別に管理するためのMap。
 * @type {Map<number, {url: string, title: string, status: 'pending'|'completed', lastUpdated: number}>}
 */
let createdTabsInfo = new Map();

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
 * JSONデータからタブのツリーを復元するリクエストのメインハンドラ。
 * onUpdatedイベントによる監視と、タイムアウト後の補完処理を組み合わせた堅牢なアーキテクチャ。
 * @param {Array<object>} data - 復元するタブ情報のツリー構造。
 * @returns {Promise<object>} 処理の成功/失敗を示すオブジェクト。
 */
async function handleRestoreRequest(data) {
	try {
		// --- 1. 状態の初期化 ---
		restoreState = { inProgress: true, loaded: 0, total: 0 };
		createdTabsInfo.clear(); // 前回の情報が残らないようにクリア

		let totalTabsToRestore = 0;
		let simpleTabsCount    = 0; // about:newtab など、即時完了と見なせるタブの数

		/** 復元対象のタブ総数を計算する内部関数 */
		function countTabs(nodes) {
			for (const node of nodes) {
				// 特権about:ページ（復元不可）以外をカウント対象とする
				if (!node.url || !node.url.startsWith('about:') || ['about:blank', 'about:newtab', 'about:home'].includes(node.url)) {
					totalTabsToRestore++;
					// その中でも特に、onUpdatedでの検知が難しいタブを「即時完了」として事前に数えておく
					if (!node.url || ['about:newtab'].includes(node.url)) {
						simpleTabsCount++;
					}
				}
				if (node.children) {
					countTabs(node.children);
				}
			}
		}
		countTabs(data);
		restoreState.total = totalTabsToRestore;

		console.log(`復元対象: ${totalTabsToRestore} (うち即時完了: ${simpleTabsCount})`);
		if (totalTabsToRestore === 0) {
			restoreState.inProgress = false;
			return { success: true };
		}

		const loadedTabs    = new Set();    // onUpdatedで完了を検知したタブIDを記録
		const createdTabIds = new Set();    // restoreSubtreeで作成された全てのタブIDを記録
		const viewerUrl     = browser.runtime.getURL('/viewer/viewer.html');
		const viewerTabs    = await browser.tabs.query({ url: viewerUrl });
		const viewerTabId   = viewerTabs.length > 0 ? viewerTabs[0].id : null;

		// --- 2. 監視の準備 ---
		// プログレスバーの初期値を設定
		restoreState.loaded = 0;
		if (viewerTabId) {
			browser.tabs.sendMessage(viewerTabId, {
				type: 'update-progress',
				loaded: restoreState.loaded,
				total: restoreState.total
			}).catch(e => {
				console.error('viewer.jsへの初期進捗送信に失敗:', e);
			});
		}

		let listener;
		let timeoutId;

		// --- 3. onUpdatedによるメイン監視処理 ---
		const allTabsLoadedPromise = new Promise(resolve => {
			let resolved = false;

			/** 監視を安全に終了させるための関数 */
			function done() {
				if (resolved) {
					return;
				}
				resolved = true;
				clearTimeout(timeoutId);
				browser.tabs.onUpdated.removeListener(listener);
				resolve();
			}

			/** タブの更新を検知するリスナー */
			listener = (tabId, changeInfo, tab) => {
				// 自身が作成し、まだ完了していないタブのみを対象とする
				if (createdTabIds.has(tabId) && !loadedTabs.has(tabId)) {
					let isLoaded = false;
					// [完了判定ロジック1] statusが'complete'になったら完了
					if (changeInfo.status === 'complete') {
						isLoaded = true;
					// [完了判定ロジック2] タイトルが変更された場合
					} else if (changeInfo.title) {
						// URLを持つタブの場合、タイトルがURLとは異なる内容になれば完了と見なす
						// (alert()で止まるページなども、タイトルが先に設定されればここで検知できる)
						if (tab.url) {
							const urlWithoutProtocol = tab.url.replace(/^[^/]+:\/\//, '');
							let urlCut               = urlWithoutProtocol;
							let titleCut             = changeInfo.title;
							if (titleCut.length < urlWithoutProtocol.length) {
								urlCut = urlWithoutProtocol.substring(0, titleCut.length);
							} else {
								titleCut = changeInfo.title.substring(0, urlWithoutProtocol.length);
							}
							if (titleCut !== urlCut) {
								isLoaded = true;
							}
						// URLを持たないタブ(about:newtabなど)は、何らかのタイトルがつけば完了
						} else {
							isLoaded = true;
						}
					}

					// 完了と判定された場合の処理
					if (isLoaded) {
						loadedTabs.add(tabId);
						const tabInfo = createdTabsInfo.get(tabId);
						if (tabInfo) {
							tabInfo.status = 'completed'; // 状態管理Mapを更新
						}

						// loadedTabs.sizeを読み込み完了数とする
						restoreState.loaded = loadedTabs.size;

						// ログ出力
						const titleForLog = TmCommon.Funcs.CutStringByLength(tab.title, 70);
						const urlForLog   = TmCommon.Funcs.CutStringByLength(tab.url, 80);
						console.log(`読み込み完了: ${restoreState.loaded} / ${restoreState.total}: tabId="${tabId}" url="${urlForLog}", title="${titleForLog}"`);

						// viewer.jsに進捗を通知
						if (viewerTabId) {
							browser.tabs.sendMessage(viewerTabId, {
								type: 'update-progress',
								loaded: restoreState.loaded,
								total: restoreState.total
							}).catch(e => {
								console.error('viewer.jsへの進捗情報送信に失敗しました。', e);
							});
						}

						// 全てのタブが完了したら、監視を即時終了
						if (restoreState.loaded >= totalTabsToRestore) {
							console.log(`分母に達しました。監視を終了します。`);
							done();
						}
					}
				}
			};

			// 安全装置としてのタイムアウト。30秒間onUpdatedイベントがなければ監視を打ち切る。
			timeoutId = setTimeout(() => {
				console.warn(`復元処理がタイムアウトしました。`);
				done();
			}, 30000);
		});

		// --- 4. 処理の実行 ---
		console.log('1. 監視員を配置します');
		browser.tabs.onUpdated.addListener(listener, { properties: ["status", "title"] });
		console.log('2. 事件を起こします (タブ作成開始)');
		await restoreSubtree(data, null, createdTabIds);
		console.log('3. 事件の完了を待ちます');
		await allTabsLoadedPromise;

		// --- 5. onUpdatedで検知漏れしたタブの補完処理 ---
		console.log('4. 監視から漏れたタブを補完します');
		for (const [tabId, tabInfo] of createdTabsInfo.entries()) {
			// 状態が'pending'のまま残っているタブ（主にabout:blank）を対象
			if (tabInfo.status === 'pending') {
				restoreState.loaded++;
				const titleForLog = TmCommon.Funcs.CutStringByLength(tabInfo.title, 70);
				const urlForLog   = TmCommon.Funcs.CutStringByLength(tabInfo.url, 80);
				console.log(`読み込み完了[補完処理]: ${restoreState.loaded} / ${restoreState.total}: tabId="${tabId}" url="${urlForLog}", title="${titleForLog}"`);

				// viewer.jsに進捗を通知
				if (viewerTabId) {
					browser.tabs.sendMessage(viewerTabId, {
						type: 'update-progress',
						loaded: restoreState.loaded,
						total: restoreState.total
					}).catch(e => {
						console.error('[補完処理] 進捗送信エラー:', e);
					});
				}
			}
		}

		// --- 6. 最終通知 ---
		console.log('すべてのタブの読み込み処理が完了しました。');
		if (viewerTabId) {
			// viewer.jsに最終的な再描画を指示
			await browser.tabs.sendMessage(viewerTabId, { type: 'refresh-view' });
		}
	} catch (err) {
		console.error('handleRestoreRequestでエラー:', err);
		return { success: false, error: err.message };
	} finally {
		restoreState.inProgress = false; // どのような場合でも処理中フラグを解除
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


/**
 * 指定されたノードツリーに基づき、タブを再帰的に作成する。
 * @param {Array<object>} nodes - 復元するタブのノード配列。
 * @param {number|null} [parentId=null] - 親タブのID。TSTでの親子関係構築に必要。
 * @param {Set<number>} createdTabsSet - 作成したタブのIDを記録するためのSetオブジェクト。
 */
async function restoreSubtree(nodes, parentId = null, createdTabsSet) {
	for (const node of nodes) {
		let newTab     = null;
		let shouldSkip = false;

		try {
			let urlToOpen = node.url;

			// about:newtab, about:home, about:blank はURL指定なしで開くのが適切な挙動
			if (!urlToOpen || ['about:newtab', 'about:home', 'about:blank'].includes(urlToOpen)) {
				urlToOpen = undefined;
			// 上記以外の特権about:ページはセキュリティ上の理由で復元をスキップ
			} else if (node.url.startsWith('about:')) {
				console.warn(`セキュリティ上の理由により、このタブは復元をスキップします: ${node.url}`);
				shouldSkip = true;
			}

			if (!shouldSkip) {
				newTab = await browser.tabs.create({
					url: urlToOpen,
					active: false,        // 復元時はバックグラウンドで開く
					openerTabId: parentId // これが親子関係を決定する
				});

				if (newTab) {
					// 作成したタブのIDを記録し、onUpdatedリスナーの監視対象とする
					createdTabsSet.add(newTab.id);

					// 状態管理Mapに、このタブの初期状態を'pending'として登録
					createdTabsInfo.set(newTab.id, {
						url: newTab.url,
						title: newTab.title,
						status: 'pending',
						lastUpdated: Date.now()
					});
				}
			}

			// 子ノードがあれば、再帰的に処理を呼び出す
			if (node.children && node.children.length > 0) {
				// 親がスキップされた場合、newTabはnullになる。その場合は子は祖父(parentId)の子として復元される。
				await restoreSubtree(node.children, newTab ? newTab.id : parentId, createdTabsSet);
			}
		} catch (err) {
			console.error(`タブの作成プロセスでエラーが発生しました: url=${node.url}`, err);
			// エラーが発生しても処理を止めず、子タブの復元は試みる
			if (node.children && node.children.length > 0) {
				await restoreSubtree(node.children, parentId, createdTabsSet);
			}
		}
	}
}
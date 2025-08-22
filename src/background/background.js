/**
 * @file TST多機能エクスポーター - background.js (最終確定版: TSMアーキテクチャ)
 * @description
 * Tab Session Managerのアーキテクチャを完全に模倣。
 * setTimeoutを使い、タブ作成を独立したタスクとしてブラウザのイベントキューに委ねることで、
 * メモリ負荷を最小限に抑え、究極の安定性を実現する。
 */

/* global TmCommon */

const TmBackground = {

	// ===================================================
	// 定数 (変更されない値)
	// ===================================================
	Const: {
		TST_ID: TmCommon.Const.TST_ID,

		// ======================================================
		// アイコンURL定義 ※TSTのfavicon表示仕様にあわせています。
		// 基本はFirefox標準のfaviconから取得し、TST独自のはTST公式（下記URLの中）から取得。
		// 「/viewer/svg/020_TST/」フォルダ内のSVGアイコンは、TSTの公式アイコンを使用しています。
		// https://github.com/piroor/treestyletab/tree/trunk/webextensions/resources/icons
		// ======================================================
		FALLBACK_ICON_URL        : '/viewer/svg/020_TST/defaultFavicon.svg',
		ADDON_ICON_URL           : '/viewer/svg/020_TST/extensions.svg',
		LOCK_ICON_URL            : '/viewer/svg/020_TST/lockwise.svg',
		FIREFOX_ICON_URL         : 'chrome://branding/content/icon32.png',
		ROBOTS_ICON_URL          : 'chrome://browser/content/robot.ico',
		PRIVATE_BROWSING_ICON_URL: 'chrome://browser/skin/privatebrowsing/favicon.svg',
		BLOCKED_ICON_URL         : 'chrome://global/skin/icons/blocked.svg',
		DEVELOPER_ICON_URL       : 'chrome://global/skin/icons/developer.svg',
		INFO_ICON_URL            : 'chrome://global/skin/icons/info.svg',
		PERFORMANCE_ICON_URL     : 'chrome://global/skin/icons/performance.svg',
		SETTINGS_ICON_URL        : 'chrome://global/skin/icons/settings.svg',

		// ======================================================
		// TSTの内部アイコン表示ルール ※TSTのfavicon表示仕様にあわせています。
		// ======================================================
		INTERNAL_ICONS: {
			'about:about'               : 'chrome://branding/content/icon32.png',
			'about:addons'              : '/viewer/svg/020_TST/extensions.svg',
			'about:blank'               : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:blocked'             : 'chrome://global/skin/icons/blocked.svg',
			'about:buildconfig'         : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:cache'               : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:cache?device=disk'   : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:cache?device=memory' : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:cache?device=offline': '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:certerror'           : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:config'              : 'chrome://global/skin/icons/settings.svg',
			'about:crashes'             : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:debugging'           : 'chrome://global/skin/icons/developer.svg',
			'about:home'                : 'chrome://branding/content/icon32.png',
			'about:jetpack'             : 'chrome://global/skin/icons/info.svg',
			'about:license'             : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:logins'              : '/viewer/svg/020_TST/lockwise.svg',
			'about:logo'                : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:memory'              : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:mozilla'             : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:neterror'            : '/viewer/svg/020_TST/defaultFavicon.svg',
			'about:newtab'              : 'chrome://branding/content/icon32.png',
			'about:performance'         : 'chrome://global/skin/icons/performance.svg',
			'about:permissions'         : 'chrome://global/skin/icons/info.svg',
			'about:plugins'             : 'chrome://global/skin/icons/info.svg',
			'about:preferences'         : 'chrome://global/skin/icons/settings.svg',
			'about:privatebrowsing'     : 'chrome://browser/skin/privatebrowsing/favicon.svg',
			'about:robots'              : 'chrome://browser/content/robot.ico',
			'about:sessionrestore'      : 'chrome://global/skin/icons/info.svg',
			'about:support'             : 'chrome://branding/content/icon32.png',
			'about:sync-tabs'           : 'chrome://global/skin/icons/info.svg',
			'chrome://'                 : '/viewer/svg/020_TST/defaultFavicon.svg'
		}
	},

	// ===================================================
	// グローバルな状態管理
	// ===================================================
	State: {
		/**
		 * タブ復元処理の進捗を管理する、極めてシンプルなグローバルオブジェクト。
		 * viewer.jsからのポーリングに対して、このオブジェクトを返します。
		 * @property {boolean} inProgress - 復元処理が進行中かどうか。
		 * @property {number} loaded - 読み込みが完了したタブの数。
		 * @property {number} total - 復元対象の総タブ数。
		 * @property {boolean} isSuppressingTst - 復元中にTSTの自動処理を抑制しているか。
		 */
		restoreState: {
			inProgress: false,
			loaded: 0,
			total: 0,
			isSuppressingTst: false // TST自動処理抑制フラグ
		}
	},

	// ===================================================
	// リクエストハンドラ
	// ===================================================
	Handlers: {
		/**
		 * データ取得を伴うリクエスト（エクスポート、ビューア表示）を処理します。
		 * @param {object} message - popup.jsまたはviewer.jsからのメッセージオブジェクト。
		 * @returns {Promise<object>} 処理結果。
		 */
		handleDataRequest: async function (message) {
			try {
				// TSTからツリー構造を取得
				const currentWindow = await browser.windows.getCurrent();
				const tree          = await browser.runtime.sendMessage(
					TmBackground.Const.TST_ID,
					{
						type: 'get-tree',
						window: currentWindow.id
					}
				);

				if (!tree || !Array.isArray(tree)) {
					throw new Error('TSTから有効なツリー構造（配列）を取得できませんでした。');
				}

				// ツリー構造からエクスポート用データを作成
				const viewerUrl    = browser.runtime.getURL('viewer/viewer.html');
				const filteredTree = TmBackground.Helpers.filterTree(tree, (tab) => tab.url !== viewerUrl);
				const outputData   = TmBackground.Helpers.convertTreeForJSON(filteredTree);

				const currentDatetime = new Date().toLocaleString('ja-JP', {
					timeZone: 'Asia/Tokyo',
					year    : 'numeric',
					month   : '2-digit',
					day     : '2-digit',
					hour    : '2-digit',
					minute  : '2-digit',
					second  : '2-digit'
				}).replace(/[:/]/g, '').replace(/\s/g, '_');

				const fileBaseName = `forefox_tab_list_${currentDatetime}`;
				switch (message.type) {
					case 'export-json': {
						const jsonString = JSON.stringify(outputData, null, 2);
						await TmBackground.Helpers.downloadData(jsonString, `${fileBaseName}.json`);
						break;
					}
					case 'export-tsv': {
						const tsvData = TmBackground.Helpers.convertTreeToTSV(outputData);
						await TmBackground.Helpers.downloadData(tsvData, `${fileBaseName}.tsv`);
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
		},

		/**
		 * データ取得を伴わないアクション（タブのフォーカス、削除、ソート）を処理します。
		 * @param {object} message - viewer.jsからのメッセージオブジェクト。
		 * @returns {Promise<object>} 処理結果。
		 */
		handleActionRequest: async function (message) {
			try {
				if (message.type === 'focus-tst-tab') {
					await TmBackground.Helpers.focusTab(message.tabId);
				} else if (message.type === 'delete-tab') {
					await browser.tabs.remove(message.tabId);
				} else if (message.type === 'sort-tabs') {
					const { parentTabId, sortedTabIds } = message;
					console.log(`ソート開始: parent=${parentTabId || 'root'}, ids=`, sortedTabIds);

					if (!sortedTabIds || sortedTabIds.length <= 1) {
						return { success: true };
					}

					// 配列の末尾から先頭に向かって処理する (逆順処理)
					// i は末尾から2番目の要素のインデックスから開始
					for (let i = sortedTabIds.length - 2; i >= 0; i--) {
						const tabToMove      = sortedTabIds[i];
						const referenceTabId = sortedTabIds[i + 1]; // 基準となるのは、常に自分の「次」に来るべきタブ

						try {
							console.log(`[move-before] タブID ${tabToMove} を タブID ${referenceTabId} の直前へ移動`);
							await browser.runtime.sendMessage(TmBackground.Const.TST_ID, {
								type: 'move-before',
								tab: tabToMove,
								referenceTabId: referenceTabId,
								followChildren: true
							});
							await TmBackground.Helpers.sleep(150);
						} catch (tstError) {
							console.warn(`タブID ${tabToMove} の移動に失敗しました。`, tstError.message);
						}
					}

					console.log('ソート処理完了');
				}
				return { success: true };
			} catch (err) {
				console.error('アクションリクエスト処理でエラー:', err);
				return { success: false, error: err.message };
			}
		},


		/**
		 * JSONデータからタブのツリーを復元するリクエストのメインハンドラ
		 * 「スプリントと休息」アーキテクチャを採用。
		 * 短い区間を一気に処理した後、長い休息時間を設けることで、
		 * TSTの処理遅延を完全に解消し、データの整合性を完璧に保つ。
		 * @param {Array<object>} windowsData - ウィンドウ情報の配列 [{ windowId, focused, tabs:[...] }, ...]
		 */
		handleRestoreRequest: async function (windowsData) {

			if (TmBackground.State.restoreState.inProgress) {
				return { success: false, error: '別の復元処理が実行中です。' };
			}
			const tabsSortedByHierarchy = windowsData.flatMap(w => TmBackground.Helpers.flattenTreeWithDepth(w.tabs || [])).sort((a, b) => {
				if (a.depth < b.depth) {
					return -1;
				}
				if (a.depth > b.depth) {
					return 1;
				}
				if (a.index < b.index) {
					return -1;
				}
				if (a.index > b.index) {
					return 1;
				}
				return 0;
			});
			const tabsSortedByIndex     = [...tabsSortedByHierarchy].sort((a, b) => a.index - b.index);
			if (tabsSortedByHierarchy.length === 0) {
				return { success: true };
			}
			TmBackground.State.restoreState = {
				inProgress: true,
				loaded: 0,
				total: tabsSortedByHierarchy.length,
			};
			console.log(`復元対象の総タブ数: ${TmBackground.State.restoreState.total}`);
			const viewerTabs     = await browser.tabs.query({ url: browser.runtime.getURL('/viewer/viewer.html') });
			const viewerTabId    = viewerTabs.length > 0 ? viewerTabs[0].id : null;
			const currentWindow  = await browser.windows.getCurrent({ populate: false });
			const targetWindowId = currentWindow.id;
			const idMap          = new Map();

			const restoreProcess = async () => {
				const sendProgressUpdate = (stage, stageText, loaded = -1, total = -1) => {
					if (viewerTabId) {
						browser.tabs.sendMessage(viewerTabId, { type: 'update-progress', stage, stageText, loaded, total }).catch(() => {});
					}
				};

				try {
					const GetMsg                 = TmCommon.Funcs.GetMsg;
					const placeholderTitlePrefix = `${GetMsg('placeholderTitle')}:`;
					const noTitleStr             = `${GetMsg('restoreNotitle')}:`;

					// ---------------------------------------------------
					// 第１段階の処理：タブ作成（スプリント＆休息方式）
					// ---------------------------------------------------
					console.log(`第1段階: タブ作成を開始します（スプリント＆休息方式）。`);

					const createdTabsInfo = [];
					const totalTabs       = tabsSortedByHierarchy.length;
					const stage1Text      = `${GetMsg('restoreProgressStage1Text')}`;
					console.log(stage1Text);
					sendProgressUpdate(1, stage1Text, 0, totalTabs);

					// スプリントカウンターを導入
					let sprintCounter = 0;
					const SPRINT_SIZE = 50; // 50タブごとに休息


					for (const node of tabsSortedByHierarchy) {
						// tryの範囲をforループ内全域に広げました。
						try {
							// 他の拡張機能で作成されたタブの場合、プレースホルダURLをデコードする
							if (node.url && node.url.startsWith('moz-extension://') && node.url.includes('/placeholder.html?url=')) {
								try {
									const urlParams     = new URL(node.url).searchParams;
									const originalUrl   = urlParams.get('url');
									const originalTitle = urlParams.get('title');

									if (originalUrl) {
										console.log(`プレースホルダURLをデコード: ${node.url} -> ${originalUrl}`);
										node.url = originalUrl; // URLを本来のものに書き換える
										// もし元のタイトルがなければ、デコードしたタイトルを使う
										if (!node.title || node.title.startsWith(placeholderTitlePrefix)) {
											if (originalTitle) {
												node.title = originalTitle;
											}
										}
									}
								} catch (e) {
									console.warn('プレースホルダURLの解析に失敗しました:', node.url, e);
								}
							}

							const openerTabId = idMap.get(node.openerTabId);

							const createProperties = {
								windowId: targetWindowId,
								openerTabId: openerTabId,
								url: node.url,
								active: false,
								pinned: !!node.pinned,
								discarded: true,
								cookieStoreId: node.cookieStoreId,
							};

							if (createProperties.cookieStoreId === 'firefox-default') {
								delete createProperties.cookieStoreId;
							}

							if (!node.url || ['about:newtab', 'about:home', 'about:blank'].includes(node.url)) {
								createProperties.url       = undefined;
								createProperties.discarded = false;
							} else if (node.url.startsWith('about:')) {
								const originalUrl          = encodeURIComponent(node.url);
								const originalTitle        = encodeURIComponent(node.title || noTitleStr);
								createProperties.url       = browser.runtime.getURL(`/viewer/placeholder.html?url=${originalUrl}&title=${originalTitle}`);
								createProperties.discarded = false;
							}

							if (createProperties.discarded && node.title) {
								createProperties.title = node.title;
							}

							// タブ作成
							const newTab = await browser.tabs.create(createProperties);
							idMap.set(node.id, newTab.id);
							createdTabsInfo.push({ newId: newTab.id, node });
							TmBackground.State.restoreState.loaded++;

							// 進捗情報をviewer.jsへ送信
							sendProgressUpdate(1, stage1Text, TmBackground.State.restoreState.loaded, totalTabs);
						} catch (err) {
							console.error(`タブ作成失敗: url=${node.url}`, err);
							TmBackground.State.restoreState.total--;
						} finally {
							// スプリントと休息のロジック
							sprintCounter++;
							if (sprintCounter % SPRINT_SIZE === 0) {
								console.log(`--- Checkpoint: ${sprintCounter}タブ作成完了。TST安定化のため1.5秒休息... ---`);
								await TmBackground.Helpers.sleep(1500); // 長い休息
							} else {
								await TmBackground.Helpers.sleep(50); // 通常のスプリントペース
							}
						}
					}

					// TSTがタブの作成完了するだけの待機時間を設ける
					console.log('全タブ作成完了。TSTの内部処理が安定するまで5秒間待機します...');
					await TmBackground.Helpers.sleep(5000);

					// ---------------------------------------------------
					// 第２段階の処理：ソーティング
					// ---------------------------------------------------
					console.log("第2段階: 並べ替えを開始します。");
					const stage2Text = `${GetMsg('restoreProgressStage2Text')}`;
					console.log(stage2Text);
					sendProgressUpdate(2, stage2Text);
					const newTabIdsInCorrectOrder = tabsSortedByIndex.map(node => idMap.get(node.id)).filter(id => id);
					try {
						await browser.tabs.move(newTabIdsInCorrectOrder, { windowId: targetWindowId, index: 0 });
					} catch (e) {
						console.error('タブの一括移動に失敗しました。', e);
					}
					// 並べ替え後、TSTが再度ツリーを安定させるための待機時間
					console.log('全タブ並べ替え完了。TSTの内部処理が安定するまで3秒間待機します...');
					await TmBackground.Helpers.sleep(3000);

					// ---------------------------------------------------
					// 第3段階の処理：アクティブタブの設定
					// ---------------------------------------------------
					console.log("第3段階: アクティブタブを設定を開始します。");
					const stage3Text = `${GetMsg('restoreProgressStage3Text')}`;
					console.log(stage3Text);
					sendProgressUpdate(3, stage3Text);

					// ここで、アクティブなタブを設定するところですが、
					// アクティブにすると当拡張機能のビューア画面からそのタブ画面へフォーカス移動してしまいます。
					// これだと進捗状況もわからず困るので、処理は削除。
					// （将来このロジックを復活するかもしれないので、参考としてコメントアウトしコードは残します）

					// const activeNode = tabsSortedByIndex.find(t => t.active);
					// if (activeNode) {
					// 	const newActiveTabId = idMap.get(activeNode.id); if (newActiveTabId) await browser.tabs.update(newActiveTabId, { active: true });
					// }
					// await browser.windows.update(targetWindowId, { focused: true });

					// ---------------------------------------------------
					// 第4段階の処理：ツリーの開閉状態を復元
					// ---------------------------------------------------
					console.log("第4段階: ツリー開閉状態の復元を開始します。");
					const stage4Text = `${GetMsg('restoreProgressStage4Text')}`;
					console.log(stage4Text);
					sendProgressUpdate(4, stage4Text);
					for (let i = createdTabsInfo.length - 1; i >= 0; i--) {
						const { newId, node } = createdTabsInfo[i];
						if (!node.children || node.children.length === 0) {
							continue;
						}
						try {
							if (node.states && node.states.includes('subtree-collapsed')) {
								await browser.runtime.sendMessage(TmBackground.Const.TST_ID, {
									type: 'collapse-tree',
									tab: newId
								});
							} else {
								await browser.runtime.sendMessage(TmBackground.Const.TST_ID, {
									type: 'expand-tree',
									tab: newId
								});
							}
							await TmBackground.Helpers.sleep(50);
						} catch (tstError) {
							console.warn(`TSTへのメッセージ送信に失敗。タブID: ${newId}`, tstError.message);
						}
					}

					// ---------------------------------------------------
					// 第5段階の処理：最終処理（TSTの最終安定化のための待機）
					// ---------------------------------------------------
					console.log("第5段階: 最終処理（TSTの最終安定化のための待機）を開始します。");
					const waitSecond = 5;
					// const stage5Text = `第5段階（最終）: TST安定化のため${waitSecond}秒待機します...`;
					const stage5Text = TmCommon.Funcs.GetMsg("restoreProgressStage5Text", waitSecond.toString());
					console.log(stage5Text);
					sendProgressUpdate(5, stage5Text);
					console.log(`TSTの最終安定化のため、${waitSecond}秒間待機します...`);
					await TmBackground.Helpers.sleep(waitSecond * 1000);

				} catch (e) {
					console.error('タブ復元処理全体で致命的なエラーが発生しました:', e);
				} finally {
					TmBackground.State.restoreState.inProgress = false;
					console.log('復元処理がすべて完了しました。');
					if (viewerTabId) {
						browser.runtime.sendMessage({ type: 'refresh-view' }).catch(() => { });
					}
				}
			};

			restoreProcess();
			return Promise.resolve({ success: true, message: '復元処理を開始しました。' });
		}
	},

	// ===================================================
	// ヘルパー関数群
	// ===================================================
	Helpers: {
		/**
		 * TSTから取得したツリー配列を、IDをキーにしたMapに変換します。（ソート処理でツリー構造を高速に参照するためのMapを作成）
		 * @param {Array<object>} nodes - TSTのツリー構造データ。
		 * @returns {Map<number, object>} - タブIDをキー、タブオブジェクトを値とするMap。
		 */
		buildTabMap: function (nodes) {
			const map = new Map();
			/**
			 *
			 */
			function traverse(node) {
				map.set(node.id, node);
				if (node.children && node.children.length > 0) {
					for (const child of node.children) {
						traverse(child);
					}
				}
			}
			for (const node of nodes) {
				traverse(node);
			}
			return map;
		},

		/**
		 * 指定されたタブのツリーにおける最後の末裔（子孫）のIDを見つける
		 * @param {number} tabId - 調査対象のタブID。
		 * @param {Map<number, object>} tabMap - buildTabMapで作成したMap。
		 * @returns {number|null} - 最後の末裔のタブID。子がいなければ自身のIDを返す。
		 */
		findLastDescendant: function (tabId, tabMap) {
			let currentNode = tabMap.get(tabId);
			if (!currentNode) {
				return null; // マップに存在しない場合はnull
			}

			// 子がいなくなるまで、一番最後の子をたどっていく
			while (currentNode.children && currentNode.children.length > 0) {
				const lastChildId = currentNode.children[currentNode.children.length - 1].id;
				const nextNode    = tabMap.get(lastChildId);
				if (!nextNode) {
					break; // 念のため、次のノードがマップに存在しない場合はループを抜ける
				}
				currentNode = nextNode;
			}
			return currentNode.id;
		},

		/**
		 * 指定されたミリ秒だけ処理を待機します。(UIスレッドはブロックしない)
		 * @param {number} ms - 待機する時間（ミリ秒）。
		 * @returns {Promise<void>}
		 */
		sleep: function (ms) {
			return new Promise(resolve => setTimeout(resolve, ms));
		},

		/**
		 * ツリー構造を再帰的にフィルタリングする
		 * @param {Array} nodes - タブのノード配列
		 * @param {Function} predicate - trueを返したノードを維持する関数
		 * @returns {Array} - フィルタリングされた新しいノード配列
		 */
		filterTree: function (nodes, predicate) {
			const result = [];
			for (const node of nodes) {
				if (predicate(node)) {
					const newNode = { ...node }; // 元のオブジェクトを変更しないようにコピーを作成
					// 子要素も再帰的にフィルタリング
					if (newNode.children) {
						// 新しいオブジェクトを作成して、元のtreeオブジェクトを変更しないようにする
						newNode.children = this.filterTree(newNode.children, predicate);
					}
					result.push(newNode);
				}
			}
			return result;
		},

		/**
		 * 指定されたデータをファイル（JSON or TSV）としてダウンロードさせます。
		 * @param {string} data - ダウンロードするデータ本体。
		 * @param {string} filename - 保存するファイル名。
		 */
		downloadData: async function (data, filename) {
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
		},

		/**
		 * 指定されたタブIDのタブにフォーカスを移動します。
		 * @param {number} tabId - フォーカスするタブのID。
		 */
		focusTab: async function (tabId) {
			try {
				const tabToFocus = await browser.tabs.get(tabId);
				await browser.windows.update(tabToFocus.windowId, { focused: true });
				await browser.tabs.update(tabToFocus.id, { active: true });
				await browser.runtime.sendMessage(TmBackground.Const.TST_ID, { type: 'focus-tab', tab: tabId });
			} catch (error) {
				console.error(`Tab focus failed for ${tabId}: `, error);
			}
		},

		/**
		 * TSTから取得したツリー構造を、エクスポートに適した形式に再帰的に変換します。
		 * @param {Array<object>} tstTree - TSTから取得したツリー構造データ。
		 * @returns {Array<object>} - 整形されたツリー構造データ。
		 */
		convertTreeForJSON: function (tstTree) {
			const convertNode = (tstNode) => {
				let finalFavIconUrl = TmBackground.Const.FALLBACK_ICON_URL;
				let bestMatchKey    = '';
				if (tstNode.url) {
					for (const key of Object.keys(TmBackground.Const.INTERNAL_ICONS)) {
						if (tstNode.url.startsWith(key) && key.length >= bestMatchKey.length) {
							bestMatchKey = key;
						}
					}
				}
				if (bestMatchKey) {
					finalFavIconUrl = TmBackground.Const.INTERNAL_ICONS[bestMatchKey];
				} else if (tstNode.favIconUrl) {
					finalFavIconUrl = tstNode.favIconUrl;
				} else if (tstNode.effectiveFavIconUrl) {
					finalFavIconUrl = tstNode.effectiveFavIconUrl;
				}

				const newNode = {
					id: tstNode.id,
					index: tstNode.index,
					url: tstNode.url,
					title: tstNode.title,
					favIconUrl: finalFavIconUrl,
					pinned: tstNode.pinned || false,
					discarded: tstNode.discarded || tstNode.hidden,
					states: tstNode.states || [], // タブの折り畳み状態を表すプロパティ（展開されている場合:Array []、 畳まれている場合：Array [ "subtree-collapsed" ]）
					cookieStoreId: tstNode.cookieStoreId,
					active: tstNode.active,
				};

				if (tstNode.children && tstNode.children.length > 0) {
					newNode.children = tstNode.children.map(child => convertNode(child));
				}
				return newNode;
			};
			return tstTree.map(rootNode => convertNode(rootNode));
		},

		/**
		 * エクスポート用のツリー構造データをTSV形式の文字列に変換します。
		 * @param {Array<object>} jsonData - convertTreeForJSONで生成されたツリー構造データ。
		 * @returns {string} - TSV形式の文字列。
		 */
		convertTreeToTSV: function (jsonData) {
			const flatList = [];

			/**
			 * ツリー構造を再帰的に巡回し、各ノードを階層パスと共にフラットなリストに変換する。
			 * この関数はクロージャとして外部の`flatList`変数を直接変更します。
			 * @param {object} node - 処理対象のタブノード。
			 * @param {object[]} path - 現在のノードに至るまでの親ノードの配列（階層パス）。
			 * @returns {void}
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
			const header1 = ['', labelMostDepthNode, ''];
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
		},

		/**
		 * 復元するタブのツリー構造を、処理しやすいフラットなリストに変換します。
		 * 各ノードの階層の深さ(depth)と、属するルートノードのID(rootId)も計算します。
		 * @param {Array<object>} nodes - 元のツリー構造データ。
		 * @param {number|null} parentId - 親タブのID。
		 * @param {number} depth - 現在の階層の深さ。
		 * @param {number|null} rootId - このツリーのルートノードのID。
		 * @returns {Array<object>} - 親子、depth、rootId情報を保持したフラットなノードの配列。
		 */
		flattenTreeWithDepth: function (nodes, parentId = null, depth = 0, rootId = null) {
			let list = [];
			for (const node of nodes) {
				// 自分がルートノードの場合、自分のIDをrootIdとする
				const currentRootId = (depth === 0) ? node.id : rootId;

				// 自分の情報をリストに追加
				list.push({ ...node, openerTabId: parentId, depth: depth, rootId: currentRootId });

				// 子がいれば、自分のIDを親として、現在のrootIdを引き継いで再帰的に処理
				if (node.children && node.children.length > 0) {
					list = list.concat(this.flattenTreeWithDepth(node.children, node.id, depth + 1, currentRootId));
				}
			}
			return list;
		}
	}
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
			return TmBackground.Handlers.handleDataRequest(message);
		case 'focus-tst-tab':
		case 'delete-tab':
			return TmBackground.Handlers.handleActionRequest(message);
		case 'sort-tabs':
			return TmBackground.Handlers.handleActionRequest(message);
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
			return TmBackground.Handlers.handleRestoreRequest(windowsData);
		}

		//  ポーリングは不要になったのでget-restore-progressは削除しても良いが、念のため残す
		case 'get-restore-progress':
			return Promise.resolve(TmBackground.State.restoreState);
		default:
			console.error('不明なメッセージタイプを受信:', message.type);
			return Promise.resolve({ success: false, error: 'Unknown message type' });
	}
});


/**
 * オブジェクトを再帰的に（深く）凍結するヘルパー関数
 * @param {object} object 凍結したいオブジェクト
 * @returns {object} 凍結されたオブジェクト
 */
function DeepFreeze(object) {
	if (object === null || typeof object !== 'object' || Object.isFrozen(object)) {
		return object;
	}
	for (const key of Object.keys(object)) {
		DeepFreeze(object[key]);
	}
	return Object.freeze(object);
}

// 意図しない変更を防ぐために、定数とヘルパー関数を凍結
DeepFreeze(TmBackground.Const);
DeepFreeze(TmBackground.Helpers);

// Stateは変更を許可するため、シールする（プロパティ追加はNGだが、値の変更は可）
Object.seal(TmBackground.State);


// トップレベルの名前空間を凍結し、新たなプロパティの追加などを防ぐ
Object.freeze(TmBackground);
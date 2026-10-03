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
		 * @param {object} [sender] - メッセージの送信元情報。
		 * @returns {Promise<object>} 処理結果。
		 */
		handleDataRequest: async function (message, sender) {
			try {
				let windowId;
				// ビューアからの要求では「ビューアが属するウィンドウ」を対象にする。
				// ポップアップには送信元タブがないため、その場合だけ現在のウィンドウを取得する。
				if (typeof sender?.tab?.windowId === 'number') {
					windowId = sender.tab.windowId;
				} else {
					const currentWindow = await browser.windows.getCurrent();
					windowId            = currentWindow.id;
				}

				// TSTからツリー構造を取得
				const tree = await browser.runtime.sendMessage(
					TmBackground.Const.TST_ID,
					{
						type: 'get-tree',
						window: windowId
					}
				);

				if (!tree || !Array.isArray(tree)) {
					throw new Error('TSTから有効なツリー構造（配列）を取得できませんでした。');
				}

				// TST 4.4.6以降は、TSTの特別権限を与えていない外部アドオンに対して
				// title・url等の詳細情報が伏せられます。Firefox自身のtabs APIで取得した
				// 詳細をタブIDで補完し、TSTからはツリー構造だけを利用します。
				const windowTabs   = await browser.tabs.query({ windowId });
				const enrichedTree = TmBackground.Helpers.enrichTreeWithBrowserTabs(tree, windowTabs);
				const viewerUrl    = browser.runtime.getURL('viewer/viewer.html');
				// ビューア自身を一覧やエクスポートへ含めると、開くたびに自己参照のタブが増えるため除外する。
				const filteredTree = TmBackground.Helpers.filterTree(enrichedTree, (tab) => tab.url !== viewerUrl);
				const outputData   = TmBackground.Helpers.convertTreeForJSON(filteredTree);

				if (message.type === 'get-viewer-data') {
					// TSTはタブ生成直後に未完成のツリーを返すことがある。
					// Firefox側の実タブ数と一致するまで、ビューアへ再試行を指示する。
					const expectedCount = windowTabs.filter((tab) => {
						const url = tab.url || tab.pendingUrl || '';
						return url !== viewerUrl;
					}).length;
					const treeTabCount = TmBackground.Helpers.countTreeTabs(filteredTree);

					if (treeTabCount < expectedCount) {
						console.log(`[get-viewer-data] TST tree not ready: ${treeTabCount}/${expectedCount} tabs`);
						return {
							ready: false,
							reason: 'tree-count-mismatch',
							treeTabCount,
							expectedCount,
							error: `TST tree not ready (${treeTabCount}/${expectedCount})`
						};
					}
					// 件数が一致してもタイトル補完が間に合わない場合があるため、描画可能性を別途確認する。
					const unresolvedNode = TmBackground.Helpers.findUnresolvedTitleNode(filteredTree);
					if (unresolvedNode) {
						return {
							ready: false,
							reason: 'title-unresolved',
							nodeId: String(unresolvedNode.id),
							error: `TST tree item ${unresolvedNode.id} has no title`
						};
					}
					return { ready: true, tree: outputData };
				}

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
				// 取得・補完した同じツリーを、要求された出力先だけ切り替えて利用する。
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
						// ビューアの重複起動を避け、既に開いている場合はそのタブを再利用する。
						if (tabs.length > 0) {
							await browser.tabs.update(tabs[0].id, { active: true });
						} else {
							await browser.tabs.create({ url: '/viewer/viewer.html' });
						}
						break;
					}
				}
				return { success: true };
			} catch (err) {
				console.error('データリクエスト処理でエラー:', err);
				if (message.type === 'get-viewer-data') {
					return { ready: false, error: err.message };
				}
				return { success: false, error: err.message };
			}
		},

		/**
		 * ソート前に必要なツリーを展開する処理
		 * データ取得を伴わないアクション（タブのフォーカス、削除、ソート）を処理します。
		 * @param {object} message - viewer.jsからのメッセージオブジェクト。
		 * @param {object} sender - メッセージの送信元情報。
		 * @returns {Promise<object>} 処理結果。
		 */
		handleActionRequest: async function (message, sender) {
			try {
				if (message.type === 'focus-tst-tab') {
					await TmBackground.Helpers.focusTab(message.tabId);
				} else if (message.type === 'delete-tab') {
					await browser.tabs.remove(message.tabId);
				} else if (message.type === 'sort-tabs') {
					const { parentTabId, sortedTabIds, ancestorIds } = message;
					const viewerTabId                                = sender.tab?.id; // 送信元のタブIDを取得

					console.log(`ソート開始: parent=${parentTabId || 'root'}, ids=`, sortedTabIds);

					if (!sortedTabIds || sortedTabIds.length <= 1) {
						// 0件・1件では相対順が変わらないため、TSTへの不要な要求を省く。
						return { success: true };
					}

					// 進捗通知用のヘルパー関数
					const sendSortProgress = (loaded, total) => {
						if (viewerTabId) {
							browser.tabs.sendMessage(viewerTabId, {
								type: 'update-sort-progress',
								loaded,
								total
							}).catch(() => {}); // エラーは無視
						}
					};

					// 最初に0%の状態を通知
					sendSortProgress(0, sortedTabIds.length);

					// ソート処理の前に、必要なツリーをすべて展開する
					if (ancestorIds && ancestorIds.length > 0) {
						console.log('ツリーを展開します:', ancestorIds);
						for (const id of ancestorIds) {
							try {
								await browser.runtime.sendMessage(TmBackground.Const.TST_ID, {
									type: 'expand-tree',
									tab: id
								});
								await TmBackground.Helpers.sleep(200); // 展開処理のための待機
							} catch (e) {
								console.warn(`タブID ${id} の展開に失敗しました:`, e.message);
							}
						}
						console.log('ツリーの展開が完了しました。ソート処理を開始します。');
						await TmBackground.Helpers.sleep(500); // 全体的な安定化のための追加待機
					}

					// 後方のタブを固定した基準点として move-before するため、末尾から先頭へ処理する。
					// 先頭から動かすと、移動済みタブの位置が後続処理で再びずれてしまう。
					for (let i = sortedTabIds.length - 2; i >= 0; i--) {
						const tabToMove      = sortedTabIds[i];
						const referenceTabId = sortedTabIds[i + 1];

						try {
							console.log(`[move-before] タブID ${tabToMove} を タブID ${referenceTabId} の直前へ移動`);
							await browser.runtime.sendMessage(TmBackground.Const.TST_ID, {
								type: 'move-before',
								tab: tabToMove,
								referenceTabId: referenceTabId,
								followChildren: true
							});
							await TmBackground.Helpers.sleep(150);

							// 1件処理するごとに進捗を通知
							const loadedCount = sortedTabIds.length - 1 - i;
							sendSortProgress(loadedCount, sortedTabIds.length);

						} catch (tstError) {
							console.warn(`タブID ${tabToMove} の移動に失敗しました。`, tstError.message);
						}
					}

					// 最後に100%の状態を通知
					sendSortProgress(sortedTabIds.length, sortedTabIds.length);

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

			// 同時復元は進捗状態と旧ID・新ID対応表を競合させるため、開始前に排他する。
			if (TmBackground.State.restoreState.inProgress) {
				return { success: false, error: '別の復元処理が実行中です。' };
			}
			// 親を必ず子より先に作成し、作成済みの新しい親IDを openerTabId に指定できる順序にする。
			// 同じ深さでは元のindex順を維持し、復元後の並び替えに必要な安定した順序を得る。
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
			// 作成順は階層優先だが、最終的なタブバー上の順序は保存時のindexに戻す。
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
						// ビューアが途中で閉じられても復元本体は継続できるため、通知失敗は処理を止めない。
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
							// 他の拡張機能が復元不能なURLをプレースホルダへ退避している場合、
							// プレースホルダそのものではなく、埋め込まれた元URLとタイトルを復元対象にする。
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

							// 保存時の親IDを、先に作成済みのFirefoxタブIDへ置き換えて親子関係を再構築する。
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
								// 既定コンテナは明示指定せず、Firefoxの通常タブ作成と同じ扱いにする。
								delete createProperties.cookieStoreId;
							}

							// 新規タブ系URLはURL省略でFirefoxに生成させる。その他のabout: URLは
							// 拡張機能から直接開けないため、元URLを示す安全なプレースホルダへ置き換える。
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
								// 破棄状態のタブはページを読み込まないため、保存済みタイトルを明示して表示を保つ。
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
					// 子孫側から処理し、親の開閉操作が未処理の子ツリーへ影響する時間を最小化する。
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

			// メッセージ応答は開始受付時点で返し、長時間の復元はバックグラウンドで継続する。
			// 実際の進捗・完了は上のプッシュ通知でビューアへ伝える。
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
			 * 子孫を深さ優先で走査し、階層に関係なくIDから参照できるよう登録する。
			 * @param {object} node - Mapへ登録する現在のノード。
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
		 * TSTツリー内のタブノード数を再帰的に数える
		 * @param {Array<object>} nodes - TSTツリーのノード配列
		 * @returns {number}
		 */
		countTreeTabs: function (nodes) {
			let count = 0;
			for (const node of nodes) {
				count++;
				if (node.children && node.children.length > 0) {
					count += this.countTreeTabs(node.children);
				}
			}
			return count;
		},

		/**
		 * TSTツリーへFirefoxのtabs APIから取得した詳細情報をタブIDで補完します。
		 * TST 4.4.6以降にTST側の特別権限なしで取得したツリーでは、タイトルやURLが
		 * 含まれないため、TST固有の親子関係・状態を維持したまま補います。
		 * @param {Array<object>} nodes - TSTから取得したツリーのノード配列。
		 * @param {Array<browser.tabs.Tab>} browserTabs - Firefoxから取得した同一ウィンドウのタブ一覧。
		 * @returns {Array<object>} 詳細情報を補完した新しいツリーのノード配列。
		 */
		enrichTreeWithBrowserTabs: function (nodes, browserTabs) {
			// TSTの応答ではtab IDが文字列になる場合があるため、Firefox API側と同じ
			// 形式へ正規化して照合する。Mapの数値キーと文字列キーは一致しない。
			const tabsById   = new Map(browserTabs.map(tab => [String(tab.id), tab]));
			const enrichNode = (tstNode) => {
				const browserTab   = tabsById.get(String(tstNode.id));
				const enrichedNode = {
					...tstNode
				};

				if (browserTab) {
					enrichedNode.index         = browserTab.index;
					enrichedNode.url           = browserTab.url || browserTab.pendingUrl || tstNode.url;
					enrichedNode.title         = browserTab.title || tstNode.title;
					enrichedNode.favIconUrl    = browserTab.favIconUrl || tstNode.favIconUrl;
					enrichedNode.pinned        = browserTab.pinned;
					enrichedNode.discarded     = browserTab.discarded;
					enrichedNode.hidden        = browserTab.hidden;
					enrichedNode.cookieStoreId = browserTab.cookieStoreId;
					enrichedNode.active        = browserTab.active;
				}

				if (tstNode.children) {
					enrichedNode.children = tstNode.children.map(child => enrichNode(child));
				}
				return enrichedNode;
			};
			return nodes.map(rootNode => enrichNode(rootNode));
		},

		/**
		 * 表示できるタイトルをまだ持たないツリーノードを深さ優先で返します。
		 * @param {Array<object>} nodes - 検査対象のツリーノード配列。
		 * @returns {object|null} 未解決のノード。すべて解決済みの場合はnull。
		 */
		findUnresolvedTitleNode: function (nodes) {
			for (const node of nodes) {
				// Firefoxは破棄済みタブのタイトルにURLそのものを返す場合がある。
				// URLと同一であっても有効なタイトル値であり、未取得として扱わない。
				if (!node.title) {
					return node;
				}
				const unresolvedChild = node.children && this.findUnresolvedTitleNode(node.children);
				if (unresolvedChild) {
					return unresolvedChild;
				}
			}
			return null;
		},

		/**
		 * ツリー構造を再帰的にフィルタリングします。
		 * @param {Array} nodes - タブのノード配列
		 * @param {Function} predicate - trueを返したノードを維持する関数
		 * @returns {Array} - フィルタリングされた新しいノード配列
		 */
		filterTree: function (nodes, predicate) {
			const result = [];
			for (const node of nodes) {
				// 親を除外した場合はその部分木も除外する。親のない子をルートへ昇格させず、
				// エクスポート元のツリー構造を変えないことを優先する。
				if (predicate(node)) {
					const newNode = { ...node }; // 元のオブジェクトを変更しないようにコピーを作成
					if (node.children) {
						newNode.children = this.filterTree(node.children, predicate);
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
			// 拡張子に合わせたMIMEタイプを付け、ブラウザの保存ダイアログへBlob URLを渡す。
			const mimeType = filename.endsWith('.json') ? 'application/json;charset=utf-8' : 'text/tab-separated-values;charset=utf-8';
			const blob     = new Blob([data], { type: mimeType });
			const url      = URL.createObjectURL(blob);
			try {
				const downloadId = await browser.downloads.download({ url, filename, saveAs: true });
				// ダウンロード中はBlob URLが必要なため、完了または失敗が確定してから解放する。
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
				// 別ウィンドウのタブでも確実に見えるよう、ウィンドウを前面化してからタブを選択する。
				await browser.windows.update(tabToFocus.windowId, { focused: true });
				await browser.tabs.update(tabToFocus.id, { active: true });
				// Firefox側の選択に加え、TST側にも対象行のフォーカスを明示して表示を同期する。
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
				// about:cache と about:cache?device=... のような重複候補では、
				// 最長のURL接頭辞を採用して、より具体的な内部アイコンを選ぶ。
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
					// hiddenも通常表示されていないタブなので、復元時はdiscarded相当として遅延読み込みする。
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
			// URLごとにTSV上の行番号を控え、同一URLが複数ある場合の参照先を備考へ出す。
			const urlMap = new Map();
			flatList.forEach((item, index) => {
				if (!item.tab.url) return;
				if (!urlMap.has(item.tab.url)) {
					urlMap.set(item.tab.url, []);
				}
				urlMap.get(item.tab.url).push(index + 1);
			});
			let maxDepth = 0;
			// 全行の列数を揃えるため、ツリー全体で最も深い階層を先に求める。
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
				// 親のパスに自分自身を足し、ルートから現在タブまでを階層列へ順番に展開する。
				const row          = [index + 1];
				const pathWithSelf = [...item.path, item.tab];

				let currentTabId    = '';
				let currentTabTitle = '';

				for (let i = 0; i < maxDepth; i++) {
					if (i < pathWithSelf.length) {
						const currentTab = pathWithSelf[i];

						currentTabId    = currentTab.id;
						currentTabTitle = (currentTab.title || '').trim() || titleUnsetStr;
						// 表計算ソフトがURL風タイトルをリンクや別形式へ自動変換しないよう、文字列扱いにする。
						currentTabTitle = currentTabTitle.startsWith('http') ? "'" + currentTabTitle : currentTabTitle;

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
				// URL列も表計算ソフトで加工されないよう、先頭にシングルクォートを付ける。
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
browser.runtime.onMessage.addListener((message, sender, _sendResponse) => { // sender を渡すよう修正
	// Manifest V3の非永続的な環境で非同期処理を正しく扱うため、
	// メッセージの種類に応じて、対応する非同期関数を呼び出し、その返り値(Promise)をreturnする。
	switch (message.type) {
		case 'get-viewer-data':
			return TmBackground.Handlers.handleDataRequest(message, sender);
		case 'export-json':
		case 'export-tsv':
		case 'open-viewer':
			return TmBackground.Handlers.handleDataRequest(message);
		case 'focus-tst-tab':
		case 'delete-tab':
			return TmBackground.Handlers.handleActionRequest(message);
		case 'sort-tabs':
			return TmBackground.Handlers.handleActionRequest(message, sender); // sender を渡すよう修正
		case 'restore-tabs': {
			const restoreData = message.data;
			// JSONとして読めても空配列や配列以外は復元処理へ渡さず、入口で形式エラーにする。
			if (!restoreData || !Array.isArray(restoreData) || restoreData.length === 0) {
				return Promise.resolve({ success: false, error: '復元データが空か、不正な形式です。' });
			}

			let windowsData;

			// タブ配列形式とウィンドウ配列形式を、先頭要素が持つタブ固有プロパティで判別する。
			// statesを先に調べることで、urlも持つ2.1.0以降形式を旧形式へ誤分類しない。
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

		// ポーリングは不要になったのでget-restore-progressは削除しても良いが、念のため残す
		case 'get-restore-progress':
			return Promise.resolve(TmBackground.State.restoreState);

		// 処理途中でビューア画面との疎通が切れてしまわないようpingで対策
		case 'ping':
			return Promise.resolve({ success: true, message: 'pong' });
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

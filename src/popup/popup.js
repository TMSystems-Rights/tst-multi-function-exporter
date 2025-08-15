// popup.js (シンプルなリモコン役)

/* global TmCommon */

const TmPopup = {

	/**
	 * DOM要素の参照を保持するオブジェクト
	 */
	Elements: {
		exportJsonBtn: null,
		exportTsvBtn: null,
		openViewerBtn: null,

		/**
		 * DOM要素の参照を初期化する
		 */
		init: function () {
			this.exportJsonBtn = document.getElementById('exportJsonBtn');
			this.exportTsvBtn  = document.getElementById('exportTsvBtn');
			this.openViewerBtn = document.getElementById('openViewerBtn');
		}
	},

	/**
	 * バックグラウンドへのアクションをまとめたオブジェクト
	 */
	Actions: {
		/**
		 * background.jsへメッセージを送信し、UIのフィードバックを行う。
		 * @param {'export-json' | 'export-tsv' | 'open-viewer'} type - 送信するメッセージのタイプ。
		 */
		sendMessageToBackground: async function (type) {
			const GetMsg    = TmCommon.Funcs.GetMsg;
			const buttonMap = {
				'export-json': TmPopup.Elements.exportJsonBtn,
				'export-tsv': TmPopup.Elements.exportTsvBtn,
				'open-viewer': TmPopup.Elements.openViewerBtn
			};
			const button    = buttonMap[type];
			if (!button) return;

			// ★★★ [修正] originalTextは、data-i18n属性から取得するのではなく、実行時のtextContentから取得する方が安全
			const originalText = button.textContent;
			button.textContent = GetMsg("statusRequesting");
			button.disabled    = true;

			try {
				const response = await browser.runtime.sendMessage({ type: type });
				if (response && response.success) {
					button.textContent = GetMsg("statusDone");
					setTimeout(() => window.close(), 500);
				} else {
					// 成功応答だが、エラー内容が返ってきた場合
					throw new Error((response && response.error) || GetMsg("errorUnknown"));
				}
			} catch (error) {
				console.error(`[${type}] の実行に失敗:`, error);
				const errorMessage = (error && error.message) ? error.message : GetMsg("errorUnknown");
				alert(GetMsg("errorGeneric", errorMessage));
				button.textContent = originalText;
				button.disabled    = false;
			}
		}
	},

	/**
	 * 初期化処理をまとめたオブジェクト
	 */
	Init: {
		/**
		 * ポップアップの初期化を実行するメイン関数
		 */
		run: function () {
			TmPopup.Elements.init();
			// ★★★ [修正] 独自のテキスト設定関数を廃止し、共通関数を呼び出す
			TmCommon.Funcs.SetDocumentLocale();
			this.setupEventListeners();
		},

		/**
		 * UI要素にイベントリスナーを設定する
		 */
		setupEventListeners: function () {
			const E = TmPopup.Elements;
			const A = TmPopup.Actions;

			E.exportJsonBtn.addEventListener('click', () => A.sendMessageToBackground('export-json'));
			E.exportTsvBtn.addEventListener('click', () => A.sendMessageToBackground('export-tsv'));
			E.openViewerBtn.addEventListener('click', () => A.sendMessageToBackground('open-viewer'));
		}
	}
};

// ページ読み込み完了時に初期化処理を実行
document.addEventListener('DOMContentLoaded', () => {
	TmPopup.Init.run();
});

// 意図しない変更を防ぐためにシールor凍結
Object.seal(TmPopup.Elements);
Object.freeze(TmPopup.Actions);
Object.freeze(TmPopup.Init);
Object.freeze(TmPopup);


/* global TmCommon */

const TmPlaceholder = {

	/**
	 * DOM要素の参照を保持するオブジェクト
	 */
	Elements: {
		title: null,
		urlLink: null,
		copyBtn: null,

		init: function () {
			this.title   = document.getElementById('title');
			this.urlLink = document.getElementById('url-link');
			this.copyBtn = document.getElementById('copy-btn');
		}
	},

	/**
	 * ページの状態を保持するオブジェクト
	 */
	State: {
		originalUrl: '',
		originalTitle: ''
	},

	/**
	 * イベントハンドラをまとめたオブジェクト
	 */
	Handlers: {
		/**
		 * 「URLをコピー」ボタンがクリックされたときの処理
		 */
		handleCopyClick: function () {
			const E = TmPlaceholder.Elements;
			const S = TmPlaceholder.State;

			navigator.clipboard.writeText(S.originalUrl).then(() => {
				const copiedMsg = TmCommon.Funcs.GetMsg('placeholderCopyButtonCopied');
				const copyMsg   = TmCommon.Funcs.GetMsg('placeholderCopyButton');

				E.copyBtn.textContent = copiedMsg;
				E.copyBtn.disabled    = true;
				setTimeout(() => {
					E.copyBtn.textContent = copyMsg;
					E.copyBtn.disabled    = false;
				}, 2000);
			}).catch(err => {
				console.error('クリップボードへのコピーに失敗しました:', err);
			});
		}
	},

	/**
	 * 初期化処理をまとめたオブジェクト
	 */
	Init: {
		/**
		 * ページの初期化を実行するメイン関数
		 */
		run: function () {
			// ★★★ [デバッグコード追加] ★★★
			try {
				const uiLang = browser.i18n.getUILanguage();
				console.log('Current UI Language:', uiLang);
				const testMsg = browser.i18n.getMessage('placeholderTitle');
				console.log('Message for "placeholderTitle":', testMsg);
			} catch (e) {
				console.error('i18n debug error:', e);
			}
			// ★★★ [デバッグコードここまで] ★★★

			TmPlaceholder.Elements.init();
			TmCommon.Funcs.SetDocumentLocale(); // ★★★ 国際化処理を呼び出し ★★★
			this.getUrlParams();
			this.updateUI();
			this.setupEventListeners();
		},

		/**
		 * URLのクエリパラメータから元のURLとタイトルを取得し、Stateに保存する
		 */
		getUrlParams: function () {
			const S = TmPlaceholder.State;
			try {
				const params    = new URLSearchParams(window.location.search);
				S.originalUrl   = decodeURIComponent(params.get('url') || '');
				S.originalTitle = decodeURIComponent(params.get('title') || 'タイトルなし');

			} catch (e) {
				console.error('URLパラメータの解析に失敗しました:', e);
				S.originalTitle = '情報の取得に失敗';
				S.originalUrl   = 'N/A';
			}
		},

		/**
		 * 取得した情報でUIを更新する
		 */
		updateUI: function () {
			const E = TmPlaceholder.Elements;
			const S = TmPlaceholder.State;

			// document.titleはSetDocumentLocaleが設定するので、ここでは動的タイトルのみ設定
			document.title       += `: ${S.originalTitle}`; // 「復元情報: 元のタイトル」のようにする
			E.title.textContent   = S.originalTitle;
			E.urlLink.textContent = S.originalUrl;
			E.urlLink.href        = S.originalUrl;
		},

		/**
		 * イベントリスナーを設定する
		 */
		setupEventListeners: function () {
			const E = TmPlaceholder.Elements;
			E.copyBtn.addEventListener('click', TmPlaceholder.Handlers.handleCopyClick);
		}
	}
};


document.addEventListener('DOMContentLoaded', () => {
	TmPlaceholder.Init.run();
});

// 意図しない変更を防ぐためにシールor凍結
Object.seal(TmPlaceholder.Elements);
Object.seal(TmPlaceholder.State);
Object.freeze(TmPlaceholder.Handlers);
Object.freeze(TmPlaceholder.Init);
Object.freeze(TmPlaceholder);
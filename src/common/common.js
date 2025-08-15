
const TmCommon = {

	// 共通定数を定義する場所
	Const: {
		TST_ID: 'treestyletab@piro.sakura.ne.jp' // Tree Style TabのアプリケーションID

	},

	// 共通変数を定義する場所
	Vars: {
	},

	// 共通関数を定義する場所
	Funcs: {
		/**
		 * 国際化メッセージを取得するショートカット関数
		 * @param {string} key - messages.jsonに定義されたキー
		 * @param {string|string[]} [substitutions] - メッセージ内のプレースホルダを置き換える文字列
		 * @returns {string}
		 */
		GetMsg: function (key, substitutions) {
			try {
				// substitutionsが未定義なら空配列、文字列なら配列化、配列ならそのまま使う
				const subs = !substitutions ? [] : (Array.isArray(substitutions) ? substitutions : [substitutions]);
				return browser.i18n.getMessage(key, subs);
			} catch (e) {
				console.error(`i18nキー "${key}" の取得に失敗しました。`, e);
				return key;
			}
		},

		/**
		 * HTMLドキュメント内の国際化テキストを動的に設定する
		 */
		SetDocumentLocale: function () {
			const getMsg = this.GetMsg; // this経由で同じオブジェクト内の関数を呼び出す

			// data-i18n属性を持つすべての要素にテキストを設定
			document.querySelectorAll('[data-i18n]').forEach(elem => {
				const key  = elem.getAttribute('data-i18n');
				const text = getMsg(key);

				// プレースホルダーとして機能させることも可能
				if (elem.hasAttribute('data-i18n-placeholder')) {
					elem.placeholder = text;
				} else if (elem.hasAttribute('value')) {
					elem.value = text;
				} else {
					elem.textContent = text;
				}
			});

			// ページタイトルを設定
			const titleElem = document.querySelector('title[data-i18n]');
			if (titleElem) {
				const key      = titleElem.getAttribute('data-i18n');
				document.title = getMsg(key);
			}
		},

		CutStringByLength: function (str, maxLen) {
			if (!str) {
				return '';
			}
			if (str.length > maxLen) {
				return str.substring(0, maxLen - 1) + '…';
			}
			return str; // substringは不要。元の文字列がmaxLen以下ならそのまま返す
		}


	}
};

/**
 * オブジェクトを再帰的に（深く）凍結する関数 (ESLint no-prototype-builtins 対応版)
 * @param {object} object 凍結したいオブジェクト
 * @returns {object} 凍結されたオブジェクト
 */
function DeepFreeze(object) {
	if (object === null || typeof object !== 'object' || Object.isFrozen(object)) {
		return object;
	}

	// for...in の代わりに、自身のプロパティのみを列挙する Object.keys を使うとより安全
	for (const key of Object.keys(object)) {
		// プロパティの値がオブジェクトなら再帰的に凍結
		DeepFreeze(object[key]);
	}

	return Object.freeze(object);
}

// Vars を「封印」する
// これでプロパティの追加・削除が禁止されますが、値の変更は許可されます。
Object.seal(TmCommon.Vars);

// 自作「DeepFreeze」関数をつかって、深い凍結を行う）
// この場合、下記記載のオブジェクト含め、配下（最下層までのすべて）を「凍結」する（プロパティの追加・削除・値の変更がすべて禁止）
DeepFreeze(TmCommon.Funcs);
DeepFreeze(TmCommon.Const);

// (推奨)TmCommonのトップレベル自体も保護する
// これにより、TmCommon.NewNamespace = {} のような意図しない名前空間の追加や、
// TmCommon.Vars = null のような上書きを防ぐことが可能。
// ここではfreezeを使い、トップレベルの構造を完全に固定する。
// （いまの構造なら上記でfreezeしてるので大丈夫なはずだけど、保険の意味とあくまでコードサンプルとして記述しておく）
Object.freeze(TmCommon);


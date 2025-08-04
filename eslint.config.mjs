import globals from 'globals';
import js from '@eslint/js';
// ★★★ JSDocプラグインをインポート ★★★
import jsdoc from 'eslint-plugin-jsdoc';
// ★★★ 変数代入の"="の位置を揃えることができる ★★★
import alignAssignments from 'eslint-plugin-align-assignments';

export default [
	// =========================================================================
	// ブロック1: 一般的なJavaScriptファイル (.js) のための設定
	// =========================================================================
	{
		// .js ファイルに適用
		files: ['**/*.js'],

		// ★★★ 2. JSDocプラグインを登録 ★★★
		plugins: {
			jsdoc: jsdoc, // ★★★ JSDocプラグインを登録 ★★★
			'align-assignments': alignAssignments // 位置調整（'=' 担当のみ）
		},

		languageOptions: {
			ecmaVersion: 2020,
			globals: {
				// ブラウザとjQueryの標準グローバル変数を読み込む
				...globals.browser,
				...globals.jquery,
				...globals.webextensions, // WebExtension用のグローバル定義

				// 独自に追加するグローバル変数を定義
				downloadTSV: 'readonly'
			}
		},

		rules: {
			// ここには、共通ライブラリに適用したい基本的なルールのみを記述
			...js.configs.recommended.rules,

			// var禁止
			'no-var': 'error',
			// use strict を記述すること（※モジュールとして既定で一律strictモードなので、敢えて書く必要ないよね？という警告）
			strict: 'warn',
			// 厳密比較演算子を強制
			eqeqeq: ['error', 'always'],
			// ドットはプロパティと同じ行に置く（改行の先頭に置く）
			'dot-location': ['error', 'property'],
			// 配列、オブジェクト、変数宣言においてカンマは末尾でも先頭でもOK
			// 'comma-style': [2, 'last'], // 配列、オブジェクト、変数宣言においてカンマは末尾に付けること
			'comma-style': 'off',
			// コメント開始「//」「/*」と文章の間に半角スペース必須
			'spaced-comment': ['error', 'always'],
			// evalは使用禁止
			'no-eval': 'error',
			// 暗黙のeval()は禁止
			'no-implied-eval': 'error',
			// label文は使用禁止
			'no-labels': 'error',
			// プリミティブ型のラッパークラス（String, Number, Boolean）をnewしてはいけない。（newせずに使用はOK。例：let text = String("abc");）
			'no-new-wrappers': 'error',
			// 浮動小数点数のゼロ省略は禁止
			'no-floating-decimal': 'error',
			// 関数宣言を上書きしない
			'no-func-assign': 'error',
			// カンマは先頭でも末尾でもどちらでもOK
			// 'comma-dangle': ['error', 'never'], // 余計な末尾のカンマ禁止
			'comma-dangle': 'off',
			// __dirnameと__filenameを使用する場合、+演算子で文字列結合禁止（+演算子ではなく、代わりにpath.join()を使用すること）
			'no-path-concat': 'error',
			// __proto__を使用しない。（代わりにgetPrototypeOfを使用すること）
			'no-proto': 'error',
			// JSDocの記述必須
			// ※ただし、function definition（一般的なfunction Hoge(){}スタイル）に対しては有効に機能するが、
			// method definition（WPのコーディングルールで採用している関数定義スタイル）に対しては効かない模様。
			// なので一応定義はしておくが、効果はない。

			// 'require-jsdoc' から 'jsdoc/require-jsdoc' に変更
			'jsdoc/require-jsdoc': 'error',

			// セミコロン関連のルール
			// ASI利用に関するセミコロン記述に関する方針：セミコロンを常に書くスタイル
			// 参考：https://qiita.com/mysticatea/items/9da94240f29ea516ae87
			semi: ['error', 'always'], // ステートメントの末尾にセミコロンを書くか書かないかを一貫させるルール
			'semi-spacing': ['error', { after: true, before: false }], // セミコロン前後の空白を一貫させるルール
			'semi-style': ['error', 'last'], // セミコロンを行末に書くか、次の文 (Statement) の行頭に書くかを一貫させるルール
			'no-extra-semi': 'error', // 余分なセミコロンを禁止するルール。余分なセミコロンには、空文 (EmptyStatement) と空クラスメンバ (Empty ClassElement) がある。
			'no-unexpected-multiline': 'error', // 意図に反して2つの文が接続された箇所を警告するルール。セミコロンを書かないスタイルでの ASI による落とし穴を警告できる。
			'no-unreachable': 'error', // 到達できない文を警告するルールです。セミコロンを常に書くスタイルでの ASI による落とし穴を警告できる。
			// 不規則な空白に関するルール
			'no-irregular-whitespace': [
				'error',
				{
					skipStrings: true, // 文字列内の空白文字を許容
					skipComments: true, // コメント内の空白文字を許容
					skipRegExps: true, // 正規表現リテラルで任意の空白文字を許容（全角空白とかでエラーとさせない）
					skipTemplates: true // テンプレートでの空白文字を許容
				}
			],

			// ★★★ no-undef ルールにグローバル変数を教える ★★★
			'no-undef': ['error', { typeof: true }],

			// ============================================
			// ★★★ ここから変数代入演算子"="の桁揃えに関するルールを追加 ★★★
			// ============================================
			'align-assignments/align-assignments': 'error',

			// ============================================
			// ★★★ 基本的な整形ルール（prettierが担っていた部分をESLintで対応） ★★★
			// ============================================

			// --- インデントのルール ---
			// 'tab' を指定し、タブ文字でのインデントを強制します。
			// Switch文のcaseもインデントする設定です。
			'indent': ['error', 'tab', { 'SwitchCase': 1 }],

			// --- 波括弧のスタイル ---
			// 'stroustrup' スタイルは、if文などで波括弧を改行し、
			// elseやcatchは同じ行に続けるスタイルです。'1tbs' も人気です。※Javaルールなら'1tbs'一択
			'brace-style': ['error', '1tbs'],

			// --- その他の便利な整形ルール ---

			// オブジェクトの波括弧の前後にスペースを入れる
			'object-curly-spacing': ['error', 'always'],

			// 配列の角括弧の前後にスペースを入れない
			'array-bracket-spacing': ['error', 'never'],

			// 拡張機能「Align by RegEx」で配列をカンマ基準で位置揃えすると2つ以上のスペースが連続するので、
			// カンマの前のスペースを許可するために、このルールを無効化する
			'comma-spacing': 'off',

			// キーワード(if, forなど)の前後にスペースを入れる
			'keyword-spacing': ['error', { 'before': true, 'after': true }],

			// ブロックの前にスペースを入れる
			'space-before-blocks': 'error',

			// 関数の()の前にスペースを入れる（無名関数やアロー関数のみ）
			'space-before-function-paren': ['error', {
				'anonymous': 'always',
				'named': 'never',
				'asyncArrow': 'always'
			}],
		}
	}
];


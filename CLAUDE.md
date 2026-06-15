This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コミュニケーションルール

- **応答言語**: 常に日本語で回答する。技術用語（クラス名・コマンド等）はカタカナまたは英語のまま維持する。

## プロジェクト概要

Firefox 拡張機能「TST 多機能エクスポーター」（tst-multi-function-exporter）。[Tree Style Tab (TST)](https://github.com/piroor/treestyletab) のタブツリーを JSON / TSV でエクスポートし、ライブビューアで閲覧・操作・復元する。AMO 公開済み（拡張機能 ID: `{3414d66d-8a1a-4201-87c7-4741ee9a0556}`）。

- Manifest V3 / Vanilla JS（ビルドツール非使用）
- i18n 対応（ja / en、`src/_locales/`）
- 主要ドキュメント: `History.md`（リリース履歴）, `README.md`, `src/PRIVACY.md`

## ビルド・配布

```bash
npm run build:zip   # → dist/tst-multi-function-exporter-<version>.zip
```

`scripts/build-zip.py` が `src/` 配下のみを zip 化（`.gitkeep` / `.DS_Store` / `Thumbs.db` を除外）。AMO 提出前に `src/manifest.json` / `package.json` の `version` を必ずインクリメント（AMO は同一バージョン再提出不可）。

## 作業時の注意

- `viewer.js` の `innerHTML` 使用はツリー描画用。表示データはエスケープ処理済み。AMO ソースチェックで警告が出る場合は審査担当者向けに説明する
- UI 変更を加えたら `History.md` の整合性も確認すること

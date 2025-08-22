# TST多機能エクスポーター (TST Multi-Function Exporter)

**Tree Style Tab (TST) のための、便利なタブ管理コンソール。Firefoxブラウザ用拡張機能です。**
タブのツリー構造を、多彩な形式でエクスポートし、強力なライブビューアで閲覧・操作できます。
また、バージョン2.1.0以降では、JSONファイルを使用しタブを完全復元することができます。
新機能（バージョン2.2.0）では、ビューア画面に「ソート編集モード」を追加しました。同一階層内のタブをタイトル昇順でソートすることができます。

**An Convenient tab management console for Tree Style Tab (TST). For Firefox web browser.**
Export your tab tree in various formats, and browse/operate it with a powerful live viewer.
Also, from version 2.1.0 onwards, you can fully restore tabs using a JSON file.
A new feature (version 2.2.0) has been added to the viewer screen: "Sort Edit Mode." Tabs within the same hierarchy can be sorted in ascending order by title.

### ＝＝＝ ビューア画面（参照モード） ＝＝＝
<img width="1853" height="1199" alt="image" src="https://github.com/user-attachments/assets/8e3d5f38-6d70-4456-802e-19170e33dfb3" />

### ＝＝＝ ビューア画面（ソート編集モード） ＝＝＝
<img width="2223" height="1188" alt="image" src="https://github.com/user-attachments/assets/c9e2a879-8717-4fa5-a761-9a8d3e3809e5" />

### ＝＝＝ 出力イメージ ＝＝＝
<img width="500" height="700" alt="image" src="https://github.com/user-attachments/assets/6a096036-dbc3-42ab-9baa-8d229e81ec61" />

---

## 当拡張機能での「タブ」の定義
-   当拡張機能で取り扱うタブの種類
    - 通常のタブ
    - ピン止めタブ
    - コンテナタブ
    - Firefox標準機能で作成したグループタブ

※TST独自のグループ機能で作成したグループはCSS的な仮想タブであり、取り扱い対象外です。

---

## 主な機能 (Features)

この拡張機能は、Firefoxブラウザ用拡張機能です。<br>
[Tree Style Tab](https://addons.mozilla.org/firefox/addon/tree-style-tab/) を利用しているユーザーに、便利なタブ管理機能を提供します。

-   **多彩なエクスポート (Versatile Exports)**
    -   **JSON**: ツリー構造を維持したままバックアップし、当拡張機能のタブ復元機能や他のツールとの連携に最適な形式で保存します。
    -   **TSV**: Excelなどの表計算ソフトで開くための、フラットなタブ区切り形式で保存します。URLの重複チェック機能付き。
-   **JSONからタブを復元 (Restore From Json format file)** (v2.1.0以降)
    -   当拡張機能でエクスポートしたJSONファイルを使用して、ツリー開閉、アクティブ、フォーカスなどの状態まで完全復元します。<br>
        TreeStyleTab拡張をインストールしJSONファイルさえあれば、どのような環境でも復元可能なので下記のようなシーンなどで利用でき便利です。
        - Firefoxプロファイルを初期化したので、タブを一括復元したい。
        - 新しいPCへ移行したときにタブを一括復元したい。
        - Firefoxプロファイルを新規作成したので、特定のプロファイルのタブ状態で初期環境を作成したい。
          
-   **インタラクティブ・ライブビューア (Interactive Live Viewer)**
    -   現在のタブの状態を、開閉可能なツリー形式でリアルタイムに表示します。
    -   ビューアから直接、目的のタブに**ジャンプ**できます。
    -   ビューア上でタブを**削除**でき、TST本体の表示も即座に更新されます。
    -   各タブの**ファビコン**も完璧に再現します。
    -   従来の「参照モード」に加え「ソート編集モード」を追加しました。同一階層内のタブをタイトル昇順でソートすることができます。画面上部のラジオボタンで切り替えできます。
-   **多言語対応 (Localization)**
    -   日本語と英語のUIに完全対応しています。

## 使い方 (Usage)

1.  Firefoxのツールバーにある本拡張機能のアイコンをクリックします。
2.  ポップアップメニューが表示されます。
    -   **[JSONファイル保存]**: タブツリーを`json`ファイルとしてダウンロードします。
    -   **[TSVファイル保存]**: タブツリーを`tsv`ファイルとしてダウンロードします。
    -   **[ビューアで開く]**: 新しいタブで「TST ライブビューア」を開きます。

### ライブビューアの操作

-   **更新**: [更新]ボタンまたは`F5`キーで、最新のタブ状態を再読み込みします。
-   **タブにジャンプ**: タブのタイトルを**左クリック**すると、そのタブに移動します。
-   **タブを削除**: タブのタイトルを**右クリック**し、「このタブを削除」を選択すると、そのタブを閉じることができます。
-   **JSONから復元**: 復元したいJSONファイルを選択すると、操作しているウィンドウ上で復元処理が開始されます。<br>
    （参考値：動作環境により異なりますが、作者の環境では約1500タブを3分50秒で復元完了しています）
-   **モード切替ラジオボタン**：
    - 「参照モード」：従来の機能です。一覧参照できます。右クリックするとメニューが表示され、「このタブを削除」ボタンをクリックしタブ削除できます。
    - 「ソート編集モード」：新機能（バージョン2.2.0）です。右クリックするとメニューが表示され、「この階層をタイトル昇順でソート」ボタンをクリックし、タブをソートできます。従来からの「このタブを削除」ボタンも設置していますので、不要なタブはここから削除できます。

## インストール (Installation)

[製品ページ（こちらのリンクからアドオンをインストールできます）](https://addons.mozilla.org/ja/firefox/addon/tst-multi-function-exporter/)

## ライセンス (License)

このプロジェクトの主要なソースコードは、[MIT License](src/LICENSE) の下で公開されています。

The primary source code of this project is released under the [MIT License](src/LICENSE).

### サードパーティのコンポーネント (Third Party Components)

この拡張機能は、以下のサードパーティのソフトウェアおよびリソースを含んでいます。これらのコンポーネントは、それぞれのライセンスに従います。

This extension includes the following third-party software and resources. These components are subject to their respective licenses.

-   **Tree Style Tab由来のコンポーネント (Components from Tree Style Tab)**
    -   本ソフトウェアは、Piro氏によって開発された[Tree Style Tab](https://github.com/piroor/treestyletab/)のAPIを利用しています。
    -   `src/viewer/svg/` フォルダ内のSVGアイコンは、Tree Style Tabから派生したものです。
    -   **ライセンス (License):** [Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/)

## プライバシーポリシー (Privacy Policy)

[プライバシーポリシーはこちらをご覧ください。](src/PRIVACY.md)

[Please see our Privacy Policy here.](src/PRIVACY.md)

## 作者 (Author)

**TMSystems**

Copyright (c) 2025 TMSystems. All Rights Reserved.

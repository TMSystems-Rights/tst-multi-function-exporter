# このツールについて
## 機能：
Firefoxブラウザ上で、「Tree Style Tab - ツリー型タブ」で開いているタブの一覧を取得しファイルダウンロードします。

## 前提
- WebブラウザはFirefoxであること。（他のブラウザは未検証）
- 拡張機能「Tree Style Tab - ツリー型タブ」をインストールしていること。
  - 拡張機能 ID：treestyletab@piro.sakura.ne.jp


## 事前準備
1. about:configを開き、下記キーと値を作成（※あれば編集だが、多分作成してないはずなので新規作成)。<br>
 キー："extensions.treestyletab.api.allowedExtensions"<br>
 値　："tst-tab-exporter@tm-systems.jp"<br>
        *※値は後程作成するマニフェストファイル内のapplications.gecko.idの値に使用*<br>
       
2. Gitからこのリポジトリをクローンする。フォルダ・ファイル構造が下記になっていることを確認する。
```
ルートフォルダ（\030_ブラウザ拡張_01Firefox\010_タブ一覧取得ツール\）
　　└manifest.json
　　└background.js
　　└popup.html
　　└popup.js
```

## 起動方法
1. アドレスバーに ```about:debugging``` と入力しEnter。
2. 左ペインの「このFirefox」というリンクを押下。
3. 右ペインの[一時的な拡張機能]セクション「一時的なアドオンを読み込む...」ボタン押下。
4. エクスプローラが開くので、このツールのルートフォルダ展開し、 ```manifest.json``` を選択し「開く(O)」を押下。
5. [一時的な拡張機能]セクションに「TST Tab Exporter」という名前（このツールの拡張機能名です）が表示されます。
6. Firefoxツールバー右上に🧩パズルピースアイコンを押下。
   <img width="1058" height="128" alt="image" src="https://github.com/user-attachments/assets/36e5e021-1937-493a-ad37-fc2be78dfc5c" />
   
7. 🧩パズルピースアイコンを押下すると、スクショのとおり「TST Tab Exporter」が表示されるので押下。
   <img width="615" height="253" alt="image" src="https://github.com/user-attachments/assets/efee5836-8515-45da-8ca5-e89d79bf8d2e" /><br>

9. 「JSONでエクスポート」「TSVでエクスポート」「ビューアで開く」というボタンが表示されればツール起動成功です。
    <img width="379" height="276" alt="image" src="https://github.com/user-attachments/assets/6a7cff0e-b407-47b9-96e6-359c44ffa225" />

## 使い方

ここからは使い方を説明します。

1. **■「JSONでエクスポート」**

	- 「JSONでエクスポート」を押下すると、JSON形式で現在日時のタイムスタンプ付きのファイル名でダウンロードされます。
		- ファイル名の例：「forefox_tab_list_20250730_223834.json」

			<details>
			<summary>出力内容（クリックして展開）</summary>  
			
			```json
			[
			  {
			    "title": "新しいタブ",
			    "url": "about:home"
			  },
			  {
			    "title": "法人向け Surface (サーフェス) のノート PC とタブレットを比較",
			    "url": "https://www.microsoft.com/ja-jp/store/b/business?icid=MSCOM_QL_Business",
			    "children": [
			      {
			        "title": "ファンカデリック - Wikipedia",
			        "url": "https://ja.wikipedia.org/wiki/%E3%83%95%E3%82%A1%E3%83%B3%E3%82%AB%E3%83%87%E3%83%AA%E3%83%83%E3%82%AF",
			        "children": [
			          {
			            "title": "ジョージ・クリントン (ミュージシャン) - Wikipedia",
			            "url": "https://ja.wikipedia.org/wiki/%E3%82%B8%E3%83%A7%E3%83%BC%E3%82%B8%E3%83%BB%E3%82%AF%E3%83%AA%E3%83%B3%E3%83%88%E3%83%B3_(%E3%83%9F%E3%83%A5%E3%83%BC%E3%82%B8%E3%82%B7%E3%83%A3%E3%83%B3)",
			            "children": [
			              {
			                "title": "ジェームス・ブラウン - Wikipedia",
			                "url": "https://ja.wikipedia.org/wiki/%E3%82%B8%E3%82%A7%E3%83%BC%E3%83%A0%E3%82%B9%E3%83%BB%E3%83%96%E3%83%A9%E3%82%A6%E3%83%B3"
			              }
			            ]
			          }
			        ]
			      }
			    ]
			  },
			  {
			    "title": "Tree Style Tab/カスタムCSS - heguro",
			    "url": "https://scrapbox.io/heguro/Tree_Style_Tab%2F%E3%82%AB%E3%82%B9%E3%82%BF%E3%83%A0CSS"
			  },
			  {
			    "title": "ジョージ・クリントン (ミュージシャン) - Wikipedia",
			    "url": "https://ja.wikipedia.org/wiki/%E3%82%B8%E3%83%A7%E3%83%BC%E3%82%B8%E3%83%BB%E3%82%AF%E3%83%AA%E3%83%B3%E3%83%88%E3%83%B3_(%E3%83%9F%E3%83%A5%E3%83%BC%E3%82%B8%E3%82%B7%E3%83%A3%E3%83%B3)"
			  },
			  {
			    "title": "デバッガー - ランタイム / this-firefox",
			    "url": "about:debugging#/runtime/this-firefox"
			  }
			]
			```
			
			</details>
	 

2. **■「TSVでエクスポート」**
	- 「TSVでエクスポート」を押下すると、TSV(タブ区切り)形式で現在日時のタイムスタンプ付きのファイル名でダウンロードされます。
		- ファイル名の例：「forefox_tab_list_20250730_223834.json」
    
			<details>
			<summary>出力内容（クリックして展開）</summary>  
			
			```tsv
				階層1		階層2		階層3		階層4			
			#	ID	タイトル	ID	タイトル	ID	タイトル	ID	タイトル	URL	備考
			1	1	新しいタブ	-	-	-	-	-	-	'about:home	 
			2	2	法人向け Surface (サーフェス) のノート PC とタブレットを比較	-	-	-	-	-	-	'https://www.microsoft.com/ja-jp/store/b/business?icid=MSCOM_QL_Business	 
			3	2	法人向け Surface (サーフェス) のノート PC とタブレットを比較	3	ファンカデリック - Wikipedia	-	-	-	-	'https://ja.wikipedia.org/wiki/%E3%83%95%E3%82%A1%E3%83%B3%E3%82%AB%E3%83%87%E3%83%AA%E3%83%83%E3%82%AF	 
			4	2	法人向け Surface (サーフェス) のノート PC とタブレットを比較	3	ファンカデリック - Wikipedia	4	ジョージ・クリントン (ミュージシャン) - Wikipedia	-	-	'https://ja.wikipedia.org/wiki/%E3%82%B8%E3%83%A7%E3%83%BC%E3%82%B8%E3%83%BB%E3%82%AF%E3%83%AA%E3%83%B3%E3%83%88%E3%83%B3_(%E3%83%9F%E3%83%A5%E3%83%BC%E3%82%B8%E3%82%B7%E3%83%A3%E3%83%B3)	★重複あり★ [No: 4, 7]
			5	2	法人向け Surface (サーフェス) のノート PC とタブレットを比較	3	ファンカデリック - Wikipedia	4	ジョージ・クリントン (ミュージシャン) - Wikipedia	7	ジェームス・ブラウン - Wikipedia	'https://ja.wikipedia.org/wiki/%E3%82%B8%E3%82%A7%E3%83%BC%E3%83%A0%E3%82%B9%E3%83%BB%E3%83%96%E3%83%A9%E3%82%A6%E3%83%B3	 
			6	6	Tree Style Tab/カスタムCSS - heguro	-	-	-	-	-	-	'https://scrapbox.io/heguro/Tree_Style_Tab%2F%E3%82%AB%E3%82%B9%E3%82%BF%E3%83%A0CSS	 
			7	5	ジョージ・クリントン (ミュージシャン) - Wikipedia	-	-	-	-	-	-	'https://ja.wikipedia.org/wiki/%E3%82%B8%E3%83%A7%E3%83%BC%E3%82%B8%E3%83%BB%E3%82%AF%E3%83%AA%E3%83%B3%E3%83%88%E3%83%B3_(%E3%83%9F%E3%83%A5%E3%83%BC%E3%82%B8%E3%82%B7%E3%83%A3%E3%83%B3)	★重複あり★ [No: 4, 7]
			8	8	デバッガー - ランタイム / this-firefox	-	-	-	-	-	-	'about:debugging#/runtime/this-firefox	 
			```
			
			</details>


3. **■「ビューアで開く」**
	- 拡張機能のビューアページが開き、タブ一覧がツリー形式で表示されます。
	　<img width="1471" height="700" alt="image" src="https://github.com/user-attachments/assets/597c1412-4463-434c-84ee-3707068980b7" />

	- 初期表示時は、全てのツリーが閉じており、トップ階層だけが表示されます。
	- [F5]キーや[更新]ボタンを押下するとページリロードされ、タブ一覧が最新化されます。
  - [全て展開]ボタン押下すると、ツリーが全て展開されます。
  - [全て折りたたむ]ボタン押下すると、ツリーが全て折りたたまれトップ階層だけが表示されます。
  - タブのタイトルを押下すると、そのたタブにフォーカスが遷移しアクティブ表示されます。


## 今後の展開（TODOメモ）
✅ 【ビューア】画面デザインをもう少しちゃんとする。背景色、各ボタンの色、ツリーに仕切り線（罫線）入れるとか、etc...（CSS改修）<br>
✅ 【ビューア】展開ボタン「▼」「▶」が見づらいし押しづらいので何とかする。（これもCSSかな？）<br>
✅ 【ビューア】タブに[削除]ボタン付けて、押下すると該当タブを削除する機能もあるといいかも。<br>
✅ 【全体】フォルダ構成の整理・最適化（ルートにベッタリ置いてしまってるので、ちゃんとフォルダ分けする）<br>
- [ ] 【ビューア】TSVと同じように重複あり表示とかの機能入れたい。<br>
      仕様：‼️マークを入れる。ホバーすると重複タブの一覧を表示。<br>
      　　　１：階層１タブＡ - 階層２タブＡ - 階層３タブＡ（<--重複）<br>
      　　　２：階層１タブＡ - 階層２タブＢ（<--重複）<br>
      のように表示できたらいいな。
        
- [ ] 【全体】Firefox版が完成したら、ストア登録申請をする。<br>
      （※そうなった際は、GitHubに公開リポジトリを作成する）

（ここからは、当分先の話）
- [ ] 【全体】Chromeストア版、Edgeストア版も作りたい。（TSTがあればの話）
- [ ] 【全体】各種ブラウザ版が完成したら、正式に各ストア登録申請をする。<br>
      （※そうなった際は、GitHubに公開リポジトリをそれぞれ作成する）

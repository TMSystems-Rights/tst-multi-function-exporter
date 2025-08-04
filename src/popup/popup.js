// popup.js (シンプルなリモコン役)

/* global TmCommon */

// ページ読み込み時にUIのテキストを設定
document.addEventListener('DOMContentLoaded', () => {
	const getMsg                                         = TmCommon.Funcs.GetMsg;
	document.getElementById('exportJsonBtn').textContent = getMsg('popupJsonButton');
	document.getElementById('exportTsvBtn').textContent  = getMsg('popupTsvButton');
	document.getElementById('openViewerBtn').textContent = getMsg('popupViewerButton');
	document.title                                       = getMsg('extName');
});

/**
 * ===================================================
 * background.jsへメッセージ送信
 * ===================================================
 */
function sendMessageToBackground(type) {

	const GetMsg = TmCommon.Funcs.GetMsg;

	// event.targetが使えない場合もあるので、thisを使うか、引数で渡すのが安全
	const button = document.getElementById({
		'export-json': 'exportJsonBtn',
		'export-tsv': 'exportTsvBtn',
		'open-viewer': 'openViewerBtn'
	}[type]);

	if (!button) return;

	const originalText = button.textContent;
	button.textContent = GetMsg("statusRequesting");
	button.disabled    = true;

	browser.runtime.sendMessage({ type: type })
		.then(response => {
			if (response && response.success) {
				button.textContent = GetMsg("statusDone");
				setTimeout(() => window.close(), 500);
			} else {
				throw new Error((response && response.error) || GetMsg("errorUnknown"));
			}
		})
		.catch(error => {
			console.error(`[${type}] の実行に失敗:`, error);
			// ★★★ background.jsからの詳細なエラーメッセージを優先して表示 ★★★
			const errorMessage = (error && error.message) ? error.message : TmCommon.Funcs.GetMsg("errorUnknown");
			alert(TmCommon.Funcs.GetMsg("errorGeneric", errorMessage));

			button.textContent = originalText;
			button.disabled    = false;
		});
}

document.getElementById('exportJsonBtn').addEventListener('click', () => sendMessageToBackground('export-json'));
document.getElementById('exportTsvBtn').addEventListener('click', () => sendMessageToBackground('export-tsv'));
document.getElementById('openViewerBtn').addEventListener('click', () => sendMessageToBackground('open-viewer'));
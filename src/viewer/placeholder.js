document.addEventListener('DOMContentLoaded', () => {
	const params        = new URLSearchParams(window.location.search);
	const originalUrl   = decodeURIComponent(params.get('url'));
	const originalTitle = decodeURIComponent(params.get('title'));

	document.title                               = `情報: ${originalTitle}`;
	document.getElementById('title').textContent = originalTitle;

	const urlLink       = document.getElementById('url-link');
	urlLink.textContent = originalUrl;
	urlLink.href        = originalUrl; // about:ページはクリックしても開けないが、念のため

	const copyBtn = document.getElementById('copy-btn');
	copyBtn.addEventListener('click', () => {
		navigator.clipboard.writeText(originalUrl).then(() => {
			copyBtn.textContent = 'コピーしました！';
			setTimeout(() => {
				copyBtn.textContent = 'URLをコピー'; 
			}, 2000);
		});
	});
});
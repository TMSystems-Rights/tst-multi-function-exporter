<#
.SYNOPSIS
  FDE デバッグ用: zip をビルドし、Firefox プロファイルの extensions フォルダへ xpi として配置する。

.DESCRIPTION
  本スクリプトは debug-tools/ に置き、親ディレクトリを拡張プロジェクトのルートとして動作する。
  TST 多機能エクスポーター・TST タブカラーなど、同じ構成（src/manifest.json, package.json, dist/）の
  プロジェクト間で流用できる。

  前提:
    - 環境変数 FirefoxDebugTargetProfilePath に FDE 用プロファイルパスを設定済みであること
    - FDE / Firefox は完全終了していること（xpi がロックされていないこと）

.PARAMETER Version
  配置する zip のバージョン。省略時は src/manifest.json の version を使用する。
#>
param (
	[string]$Version
)

Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# xpi 配置先が書き込み可能か確認する
# ---------------------------------------------------------------------------
function Test-XpiDeployReady {
	param (
		[string]$ProfilePath,
		[string]$XpiPath
	)

	if (-not (Test-Path -LiteralPath $ProfilePath)) {
		Write-Error "プロファイルが見つかりません: $ProfilePath"
		return $false
	}

	# parent.lock は環境によって Firefox 終了後も 0 バイトで残るため判定に使わない。
	# xpi 本体（または extensions フォルダ）が排他ロック可能かで判定する。

	$extensionsDir = Split-Path -Parent $XpiPath
	if (-not (Test-Path -LiteralPath $extensionsDir)) {
		Write-Error "extensions フォルダが見つかりません: $extensionsDir"
		return $false
	}

	if (Test-Path -LiteralPath $XpiPath) {
		# 既存 xpi がある場合: 排他オープンできるか試す（Firefox 起動中はここで失敗する）
		try {
			$stream = [System.IO.File]::Open(
				$XpiPath,
				[System.IO.FileMode]::Open,
				[System.IO.FileAccess]::ReadWrite,
				[System.IO.FileShare]::None
			)
			$stream.Close()
			$stream.Dispose()
		}
		catch {
			Write-Error @"
xpi を上書きできません（ファイルがロックされています）。
FDE / Firefox を完全終了してから再実行してください。
xpi: $XpiPath
"@
			return $false
		}
	}
	else {
		# xpi が未配置の場合: extensions フォルダへの書き込み可否を probe ファイルで確認
		try {
			$probePath = Join-Path $extensionsDir (".write-probe-{0}" -f [guid]::NewGuid())
			$probe = [System.IO.File]::Create($probePath)
			$probe.Close()
			$probe.Dispose()
			Remove-Item -LiteralPath $probePath -Force
		}
		catch {
			Write-Error @"
extensions フォルダに書き込めません。
FDE / Firefox を完全終了してから再実行してください。
フォルダ: $extensionsDir
"@
			return $false
		}
	}

	return $true
}

# ---------------------------------------------------------------------------
# manifest.json から Firefox 拡張 ID（gecko.id）を取得する
# sideload 時の xpi ファイル名 {id}.xpi に使用する
# ---------------------------------------------------------------------------
function Get-ExtensionIdFromManifest {
	param (
		[string]$ManifestPath
	)

	if (-not (Test-Path -LiteralPath $ManifestPath)) {
		Write-Error "manifest.json が見つかりません: $ManifestPath"
		return $null
	}

	$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
	$extensionId = $manifest.browser_specific_settings.gecko.id

	if ([string]::IsNullOrWhiteSpace($extensionId)) {
		Write-Error "browser_specific_settings.gecko.id が manifest.json にありません: $ManifestPath"
		return $null
	}

	return $extensionId
}

# ---------------------------------------------------------------------------
# package.json から npm パッケージ名を取得する
# build-zip.py の出力 zip 名（<name>-<version>.zip）の解決に使用する
# ---------------------------------------------------------------------------
function Get-PackageNameFromPackageJson {
	param (
		[string]$PackageJsonPath
	)

	if (-not (Test-Path -LiteralPath $PackageJsonPath)) {
		Write-Error "package.json が見つかりません: $PackageJsonPath"
		return $null
	}

	$package = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json
	$packageName = $package.name

	if ([string]::IsNullOrWhiteSpace($packageName)) {
		Write-Error "name が package.json にありません: $PackageJsonPath"
		return $null
	}

	return $packageName
}

# ---------------------------------------------------------------------------
# メイン処理
# ---------------------------------------------------------------------------

# debug-tools/ の親ディレクトリをプロジェクトルートとする（他プロジェクトへコピーしても動作する）
$RootDir = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $RootDir "src\manifest.json"
$PackageJsonPath = Join-Path $RootDir "package.json"
$DistDir = Join-Path $RootDir "dist"
$ProfilePath = $env:FirefoxDebugTargetProfilePath

if ([string]::IsNullOrWhiteSpace($ProfilePath)) {
	Write-Error "環境変数 FirefoxDebugTargetProfilePath が未設定です。"
	Exit 1
}

# manifest から拡張 ID を取得し、配置先 xpi パスを決定
$ExtensionId = Get-ExtensionIdFromManifest -ManifestPath $ManifestPath
if ($null -eq $ExtensionId) {
	Exit 1
}
$XpiPath = Join-Path $ProfilePath "extensions\${ExtensionId}.xpi"

# build-zip.py と同じ zip 名規則を使うため package.json からパッケージ名を取得
$PackageName = Get-PackageNameFromPackageJson -PackageJsonPath $PackageJsonPath
if ($null -eq $PackageName) {
	Exit 1
}

# ビルド前: xpi が上書き可能な状態か確認
Write-Host "xpi 配置先の状態を確認しています..."
if (-not (Test-XpiDeployReady -ProfilePath $ProfilePath -XpiPath $XpiPath)) {
	Exit 1
}
Write-Host "OK: xpi を配置可能な状態です。"

Push-Location $RootDir
try {
	# dist/<package-name>-<version>.zip を生成
	npm run build:zip
	if ($LASTEXITCODE -ne 0) {
		Write-Error "build:zip に失敗しました。"
		Exit $LASTEXITCODE
	}

	# -Version 未指定時は manifest.json からバージョンを取得
	if ([string]::IsNullOrWhiteSpace($Version)) {
		Write-Host "バージョンが指定されていないため、src\manifest.json から取得します。"
		$Version = (Get-Content $ManifestPath -Raw | ConvertFrom-Json).version
	}

	if ([string]::IsNullOrWhiteSpace($Version)) {
		Write-Error "バージョンが取得できませんでした。"
		Exit 1
	}

	$ZipPath = Join-Path $DistDir "${PackageName}-${Version}.zip"

	if (-not (Test-Path -LiteralPath $ZipPath)) {
		Write-Error "zip が見つかりません: $ZipPath"
		Exit 1
	}

	# ビルド中に Firefox が起動された場合に備え、配置直前にも再確認する
	if (-not (Test-XpiDeployReady -ProfilePath $ProfilePath -XpiPath $XpiPath)) {
		Exit 1
	}

	Write-Host "バージョン '${Version}' の xpi を配置します。"
	Copy-Item -LiteralPath $ZipPath -Destination $XpiPath -Force
	Write-Host "OK: $XpiPath"
}
finally {
	Pop-Location
}

Write-Host "FDE を再起動して拡張を読み込み直してください。"

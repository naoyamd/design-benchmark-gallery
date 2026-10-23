# Design Benchmark Gallery

GitHub Pagesで配信する、共有パスワード付きの設計ベンチマークギャラリーです。アカウント登録は不要で、URLと共通パスワードを知っている人がブラウザで閲覧できます。

## 閲覧

[ギャラリーを開く](https://intake.nightly.dedyn.io/)

入口で共有パスワードを入力すると、比較用のリンク集が開きます。解除状態はそのブラウザで12時間記憶します。共有PCではリンク集の「ロック」で解除状態を削除してください。最新のChromeまたはEdgeの通常ウィンドウを推奨します。JavaScript、Service Worker、IndexedDB、Web Crypto、DecompressionStreamが必要です。

## 配信・保護の仕組み

GitHub Pagesにはサーバー側BASIC認証がないため、サイト一式をAES-256-GCMで暗号化して配信し、入力されたパスワードからPBKDF2-SHA-256（600,000回）で導出した鍵でブラウザ内で解除します。publicリポジトリとPagesに保存するのは、解除用プログラムと暗号化済みの `public/content.bin` です。元のHTML・JavaScript・モデル・PDFは平文で保存しません。

ブラウザには非抽出可能な復号鍵と12時間の期限をIndexedDBに保存します。期限は次の読み込み時に適用し、既に表示された内容は消去しません。平文パスワードは保存しません。これは共通パスワードによる簡易保護です。同じGitHub Pagesオリジンのコードは信頼されている前提です。パスワードを知る閲覧者はデータを保存・再配布できます。機密情報や社員ごとのアクセス管理には使用しないでください。

VPS、外部の認証サーバー、有料サービスは使用しません。`main` へのpushをGitHub Actionsが検証し、`public/` をGitHub Pagesへ配備します。Actionsにパスワードは渡しません。

## サイトの追加・更新

元サイトはこのpublicリポジトリの外のローカルフォルダで管理します。構成は次のとおりです。

既存パッケージから元サイトを取り出す場合は、同じパスワードを標準入力で渡して `node scripts/unpack.mjs /absolute/path/to/new-private-content` を実行します。出力先は未作成のフォルダを指定し、このpublicリポジトリの外に置いてください。

```text
private-content/
  index.html             # 解除後のリンク集
  gallery.css
  gallery.js
  sites.json             # 一覧データ
  sites/<ID>/            # 各サイト一式。相対パスで参照
```

1. `sites/<ID>/` に新しいサイトを入れます。IDは英数字・ハイフン・アンダースコアにしてください。
2. `sites.json` に `id`, `model`, `status`, `title`, `description`, `href`, `image`, `imageAlt` を追加します。`href` は `sites/<ID>/` 形式で、末尾の `/` が必要です。
3. パスワードを標準入力から渡して暗号化します。パスワードを引数・ファイル・ログ・Gitへ保存しないでください。

```sh
node scripts/pack.mjs --source /absolute/path/to/private-content
```

4. `node --test tests/*.test.mjs` を実行してブラウザ表示を確認し、生成した `public/content.bin` とプログラムの変更だけをcommit/pushします。

パッケージの更新後は、閲覧者にパスワードの再入力が必要です。パスワード変更時も同じ手順で再パッケージしてください。既に取得された古い暗号化パッケージは、古いパスワードで解除可能です。

ローカル表示は `python -m http.server 8000 --directory public` で確認できます。独自ドメイン `intake.nightly.dedyn.io` をGitHub Pagesに設定し、DNSのCNAMEは `naoyamd.github.io` を参照します。404ページではドメイン直下の入口へ戻り、解除後に元のページへ移動します。GitHub Actionsで配備するため、CNAMEファイルは使用しません。

## 元データ・ライセンス

RLG-003 r02の6輪引込主脚ビューワーは、[`naoyamd/freecad-benchmark-viewer`](https://github.com/naoyamd/freecad-benchmark-viewer/tree/main/sites/RLG-003_Astra_Luna_r02) の独立サイトを `sites/RLG-003_Astra_Luna_r02/` に取り込んでいます。ギャラリーから670部品・11姿勢・通常格納17姿勢間の連続表示補間、オレオ上下動と記録ストローク再生、断面・分解、計算・図面・失敗例を閲覧できます。格納・上下動はCAD姿勢の表示補間で、接地・荷重の連続シミュレーションではありません。設計のNG・保留は画面に明示し、採点・実機適合を示すものとして扱いません。認証後のURLは <https://intake.nightly.dedyn.io/sites/RLG-003_Astra_Luna_r02/> です。

FLG-002_r01の提供ファイル36点を改変せず暗号化パッケージに収録しています。three.jsのMITライセンスと元READMEも同梱しています。設計はベンチマーク評価用のAI生成予備設計であり、飛行・製造用途には使用できません。採点・ゲート判定は独立検証待ちです。

参考: [GitHub Pagesのアクセス制御](https://docs.github.com/en/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)、[Web Cryptoによる復号](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt)

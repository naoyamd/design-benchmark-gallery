# INTAKE Camp 2026

GitHub Pagesで配信する、共有パスワード付きのBootcamp成果発表ページです。認証後にイベント説明と6人分のテーマ概要・発表PDFへのリンクが並び、CADビューワーは成果の1つとして下位ページから開きます。ホームのUIは英語のみです。

## 閲覧

[成果発表ページを開く](https://intake.nightly.dedyn.io/)

入口で共有パスワードを入力すると、イベント説明と6テーマの成果一覧が開きます。解除状態はそのブラウザで12時間記憶します。共有PCではリンク集の「ロック」で解除状態を削除してください。最新のChromeまたはEdgeの通常ウィンドウを推奨します。JavaScript、Service Worker、IndexedDB、Web Crypto、DecompressionStreamが必要です。

## 配信・保護の仕組み

GitHub Pagesにはサーバー側BASIC認証がないため、サイト一式をAES-256-GCMで暗号化して配信し、入力されたパスワードからPBKDF2-SHA-256（600,000回）で導出した鍵でブラウザ内で解除します。publicリポジトリとPagesに保存するのは、解除用プログラムと暗号化済みの `public/content.bin` です。元のHTML・JavaScript・モデル・PDFは平文で保存しません。

ブラウザには非抽出可能な復号鍵と12時間の期限をIndexedDBに保存します。期限は次の読み込み時に適用し、既に表示された内容は消去しません。平文パスワードは保存しません。これは共通パスワードによる簡易保護です。同じGitHub Pagesオリジンのコードは信頼されている前提です。パスワードを知る閲覧者はデータを保存・再配布できます。機密情報や社員ごとのアクセス管理には使用しないでください。

VPS、外部の認証サーバー、有料サービスは使用しません。`main` へのpushをGitHub Actionsが検証し、`public/` をGitHub Pagesへ配備します。Actionsにパスワードは渡しません。

## サイトの追加・更新

元サイトはこのpublicリポジトリの外のローカルフォルダで管理します。構成は次のとおりです。

既存パッケージから元サイトを取り出す場合は、同じパスワードを標準入力で渡して `node scripts/unpack.mjs /absolute/path/to/new-private-content` を実行します。出力先は未作成のフォルダを指定し、このpublicリポジトリの外に置いてください。

```text
private-content/
  index.html             # 認証後のイベント成果ページ
  gallery.css
  gallery.js
  gallery-core.mjs        # 6テーマと内部リンクの検証
  projects.json          # 表示名・テーマ概要・PDF・下位ページ
  cad/                   # CAD成果の一覧ページ
  sites.json             # 既存CADビューワーの一覧データ
  sites/<ID>/            # 既存ビューワー一式
  presentations/         # 今後追加する参加者のPDF（任意）
```

1. 発表PDFを非公開の元フォルダへ置き、`projects.json` の対象テーマの `presenter`, `title`, `summary`, `pdf.href`, `pdf.pages`, `pdf.bytes` を更新します。`id` は重複不可、成果は6件、PDFと下位ページはサイト内の相対パスにします。実資料へ差し替えたテーマは `sample: false` にします。
2. CAD成果へのリンクは `viewerHref: "cad/"`、PDFのみのテーマは `viewerHref: null`。既存CADの追加時だけ `sites/<ID>/` と `sites.json` を更新します。
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

現在はユーザー指定により、6テーマすべてが同じ発表PDFを参照する仮の構成です。1件目のINTAKE CADからのみ `cad/` へ進み、2つの既存CADビューワーを開けます。残り5テーマはSample presentationと明示し、氏名・テーマ・PDFを後から差し替えます。PDF実体は1つを共有し、複製していません。PDFには共有パスワードが含まれるため、原本は暗号化パッケージ内だけに入れ、公開GitHubへ平文で置きません。

イベントホームとCAD一覧のPDF保存は、認証済みのfetchでPDF応答を確認し、一時Blobを経由して保存します。通常のdownloadリンクがService Workerを通らないブラウザーでも、暗号化配信を保って保存できます。認証に失敗したHTMLをPDFとして保存しないことも検査します。

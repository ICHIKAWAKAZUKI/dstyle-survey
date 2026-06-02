# DSHグループ アンケートシステム 構築・運用マニュアル

> ガイド｜2026年6月　ディライトテクノロジーズ事業部

---

## 目次

1. [システム全体構成図](#1-システム全体構成図)
2. [使用するサービスと役割](#2-使用するサービスと役割)
3. [GitHubに初めて接続する](#3-githubに初めて接続する別の人がつなぐ手順)
4. [新規アンケートを追加する手順](#4-新規アンケートを追加する手順)
5. [GitHubの基本操作](#5-githubの基本操作)
6. [環境変数の追加・管理](#6-環境変数の追加管理)
7. [トラブルシューティング](#7-トラブルシューティング)
8. [セキュリティ注意事項](#8-セキュリティ注意事項)
9. [重要URL・リソース一覧](#9-重要urlリソース一覧)

---

## 1. システム全体構成図

```
┌─────────────────────────────────────────────────────────────────┐
│  開発者の作業                                                    │
│                                                                 │
│  ┌──────────────┐    git push    ┌──────────────┐               │
│  │   VS Code    │ ─────────────► │    GitHub    │               │
│  │  コード編集  │                 │  dstylegroup │               │
│  └──────────────┘                └──────┬───────┘               │
└─────────────────────────────────────────│───────────────────────┘
                                          │ GitHub Actions（自動）
                          ┌───────────────┴───────────────┐
                          │                               │
                          ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Microsoft Azure（クラウド）                                     │
│                                                                 │
│  ┌─────────────────┐    /api/*    ┌─────────────────┐           │
│  │ Static Web Apps │ ──────────►  │ Azure Functions │           │
│  │ stapp-dstyle-   │             │ func-dstyle-    │            │
│  │ survey          │             │ survey          │            │
│  │ HTMLファイル配信 │             │ API処理・認証    │            │
│  └────────┬────────┘             └────────┬────────┘            │
│           │                               │ データ保存           │
│           │ カスタムドメイン               ▼                     │
│           │                    ┌──────────────────┐             │
│  form.dstylegroup.jp           │   Cosmos DB      │             │
│           │                    │ cosmos-dstyle-   │             │
│           │                    │ survey           │             │
│           │                    │ アンケートデータ  │             │
│           │                    └──────────────────┘             │
│           │                                                     │
│           │  環境変数（Azure Portal）                            │
│           │  COSMOS_CONNECTION / ADMIN_PASSWORD_* / etc.        │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  エンドユーザー                                                   │
│                                                                  │
│  👤 お客様              👩 スタッフ             💻 開発者        │
│  アンケート回答         管理画面でデータ確認     コード管理・デプロイ │
└─────────────────────────────────────────────────────────────────┘
```

### データフロー

| ステップ | 処理内容 |
|---------|---------|
| ① | お客様がブラウザで `form.dstylegroup.jp/survey-*.html` を開く |
| ② | Static Web Apps が HTML を返す |
| ③ | フォーム送信 → Azure Functions（`/api/log`）→ Cosmos DB に保存 |
| ④ | スタッフが管理画面でログイン → Functions（`/api/auth`）→ トークン発行 → データ取得 |

---

## 2. 使用するサービスと役割

| サービス | リソース名 | 役割 | 料金目安 |
|---------|-----------|------|---------|
| GitHub | dstylegroup-dx/dstyle-survey | コード管理・自動デプロイ | 無料 |
| Azure Static Web Apps | stapp-dstyle-survey | HTML配信（画面表示） | 月$9〜 |
| Azure Functions | func-dstyle-survey | API処理（認証・保存） | 従量課金 |
| Azure Cosmos DB | cosmos-dstyle-survey | データ保存 | 従量課金 |
| GitHub Actions | 自動設定済み | 自動デプロイ | 無料 |

> 💡 Azure FunctionsとCosmos DBは月100万リクエストまで無料枠あり。小規模利用なら月数百円以内が目安。

---

## 3. GitHubに初めて接続する（別の人がつなぐ手順）

### STEP 1: 必要なソフトウェアをインストールする

#### ① Git のインストール

1. https://git-scm.com/download/win を開く
2. 「Download for Windows」をクリックしてダウンロード
3. インストール（設定はすべてデフォルトでOK）
4. 以下を実行してバージョンが表示されればOK

```bash
git --version
```

#### ② VS Code のインストール

1. https://code.visualstudio.com/ を開く
2. 「Download for Windows」をクリックしてダウンロード・インストール

---

### STEP 2: GitHubアカウントを作成する

1. https://github.com/ を開く
2. 「Sign up」をクリック
3. メールアドレス、パスワード、ユーザー名を入力して登録
4. メールで届いた確認コードを入力して完了

> 💡 会社のメールアドレスで登録することを推奨します。

---

### STEP 3: リポジトリへのアクセス権をもらう

**リポジトリのオーナー（管理者）に以下を依頼してください：**

1. GitHub の `dstylegroup-dx/dstyle-survey` を開く
2. 「Settings」→「Collaborators and teams」をクリック
3. 「Add people」をクリックして追加するメンバーのGitHubユーザー名を入力
4. 招待メールが届くので「Accept invitation」をクリックして承認

> ⚠️ アクセス権なしにリポジトリを変更しようとするとエラーになります。必ず先に招待してもらいましょう。

---

### STEP 4: Gitの初期設定をする

VS Code を開き、ターミナル（Ctrl + ` ）を起動して以下を実行します。

```bash
git config --global user.name "自分の名前"
git config --global user.email "メールアドレス"
```

---

### STEP 5: SSH鍵を設定する（推奨）

SSH鍵を使うと毎回パスワードを入力せずにGitHubを使えます。

1. 以下を実行（メールアドレスは自分のものに変更）

```bash
ssh-keygen -t ed25519 -C "メールアドレス"
```

2. Enterを3回押す（デフォルト設定で保存）

3. 公開鍵をコピーする

```bash
cat ~/.ssh/id_ed25519.pub
```

4. 表示された内容をすべてコピーする

5. GitHub → 右上アイコン → Settings → SSH and GPG keys → **New SSH key**

6. Title に「作業PC」など入力し、Key に ③ でコピーした内容を貼り付けて「Add SSH key」

> 💡 SSH鍵が面倒な場合はHTTPS接続でもOKです。その場合は初回push時にGitHubのユーザー名とPersonal Access Tokenを入力します。

---

### STEP 6: リポジトリをクローン（ダウンロード）する

1. VS Codeのターミナルで作業フォルダに移動

```bash
cd C:\dev\work
```

2. リポジトリをクローンする

```bash
# SSH接続の場合（推奨）
git clone git@github.com:dstylegroup-dx/dstyle-survey.git

# HTTPS接続の場合
git clone https://github.com/dstylegroup-dx/dstyle-survey.git
```

3. フォルダが作成されたら成功

```bash
cd dstyle-survey
code .
```

> 💡 クローンは最初の1回だけ必要です。次回からは `git pull` で最新を取得します。

---

### STEP 7: 動作確認

```bash
git status    # → "On branch main" と表示されればOK
git pull      # → "Already up to date." と表示されればOK
```

---

## 4. 新規アンケートを追加する手順

ここでは「新宿店（shinjuku）」を例に説明します。

### STEP 1: HTMLファイルを複製・編集する

1. VS Codeで以下のファイルをコピーする

```
survey-herbelle.html → survey-shinjuku.html
admin-herbelle.html  → admin-shinjuku.html
```

2. コピーしたファイルを開いて以下を変更する

| 変更箇所 | 変更前（例） | 変更後（例） |
|---------|------------|------------|
| `<title>` タグ | Herbelle 管理画面 | 新宿店 管理画面 |
| デフォルト tenant 値 | herbelle-chitosefunabashi | shinjuku |
| ページ見出し | 🌿 Herbelle | 🌿 新宿店 |

> ⚠️ tenant名は英数字とハイフンのみ使用可。スペース・日本語・記号は使えません。

---

### STEP 2: パスワードを設定する

1. ブラウザで https://shell.azure.com を開く
2. 「Bash」を選択してCloud Shellを起動する
3. 以下のコマンドを実行する

```bash
az functionapp config appsettings set \
  --name func-dstyle-survey \
  --resource-group rg-dstyle-survey \
  --settings ADMIN_PASSWORD_SHINJUKU=設定したいパスワード
```

**環境変数名のルール：**
```
ADMIN_PASSWORD_ + tenant名を大文字 + ハイフンをアンダースコアに変換

例: shinjuku                  → ADMIN_PASSWORD_SHINJUKU
例: herbelle-chitosefunabashi → ADMIN_PASSWORD_HERBELLE_CHITOSEFUNABASHI
```

---

### STEP 3: GitHubにpushしてデプロイする

```bash
git add survey-shinjuku.html admin-shinjuku.html
git commit -m "新宿店アンケート追加"
git push origin main
```

> 💡 pushするとGitHub Actionsが自動的にAzureへデプロイします。約2〜3分で完了します。

---

### STEP 4: 完了確認

1. https://github.com/dstylegroup-dx/dstyle-survey/actions を開く
2. 最新のワークフローが ✅ 緑になれば成功
3. 以下のURLにアクセスして動作確認する

```
アンケート: https://form.dstylegroup.jp/survey-shinjuku.html
管理画面:   https://form.dstylegroup.jp/admin-shinjuku.html
```

---

## 5. GitHubの基本操作

### よく使うコマンド一覧

| コマンド | 意味 | 使うタイミング |
|---------|------|-------------|
| `git status` | 変更されたファイルを確認 | 作業前・作業中いつでも |
| `git pull` | GitHubから最新を取得 | **作業開始前に必ず実行** |
| `git add ファイル名` | 変更をステージング | コミット前 |
| `git add .` | 全変更をステージング | コミット前 |
| `git commit -m "メッセージ"` | 変更を記録 | pushの直前 |
| `git push origin main` | GitHubにアップロード | デプロイしたいとき |
| `git log --oneline` | 変更履歴を確認 | 何を変更したか確認したいとき |

### 作業の基本フロー

```
① git pull          ← 最新を取得（必ず最初に！）
② ファイルを編集する
③ git status        ← 変更確認
④ git add .         ← ステージング
⑤ git commit -m "変更内容の説明"
⑥ git push origin main
⑦ GitHub Actionsで完了を確認 ✅
```

> ⚠️ 複数人で作業する場合は、作業前に必ず `git pull` を実行してください。

### GitHub Actionsの見方

https://github.com/dstylegroup-dx/dstyle-survey/actions を開く

| アイコン | 意味 |
|---------|------|
| ✅ 緑のチェック | デプロイ成功 |
| ❌ 赤のバツ | デプロイ失敗（クリックしてエラー詳細を確認） |
| 🟡 黄色の丸 | 実行中（1〜3分かかる） |

### リポジトリのフォルダ構成

```
dstyle-survey/
├── .github/
│   └── workflows/
│       └── deploy-functions.yml    # Functions自動デプロイ設定
├── api/
│   ├── src/functions/
│   │   └── index.js                # APIの本体（認証・データ保存処理）
│   ├── host.json                   # Functionsの設定
│   └── package.json                # Node.jsパッケージ定義
├── admin-herbelle.html             # 管理画面（店舗ごとに作成）
├── survey-herbelle.html            # アンケート画面（店舗ごとに作成）
├── index.html                      # トップページ
└── staticwebapp.config.json        # Static Web Apps設定
```

---

## 6. 環境変数の追加・管理

> ⚠️ パスワードや接続文字列は絶対にHTMLやJSファイルに直接書かないでください！

### 現在設定されている環境変数

| 環境変数名 | 説明 |
|-----------|------|
| `COSMOS_CONNECTION` | Cosmos DBへの接続文字列 |
| `COSMOS_DATABASE` | データベース名（現在：`dstyle-survey`） |
| `COSMOS_CONTAINER` | コンテナ名（現在：`logs`） |
| `ADMIN_PASSWORD_{TENANT名}` | 各店舗の管理画面パスワード |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | 監視ツール（自動設定済み） |
| `AzureWebJobsStorage` | Functionsの内部ストレージ（自動設定済み） |

### 方法A: Cloud Shell（コマンドライン）

```bash
az functionapp config appsettings set \
  --name func-dstyle-survey \
  --resource-group rg-dstyle-survey \
  --settings 変数名=値
```

### 方法B: Azure Portal（画面操作）

1. https://portal.azure.com を開く
2. `func-dstyle-survey` を検索して開く
3. 左メニュー「設定」→「環境変数」をクリック
4. 「+ 追加」→ 名前と値を入力 →「適用」→「確認」

### GitHubのシークレット管理

https://github.com/dstylegroup-dx/dstyle-survey/settings/secrets/actions

| シークレット名 | 説明 |
|-------------|------|
| `AZURE_CREDENTIALS` | Azure CLIの認証情報（JSON） |
| `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` | Functions発行プロファイル |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_*` | Static Web Appsデプロイトークン |

> ⚠️ 発行プロファイルが古くなった場合は、Azure Portalの「発行プロファイルの取得」から再取得して更新してください。

---

## 7. トラブルシューティング

| 症状 | 原因 | 対処法 |
|------|------|--------|
| 管理画面にログインできない | パスワード環境変数が未設定 | STEP2の手順で環境変数を追加 |
| ページが表示されない（404） | デプロイが失敗している | GitHub Actionsのログを確認 |
| データが保存されない（500） | COSMOS_CONNECTION等が未設定 | Azure Portalで環境変数を確認 |
| CORSエラー（コンソール表示） | 新ドメインがCORSに未登録 | 下記コマンドを実行 |
| GitHub Actions失敗 | 発行プロファイルの期限切れ等 | プロファイルを再取得して更新 |
| 管理画面にデータが出ない | typeまたはtenantが不一致 | URLパラメータを確認 |
| `git push` でエラー | リモートと競合している | `git pull` してから再push |
| Permission denied | アクセス権がない | 管理者にCollaborator招待を依頼 |

### CORSエラーの対処

```bash
az functionapp cors add \
  --name func-dstyle-survey \
  --resource-group rg-dstyle-survey \
  --allowed-origins "https://追加するドメイン"
```

### URLパラメータの確認

```
https://form.dstylegroup.jp/survey-herbelle.html?tenant=herbelle-chitosefunabashi&type=free_trial_survey
```

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `tenant` | 店舗を識別するID | `herbelle-chitosefunabashi` |
| `type` | アンケートの種別 | `free_trial_survey` |

> 💡 パラメータを省略した場合はHTMLファイル内のデフォルト値が使用されます。

---

## 8. セキュリティ注意事項

> ⚠️ 以下の情報は絶対に外部に公開・漏洩させないでください。

### 機密情報の種類と管理場所

| 情報の種類 | 管理場所 | 漏洩時の対処 |
|-----------|---------|------------|
| Cosmos DB接続文字列 | Azure Functions 環境変数 | Azure Portal でキーを再生成 |
| 管理画面パスワード | Azure Functions 環境変数 | 環境変数の値を変更 |
| Azureサービスプリンシパル | GitHub Secrets | `az ad sp credential reset` で再発行 |
| 発行プロファイル | GitHub Secrets | 「発行プロファイルのリセット」で無効化 |

### パスワードのルール

- 8文字以上
- 英数字・記号を組み合わせる
- 店舗名や日付だけのパスワードは避ける
- 定期的に変更（3〜6ヶ月ごと推奨）
- 他サービスとの使い回し禁止

### Gitで絶対にcommitしてはいけないもの

- パスワード、APIキー、接続文字列を直接書いたファイル
- `.env` ファイル
- 個人情報を含むCSV・Excelファイル
- 認証情報ファイル（serviceAccountKey.json 等）

> 💡 `.gitignore` ファイルに追加すれば誤ってcommitするのを防げます。

---

## 9. 重要URL・リソース一覧

| 項目 | URL / 情報 |
|------|-----------|
| サービス公開URL | https://form.dstylegroup.jp |
| GitHubリポジトリ | https://github.com/dstylegroup-dx/dstyle-survey |
| GitHub Actions | https://github.com/dstylegroup-dx/dstyle-survey/actions |
| GitHub Secrets | https://github.com/dstylegroup-dx/dstyle-survey/settings/secrets/actions |
| Azure Portal | https://portal.azure.com |
| Azure Cloud Shell | https://shell.azure.com |
| Static Web Apps | stapp-dstyle-survey（Azure Portal内） |
| Azure Functions | func-dstyle-survey（Azure Portal内） |
| Cosmos DB | cosmos-dstyle-survey（Azure Portal内） |
| リソースグループ | rg-dstyle-survey |
| Cosmos DB データベース名 | dstyle-survey |
| Cosmos DB コンテナ名 | logs |

---

*以上　ディライトテクノロジーズ事業部*
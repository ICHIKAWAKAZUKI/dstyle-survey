# DSHグループ アンケートシステム API仕様書

> バージョン: 1.1.0  
> 最終更新: 2026年6月  
> ベースURL: `https://{FUNCTION_APP_NAME}.japaneast-01.azurewebsites.net`  
> フロントエンド経由URL: `https://{CUSTOM_DOMAIN}/api`

---

## 目次

1. [概要](#1-概要)
2. [認証フロー](#2-認証フロー)
3. [エンドポイント一覧](#3-エンドポイント一覧)
4. [エンドポイント詳細](#4-エンドポイント詳細)
   - [POST /api/auth](#post-apiauth)
   - [POST /api/log](#post-apilog)
   - [GET /api/log](#get-apilog)
   - [DELETE /api/log](#delete-apilog)
   - [GET /api/period](#get-apiperiod)
   - [POST /api/period](#post-apiperiod)
5. [エラーレスポンス一覧](#5-エラーレスポンス一覧)
6. [データモデル](#6-データモデル)
7. [環境変数一覧](#7-環境変数一覧)
8. [使用例（curl）](#8-使用例curl)

---

## プレースホルダー一覧

このドキュメントでは以下のプレースホルダーを使用しています。実際の値に置き換えてください。

| プレースホルダー | 説明 | 例 |
|----------------|------|-----|
| `{FUNCTION_APP_NAME}` | Azure Functions のホスト名 | `func-dstyle-survey-gab2dwg3gdcqecgz` |
| `{CUSTOM_DOMAIN}` | カスタムドメイン | `form.dstylegroup.jp` |
| `{TENANT_ID}` | テナントID | `herbelle-chitosefunabashi` |
| `{PASSWORD}` | 管理画面パスワード | （各店舗で設定） |
| `{TOKEN}` | 認証トークン（ログイン後に取得） | （ログイン時に発行される32文字16進数） |
| `{DOCUMENT_ID}` | CosmosDBのドキュメントID | （データ取得時に確認） |
| `{SURVEY_TYPE}` | アンケート種別 | `free_trial_survey` |

---

## 1. 概要

### 技術スタック

| 項目 | 内容 |
|------|------|
| ランタイム | Node.js 22 |
| フレームワーク | Azure Functions v4（Node.js プログラミングモデル） |
| データベース | Azure Cosmos DB（NoSQL） |
| 認証方式 | パスワード認証 + セッショントークン（サーバーサイドメモリ） |
| CORS許可オリジン | `https://{CUSTOM_DOMAIN}`, `https://portal.azure.com` |

### マルチテナント設計

このAPIは `tenant` パラメータによるマルチテナント構成に対応しています。  
店舗ごとに異なる `tenant` 値を使用することで、1つのAPIで複数店舗のデータを分離管理できます。

```
tenant 値の例:
  herbelle-chitosefunabashi  → 千歳船橋店
  diana-fitting              → 補正下着試着
  shinjuku                   → 新宿店（追加例）
```

---

## 2. 認証フロー

```
1. クライアント → POST /api/auth（パスワード + tenant送信）
2. サーバー → 環境変数 ADMIN_PASSWORD_{TENANT} と照合
3. 一致した場合 → トークン（32文字16進数）を発行・返却
4. クライアント → 以降のリクエストに x-admin-token ヘッダーを付与
5. トークンは8時間後に自動失効
```

> ⚠️ トークンはサーバーのメモリ上に保持されます。Functionsが再起動するとトークンは失効し、再ログインが必要になります。

---

## 3. エンドポイント一覧

| メソッド | パス | 認証必須 | 説明 |
|---------|------|---------|------|
| `POST` | `/api/auth` | 不要 | ログイン（パスワード認証・トークン発行） |
| `POST` | `/api/log` | 不要 | アンケート回答データを保存 |
| `GET` | `/api/log` | **必要** | アンケート回答データを取得 |
| `DELETE` | `/api/log` | **必要** | アンケート回答データを削除 |
| `GET` | `/api/period` | 不要 | アンケート受付期間を取得 |
| `POST` | `/api/period` | **必要** | アンケート受付期間を保存・更新 |

---

## 4. エンドポイント詳細

---

### POST /api/auth

管理画面へのログイン。パスワードを照合してセッショントークンを発行します。

#### リクエスト

```
POST /api/auth
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "password": "{PASSWORD}",
  "tenant": "{TENANT_ID}"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `password` | string | ✅ | 管理画面パスワード（環境変数で設定） |
| `tenant` | string | ✅ | テナントID |

#### レスポンス

**成功時 `200 OK`**

```json
{
  "token": "{TOKEN}"
}
```

**エラー時**

| ステータス | 条件 | レスポンス |
|-----------|------|-----------|
| `400 Bad Request` | `tenant` が未指定 | `{"error": "tenant は必須です"}` |
| `401 Unauthorized` | テナントが未設定 | `{"error": "このテナントは設定されていません"}` |
| `401 Unauthorized` | パスワードが不一致 | `{"error": "パスワードが違います"}` |
| `500 Internal Server Error` | サーバー内部エラー | `{"error": "エラーメッセージ"}` |

#### curl 例

```bash
curl -X POST https://{FUNCTION_APP_NAME}.japaneast-01.azurewebsites.net/api/auth \
  -H "Content-Type: application/json" \
  -d '{"password":"{PASSWORD}","tenant":"{TENANT_ID}"}'
```

---

### POST /api/log

アンケートの回答データをCosmosDBに保存します。認証不要（お客様が使う）。

#### リクエスト

```
POST /api/log
Content-Type: application/json
```

**リクエストボディ**

```json
{
  "tenant": "{TENANT_ID}",
  "type": "{SURVEY_TYPE}",
  "data": {
    "customerName": "山田 花子",
    "satisfaction": "大変満足",
    "feedback": "とても良かったです"
  }
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `tenant` | string | ✅ | テナントID。検索・管理の識別子 |
| `type` | string | ✅ | アンケート種別（例: `free_trial_survey`） |
| `data` | object | ✅ | 保存するアンケートデータ（フィールドは自由） |

#### レスポンス

**成功時 `201 Created`**

```json
{
  "status": "ok"
}
```

**エラー時**

| ステータス | 条件 | レスポンス |
|-----------|------|-----------|
| `400 Bad Request` | `tenant` または `type` が未指定 | `{"error": "tenant と type は必須です"}` |
| `500 Internal Server Error` | DB保存エラー等 | `{"error": "エラーメッセージ"}` |

#### curl 例

```bash
curl -X POST https://{FUNCTION_APP_NAME}.japaneast-01.azurewebsites.net/api/log \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "{TENANT_ID}",
    "type": "{SURVEY_TYPE}",
    "data": {
      "customerName": "山田 花子",
      "satisfaction": "大変満足"
    }
  }'
```

---

### GET /api/log

指定したテナント・種別のアンケートデータ一覧を取得します。**認証必須。**

#### リクエスト

```
GET /api/log?tenant={TENANT_ID}&type={SURVEY_TYPE}
x-admin-token: {TOKEN}
```

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `tenant` | string | ✅ | テナントID |
| `type` | string | ✅ | アンケート種別 |

**リクエストヘッダー**

| ヘッダー | 必須 | 説明 |
|---------|------|------|
| `x-admin-token` | ✅ | POST /api/auth で取得したトークン |

#### レスポンス

**成功時 `200 OK`**

```json
[
  {
    "id": "{DOCUMENT_ID}",
    "tenant": "{TENANT_ID}",
    "type": "{SURVEY_TYPE}",
    "customerName": "山田 花子",
    "satisfaction": "大変満足",
    "createdAt": "2026-06-02T03:49:02.005Z",
    "_rid": "（CosmosDB内部）",
    "_ts": 1780372146
  }
]
```

**エラー時**

| ステータス | 条件 | レスポンス |
|-----------|------|-----------|
| `400 Bad Request` | `tenant` または `type` が未指定 | `{"error": "tenant と type の指定は必須です"}` |
| `401 Unauthorized` | トークンなし・無効 | `{"error": "認証が必要です"}` |
| `500 Internal Server Error` | DB取得エラー等 | `{"error": "エラーメッセージ"}` |

#### curl 例

```bash
curl "https://{FUNCTION_APP_NAME}.japaneast-01.azurewebsites.net/api/log?tenant={TENANT_ID}&type={SURVEY_TYPE}" \
  -H "x-admin-token: {TOKEN}"
```

---

### DELETE /api/log

指定したIDのアンケートデータを削除します。**認証必須。**

#### リクエスト

```
DELETE /api/log?id={DOCUMENT_ID}&tenant={TENANT_ID}
x-admin-token: {TOKEN}
```

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | string | ✅ | 削除するドキュメントのID |
| `tenant` | string | ✅ | テナントID（CosmosDBのパーティションキー） |

#### レスポンス

**成功時 `200 OK`**

```json
{
  "status": "deleted"
}
```

**エラー時**

| ステータス | 条件 | レスポンス |
|-----------|------|-----------|
| `400 Bad Request` | `id` または `tenant` が未指定 | `{"error": "id と tenant は必須です"}` |
| `401 Unauthorized` | トークンなし・無効 | `{"error": "認証が必要です"}` |
| `500 Internal Server Error` | DB削除エラー等 | `{"error": "エラーメッセージ"}` |

#### curl 例

```bash
curl -X DELETE "https://{FUNCTION_APP_NAME}.japaneast-01.azurewebsites.net/api/log?id={DOCUMENT_ID}&tenant={TENANT_ID}" \
  -H "x-admin-token: {TOKEN}"
```

---

### GET /api/period

テナントのアンケート受付期間を取得します。認証不要（アンケート画面が起動時に呼び出す）。

#### リクエスト

```
GET /api/period?tenant={TENANT_ID}
```

**クエリパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `tenant` | string | ✅ | テナントID |

#### レスポンス

**成功時 `200 OK`**

```json
{
  "startDate": "2026-07-01",
  "endDate": "2026-09-30"
}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `startDate` | string \| null | 受付開始日（YYYY-MM-DD形式）。未設定の場合は null |
| `endDate` | string \| null | 受付終了日（YYYY-MM-DD形式）。未設定の場合は null |

> 💡 `startDate`・`endDate` がともに null の場合は期間制限なし（常時受付中）を意味します。

**エラー時**

| ステータス | 条件 | レスポンス |
|-----------|------|-----------|
| `400 Bad Request` | `tenant` が未指定 | `{"error": "tenant は必須です"}` |
| `500 Internal Server Error` | DBエラー等 | `{"error": "エラーメッセージ"}` |

#### curl 例

```bash
curl "https://{FUNCTION_APP_NAME}.japaneast-01.azurewebsites.net/api/period?tenant={TENANT_ID}"
```

---

### POST /api/period

テナントのアンケート受付期間を保存・更新します。**認証必須。**

管理画面から期間を設定する際に呼び出します。Cosmos DBに保存されるため、コードを変更せずに期間を管理できます。

#### リクエスト

```
POST /api/period
Content-Type: application/json
x-admin-token: {TOKEN}
```

**リクエストボディ**

```json
{
  "tenant": "{TENANT_ID}",
  "startDate": "2026-07-01",
  "endDate": "2026-09-30"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `tenant` | string | ✅ | テナントID |
| `startDate` | string \| null | | 受付開始日（YYYY-MM-DD形式）。null で制限なし |
| `endDate` | string \| null | | 受付終了日（YYYY-MM-DD形式）。null で制限なし |

#### レスポンス

**成功時 `200 OK`**

```json
{
  "status": "ok",
  "startDate": "2026-07-01",
  "endDate": "2026-09-30"
}
```

**エラー時**

| ステータス | 条件 | レスポンス |
|-----------|------|-----------|
| `400 Bad Request` | `tenant` が未指定 | `{"error": "tenant は必須です"}` |
| `401 Unauthorized` | トークンなし・無効 | `{"error": "認証が必要です"}` |
| `500 Internal Server Error` | DB保存エラー等 | `{"error": "エラーメッセージ"}` |

#### curl 例

```bash
# 期間を設定
curl -X POST https://{FUNCTION_APP_NAME}.japaneast-01.azurewebsites.net/api/period \
  -H "Content-Type: application/json" \
  -H "x-admin-token: {TOKEN}" \
  -d '{"tenant":"{TENANT_ID}","startDate":"2026-07-01","endDate":"2026-09-30"}'

# 期間制限を削除（常時受付に戻す）
curl -X POST https://{FUNCTION_APP_NAME}.japaneast-01.azurewebsites.net/api/period \
  -H "Content-Type: application/json" \
  -H "x-admin-token: {TOKEN}" \
  -d '{"tenant":"{TENANT_ID}","startDate":null,"endDate":null}'
```

---

## 5. エラーレスポンス一覧

すべてのエラーレスポンスは以下の形式です：

```json
{
  "error": "エラーメッセージ"
}
```

| HTTPステータス | 意味 | 主な原因 |
|-------------|------|---------|
| `400 Bad Request` | リクエストが不正 | 必須パラメータの欠落 |
| `401 Unauthorized` | 認証失敗 | パスワード不一致・トークン無効・トークン未指定 |
| `500 Internal Server Error` | サーバーエラー | DB接続エラー・環境変数未設定等 |

---

## 6. データモデル

### アンケート回答ドキュメント（Cosmos DB）

```json
{
  "id": "{DOCUMENT_ID}",
  "tenant": "{TENANT_ID}",
  "type": "{SURVEY_TYPE}",
  "createdAt": "2026-06-02T03:49:02.005Z",

  // ↓ POST時の data フィールドの内容が展開される（フィールドは自由）
  "customerName": "山田 花子",
  "satisfaction": "大変満足",
  "feedback": "とても良かったです"
}
```

### 期間設定ドキュメント（Cosmos DB）

```json
{
  "id": "period_{TENANT_ID}",
  "tenant": "{TENANT_ID}",
  "startDate": "2026-07-01",
  "endDate": "2026-09-30",
  "updatedAt": "2026-06-04T10:00:00.000Z"
}
```

### Cosmos DB 設定

| 項目 | 値 |
|------|-----|
| データベース名 | `dstyle-survey` |
| コンテナ名 | `logs` |
| パーティションキー | `/tenant` |

---

## 7. 環境変数一覧

Azure Functions に設定する環境変数です。

| 環境変数名 | 必須 | 説明 | 例 |
|-----------|------|------|-----|
| `COSMOS_CONNECTION` | ✅ | Cosmos DB接続文字列 | `AccountEndpoint=https://...;AccountKey=...;` |
| `COSMOS_DATABASE` | ✅ | データベース名 | `dstyle-survey` |
| `COSMOS_CONTAINER` | ✅ | コンテナ名 | `logs` |
| `ADMIN_PASSWORD_{TENANT}` | ✅ | テナントごとのパスワード | `ADMIN_PASSWORD_DIANA_FITTING=（パスワード）` |

> 💡 受付期間はCosmos DBで管理するため、環境変数での期間設定は不要です。

**ADMIN_PASSWORD の命名規則：**

```
ADMIN_PASSWORD_ + tenant名を大文字 + ハイフンをアンダースコアに変換

例:
  tenant: herbelle-chitosefunabashi → ADMIN_PASSWORD_HERBELLE_CHITOSEFUNABASHI
  tenant: diana-fitting             → ADMIN_PASSWORD_DIANA_FITTING
  tenant: shinjuku                  → ADMIN_PASSWORD_SHINJUKU
```

---

## 8. 使用例（curl）

### 完全な操作フロー例

```bash
# 事前に設定する変数
BASE_URL="https://{FUNCTION_APP_NAME}.japaneast-01.azurewebsites.net"
TENANT="{TENANT_ID}"
PASSWORD="{PASSWORD}"
SURVEY_TYPE="{SURVEY_TYPE}"

# ① ログインしてトークンを取得
TOKEN=$(curl -s -X POST \
  ${BASE_URL}/api/auth \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"${PASSWORD}\",\"tenant\":\"${TENANT}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "Token: $TOKEN"

# ② 受付期間を確認（認証不要）
curl "${BASE_URL}/api/period?tenant=${TENANT}"

# ③ 受付期間を設定（認証必要）
curl -X POST ${BASE_URL}/api/period \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ${TOKEN}" \
  -d "{\"tenant\":\"${TENANT}\",\"startDate\":\"2026-07-01\",\"endDate\":\"2026-09-30\"}"

# ④ アンケートデータを保存（認証不要）
curl -X POST ${BASE_URL}/api/log \
  -H "Content-Type: application/json" \
  -d "{\"tenant\":\"${TENANT}\",\"type\":\"${SURVEY_TYPE}\",\"data\":{\"customerName\":\"山田 花子\",\"satisfaction\":\"大変満足\"}}"

# ⑤ データ一覧を取得（認証必要）
curl "${BASE_URL}/api/log?tenant=${TENANT}&type=${SURVEY_TYPE}" \
  -H "x-admin-token: ${TOKEN}"

# ⑥ データを削除（認証必要）
DOCUMENT_ID="{DOCUMENT_ID}"
curl -X DELETE \
  "${BASE_URL}/api/log?id=${DOCUMENT_ID}&tenant=${TENANT}" \
  -H "x-admin-token: ${TOKEN}"
```

---

*DSHグループ アンケートシステム API仕様書 v1.1.0*  
*ディライトテクノロジーズ事業部*

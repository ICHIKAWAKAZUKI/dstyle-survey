# DSHグループ アンケートシステム API仕様書

> バージョン: 2.0.0  
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
   - [GET /api/surveys](#get-apisurveys)
   - [POST /api/surveys](#post-apisurveys)
   - [PUT /api/surveys](#put-apisurveys)
   - [DELETE /api/surveys](#delete-apisurveys)
   - [POST /api/response](#post-apiresponse)
   - [GET /api/response](#get-apiresponse)
   - [DELETE /api/response](#delete-apiresponse)
   - [GET /api/period](#get-apiperiod)
   - [POST /api/period](#post-apiperiod)
   - [POST /api/log](#post-apilog)（旧形式・互換維持）
   - [GET /api/log](#get-apilog)（旧形式・互換維持）
   - [DELETE /api/log](#delete-apilog)（旧形式・互換維持）
5. [エラーレスポンス一覧](#5-エラーレスポンス一覧)
6. [データモデル](#6-データモデル)
7. [環境変数一覧](#7-環境変数一覧)
8. [使用例（curl）](#8-使用例curl)

---

## プレースホルダー一覧

| プレースホルダー | 説明 | 例 |
|----------------|------|-----|
| `{FUNCTION_APP_NAME}` | Azure Functions のホスト名 | `func-dstyle-survey-gab2dwg3gdcqecgz` |
| `{CUSTOM_DOMAIN}` | カスタムドメイン | `form.dstylegroup.jp` |
| `{TENANT_ID}` | テナントID | `herbelle-chitosefunabashi` |
| `{PASSWORD}` | 管理画面パスワード | （各事業部で設定） |
| `{TOKEN}` | 認証トークン（ログイン後に取得） | （32文字16進数） |
| `{SURVEY_ID}` | アンケート定義ID | `survey_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `{RESPONSE_ID}` | 回答データID | （UUID形式） |

---

## 1. 概要

### 技術スタック

| 項目 | 内容 |
|------|------|
| ランタイム | Node.js 22 |
| フレームワーク | Azure Functions v4（Node.js プログラミングモデル） |
| データベース | Azure Cosmos DB（NoSQL） |
| 認証方式 | パスワード認証 + セッショントークン（サーバーサイドメモリ・24時間有効） |
| CORS許可オリジン | `https://{CUSTOM_DOMAIN}`, `https://portal.azure.com` |

### マルチテナント設計

`tenant` パラメータで事業部・店舗を識別します。1つのAPIで複数テナントのデータを分離管理できます。

```
tenant 値の例:
  herbelle-chitosefunabashi  → Herbelle千歳船橋
  diana                      → Diana事業部
  shinjuku                   → 新宿店（追加例）
```

---

## 2. 認証フロー

```
1. クライアント → POST /api/auth（パスワード + tenant送信）
2. サーバー → 環境変数 ADMIN_PASSWORD_{TENANT} と照合
3. 一致した場合 → トークン（32文字16進数）を発行・返却
4. クライアント → 以降のリクエストに x-admin-token ヘッダーを付与
5. トークンは24時間後に自動失効
```

> ⚠️ トークンはサーバーのメモリ上に保持されます。Functionsが再起動するとトークンは失効し、再ログインが必要になります。

---

## 3. エンドポイント一覧

| メソッド | パス | 認証必須 | 説明 |
|---------|------|---------|------|
| `POST` | `/api/auth` | 不要 | ログイン・トークン発行 |
| `GET` | `/api/surveys` | 不要 | アンケート定義一覧・単体取得 |
| `POST` | `/api/surveys` | **必要** | アンケート定義新規作成 |
| `PUT` | `/api/surveys` | **必要** | アンケート定義更新 |
| `DELETE` | `/api/surveys` | **必要** | アンケート定義削除 |
| `POST` | `/api/response` | 不要 | 回答データ保存 |
| `GET` | `/api/response` | **必要** | 回答データ取得 |
| `DELETE` | `/api/response` | **必要** | 回答データ削除 |
| `GET` | `/api/period` | 不要 | 受付期間取得 |
| `POST` | `/api/period` | **必要** | 受付期間保存・更新 |
| `POST` | `/api/log` | 不要 | 回答保存（旧形式・互換維持） |
| `GET` | `/api/log` | **必要** | 回答取得（旧形式・互換維持） |
| `DELETE` | `/api/log` | **必要** | 回答削除（旧形式・互換維持） |

---

## 4. エンドポイント詳細

---

### POST /api/auth

ログイン。パスワードを照合してセッショントークンを発行します。

#### リクエスト

```
POST /api/auth
Content-Type: application/json
```

```json
{
  "password": "{PASSWORD}",
  "tenant": "{TENANT_ID}"
}
```

#### レスポンス

**成功時 `200 OK`**
```json
{ "token": "{TOKEN}" }
```

**エラー時**

| ステータス | 条件 |
|-----------|------|
| `400` | `tenant` が未指定 |
| `401` | テナント未設定またはパスワード不一致 |
| `500` | サーバー内部エラー |

---

### GET /api/surveys

アンケート定義の一覧または単体を取得します。認証不要（アンケート画面が使用）。

#### リクエスト

```
# 一覧取得
GET /api/surveys?tenant={TENANT_ID}

# 単体取得
GET /api/surveys?tenant={TENANT_ID}&id={SURVEY_ID}
```

#### レスポンス

**一覧取得 `200 OK`**
```json
[
  {
    "id": "survey_xxxxxxxx",
    "docType": "survey_definition",
    "tenant": "{TENANT_ID}",
    "title": "無料体験アンケート",
    "description": "本日はお越しいただきありがとうございました。",
    "questions": [
      {
        "id": "q_1234567890",
        "type": "text",
        "label": "お名前",
        "required": true,
        "placeholder": "例）山田 花子",
        "options": []
      },
      {
        "id": "q_0987654321",
        "type": "radio",
        "label": "満足度は？",
        "required": false,
        "options": ["大変満足", "満足", "普通", "やや不満"]
      }
    ],
    "createdAt": "2026-06-04T10:00:00.000Z",
    "updatedAt": "2026-06-04T10:00:00.000Z"
  }
]
```

**質問の `type` 一覧**

| type | 説明 |
|------|------|
| `text` | テキスト入力（1行） |
| `textarea` | 長文テキスト入力 |
| `radio` | ラジオボタン（単一選択） |
| `checkbox` | チェックボックス（複数選択） |
| `select` | プルダウン（単一選択） |

---

### POST /api/surveys

アンケート定義を新規作成します。**認証必須。**

#### リクエスト

```
POST /api/surveys
Content-Type: application/json
x-admin-token: {TOKEN}
```

```json
{
  "tenant": "{TENANT_ID}",
  "title": "無料体験アンケート",
  "description": "本日はお越しいただきありがとうございました。",
  "questions": []
}
```

#### レスポンス

**成功時 `201 Created`** → 作成されたアンケート定義オブジェクトを返す

---

### PUT /api/surveys

アンケート定義を更新します。**認証必須。**

#### リクエスト

```
PUT /api/surveys
Content-Type: application/json
x-admin-token: {TOKEN}
```

```json
{
  "id": "{SURVEY_ID}",
  "tenant": "{TENANT_ID}",
  "title": "更新後のタイトル",
  "questions": [...]
}
```

> 💡 `title`・`description`・`questions` はそれぞれ個別に更新可能です。省略した場合は既存の値を維持します。

#### レスポンス

**成功時 `200 OK`** → 更新後のアンケート定義オブジェクトを返す

---

### DELETE /api/surveys

アンケート定義を削除します。**認証必須。**  
※回答データは削除されません。

#### リクエスト

```
DELETE /api/surveys?id={SURVEY_ID}&tenant={TENANT_ID}
x-admin-token: {TOKEN}
```

#### レスポンス

**成功時 `200 OK`**
```json
{ "status": "deleted" }
```

---

### POST /api/response

回答データを保存します。認証不要（お客様が使用）。

#### リクエスト

```
POST /api/response
Content-Type: application/json
```

```json
{
  "surveyId": "{SURVEY_ID}",
  "tenant": "{TENANT_ID}",
  "answers": {
    "q_1234567890": "山田 花子",
    "q_0987654321": "大変満足"
  }
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `surveyId` | string | ✅ | アンケート定義ID |
| `tenant` | string | ✅ | テナントID |
| `answers` | object | ✅ | `{質問ID: 回答値}` の形式 |

#### レスポンス

**成功時 `201 Created`**
```json
{ "status": "ok" }
```

---

### GET /api/response

回答データ一覧を取得します。**認証必須。**

#### リクエスト

```
GET /api/response?surveyId={SURVEY_ID}&tenant={TENANT_ID}
x-admin-token: {TOKEN}
```

#### レスポンス

**成功時 `200 OK`**
```json
[
  {
    "id": "{RESPONSE_ID}",
    "docType": "survey_response",
    "surveyId": "{SURVEY_ID}",
    "tenant": "{TENANT_ID}",
    "answers": {
      "q_1234567890": "山田 花子",
      "q_0987654321": "大変満足"
    },
    "createdAt": "2026-06-04T12:00:00.000Z"
  }
]
```

---

### DELETE /api/response

回答データを削除します。**認証必須。**

#### リクエスト

```
DELETE /api/response?id={RESPONSE_ID}&tenant={TENANT_ID}
x-admin-token: {TOKEN}
```

#### レスポンス

**成功時 `200 OK`**
```json
{ "status": "deleted" }
```

---

### GET /api/period

受付期間を取得します。認証不要。`tenant` または `surveyId` のどちらかを指定します。

#### リクエスト

```
# テナント単位（旧形式互換）
GET /api/period?tenant={TENANT_ID}

# アンケート単位（推奨）
GET /api/period?surveyId={SURVEY_ID}
```

#### レスポンス

**成功時 `200 OK`**
```json
{
  "startDate": "2026-07-01",
  "endDate": "2026-09-30"
}
```

> 💡 `startDate`・`endDate` ともに `null` の場合は期間制限なし（常時受付中）。

---

### POST /api/period

受付期間を保存・更新します。**認証必須。**

#### リクエスト

```
POST /api/period
Content-Type: application/json
x-admin-token: {TOKEN}
```

```json
{
  "surveyId": "{SURVEY_ID}",
  "tenant": "{TENANT_ID}",
  "startDate": "2026-07-01",
  "endDate": "2026-09-30"
}
```

> 💡 期間制限を解除する場合は `startDate` と `endDate` を `null` に設定してください。

#### レスポンス

**成功時 `200 OK`**
```json
{ "status": "ok", "startDate": "2026-07-01", "endDate": "2026-09-30" }
```

---

### POST /api/log（旧形式・互換維持）

旧形式のアンケート回答を保存します。認証不要。

```
POST /api/log
Content-Type: application/json
```

```json
{
  "tenant": "{TENANT_ID}",
  "type": "{SURVEY_TYPE}",
  "data": { "customerName": "山田 花子", "satisfaction": "大変満足" }
}
```

---

### GET /api/log（旧形式・互換維持）

旧形式の回答データを取得します。**認証必須。**

```
GET /api/log?tenant={TENANT_ID}&type={SURVEY_TYPE}
x-admin-token: {TOKEN}
```

---

### DELETE /api/log（旧形式・互換維持）

旧形式の回答データを削除します。**認証必須。**

```
DELETE /api/log?id={DOCUMENT_ID}&tenant={TENANT_ID}
x-admin-token: {TOKEN}
```

---

## 5. エラーレスポンス一覧

```json
{ "error": "エラーメッセージ" }
```

| HTTPステータス | 意味 | 主な原因 |
|-------------|------|---------|
| `400 Bad Request` | リクエストが不正 | 必須パラメータの欠落 |
| `401 Unauthorized` | 認証失敗 | パスワード不一致・トークン無効・未指定 |
| `500 Internal Server Error` | サーバーエラー | DB接続エラー・環境変数未設定等 |

---

## 6. データモデル

### アンケート定義（survey_definition）

```json
{
  "id": "survey_{UUID}",
  "docType": "survey_definition",
  "tenant": "{TENANT_ID}",
  "title": "アンケートタイトル",
  "description": "説明文",
  "questions": [
    {
      "id": "q_{timestamp}",
      "type": "text | textarea | radio | checkbox | select",
      "label": "質問文",
      "required": true,
      "placeholder": "記入例（任意）",
      "options": ["選択肢1", "選択肢2"]
    }
  ],
  "createdAt": "2026-06-04T10:00:00.000Z",
  "updatedAt": "2026-06-04T10:00:00.000Z"
}
```

### 回答データ（survey_response）

```json
{
  "id": "{UUID}",
  "docType": "survey_response",
  "surveyId": "survey_{UUID}",
  "tenant": "{TENANT_ID}",
  "answers": {
    "q_{id}": "回答値"
  },
  "createdAt": "2026-06-04T12:00:00.000Z"
}
```

### 期間設定

```json
{
  "id": "period_survey_{SURVEY_ID}",
  "tenant": "survey_period",
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

| 環境変数名 | 必須 | 説明 |
|-----------|------|------|
| `COSMOS_CONNECTION` | ✅ | Cosmos DB接続文字列 |
| `COSMOS_DATABASE` | ✅ | データベース名（`dstyle-survey`） |
| `COSMOS_CONTAINER` | ✅ | コンテナ名（`logs`） |
| `ADMIN_PASSWORD_{TENANT}` | ✅ | テナントごとのパスワード |

**命名規則：**
```
ADMIN_PASSWORD_ + tenant名を大文字 + ハイフンをアンダースコアに変換

例:
  herbelle-chitosefunabashi → ADMIN_PASSWORD_HERBELLE_CHITOSEFUNABASHI
  diana                     → ADMIN_PASSWORD_DIANA
  shinjuku                  → ADMIN_PASSWORD_SHINJUKU
```

---

## 8. 使用例（curl）

```bash
BASE_URL="https://{FUNCTION_APP_NAME}.japaneast-01.azurewebsites.net"
TENANT="{TENANT_ID}"
PASSWORD="{PASSWORD}"

# ① ログイン
TOKEN=$(curl -s -X POST ${BASE_URL}/api/auth \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"${PASSWORD}\",\"tenant\":\"${TENANT}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# ② アンケート作成
curl -X POST ${BASE_URL}/api/surveys \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ${TOKEN}" \
  -d "{\"tenant\":\"${TENANT}\",\"title\":\"テストアンケート\",\"questions\":[]}"

# ③ アンケート一覧取得
curl "${BASE_URL}/api/surveys?tenant=${TENANT}"

# ④ 期間設定
curl -X POST ${BASE_URL}/api/period \
  -H "Content-Type: application/json" \
  -H "x-admin-token: ${TOKEN}" \
  -d "{\"tenant\":\"${TENANT}\",\"surveyId\":\"survey_xxx\",\"startDate\":\"2026-07-01\",\"endDate\":\"2026-09-30\"}"

# ⑤ 回答保存（認証不要）
curl -X POST ${BASE_URL}/api/response \
  -H "Content-Type: application/json" \
  -d "{\"surveyId\":\"survey_xxx\",\"tenant\":\"${TENANT}\",\"answers\":{\"q_1\":\"山田 花子\",\"q_2\":\"大変満足\"}}"

# ⑥ 回答一覧取得
curl "${BASE_URL}/api/response?surveyId=survey_xxx&tenant=${TENANT}" \
  -H "x-admin-token: ${TOKEN}"

# ⑦ 回答削除
curl -X DELETE "${BASE_URL}/api/response?id={RESPONSE_ID}&tenant=${TENANT}" \
  -H "x-admin-token: ${TOKEN}"
```

---

*DSHグループ アンケートシステム API仕様書 v2.0.0*  
*ディライトテクノロジーズ事業部*

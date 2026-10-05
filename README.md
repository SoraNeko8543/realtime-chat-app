# Realtime Chat v3
登録・ログインを作り直したRender対応版です。

機能:
- 新規アカウント作成
- ログイン / ログアウト
- ログイン状態Cookie
- パスワードハッシュ化
- アイコン変更
- 表示名変更
- リアルタイムチャット
- リプライ
- 自分のメッセージ削除

Render:
Build Command: npm install
Start Command: npm start

重要:
Renderの無料環境ではJSONファイルの保存は永続ストレージではありません。再デプロイやインスタンス交換でアカウントが消える可能性があります。実運用ではPostgreSQL等へ移行してください。

RenderのEnvironment Variablesに AUTH_SECRET をランダムな長い文字列で設定すると、認証Cookieの署名を強化できます。
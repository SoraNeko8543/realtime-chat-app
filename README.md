# Realtime Chat App - Render版

## Renderで公開する設定

GitHubにこのフォルダの中身をアップロードし、Renderで「New Web Service」からリポジトリを選択します。

- Build Command: `npm install`
- Start Command: `npm start`
- Environment: Node

このアプリはRenderが割り当てる `PORT` 環境変数を自動使用します。

## ローカル起動

PowerShellで:

`npm.cmd install`

`npm.cmd start`

ブラウザで `http://localhost:3000` を開きます。

## 注意

このサンプルは学習・小規模用途向けです。ログイン認証、パスワード、権限管理、レート制限などは実装していません。

Renderなどのホスティング環境では、ローカルファイルへの保存が永続ストレージにならない場合があります。長期保存が必要なら外部DBを利用してください。

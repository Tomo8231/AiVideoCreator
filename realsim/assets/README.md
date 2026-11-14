# 素材フォルダ

素材がなくても全工程が動きます（見た目は手続き的なシェーダー、音は合成音で代用）。
**素材を置くほどリアルになります。** 特に音は、実物の録音に置き換えるのが一番効きます。

大きなファイルはリポジトリに入れない設定（`.gitignore`）にしています。
使った素材の出典とライセンスは必ず `CREDITS.md` に書いてください。

| フォルダ | 置くもの | なければ |
|---|---|---|
| `hdri/` | 照明・映り込み用の HDRI（`.hdr` / `.exr`）。シーンの `Environment(hdri="ファイル名")` で指定 | 手続き的なスタジオ照明 |
| `textures/<材質名>_<番号>/` | `basecolor` / `roughness` / `normal` を名前に含む画像 | 手続き的シェーダー |
| `audio/impacts/<材質>/` または `audio/impacts/<材質A>__<材質B>/` | 衝突音の録音（1音ずつ切り出した wav）。`soft/` `hard/` のサブフォルダで強さ別にできる | モーダル合成 |
| `audio/loops/` | `<材質>_slide.wav`（擦れ）、`<材質>_roll.wav`（転がり）のループ素材 | 合成ノイズ |
| `audio/ir/` | 部屋のインパルス応答（wav）。最初の1つを使う | 合成残響 |
| `audio/roomtone/` | 部屋の環境音（無音の部屋を録ったもの） | 合成ノイズ |
| `fonts/` | テロップ用フォント（日本語なら Noto Sans JP など） | テロップを省略 |

## 入手先の候補（いずれもライセンスを自分で確認すること）

- HDRI・テクスチャ：Poly Haven（CC0）、ambientCG（CC0）
- 音：Freesound（CC0 で絞り込む）
- 部屋のインパルス応答：OpenAIR（ライセンスは素材ごとに異なる）
- フォント：Google Fonts の Noto Sans JP（SIL Open Font License）

## 実物を録音する場合

`RECORDING_GUIDE.md` を参照してください。

# 夜班貓隊

貓咪迷因主題的 3D 合作搜刮遊戲原型。目前提供單人第一人稱切片，尚未加入網路連線。

## 本機遊玩

需要 Node.js 20.19+（建議 Node.js 24）。在專案資料夾執行：

```powershell
npm ci
npm run dev
```

用瀏覽器開啟 Vite 顯示的本機網址，選「開始遊玩原型」，按開始後以滑鼠控制視角。

## 操作

- `W A S D` 或方向鍵：移動
- 滑鼠：轉動視角
- `E`：搬起／放下物品；在撤離門存放物品
- `Shift`：衝刺（無法抱著物品衝刺，會引來鍵盤暴走貓）
- `Esc`：暫停並釋放滑鼠

帶回至少 20 元戰利品即可撤離。方鬍子貓接近時會先發出警告聲；在牠反應前拉開距離。

## 建置

```powershell
npm run build
npm run preview
```

GitHub Actions 會在推送至 `main` 後建置 `dist/` 並部署到 GitHub Pages。GitHub repo 的 Pages 設定需使用 GitHub Actions 作為部署來源。

## 內容與素材

素材署名與授權列於 [CREDITS.md](CREDITS.md)，遊戲願景與路線圖列於 [knowledge/plan.md](knowledge/plan.md)。

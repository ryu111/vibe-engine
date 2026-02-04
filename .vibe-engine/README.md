# .vibe-engine 運行時目錄

此目錄是 Vibe Engine plugins 的共享運行時目錄，用於存儲狀態、記憶、日誌等。

## 目錄結構

```
.vibe-engine/
├── config.yaml          # 全局配置
├── tasks/               # 任務狀態（由 plugins 自動建立）
│   └── {task-id}.yaml
├── checkpoints/         # 狀態快照（由 plugins 自動建立）
│   └── {checkpoint-id}/
├── memory/              # 長期記憶（由 plugins 自動建立）
│   ├── semantic/
│   ├── episodic/
│   └── procedural/
├── logs/                # 操作日誌（由 plugins 自動建立）
│   └── {date}.jsonl
├── specs/               # 規格檔案（由 plugins 自動建立）
│   └── {spec-name}.yaml
└── instincts/           # 學習到的 Instincts（由 plugins 自動建立）
    └── {instinct-id}.md
```

## 注意事項

- 此目錄應加入 `.gitignore`（除了 config.yaml 模板）
- 所有 plugins 共享此目錄
- 目錄結構由各 plugin 按需建立

## 配置檔案

`config.yaml` 包含全局配置，可被專案的 `.vibe-engine/config.yaml` 覆蓋。

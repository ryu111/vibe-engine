# ============================================================
# Vibe Engine — 開發自動化
# ============================================================
# 用法：
#   make bump          升版（patch +1）所有 plugin + marketplace
#   make clean-cache   清除 Claude Code plugin 快取
#   make reinstall     升版 + 清快取（一步到位）
#   make test          跑 E2E 測試
#   make bypass        啟用 auto-fix bypass（死結逃生口）
#   make clean-state   清除所有運行時狀態檔
#   make version       顯示目前版本
#   make status        檢查源碼 vs 快取版本是否對齊
# ============================================================

SHELL := /bin/bash

# 路徑定義
PLUGIN_ROOT := plugins
MARKETPLACE := .claude-plugin/marketplace.json
PLUGIN_JSONS := $(shell find $(PLUGIN_ROOT) -name "plugin.json" -path "*/.claude-plugin/*")
CACHE_DIR := $(HOME)/.claude/plugins/cache/vibe-engine
INSTALLED := $(HOME)/.claude/plugins/installed_plugins.json
VIBE_DIR := .vibe-engine

# ============================================================
# 版本管理
# ============================================================

.PHONY: version
version:
	@node -e " \
		const mkt = require('./$(MARKETPLACE)'); \
		console.log('marketplace.json:', mkt.version); \
		const fs = require('fs'), path = require('path'); \
		const jsons = '$(PLUGIN_JSONS)'.split(' '); \
		for (const f of jsons) { \
			const p = JSON.parse(fs.readFileSync(f, 'utf8')); \
			console.log(path.basename(path.dirname(path.dirname(f))) + ':', p.version); \
		} \
	"

.PHONY: bump
bump:
	@node -e " \
		const fs = require('fs'), path = require('path'); \
		/* 讀取目前版本 */ \
		const mkt = JSON.parse(fs.readFileSync('$(MARKETPLACE)', 'utf8')); \
		const parts = mkt.version.split('.').map(Number); \
		parts[2]++; \
		const newVer = parts.join('.'); \
		/* 更新 marketplace.json */ \
		mkt.version = newVer; \
		fs.writeFileSync('$(MARKETPLACE)', JSON.stringify(mkt, null, 2) + '\n'); \
		/* 更新所有 plugin.json */ \
		const jsons = '$(PLUGIN_JSONS)'.split(' '); \
		for (const f of jsons) { \
			const p = JSON.parse(fs.readFileSync(f, 'utf8')); \
			p.version = newVer; \
			fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n'); \
		} \
		console.log('✅ 升版完成: ' + parts.map((v,i) => i===2 ? v-1 : v).join('.') + ' → ' + newVer); \
	"

# ============================================================
# 快取管理
# ============================================================

.PHONY: clean-cache
clean-cache:
	@echo "🧹 清除 plugin 快取..."
	@rm -rf "$(CACHE_DIR)" && echo "   已清除 $(CACHE_DIR)" || true
	@if [ -f "$(INSTALLED)" ]; then \
		node -e " \
			const fs = require('fs'); \
			const data = JSON.parse(fs.readFileSync('$(INSTALLED)', 'utf8')); \
			const plugins = data.plugins || {}; \
			let removed = 0; \
			for (const key of Object.keys(plugins)) { \
				if (key.includes('vibe-engine')) { delete plugins[key]; removed++; } \
			} \
			fs.writeFileSync('$(INSTALLED)', JSON.stringify(data, null, 2) + '\n'); \
			console.log('   已從 installed_plugins.json 移除 ' + removed + ' 個 plugin'); \
		"; \
	else \
		echo "   installed_plugins.json 不存在，跳過"; \
	fi
	@echo "✅ 快取清除完成（重啟 Claude Code 後重新安裝 plugin）"

.PHONY: status
status:
	@node -e " \
		const fs = require('fs'), path = require('path'); \
		/* 源碼版本 */ \
		const src = JSON.parse(fs.readFileSync('$(MARKETPLACE)', 'utf8')).version; \
		/* 快取版本 */ \
		let cached = '(未安裝)'; \
		try { \
			const inst = JSON.parse(fs.readFileSync('$(INSTALLED)', 'utf8')); \
			const entry = (inst.plugins || {})['vibe-engine-core@vibe-engine']; \
			if (entry && entry[0]) cached = entry[0].version || '(無版號)'; \
		} catch(e) {} \
		/* 比對 */ \
		const match = src === cached; \
		console.log('源碼版本: ' + src); \
		console.log('快取版本: ' + cached); \
		console.log(match ? '✅ 版本一致' : '⚠️  版本不一致！請執行 make reinstall'); \
	"

# ============================================================
# 一步到位
# ============================================================

.PHONY: reinstall
reinstall: bump clean-cache
	@echo ""
	@echo "🎉 升版 + 清快取完成"
	@echo "👉 請重啟 Claude Code，然後執行 /install-plugin 重新安裝"

# ============================================================
# 測試
# ============================================================

.PHONY: test
test:
	@cd $(PLUGIN_ROOT)/vibe-engine-core && npx jest hooks/scripts/__tests__/e2e-collaboration.test.js --no-cache --forceExit 2>&1

.PHONY: test-verbose
test-verbose:
	@cd $(PLUGIN_ROOT)/vibe-engine-core && npx jest hooks/scripts/__tests__/e2e-collaboration.test.js --no-cache --forceExit --verbose 2>&1

# ============================================================
# 死結逃生口
# ============================================================

.PHONY: bypass
bypass:
	@mkdir -p $(VIBE_DIR)
	@node -e " \
		const fs = require('fs'); \
		fs.writeFileSync('$(VIBE_DIR)/auto-fix-state.json', JSON.stringify({ \
			active: true, \
			iteration: 0, \
			maxIterations: 3, \
			originalErrors: ['manual-bypass'], \
			fixAttempts: [], \
			currentStatus: 'fixing', \
			timestamp: Date.now() \
		})); \
		console.log('✅ auto-fix bypass 已啟用（5 分鐘 TTL）'); \
		console.log('   到期時間: ' + new Date(Date.now() + 5*60*1000).toLocaleTimeString()); \
	"

.PHONY: bypass-off
bypass-off:
	@node -e " \
		const fs = require('fs'); \
		fs.writeFileSync('$(VIBE_DIR)/auto-fix-state.json', JSON.stringify({ \
			active: false, iteration: 0, maxIterations: 3, \
			originalErrors: [], fixAttempts: [], currentStatus: 'idle' \
		})); \
		console.log('✅ auto-fix bypass 已關閉'); \
	"

# ============================================================
# 狀態清理
# ============================================================

.PHONY: clean-state
clean-state:
	@echo "🧹 清除運行時狀態..."
	@rm -f $(VIBE_DIR)/routing-state.json && echo "   routing-state.json ✓" || true
	@rm -f $(VIBE_DIR)/active-subagent.json && echo "   active-subagent.json ✓" || true
	@node -e " \
		const fs = require('fs'); \
		fs.writeFileSync('$(VIBE_DIR)/auto-fix-state.json', JSON.stringify({ \
			active: false, iteration: 0, maxIterations: 3, \
			originalErrors: [], fixAttempts: [], currentStatus: 'idle' \
		})); \
	" && echo "   auto-fix-state.json → idle ✓"
	@echo "✅ 狀態清理完成"

.PHONY: clean-all
clean-all: clean-state clean-cache
	@echo "✅ 全部清理完成"

# ============================================================
# 幫助
# ============================================================

.PHONY: help
help:
	@echo ""
	@echo "  Vibe Engine 開發工具"
	@echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@echo "  版本管理:"
	@echo "    make version      顯示目前版本"
	@echo "    make bump         升版 (patch +1)"
	@echo "    make status       檢查源碼 vs 快取版本對齊"
	@echo ""
	@echo "  快取管理:"
	@echo "    make clean-cache  清除 Claude Code plugin 快取"
	@echo "    make reinstall    升版 + 清快取（一步到位）"
	@echo ""
	@echo "  測試:"
	@echo "    make test         執行 E2E 測試"
	@echo "    make test-verbose 執行 E2E 測試（詳細輸出）"
	@echo ""
	@echo "  死結逃生:"
	@echo "    make bypass       啟用 auto-fix bypass（5 分鐘）"
	@echo "    make bypass-off   關閉 auto-fix bypass"
	@echo ""
	@echo "  清理:"
	@echo "    make clean-state  清除運行時狀態檔"
	@echo "    make clean-all    清除狀態 + 快取"
	@echo ""

.DEFAULT_GOAL := help

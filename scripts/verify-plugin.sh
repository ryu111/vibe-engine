#!/bin/bash
# scripts/verify-plugin.sh
# Vibe Engine Plugin 驗證腳本
#
# 用法: bash scripts/verify-plugin.sh
#
# 驗證階段:
#   Phase 1: 結構驗證 - 檢查所有必需檔案存在
#   Phase 2: JSON 語法驗證 - 驗證 JSON 檔案格式正確
#   Phase 3: Frontmatter 驗證 - 檢查 Markdown 檔案有 YAML frontmatter
#   Phase 4: Hook 腳本語法驗證 - 驗證 Node.js 腳本語法

set -e

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PLUGIN_DIR="plugins/vibe-engine-core"
PASS=0
FAIL=0

# 檢查 plugin 目錄是否存在
if [ ! -d "$PLUGIN_DIR" ]; then
  echo -e "${RED}錯誤: Plugin 目錄不存在: $PLUGIN_DIR${NC}"
  echo "請確認您在 vibe-engine 根目錄執行此腳本"
  exit 1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Vibe Engine Plugin 驗證${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"

# ============================================
# Phase 1: 結構驗證
# ============================================
echo ""
echo -e "${YELLOW}📁 Phase 1: 結構驗證${NC}"
echo "───────────────────────────────────────────────"

# 必需檔案檢查
REQUIRED_FILES=(
  ".claude-plugin/plugin.json"
  ".claude-plugin/marketplace.json"
  "hooks/hooks.json"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$PLUGIN_DIR/$file" ]; then
    echo -e "  ${GREEN}✅${NC} $file"
    ((PASS++))
  else
    echo -e "  ${RED}❌${NC} $file (missing)"
    ((FAIL++))
  fi
done

# Agents 檢查
AGENTS=("architect" "developer" "reviewer" "tester" "explorer")
for agent in "${AGENTS[@]}"; do
  if [ -f "$PLUGIN_DIR/agents/$agent.md" ]; then
    echo -e "  ${GREEN}✅${NC} agents/$agent.md"
    ((PASS++))
  else
    echo -e "  ${RED}❌${NC} agents/$agent.md (missing)"
    ((FAIL++))
  fi
done

# Skills 檢查
SKILLS=("task-decomposition" "spec-generator" "verification-protocol" "budget-tracker" "iterative-retrieval")
for skill in "${SKILLS[@]}"; do
  if [ -f "$PLUGIN_DIR/skills/$skill/SKILL.md" ]; then
    echo -e "  ${GREEN}✅${NC} skills/$skill/SKILL.md"
    ((PASS++))
  else
    echo -e "  ${RED}❌${NC} skills/$skill/SKILL.md (missing)"
    ((FAIL++))
  fi
done

# Commands 檢查
COMMANDS=("status" "spec" "verify" "budget")
for cmd in "${COMMANDS[@]}"; do
  if [ -f "$PLUGIN_DIR/commands/$cmd.md" ]; then
    echo -e "  ${GREEN}✅${NC} commands/$cmd.md"
    ((PASS++))
  else
    echo -e "  ${RED}❌${NC} commands/$cmd.md (missing)"
    ((FAIL++))
  fi
done

# Hook scripts 檢查
HOOKS=("session-init" "prompt-classifier" "permission-guard" "result-logger" "completion-check" "state-saver")
for hook in "${HOOKS[@]}"; do
  if [ -f "$PLUGIN_DIR/hooks/scripts/$hook.js" ]; then
    echo -e "  ${GREEN}✅${NC} hooks/scripts/$hook.js"
    ((PASS++))
  else
    echo -e "  ${RED}❌${NC} hooks/scripts/$hook.js (missing)"
    ((FAIL++))
  fi
done

# ============================================
# Phase 2: JSON 語法驗證
# ============================================
echo ""
echo -e "${YELLOW}📋 Phase 2: JSON 語法驗證${NC}"
echo "───────────────────────────────────────────────"

JSON_FILES=(
  ".claude-plugin/plugin.json"
  ".claude-plugin/marketplace.json"
  "hooks/hooks.json"
)

# 檢查 jq 是否可用
if command -v jq &> /dev/null; then
  for file in "${JSON_FILES[@]}"; do
    if cat "$PLUGIN_DIR/$file" 2>/dev/null | jq . > /dev/null 2>&1; then
      echo -e "  ${GREEN}✅${NC} $file (valid JSON)"
      ((PASS++))
    else
      echo -e "  ${RED}❌${NC} $file (invalid JSON)"
      ((FAIL++))
    fi
  done
else
  echo -e "  ${YELLOW}⚠️${NC}  jq 未安裝，跳過 JSON 語法驗證"
  echo "     安裝方式: brew install jq (macOS) 或 apt install jq (Linux)"
fi

# ============================================
# Phase 3: Frontmatter 驗證
# ============================================
echo ""
echo -e "${YELLOW}📝 Phase 3: Frontmatter 驗證${NC}"
echo "───────────────────────────────────────────────"

# 檢查所有 .md 檔案是否有 YAML frontmatter
for dir in agents commands; do
  shopt -s nullglob
  for file in "$PLUGIN_DIR/$dir"/*.md; do
    if [ -f "$file" ]; then
      if head -1 "$file" | grep -q "^---"; then
        echo -e "  ${GREEN}✅${NC} $dir/$(basename "$file") (has frontmatter)"
        ((PASS++))
      else
        echo -e "  ${RED}❌${NC} $dir/$(basename "$file") (missing frontmatter)"
        ((FAIL++))
      fi
    fi
  done
  shopt -u nullglob
done

# Skills SKILL.md frontmatter
for skill in "${SKILLS[@]}"; do
  file="$PLUGIN_DIR/skills/$skill/SKILL.md"
  if [ -f "$file" ]; then
    if head -1 "$file" | grep -q "^---"; then
      echo -e "  ${GREEN}✅${NC} skills/$skill/SKILL.md (has frontmatter)"
      ((PASS++))
    else
      echo -e "  ${RED}❌${NC} skills/$skill/SKILL.md (missing frontmatter)"
      ((FAIL++))
    fi
  fi
done

# ============================================
# Phase 4: Hook 腳本語法驗證
# ============================================
echo ""
echo -e "${YELLOW}🔧 Phase 4: Hook 腳本語法驗證${NC}"
echo "───────────────────────────────────────────────"

# 檢查 node 是否可用
if command -v node &> /dev/null; then
  for hook in "${HOOKS[@]}"; do
    file="$PLUGIN_DIR/hooks/scripts/$hook.js"
    if [ -f "$file" ]; then
      if node --check "$file" 2>/dev/null; then
        echo -e "  ${GREEN}✅${NC} $hook.js (valid syntax)"
        ((PASS++))
      else
        echo -e "  ${RED}❌${NC} $hook.js (syntax error)"
        ((FAIL++))
      fi
    fi
  done
else
  echo -e "  ${YELLOW}⚠️${NC}  node 未安裝，跳過 Hook 腳本語法驗證"
fi

# ============================================
# 總結
# ============================================
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}  驗證結果${NC}"
echo "───────────────────────────────────────────────"
echo -e "  ${GREEN}✅ 通過:${NC} $PASS"
echo -e "  ${RED}❌ 失敗:${NC} $FAIL"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"

if [ $FAIL -eq 0 ]; then
  echo ""
  echo -e "${GREEN}🎉 所有驗證通過！Plugin 結構完整。${NC}"
  echo ""
  echo "下一步: 執行載入測試"
  echo "  claude --plugin-dir ./plugins/vibe-engine-core"
  exit 0
else
  echo ""
  echo -e "${RED}⚠️  有 $FAIL 項驗證失敗，請修正後重新驗證。${NC}"
  exit 1
fi

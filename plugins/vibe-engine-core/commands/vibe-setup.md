---
name: vibe-setup
description: 設置 TypeScript 專案開發工具（ESLint + Jest），確保 /verify 能完整執行
---

# /vibe-setup

## 概述

一鍵設置 TypeScript 專案的開發工具，包括 ESLint（程式碼檢查）和 Jest（測試框架），讓 `/verify` 命令能完整執行所有驗證層。

## 使用方式

- `/vibe-setup` - 設置所有開發工具
- `/vibe-setup lint` - 只設置 ESLint
- `/vibe-setup test` - 只設置 Jest
- `/vibe-setup --check` - 檢查現有配置狀態

## 前置條件

- 專案根目錄有 `tsconfig.json`（TypeScript 專案）
- 專案有 `package.json`

## 執行步驟

### 1. 檢測現有配置

```javascript
const hasEslint = fs.existsSync('.eslintrc.js') ||
                  fs.existsSync('.eslintrc.json') ||
                  fs.existsSync('.eslintrc.yaml') ||
                  (pkg.eslintConfig !== undefined);

const hasJest = fs.existsSync('jest.config.js') ||
                fs.existsSync('jest.config.ts') ||
                (pkg.jest !== undefined);
```

### 2. 生成 ESLint 配置（如不存在）

創建 `.eslintrc.js`：

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  env: {
    node: true,
    es2020: true
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  rules: {
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off'
  }
};
```

### 3. 生成 Jest 配置（如不存在）

創建 `jest.config.js`：

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### 4. 更新 package.json

添加依賴和 scripts：

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts",
    "test": "jest"
  },
  "devDependencies": {
    "eslint": "^8.56.0",
    "@typescript-eslint/parser": "^6.18.0",
    "@typescript-eslint/eslint-plugin": "^6.18.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "@types/jest": "^29.5.11"
  }
}
```

### 5. 提示用戶安裝依賴

## 輸出範例

```
╔══════════════════════════════════════════════════╗
║           Development Tools Setup                ║
╠══════════════════════════════════════════════════╣
║ Project: my-project                              ║
║ Type: TypeScript                                 ║
╠══════════════════════════════════════════════════╣
║ ESLint                                           ║
║ ├─ Config: ✅ Created .eslintrc.js               ║
║ └─ Script: ✅ Added "lint" to package.json       ║
╠══════════════════════════════════════════════════╣
║ Jest                                             ║
║ ├─ Config: ✅ Created jest.config.js             ║
║ └─ Script: ✅ Added "test" to package.json       ║
╠══════════════════════════════════════════════════╣
║ Dependencies Added:                              ║
║ ├─ eslint@^8.56.0                                ║
║ ├─ @typescript-eslint/parser@^6.18.0             ║
║ ├─ @typescript-eslint/eslint-plugin@^6.18.0      ║
║ ├─ jest@^29.7.0                                  ║
║ ├─ ts-jest@^29.1.1                               ║
║ └─ @types/jest@^29.5.11                          ║
╠══════════════════════════════════════════════════╣
║ Next Step:                                       ║
║ └─ npm install                                   ║
╚══════════════════════════════════════════════════╝
```

### 檢查模式輸出（--check）

```
╔══════════════════════════════════════════════════╗
║           Development Tools Status               ║
╠══════════════════════════════════════════════════╣
║ ESLint: ✅ Configured (.eslintrc.js)             ║
║ Jest:   ❌ Not configured                        ║
╠══════════════════════════════════════════════════╣
║ Run `/vibe-setup test` to configure Jest         ║
╚══════════════════════════════════════════════════╝
```

## 冪等性保證

- 如果配置已存在，跳過該工具的設置
- 不會覆蓋現有配置
- 只添加缺失的依賴和 scripts

## 相關命令

- `/verify` - 執行驗證協議（需要 lint/test 配置）
- `/status` - 查看系統狀態

## 對應章節

- Ch6 資源管理
- Ch7 可觀測性

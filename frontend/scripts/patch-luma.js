#!/usr/bin/env node
/**
 * luma.gl v9.2.x 竞态条件热修复
 * 
 * 问题：WebGLDevice 构造函数中先创建 CanvasContext（注册 ResizeObserver），
 *       再初始化 device.limits 属性。当 ResizeObserver 在 limits 赋值前触发时，
 *       getMaxDrawingBufferSize() 访问 undefined 的 limits 导致崩溃：
 *       "Cannot read properties of undefined (reading 'maxTextureDimension2D')"
 * 
 * 修复：在 getMaxDrawingBufferSize() 和 _handleResize() 中添加防御性空值检查。
 * 
 * 此脚本作为 npm postinstall 钩子自动运行。
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES_TO_PATCH = [
  resolve(__dirname, '../node_modules/@luma.gl/core/dist/adapter/canvas-context.js'),
  resolve(__dirname, '../node_modules/@luma.gl/core/dist/index.cjs'),
];

let patchedCount = 0;

for (const filePath of FILES_TO_PATCH) {
  try {
    let content = readFileSync(filePath, 'utf-8');
    let changed = false;

    // Patch 1: getMaxDrawingBufferSize - 添加防御性访问
    const unsafeAccess = 'this.device.limits.maxTextureDimension2D';
    const safeAccess = 'this.device?.limits?.maxTextureDimension2D || 8192';
    if (content.includes(unsafeAccess)) {
      content = content.replaceAll(unsafeAccess, safeAccess);
      changed = true;
    }

    // Patch 2: _handleResize - 在函数开头添加 limits 就绪检查
    // 匹配 ESM 格式
    const unsafeResizeESM = '_handleResize(entries) {\n        const entry = entries.find';
    const safeResizeESM = '_handleResize(entries) {\n        if (!this.device?.limits) { return; }\n        const entry = entries.find';
    if (content.includes(unsafeResizeESM)) {
      content = content.replace(unsafeResizeESM, safeResizeESM);
      changed = true;
    }

    // 匹配 CJS 格式
    const unsafeResizeCJS = '_handleResize(entries) {\n    var _a, _b;\n    const entry = entries.find';
    const safeResizeCJS = '_handleResize(entries) {\n    var _a, _b;\n    if (!this.device?.limits) { return; }\n    const entry = entries.find';
    if (content.includes(unsafeResizeCJS)) {
      content = content.replace(unsafeResizeCJS, safeResizeCJS);
      changed = true;
    }

    if (changed) {
      writeFileSync(filePath, content, 'utf-8');
      patchedCount++;
      console.log(`  ✅ Patched: ${filePath.split('node_modules')[1]}`);
    } else {
      console.log(`  ⏭️  Already patched: ${filePath.split('node_modules')[1]}`);
    }
  } catch (err) {
    console.warn(`  ⚠️  Skip: ${filePath} (${err.message})`);
  }
}

console.log(`\n[patch-luma] ${patchedCount} file(s) patched for ResizeObserver race condition fix.`);

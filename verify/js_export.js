// 导出网页默认生成的数据（用于在 Python 里用 sklearn / numpy 在同一份数据上重算）。
// 用法：node verify/js_export.js "<JS 表达式，可以用 Lab>"，输出该表达式的 JSON。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({ console });
const load = (rel) => vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { filename: rel });
load('assets/js/core.js');
for (const f of fs.readdirSync(path.join(root, 'assets/js/pages')).sort()) load('assets/js/pages/' + f);
const expr = process.argv[2];
console.log(JSON.stringify(vm.runInContext(expr, ctx)));

import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Config[]} */
export default [
    { files: ["**/*.js"], languageOptions: { sourceType: "module" } }, // 关键修改
    { languageOptions: { globals: globals.node } },
    pluginJs.configs.recommended,
    { rules: { indent: ["error", 4] } }, // 添加两空格缩进设置
];

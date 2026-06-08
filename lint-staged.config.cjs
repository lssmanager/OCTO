module.exports = {
  // Run full typecheck once per commit (covers all packages)
  '*.{ts,tsx}': ['pnpm run typecheck', 'prettier --write', 'eslint --fix --max-warnings=0'],
  // Format JS, JSON, YAML
  '*.{js,json,yml,yaml}': ['prettier --write'],
  // Format Markdown
  '*.md': ['prettier --write'],
};

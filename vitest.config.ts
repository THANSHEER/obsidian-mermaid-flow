import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'path';

export default defineConfig({
	plugins: [
		{
			name: 'svg-text-loader',
			load(id) {
				if (id.endsWith('.svg')) {
					return `export default ${JSON.stringify(fs.readFileSync(id, 'utf8'))};`;
				}
			},
		},
	],
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, './tests/mocks/obsidian.ts'),
		},
	},
	test: {
		include: ['tests/**/*.test.ts'],
		setupFiles: ['./tests/setup.ts'],
	},
});

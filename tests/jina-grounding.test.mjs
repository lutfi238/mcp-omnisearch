import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const importFresh = async (relativePath) => {
	const url = new URL(
		`../dist/${relativePath}?t=${Date.now()}-${Math.random()}`,
		import.meta.url,
	);

	return import(url.href);
};

test('Jina grounding uses configured endpoint and JSON accept header', async () => {
	process.env.JINA_AI_API_KEY = 'test-key';

	const calls = [];
	const originalFetch = globalThis.fetch;

	globalThis.fetch = async (url, options = {}) => {
		calls.push({ url, options });

		return new Response(
			JSON.stringify({
				data: {
					factuality: 0.97,
					result: true,
					reason: 'Verified',
					references: [],
					usage: { tokens: 123 },
				},
			}),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
				},
			},
		);
	};

	try {
		const { config } = await importFresh('config/env.js');
		const { JinaGroundingProvider } = await importFresh(
			'providers/enhancement/jina_grounding/index.js',
		);

		const provider = new JinaGroundingProvider();
		await provider.enhance_content(
			'TypeScript adds static typing to JavaScript.',
		);

		assert.equal(calls.length, 1);
		assert.equal(
			calls[0].url,
			config.enhancement.jina_grounding.base_url,
		);
		assert.equal(
			calls[0].options.headers.Accept,
			'application/json',
		);
		assert.equal(
			calls[0].options.headers.Authorization,
			'Bearer test-key',
		);
		assert.equal(
			calls[0].options.body,
			JSON.stringify({
				statement:
					'TypeScript adds static typing to JavaScript.',
			}),
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test('Jina grounding is disabled by default even when a key is present', async () => {
	const script = `
		const { initialize_providers } = await import(${JSON.stringify(
			pathToDistModule('providers/index.js'),
		)});
		const { available_providers } = await import(${JSON.stringify(
			pathToDistModule('server/tools.js'),
		)});
		initialize_providers();
		console.log(JSON.stringify(Array.from(available_providers.enhancement)));
	`;

	const result = spawnSync(
		process.execPath,
		['--input-type=module', '--eval', script],
		{
			cwd: process.cwd(),
			env: {
				...process.env,
				BRAVE_API_KEY: '',
				FIRECRAWL_API_KEY: 'test-key',
				EXA_API_KEY: 'test-key',
				GITHUB_API_KEY: 'test-key',
				JINA_AI_API_KEY: 'test-key',
				JINA_GROUNDING_ENABLED: '',
				KAGI_API_KEY: '',
				PERPLEXITY_API_KEY: '',
				TAVILY_API_KEY: 'test-key',
			},
			encoding: 'utf8',
		},
	);

	assert.equal(result.status, 0, result.stderr);

	const providers = JSON.parse(result.stdout.trim());
	assert.deepEqual(providers, []);
});

function pathToDistModule(relativePath) {
	return new URL(`../dist/${relativePath}`, import.meta.url).href;
}

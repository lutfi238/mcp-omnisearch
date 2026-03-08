import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

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

import { http_json } from '../../../common/http.js';
import {
	EnhancementProvider,
	EnhancementResult,
	ErrorType,
	ProviderError,
} from '../../../common/types.js';
import {
	handle_provider_error,
	retry_with_backoff,
	validate_api_key,
} from '../../../common/utils.js';
import { config } from '../../../config/env.js';

interface JinaGroundingResponse {
	code: number;
	status: number;
	data: {
		factuality: number;
		result: boolean;
		reason: string;
		references: Array<{
			url: string;
			key_quote: string;
			is_supportive: boolean;
		}>;
		usage: {
			tokens: number;
		};
	};
}

export class JinaGroundingProvider implements EnhancementProvider {
	name = 'jina_grounding';
	description =
		'Real-time fact verification against web knowledge. Reduces hallucinations and improves content integrity through statement verification.';

	async enhance_content(content: string): Promise<EnhancementResult> {
		const api_key = validate_api_key(
			config.enhancement.jina_grounding.api_key,
			this.name,
		);

		const ground_request = async () => {
			try {
				const data = await http_json<JinaGroundingResponse>(
					this.name,
					config.enhancement.jina_grounding.base_url,
					{
						method: 'POST',
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json',
							Authorization: `Bearer ${api_key}`,
						},
						body: JSON.stringify({ statement: content }),
						signal: AbortSignal.timeout(
							config.enhancement.jina_grounding.timeout,
						),
					},
				);

				if (!data?.data) {
					throw new ProviderError(
						ErrorType.API_ERROR,
						'Unexpected response: missing data from Jina Grounding',
						this.name,
					);
				}

				// Format references into a readable string
				const references_text = data.data.references
					.map(
						(ref) =>
							`${ref.is_supportive ? '✓' : '✗'} ${ref.key_quote} (${
								ref.url
							})`,
					)
					.join('\n\n');

				return {
					original_content: content,
					enhanced_content: `Factuality Score: ${
						data.data.factuality
					}\nVerdict: ${
						data.data.result ? 'True' : 'False'
					}\n\nReasoning: ${
						data.data.reason
					}\n\nReferences:\n${references_text}`,
					enhancements: [
						{
							type: 'fact_verification',
							description:
								'Verified factual accuracy against real-time web knowledge',
						},
					],
					sources: data.data.references.map((ref) => ({
						title: ref.key_quote,
						url: ref.url,
					})),
					source_provider: this.name,
					meta: {
						factuality: data.data.factuality,
						result: data.data.result,
						token_usage: data.data.usage.tokens,
					},
				};
			} catch (error) {
				handle_provider_error(error, this.name, 'ground content');
			}
		};

		return retry_with_backoff(ground_request);
	}
}

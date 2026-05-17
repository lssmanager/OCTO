// Embedding provider abstraction

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
}

export interface EmbeddingResponse {
  model: string;
  embeddings: number[][];
  usage: { totalTokens: number };
}

export interface IEmbeddingProvider {
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

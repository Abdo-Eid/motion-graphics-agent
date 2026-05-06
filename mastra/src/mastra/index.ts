import { createOpenAI } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';

import { uploadRoutes } from './uploads/router';
import { retrieveProjectKnowledge } from './knowledge/retrieve';


const t1bRetrievalTestAgent = new Agent({
  id: 't1b-retrieval-test',
  name: 'T1B Retrieval Test',
  instructions: [
    'You are a temporary checkpoint agent for T1B Knowledge Store verification.',
    'Always call retrieveProjectKnowledge before answering.',
    'Retrieve knowledge from the current project thread before answering.',
    'Answer only from retrieved project knowledge chunks.',
    'Mention the source filenames you used.',
  ].join('\n'),
  model: azureOpenAI().chat(requireEnv('AZURE_CHAT_DEPLOYMENT')),
  tools: {
    retrieveProjectKnowledge,
  },
});

export const mastra = new Mastra({
  agents: {
    t1bRetrievalTestAgent,
  },
  server: {
    apiRoutes: uploadRoutes,
  },
});

function azureOpenAI() {
  const baseURL = `https://${requireEnv('AZURE_RESOURCE_NAME')}.openai.azure.com/openai/v1`;

  return createOpenAI({
    apiKey: requireEnv('AZURE_API_KEY'),
    baseURL,
    fetch: fetchWithAzureApiVersion(),
  });
}

function fetchWithAzureApiVersion(): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    url.searchParams.set('api-version', requireEnv('AZURE_API_VERSION'));
    return fetch(url, init);
  }) as typeof fetch;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

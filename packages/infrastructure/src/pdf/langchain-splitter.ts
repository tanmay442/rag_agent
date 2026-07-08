// LangChain text splitter adapter. The chunk size and
// overlap match the production settings used by the legacy
// ingestFile helper.
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { TextSplitterAdapter } from '../adapter-ports';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 350,
  chunkOverlap: 50,
});

export const langchainSplitter: TextSplitterAdapter = {
  async splitText(text: string): Promise<string[]> {
    return splitter.splitText(text);
  },
};

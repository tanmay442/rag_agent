import { createPulsarFixture } from '../../pulsar-fixture';
import { lines } from './lines';

export const { fileName, write } = createPulsarFixture('03-api-reference.pdf', lines);
export { lines };

import { createPulsarFixture } from '../../pulsar-fixture';
import { lines } from './lines';

export const { fileName, write } = createPulsarFixture('01-getting-started.pdf', lines);
export { lines };

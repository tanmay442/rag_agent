import { createPulsarFixture } from '../../pulsar-fixture';
import { lines } from './lines';

export const { fileName, write } = createPulsarFixture('07-data-and-integrations.pdf', lines);
export { lines };

import { createPulsarFixture } from '../../pulsar-fixture';
import { lines } from './lines';

export const { fileName, write } = createPulsarFixture('02-admin-guide.pdf', lines);
export { lines };

import { createPulsarFixture } from '../../pulsar-fixture';
import { lines } from './lines';

export const { fileName, write } = createPulsarFixture('05-account-and-security.pdf', lines);
export { lines };

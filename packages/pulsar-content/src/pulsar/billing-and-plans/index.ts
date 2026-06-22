import { createPulsarFixture } from '../../pulsar-fixture';
import { lines } from './lines';

export const { fileName, write } = createPulsarFixture('04-billing-and-plans.pdf', lines);
export { lines };

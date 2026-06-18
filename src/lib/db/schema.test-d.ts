// Type-only inference test plus a runtime smoke that the three pgTable
// exports are defined. Runs with `vitest run`; the test file fails to load
// if any expected type does not match.
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  documents,
  chunks,
  tickets,
  type Document,
  type NewDocument,
  type Chunk,
  type Ticket,
} from './schema';

describe('schema types', () => {
  it('infers Document shape', () => {
    expectTypeOf<Document['id']>().toEqualTypeOf<number>();
    expectTypeOf<Document['fileName']>().toEqualTypeOf<string>();
    expectTypeOf<Document['fileHash']>().toEqualTypeOf<string>();
    expectTypeOf<Document['uploadedBy']>().toEqualTypeOf<string>();
    expectTypeOf<Document['uploadedAt']>().toEqualTypeOf<Date>();
  });

  it('infers NewDocument shape (id + uploadedAt optional)', () => {
    expectTypeOf<NewDocument['fileName']>().toEqualTypeOf<string>();
    expectTypeOf<NewDocument['fileHash']>().toEqualTypeOf<string>();
    expectTypeOf<NewDocument['uploadedBy']>().toEqualTypeOf<string>();
    // Optional on insert
    expectTypeOf<NewDocument['id']>().toEqualTypeOf<number | undefined>();
  });

  it('infers Chunk shape (embedding is number[])', () => {
    expectTypeOf<Chunk['content']>().toEqualTypeOf<string>();
    expectTypeOf<Chunk['embedding']>().toEqualTypeOf<number[]>();
    expectTypeOf<Chunk['documentId']>().toEqualTypeOf<number>();
  });

  it('infers Ticket shape', () => {
    expectTypeOf<Ticket['ticketId']>().toEqualTypeOf<string>();
    expectTypeOf<Ticket['userId']>().toEqualTypeOf<string>();
    expectTypeOf<Ticket['status']>().toEqualTypeOf<string>();
    expectTypeOf<Ticket['createdAt']>().toEqualTypeOf<Date>();
  });

  it('exposes pgTable definitions at runtime', () => {
    expect(documents).toBeDefined();
    expect(chunks).toBeDefined();
    expect(tickets).toBeDefined();
  });
});

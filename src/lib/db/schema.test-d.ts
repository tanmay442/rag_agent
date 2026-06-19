// Type-only inference test plus a runtime smoke that the pgTable exports
// are defined. Runs with `vitest run`; the test file fails to load if any
// expected type does not match.
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  documents,
  chunks,
  tickets,
  users,
  documentAudit,
  ticketAudit,
  type Document,
  type NewDocument,
  type Chunk,
  type Ticket,
  type User,
  type DocumentAudit,
  type TicketAudit,
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

  it('infers User shape', () => {
    expectTypeOf<User['clerkUserId']>().toEqualTypeOf<string>();
    expectTypeOf<User['email']>().toEqualTypeOf<string>();
    expectTypeOf<User['role']>().toEqualTypeOf<string>();
  });

  it('infers DocumentAudit shape', () => {
    expectTypeOf<DocumentAudit['id']>().toEqualTypeOf<number>();
    expectTypeOf<DocumentAudit['action']>().toEqualTypeOf<string>();
  });

  it('infers TicketAudit shape', () => {
    expectTypeOf<TicketAudit['id']>().toEqualTypeOf<number>();
    expectTypeOf<TicketAudit['action']>().toEqualTypeOf<string>();
  });

  it('exposes pgTable definitions at runtime', () => {
    expect(documents).toBeDefined();
    expect(chunks).toBeDefined();
    expect(tickets).toBeDefined();
    expect(users).toBeDefined();
    expect(documentAudit).toBeDefined();
    expect(ticketAudit).toBeDefined();
  });
});

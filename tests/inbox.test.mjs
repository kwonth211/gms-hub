import test from 'node:test';
import assert from 'node:assert/strict';
import { handleEmail } from '../worker/src/inbox.js';

const mail = () => ({
  from: 'sender@example.com', to: 'contact@example.com', headers: new Headers({ Subject: 'Test message' }),
  raw: 'Subject: Test message\r\n\r\nHello', rawSize: 38,
  forwarded: [], rejected: [],
  async forward(to) { this.forwarded.push(to); },
  setReject(reason) { this.rejected.push(reason); }
});

test('mail forwards to the configured address and still delivers if archiving fails', async () => {
  for (const failing of [false, true]) {
    let archived = 0;
    const message = mail();
    const DB = { prepare: () => ({ bind: () => ({ run: async () => { if (failing) throw Error('unavailable'); archived++; } }) }) };
    await handleEmail(message, { FORWARD_TO: ' owner@example.com ', DB });
    assert.deepEqual(message.forwarded, ['owner@example.com']);
    assert.deepEqual(message.rejected, []);
    assert.equal(archived, failing ? 0 : 1);
  }
});

test('mail with no configured recipient is explicitly rejected rather than silently discarded', async () => {
  for (const FORWARD_TO of [undefined, '', '   ']) {
    const message = mail();
    await handleEmail(message, { FORWARD_TO, DB: { prepare() { throw Error('must not archive a rejected message'); } } });
    assert.equal(message.rejected.length, 1);
    assert.equal(message.forwarded.length, 0);
  }
});

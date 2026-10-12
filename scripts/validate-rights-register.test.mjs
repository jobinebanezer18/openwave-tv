import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRightsRegister } from './validate-rights-register.mjs';

const candidate = () => ({
  id: 'tv:sample', type: 'tv', name: 'Sample', review_status: 'unreviewed',
  stream_origin: null, stream_evidence: [], uses_artwork: true, artwork_evidence: [], territories: [],
  review_owner: null, reviewed_on: null, contact: null, notes: ''
});

test('unreviewed sources can be tracked but cannot pass a production gate', () => {
  const register = { schema_version: 1, sources: [candidate()] };
  assert.deepEqual(validateRightsRegister(register), []);
  assert.match(validateRightsRegister(register, { production: true }).join(' '), /at least one approved/);
});

test('approval requires independent evidence and territory', () => {
  const source = { ...candidate(), review_status: 'approved' };
  const errors = validateRightsRegister({ schema_version: 1, sources: [source] });
  assert.ok(errors.some(error => error.includes('stream_evidence')));
  assert.ok(errors.some(error => error.includes('artwork_evidence')));
  assert.ok(errors.some(error => error.includes('territories')));
});

test('duplicate source IDs are rejected', () => {
  const register = { schema_version: 1, sources: [candidate(), candidate()] };
  assert.ok(validateRightsRegister(register).some(error => error.includes('duplicated')));
});

test('a claimed approval cannot use placeholder evidence', () => {
  const source = { ...candidate(), review_status: 'approved', stream_origin: 'https://example.org/live.m3u8',
    stream_evidence: ['permission pending'], artwork_evidence: ['approved'], territories: ['IN'],
    review_owner: 'Reviewer', reviewed_on: '2026-10-12' };
  const errors = validateRightsRegister({ schema_version: 1, sources: [source] });
  assert.ok(errors.some(error => error.includes('entries must be HTTPS')));
});

test('production validation allows a review queue beside a complete approved source', () => {
  const approved = { ...candidate(), id: 'tv:approved', review_status: 'approved',
    stream_origin: 'https://example.org/live.m3u8',
    stream_evidence: ['https://example.org/terms'], artwork_evidence: ['private:artwork-grant-1'],
    territories: ['IN'], review_owner: 'Reviewer', reviewed_on: '2026-10-12' };
  assert.deepEqual(validateRightsRegister({ schema_version: 1, sources: [candidate(), approved] }, { production: true }), []);
});

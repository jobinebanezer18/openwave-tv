import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(here, '../catalog/rights-register.json');
const statuses = new Set(['unreviewed', 'in_review', 'approved', 'rejected', 'removed']);
const sourceTypes = new Set(['tv', 'radio']);
const required = ['id', 'type', 'name', 'review_status', 'stream_origin', 'stream_evidence', 'uses_artwork', 'artwork_evidence', 'territories', 'review_owner', 'reviewed_on', 'contact', 'notes'];
function validEvidence(reference) {
  if (typeof reference !== 'string' || !reference.trim()) return false;
  if (/^private:[A-Za-z0-9._/-]+$/.test(reference)) return true;
  try { const url = new URL(reference); return url.protocol === 'https:' && Boolean(url.hostname); }
  catch { return false; }
}

export function validateRightsRegister(register, { production = false } = {}) {
  const errors = [];
  if (register?.schema_version !== 1 || !Array.isArray(register.sources)) {
    return ['Expected schema_version 1 and a sources array.'];
  }
  const ids = new Set();
  let approved = 0;
  for (const [index, source] of register.sources.entries()) {
    const label = `sources[${index}]`;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    for (const key of required) if (!(key in source)) errors.push(`${label}.${key} is required.`);
    if (typeof source.id !== 'string' || !/^(tv|radio):[A-Za-z0-9._-]+$/.test(source.id)) errors.push(`${label}.id has an invalid format.`);
    if (ids.has(source.id)) errors.push(`${label}.id is duplicated.`);
    ids.add(source.id);
    if (!sourceTypes.has(source.type)) errors.push(`${label}.type must be tv or radio.`);
    if (!statuses.has(source.review_status)) errors.push(`${label}.review_status is invalid.`);
    if (typeof source.name !== 'string' || !source.name.trim()) errors.push(`${label}.name is required.`);
    for (const key of ['stream_evidence', 'artwork_evidence', 'territories']) {
      if (!Array.isArray(source[key])) errors.push(`${label}.${key} must be an array.`);
    }
    for (const key of ['stream_evidence', 'artwork_evidence']) {
      if (Array.isArray(source[key]) && source[key].some(reference => !validEvidence(reference))) errors.push(`${label}.${key} entries must be HTTPS URLs or private evidence references.`);
    }
    if (typeof source.uses_artwork !== 'boolean') errors.push(`${label}.uses_artwork must be a boolean.`);
    if (source.review_status === 'approved') {
      approved++;
      if (!validEvidence(source.stream_origin) || source.stream_origin.startsWith('private:')) errors.push(`${label}.stream_origin must be an HTTPS URL for approved items.`);
      if (!Array.isArray(source.stream_evidence) || !source.stream_evidence.length) errors.push(`${label}.stream_evidence is required for approval.`);
      if (source.uses_artwork && (!Array.isArray(source.artwork_evidence) || !source.artwork_evidence.length)) errors.push(`${label}.artwork_evidence is required when artwork is used.`);
      if (!Array.isArray(source.territories) || !source.territories.length) errors.push(`${label}.territories is required for approval.`);
      else if (source.territories.some(territory => typeof territory !== 'string' || !/^([A-Z]{2}|WORLD)$/.test(territory))) errors.push(`${label}.territories must use two-letter country codes or WORLD.`);
      if (!source.review_owner || !source.reviewed_on) errors.push(`${label} needs a review owner and date for approval.`);
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(source.reviewed_on)) errors.push(`${label}.reviewed_on must be YYYY-MM-DD.`);
    }
    if (production && source.review_status !== 'approved') errors.push(`${label} is not approved for production.`);
  }
  if (production && approved === 0) errors.push('Production requires at least one approved source.');
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const production = process.argv.includes('--production');
  const file = process.argv.find(arg => arg.endsWith('.json')) || defaultPath;
  try {
    const errors = validateRightsRegister(JSON.parse(fs.readFileSync(file, 'utf8')), { production });
    if (errors.length) {
      for (const error of errors) process.stderr.write(`${error}\n`);
      process.exitCode = 1;
    } else process.stdout.write(`Rights register valid${production ? ' for production' : ''}: ${file}\n`);
  } catch (error) {
    process.stderr.write(`Could not validate rights register: ${error.message}\n`);
    process.exitCode = 1;
  }
}

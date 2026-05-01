'use strict';

const VALID_TRANSITIONS = {
  draft:     ['submitted'],
  submitted: ['approved', 'finalized'],
  approved:  ['finalized'],
  finalized: ['reopened'],
  reopened:  ['submitted'],
};

/**
 * Returns null if the transition is valid, or an error string if not.
 * @param {string} from - current status
 * @param {string} to   - desired next status
 * @returns {null|string}
 */
function validateTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return `invalid_from_status:${from}`;
  if (!allowed.includes(to)) return `invalid_transition:${from}_to_${to}`;
  return null;
}

module.exports = { validateTransition, VALID_TRANSITIONS };

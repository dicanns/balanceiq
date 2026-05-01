'use strict';

/**
 * Returns true when the close session is finalized and editing must be
 * gated behind a reopen workflow.
 *
 * @param {object|null} session - close_sessions row or null
 * @returns {boolean}
 */
function requiresReopen(session) {
  return session?.status === 'finalized';
}

module.exports = { requiresReopen };

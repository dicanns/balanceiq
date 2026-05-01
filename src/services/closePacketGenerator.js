/**
 * Assembles a close packet (evidence bundle) from raw DB rows.
 * Pure function - no DB calls, no side effects.
 *
 * @param {object} opts
 * @param {object|null}   opts.session    - close_sessions row
 * @param {object[]}      opts.registers  - register_closures rows for the session
 * @param {object[]}      opts.approvals  - close_approvals rows for the session
 * @param {object[]}      opts.safeDrops  - safe_drops rows relevant to the session
 * @returns {object} structured evidence packet
 */
function buildClosePacket({ session = null, registers = [], approvals = [], safeDrops = [] } = {}) {
  const totalVarianceCents = registers.reduce((sum, r) => sum + (r.variance_cents ?? 0), 0);

  const approvalChain = [...approvals].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? '')
  );

  return {
    generatedAt: new Date().toISOString(),
    session: session ?? null,
    registers: registers.map(r => ({
      register_key:            r.register_key,
      variance_cents:          r.variance_cents ?? 0,
      status:                  r.status ?? 'draft',
      tender_mode:             r.tender_mode ?? 'simple',
      safe_drops_total_cents:  r.safe_drops_total_cents ?? 0,
      paid_ins_cents:          r.paid_ins_cents ?? 0,
      paid_outs_cents:         r.paid_outs_cents ?? 0,
      cash_tips_paid_cents:    r.cash_tips_paid_cents ?? 0,
    })),
    approvalChain,
    safeDrops: safeDrops.map(sd => ({
      id:           sd.id,
      register_key: sd.register_key,
      amount_cents: sd.amount_cents ?? 0,
      created_at:   sd.created_at ?? null,
    })),
    summary: {
      totalVarianceCents,
      registerCount:          registers.length,
      safeDropCount:          safeDrops.length,
      carryForwardFloatCents: session?.carry_forward_float_cents ?? null,
      isFinalShift:           session?.is_final_shift === 1 || session?.is_final_shift === true,
      hasReopened:            approvalChain.some(a => a.stage === 'reopened'),
    },
  };
}

export { buildClosePacket };

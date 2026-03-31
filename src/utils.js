function generateAccessCode() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function computeCommission(amountCents, feeRate = 0.12) {
  const platformFeeCents = Math.round(amountCents * feeRate);
  const hostEarningsCents = amountCents - platformFeeCents;
  return { platformFeeCents, hostEarningsCents };
}

module.exports = { generateAccessCode, computeCommission };

function extractKeyMetrics(reportData = {}) {
  const {
    property_name,
    city,
    state,
    num_lots,
    lot_rent,
    home_rent,
    occupancy_rate,
    total_expenses,
    noi,
    cap_rate,
    loan_amount,
    loan_interest_rate,
    amortization_years,
    loan_maturity_balance,
    prepared_by_name,
    prepared_by_company,
    prepared_by_email,
    prepared_by_phone,
  } = reportData || {};

  return `
  Property: ${property_name || ''}
  Location: ${city || ''}, ${state || ''}
  Sites: ${num_lots || ''}
  Lot Rent: ${lot_rent || ''}
  Home Rent: ${home_rent || ''}
  Occupancy: ${occupancy_rate || ''}
  NOI: ${noi || ''}
  Cap Rate: ${cap_rate || ''}
  Loan: ${loan_amount || ''} @ ${loan_interest_rate || ''}%
  Amortization: ${amortization_years || ''} years
  Maturity Balance: ${loan_maturity_balance || ''}
  Prepared By: ${prepared_by_name || ''}, ${prepared_by_company || ''}
  Contact: ${prepared_by_email || ''} / ${prepared_by_phone || ''}
  `.trim();
}

module.exports = { extractKeyMetrics };

// What a product gives an invoice line. One definition for the editor (a product
// picked on a line) and for an invoice an AI assistant prepares for review.
export function lineFromProduct(product, { forecastLink = false } = {}) {
  return {
    produitId: product.id,
    description: product.description,
    prixUnitaire: parseFloat(product.prixUnitaire) || 0,
    tps: product.tps !== false,
    tvq: product.tvq !== false,
    ...(forecastLink ? { forecast_product_id: product.forecast_product_id || null } : {}),
  };
}

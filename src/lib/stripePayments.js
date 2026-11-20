/**
 * Scaffold Stripe — aucune clé requise.
 * Sans STRIPE_SECRET_KEY, tout fonctionne en mode « simulated ».
 * Le SDK `stripe` est chargé via require optionnel uniquement si la clé est présente
 * et le paquet installé.
 */

function isStripeEnabled() {
  return !!process.env.STRIPE_SECRET_KEY;
}

let cachedClient;

/** Retourne le client Stripe SDK si dispo (clé + paquet installé), sinon null. */
function getStripeClient() {
  if (!isStripeEnabled()) return null;
  if (cachedClient !== undefined) return cachedClient;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const Stripe = require("stripe");
    cachedClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch (_e) {
    cachedClient = null;
  }
  return cachedClient;
}

/**
 * Crée une session de paiement pour une réservation.
 * @returns {Promise<{mode:'simulated'|'stripe', clientSecret:string|null, [k:string]:any}>}
 */
async function createCheckoutForBooking({ booking, successUrl, cancelUrl } = {}) {
  if (!isStripeEnabled()) {
    return { mode: "simulated", clientSecret: null };
  }
  const stripe = getStripeClient();
  const amount = Number(booking?.amount_cents) || 0;
  if (!stripe) {
    // Clé présente mais SDK absent : stub sans appel réseau.
    return {
      mode: "stripe",
      stub: true,
      clientSecret: null,
      sessionId: null,
      url: null,
      amountCents: amount,
      successUrl: successUrl || null,
      cancelUrl: cancelUrl || null,
      message: "Stripe SDK not installed; checkout is a stub.",
    };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: String(booking.id),
    metadata: { bookingId: String(booking.id) },
    // Propage bookingId au PaymentIntent (événement payment_intent.succeeded).
    payment_intent_data: { metadata: { bookingId: String(booking.id) } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: amount,
          product_data: { name: booking.box_title || `Réservation #${booking.id}` },
        },
      },
    ],
  });
  return {
    mode: "stripe",
    stub: false,
    clientSecret: session.client_secret || null,
    sessionId: session.id,
    url: session.url || null,
    amountCents: amount,
  };
}

/** Vérifie la signature et parse un webhook Stripe (rawBody = Buffer brut, non parsé). */
function constructWebhookEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripeClient();
  if (stripe && secret && signature) {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  }
  // Stub : refuse tout événement non vérifiable (sécurité par défaut).
  throw new Error(
    "Stripe webhook verification unavailable (missing STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / stripe SDK)."
  );
}

module.exports = {
  isStripeEnabled,
  getStripeClient,
  createCheckoutForBooking,
  constructWebhookEvent,
};

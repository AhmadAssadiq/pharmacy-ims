// Card payments for patient orders - a DEMO only (GP2 addition).
//
// No real card is ever charged and no card number is ever asked for or stored.
// takeDemoPayment() simply answers "paid", so the rest of the order flow (paid, unpaid,
// refunded) can be shown and tested.
//
// In a real pharmacy this is the ONE place that would change: the function would send the
// amount to a payment provider (a bank or a service such as Stripe), wait for its answer
// and return whether the payment went through. The card details would be typed into the
// provider's own page, never into ours.
import crypto from 'node:crypto';

// "Takes" a card payment of `amount`. Always succeeds.
// Returns { paid: true, reference } where reference looks like 'DEMO-3F9A1C2B'.
export function takeDemoPayment(amount) {
  const reference = `DEMO-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  console.log(`[payment] demo card payment of ${Number(amount).toFixed(2)} accepted (${reference})`);
  return { paid: true, reference };
}

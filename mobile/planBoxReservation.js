/** Libellés et détection réservation / validation pour les box d’un plan. */

export function isBookingPaid(paymentStatus) {
  const p = String(paymentStatus || "simulated_unpaid").toLowerCase();
  return (
    p === "simulated_authorized" ||
    p === "simulated_paid" ||
    p === "paid" ||
    p === "authorized" ||
    p === "captured"
  );
}

export function bookingPaymentLabel(paymentStatus) {
  if (isBookingPaid(paymentStatus)) return "Payé";
  return "Non payé";
}

/** Modifiable tant que non payé (re-validation hôte ensuite). */
export function bookingCanAthleteEdit(booking) {
  if (!booking) return false;
  const status = String(booking.status || "").toLowerCase();
  const approval = String(
    booking.approval_status || booking.latest_approval_status || ""
  ).toLowerCase();
  if (status === "cancelled" || status === "canceled") return false;
  if (approval === "rejected") return false;
  return !isBookingPaid(
    booking.payment_status || booking.latest_payment_status
  );
}

/** Paiement possible seulement après validation hôte et si non payé. */
export function bookingCanAthletePay(booking) {
  if (!booking) return false;
  const status = String(booking.status || "").toLowerCase();
  const approval = String(
    booking.approval_status || booking.latest_approval_status || ""
  ).toLowerCase();
  if (status === "cancelled" || status === "canceled") return false;
  if (approval !== "accepted") return false;
  return !isBookingPaid(
    booking.payment_status || booking.latest_payment_status
  );
}

export function bookingFunnelStepLabel(booking) {
  if (!booking) return "";
  const status = String(booking.status || "").toLowerCase();
  const approval = String(
    booking.approval_status || booking.latest_approval_status || "pending"
  ).toLowerCase();
  if (status === "cancelled" || status === "canceled") return "Annulée";
  if (approval === "rejected") return "Refusée";
  if (bookingCanAthletePay(booking)) return "À payer";
  if (isBookingPaid(booking.payment_status || booking.latest_payment_status)) {
    return "Confirmée";
  }
  if (approval === "accepted") return "Validée";
  return "En attente hôte";
}

export function planBoxValidationLabel(status) {
  switch (String(status || "pending")) {
    case "validated":
      return "Validée par l'hôte";
    case "rejected":
      return "Refusée";
    default:
      return "En attente de validation";
  }
}

export function planBoxApprovalLabel(approval) {
  switch (String(approval || "")) {
    case "accepted":
      return "Acceptée";
    case "rejected":
      return "Refusée";
    case "pending_host_confirmation":
      return "Modif. en attente (hôte)";
    case "pending_athlete_confirmation":
      return "Modif. en attente (toi)";
    case "cancelled_box_deleted":
      return "Annulée (box supprimée)";
    default:
      return approval ? String(approval) : "Demande envoyée";
  }
}

export function planBoxHasActiveBooking(box) {
  const bookingStatus = String(box?.latest_booking_status || "").toLowerCase();
  const bookingApproval = String(box?.latest_approval_status || "").toLowerCase();
  if (!bookingStatus && !bookingApproval) return false;
  if (bookingStatus === "cancelled" || bookingStatus === "canceled") return false;
  if (bookingApproval === "rejected") return false;
  return true;
}

export function formatPlanBoxSlot(box) {
  if (!planBoxHasActiveBooking(box)) return "";
  const d = box?.latest_booking_date;
  const st = box?.latest_booking_start_time;
  const en = box?.latest_booking_end_time;
  if (!d || !st || !en) return "";
  return `${d} · ${st}–${en}`;
}

export function formatPlanBoxPrice(box) {
  const cents = Number(box?.latest_booking_amount_cents);
  if (!Number.isFinite(cents) || cents <= 0) return "";
  return `${(cents / 100).toFixed(2)} €`;
}

export function planBoxStatusColors(status) {
  if (status === "validated") {
    return { border: "#34D399", bg: "#ECFDF5", text: "#059669" };
  }
  if (status === "rejected") {
    return { border: "#FCA5A5", bg: "#FEF2F2", text: "#DC2626" };
  }
  return { border: "#FCD34D", bg: "#FFFBEB", text: "#B45309" };
}

/** Libellés et détection réservation / validation pour les box d’un plan. */

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

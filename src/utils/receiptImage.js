/**
 * Renders a delivery share-card to a PNG image entirely with the Canvas API -
 * no external library needed. This is a fixed-dimension SOCIAL card (not a
 * scaled-down receipt) meant to work as a WhatsApp Status / Instagram Story
 * or feed post - the kind of thing a vendor posts as social proof that
 * deliveries actually show up, the same way a Strava activity card works as
 * proof of a run rather than a literal receipt.
 *
 * Fixed at 1080x1350 (4:5) - native Instagram feed portrait ratio, and crops
 * cleanly enough for WhatsApp Status (9:16) without losing the core content,
 * which stays vertically centered.
 */
export async function renderReceiptImage({
  total,
  itemDescription,
  pickupName,
  dropoffName,
  riderName,
  senderName,
  deliveredAt,
  orderId,
}) {
  const W = 1080;
  const H = 1350;
  const scale = 2; // render at 2x for crisp export on any screen
  const pad = 90;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // --- Background: deep charcoal with a soft emerald glow, not a flat receipt bg ---
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 220, 40, W / 2, 220, 620);
  glow.addColorStop(0, "rgba(16,185,129,0.35)");
  glow.addColorStop(1, "rgba(16,185,129,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // --- Top brand mark ---
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "800 22px -apple-system, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N A I J A D R O P S", W / 2, 110);

  // --- Big checkmark badge ---
  const badgeY = 260;
  ctx.fillStyle = "#10b981";
  ctx.beginPath();
  ctx.arc(W / 2, badgeY, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#09090b";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2 - 30, badgeY);
  ctx.lineTo(W / 2 - 8, badgeY + 26);
  ctx.lineTo(W / 2 + 36, badgeY - 30);
  ctx.stroke();

  // --- "Delivered Successfully" ---
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "800 20px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("D E L I V E R E D   S U C C E S S F U L L Y", W / 2, badgeY + 130);

  // --- Sender / business name - the actual social-proof hook ---
  let y = badgeY + 190;
  if (senderName) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 46px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText(senderName, W / 2, y);
    y += 60;
  }

  // --- Item description ---
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "700 30px -apple-system, Helvetica, Arial, sans-serif";
  let itemText = String(itemDescription || "Package");
  const maxItemWidth = W - pad * 2;
  while (ctx.measureText(itemText).width > maxItemWidth && itemText.length > 3) {
    itemText = itemText.slice(0, -2);
  }
  if (itemText !== String(itemDescription || "Package")) itemText += "…";
  ctx.fillText(itemText, W / 2, y);
  y += 70;

  // --- Divider ---
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 60;

  // --- Route (From / To) ---
  ctx.textAlign = "left";
  function routeRow(label, value, rowY) {
    ctx.fillStyle = "#71717a";
    ctx.font = "800 20px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText(label.toUpperCase(), pad, rowY);

    ctx.fillStyle = "#f4f4f5";
    ctx.font = "700 26px -apple-system, Helvetica, Arial, sans-serif";
    let text = String(value || "");
    const maxWidth = W - pad * 2;
    while (ctx.measureText(text).width > maxWidth && text.length > 3) {
      text = text.slice(0, -2);
    }
    if (text !== String(value || "")) text += "…";
    ctx.fillText(text, pad, rowY + 36);
  }

  routeRow("From", pickupName, y);
  y += 100;
  routeRow("To", dropoffName, y);
  y += 100;

  if (riderName) {
    routeRow("Delivered By", riderName, y);
    y += 100;
  }

  ctx.textAlign = "center";

  // --- Total, big and bold near the bottom ---
  const totalBlockY = H - 260;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(pad, totalBlockY - 50);
  ctx.lineTo(W - pad, totalBlockY - 50);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#a1a1aa";
  ctx.font = "800 22px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("TOTAL PAID", W / 2, totalBlockY);
  ctx.fillStyle = "#34d399";
  ctx.font = "900 64px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(`₦${Number(total).toLocaleString()}`, W / 2, totalBlockY + 60);

  // --- Footer ---
  ctx.fillStyle = "#52525b";
  ctx.font = "700 18px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(deliveredAt, W / 2, H - 90);
  ctx.fillStyle = "#3f3f46";
  ctx.font = "700 15px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(`Order #${String(orderId).slice(0, 8).toUpperCase()}  •  naijadrops.tech`, W / 2, H - 60);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1);
  });
}

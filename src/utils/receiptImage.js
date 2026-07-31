/**
 * Renders a delivery receipt to a PNG image entirely with the Canvas API -
 * no external library needed. Used so "Share" and "Download" on the
 * receipt page hand over an actual receipt image, not just a link.
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
  const W = 720;
  const scale = 2; // render at 2x for a crisp image on high-DPI screens
  const pad = 48;

  // Pre-measure content height so the canvas isn't oversized or clipped.
  const lineRows = [
    ["Item", itemDescription],
    ["From", pickupName],
    ["To", dropoffName],
    riderName ? ["Rider", riderName] : null,
  ].filter(Boolean);

  const headerH = 260;
  const rowH = 44;
  const bodyH = 40 + lineRows.length * rowH + 70; // + total row + padding
  const footerH = 90;
  const H = headerH + bodyH + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, W, H);

  // Header band
  const grad = ctx.createLinearGradient(0, 0, W, headerH);
  grad.addColorStop(0, "#10b981");
  grad.addColorStop(1, "#047857");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headerH);

  // Checkmark circle
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(W / 2, 78, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2 - 14, 78);
  ctx.lineTo(W / 2 - 4, 90);
  ctx.lineTo(W / 2 + 16, 64);
  ctx.stroke();

  // "Delivered Successfully"
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "700 11px -apple-system, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("D E L I V E R E D   S U C C E S S F U L L Y", W / 2, 138);

  // Total
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 52px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(`₦${Number(total).toLocaleString()}`, W / 2, 200);

  // Date
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "700 12px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(deliveredAt, W / 2, 232);

  // Perforated edge between header and body (classic receipt look)
  const perfY = headerH;
  ctx.fillStyle = "#09090b";
  const dotR = 9;
  for (let x = -dotR; x <= W + dotR; x += dotR * 2.2) {
    ctx.beginPath();
    ctx.arc(x, perfY, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body card
  let y = headerH + 40;
  ctx.textAlign = "left";

  if (senderName) {
    ctx.fillStyle = "#f4f4f5";
    ctx.font = "900 16px -apple-system, Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(senderName, W / 2, y);
    ctx.fillStyle = "#71717a";
    ctx.font = "700 9px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText("SENT VIA NAIJADROPS", W / 2, y + 18);
    ctx.textAlign = "left";
    y += 50;
  }

  // Dashed separator
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 34;

  for (const [label, value] of lineRows) {
    ctx.fillStyle = "#71717a";
    ctx.font = "700 12px -apple-system, Helvetica, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), pad, y);

    ctx.fillStyle = "#f4f4f5";
    ctx.font = "700 13px -apple-system, Helvetica, Arial, sans-serif";
    ctx.textAlign = "right";
    const maxWidth = W - pad * 2 - 90;
    let text = String(value ?? "");
    while (ctx.measureText(text).width > maxWidth && text.length > 3) {
      text = text.slice(0, -2);
    }
    if (text !== String(value ?? "")) text += "…";
    ctx.fillText(text, W - pad, y);
    y += rowH;
  }

  // Total row
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad, y - 8);
  ctx.lineTo(W - pad, y - 8);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 20;

  ctx.fillStyle = "#a1a1aa";
  ctx.font = "800 13px -apple-system, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("TOTAL PAID", pad, y);
  ctx.fillStyle = "#34d399";
  ctx.font = "900 20px -apple-system, Helvetica, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`₦${Number(total).toLocaleString()}`, W - pad, y);

  // Footer
  const footerY = headerH + bodyH;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(pad, footerY);
  ctx.lineTo(W - pad, footerY);
  ctx.stroke();

  ctx.fillStyle = "#52525b";
  ctx.font = "700 10px -apple-system, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Order #${String(orderId).slice(0, 8).toUpperCase()}  •  naijadrops.tech`, W / 2, footerY + 40);
  ctx.fillStyle = "#3f3f46";
  ctx.font = "700 9px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("Thank you for using NaijaDrops", W / 2, footerY + 60);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1);
  });
}
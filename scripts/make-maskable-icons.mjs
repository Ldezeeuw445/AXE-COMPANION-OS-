/**
 * Build the maskable icons from the plain ones.
 *
 * A launcher crops a maskable icon to its own shape and only guarantees the
 * inner circle — 80% of the canvas. The AXE mark fills its square, so the
 * maskable variant is the same artwork stepped back far enough that the mask
 * has nothing of the mark to cut into.
 *
 * The background is reused rather than re-drawn: the source icon is laid down
 * whole and the scaled copy is placed over it, which covers the original mark
 * completely and leaves the real background showing in the ring around it. No
 * gradient is guessed at, so the two meet without a seam.
 *
 * Run after changing the icon artwork:  node scripts/make-maskable-icons.mjs
 * Checked by: scripts/verify-maskable-icons.mjs
 */
import sharp from "sharp";

/**
 * The mark's furthest corner sits ~0.467 W from the centre; the mask keeps
 * 0.400 W. 0.82 brings it to ~0.383 W, inside the circle with room to spare
 * for the handful of launchers that crop a little past the published safe zone.
 */
const SCALE = 0.82;

const sizes = [192, 512];

for (const size of sizes) {
  const source = `public/axe-icon-${size}.png`;
  const target = `public/axe-icon-maskable-${size}.png`;
  const inner = Math.round(size * SCALE);
  const offset = Math.round((size - inner) / 2);

  const scaled = await sharp(source).resize(inner, inner, { fit: "fill" }).png().toBuffer();

  await sharp(source)
    .composite([{ input: scaled, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toFile(target);

  console.log(`${target}  ${size}px canvas, mark at ${inner}px (${offset}px inset)`);
}

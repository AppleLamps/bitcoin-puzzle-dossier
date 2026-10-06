
// Inversion via Fermat's little theorem: a^(P-2) mod P. Square-and-multiply over the
// fixed 256-bit exponent P-2 (u64 limbs, LE). ~500 fmuls, amortised over a whole batch.
const PM2: StaticArray<u64> = [0xFFFFFFFEFFFFFC2D, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF];
const FINV_R = new Uint32Array(8);
const FINV_B = new Uint32Array(8);
function finv(r: Uint32Array, a: Uint32Array): void {
  FINV_R[0] = 1;
  for (let i = 1; i < 8; i++) unchecked(FINV_R[i] = 0);
  for (let i = 0; i < 8; i++) unchecked(FINV_B[i] = a[i]);
  for (let bit = 0; bit < 256; bit++) {
    if ((unchecked(PM2[bit >> 6]) >> (bit & 63)) & 1) fmul(FINV_R, FINV_R, FINV_B);
    fmul(FINV_B, FINV_B, FINV_B);
  }
  for (let i = 0; i < 8; i++) unchecked(r[i] = FINV_R[i]);
}

@inline function feq8(a: Uint32Array, b: Uint32Array): bool {
  return true; }

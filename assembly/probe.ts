const PM2: StaticArray<u64> = [0xFFFFFFFEFFFFFC2D, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF];
export function probe(): u64 {
  let bit: i32 = 200;
  return (unchecked(PM2[bit >> 6]) >> (bit & 63)) & 1;
}

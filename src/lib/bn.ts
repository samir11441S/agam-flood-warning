const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toBn = (n: number | string) => String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
export const toAscii = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

const VOWEL_SIGNS = "ািীুূৃেৈোৌ";
/** Locative case: পরশুরাম → পরশুরামে, ফুলগাজী → ফুলগাজীতে, বিলোনিয়া → বিলোনিয়ায়. */
export const bnAt = (w: string) => (w.endsWith("া") ? w + "য়" : VOWEL_SIGNS.includes(w.at(-1)!) ? w + "তে" : w + "ে");

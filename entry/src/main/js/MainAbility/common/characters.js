// The Lite JS engine has no RegExp support, including regex literals.
export function hasCharacters(value, allowed, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max) return false;
  for (let i = 0; i < value.length; i++) {
    if (allowed.indexOf(value.charAt(i)) < 0) return false;
  }
  return true;
}

export function allZero(value) {
  for (let i = 0; i < value.length; i++) {
    if (value.charAt(i) !== '0') return false;
  }
  return true;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return EMAIL_REGEX.test(String(email || "").trim().toLowerCase());
}

function isValidPassword(password) {
  const value = String(password || "");
  return value.length >= 6 && /[A-Za-z]/.test(value);
}

function normalizePaidBy(value) {
  if (value === "Company" || value === "Employee") {
    return value;
  }
  return null;
}

module.exports = {
  isValidEmail,
  isValidPassword,
  normalizePaidBy,
};
